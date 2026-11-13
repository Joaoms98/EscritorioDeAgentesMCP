import { chmodSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { ErroEscritorio } from './tipos.ts'
import type { Config } from './tipos.ts'

// A pasta isolada do modo Vida: uma subpasta por agente, sempre dentro de servidor/. Nada que um agente
// escreve aqui vira agente, projeto ou skill, e nada fora daqui é alcançável (a guarda está em guardaVida.ts).

const DIR_SERVIDOR = resolve(import.meta.dirname, '..')
const ID_DE_AGENTE = /^[a-z0-9-]{1,64}$/
const PASTA_VAZIA = '.vazio'
const MODO_PASTA = 0o700
const MODO_ARQUIVO = 0o600
const LIMITE_DA_LISTA = 200
const BWRAP = '/usr/bin/bwrap'

export type ItemDaOficina = {
  nome: string
  // Caminho relativo à raiz das oficinas ('.' para a própria raiz).
  caminho: string
  pasta: boolean
  bytes: number
}

export type Sandbox = {
  raiz: string
  // Pasta vazia que a chamada de decisão usa como cwd: ela não precisa de arquivo nenhum.
  vazio: string
  // false quando o bubblewrap não existe neste computador: eles andam e conversam, mas não programam.
  disponivel: boolean
}

// Caminho da pasta isolada depois de recusar todo lugar perigoso (fora de servidor/, misturada com
// dados/, com os projetos do humano ou com ~/.claude). Retorna config.dirAgentesProjeto, ou lança.
export function raizDasOficinas(
  config: Pick<Config, 'dirAgentesProjeto' | 'dirDados' | 'dirProjetos'>,
  dirServidor: string = DIR_SERVIDOR,
): string {
  const raiz = canonico(config.dirAgentesProjeto)
  if (!raiz) throw new Error(`A pasta dos projetos dos agentes não existe: ${config.dirAgentesProjeto}.`)
  const servidor = canonico(dirServidor)
  if (!servidor) throw new Error(`A pasta do servidor não existe: ${dirServidor}.`)
  if (!dentroDe(servidor, raiz)) {
    throw new Error(`A pasta dos projetos dos agentes precisa ficar dentro de ${servidor}, e não em ${raiz}.`)
  }
  for (const [nome, caminho] of lugaresProibidos(config)) {
    const alvo = realDoAncestral(resolve(caminho))
    if (!alvo) continue
    // Nos dois sentidos: nem a oficina mora lá dentro, nem aquilo mora dentro da oficina.
    if (alvo === raiz || dentroDe(raiz, alvo) || dentroDe(alvo, raiz)) {
      throw new Error(`A pasta dos projetos dos agentes não pode se misturar com ${nome} (${alvo}).`)
    }
  }
  return config.dirAgentesProjeto
}

// A pasta de um agente, criada 0700 com um LEIA.md na primeira vez; chamar de novo não muda nada.
// Retorna o caminho canônico da pasta dele.
export function criarOficina(raiz: string, agenteId: string): string {
  const id = sanearIdDeAgente(agenteId)
  const caminho = caminhoDentro(raiz, id)
  if (!caminho) throw new ErroEscritorio(400, `A pasta do agente ${id} não cai dentro de ${raiz}.`)
  mkdirSync(caminho, { recursive: true, mode: MODO_PASTA })
  chmodSync(caminho, MODO_PASTA)
  const leia = join(caminho, 'LEIA.md')
  if (!existsSync(leia)) writeFileSync(leia, textoDoLeia(id), { mode: MODO_ARQUIVO })
  return caminho
}

// O id do agente como nome de pasta: só minúsculas, números e hífen. Retorna o id, ou lança.
export function sanearIdDeAgente(agenteId: string): string {
  const id = String(agenteId ?? '').trim()
  if (!ID_DE_AGENTE.test(id)) {
    throw new ErroEscritorio(400, `Id de agente inválido para uma pasta: "${agenteId}". Use só minúsculas, números e hífen.`)
  }
  return id
}

// A função mais importante do arquivo: resolve o candidato dentro da raiz, mata link simbólico com
// realpath do ancestral que existe e exige que o resultado seja a raiz ou algo dentro dela.
// Retorna o caminho canônico quando está dentro, e null quando sai ou quando há qualquer dúvida.
export function caminhoDentro(raiz: string, candidato: string): string | null {
  if (typeof candidato !== 'string') return null
  const texto = candidato.trim()
  if (!texto || texto.includes('\0')) return null
  try {
    const base = canonico(raiz)
    if (!base) return null
    const expandido = expandirTil(texto)
    const alvo = isAbsolute(expandido) ? resolve(expandido) : resolve(base, expandido)
    const real = realDoAncestral(alvo)
    if (!real) return null
    if (real !== base && !dentroDe(base, real)) return null
    return real
  } catch {
    return null
  }
}

// O que existe numa pasta da oficina, só leitura e confinado (link simbólico para fora não é listado).
// Retorna a lista de itens, pastas primeiro; lança quando o caminho pedido sai da raiz.
export function listarOficina(raiz: string, caminho: string | null = null, limite: number = LIMITE_DA_LISTA): ItemDaOficina[] {
  const base = canonico(raiz)
  if (!base) throw new ErroEscritorio(400, `A pasta dos projetos dos agentes não existe: ${raiz}.`)
  const alvo = caminhoDentro(raiz, caminho ?? '.')
  if (!alvo) throw new ErroEscritorio(400, `Esse caminho não fica na pasta dos agentes: ${caminho}.`)
  if (!existsSync(alvo)) return []
  if (!statSync(alvo).isDirectory()) return [itemDaOficina(base, alvo, basename(alvo))]
  const itens: ItemDaOficina[] = []
  for (const entrada of readdirSync(alvo, { withFileTypes: true })) {
    const dentro = caminhoDentro(raiz, join(alvo, entrada.name))
    if (!dentro) continue
    itens.push(itemDaOficina(base, dentro, entrada.name))
    if (itens.length >= limite) break
  }
  return itens.sort((a, b) => (a.pasta === b.pasta ? a.nome.localeCompare(b.nome, 'pt-BR') : a.pasta ? -1 : 1))
}

// Apaga a pasta de um agente, ou todas elas quando o agente não é dito (nada fora da raiz é tocado).
// Retorna os ids das pastas apagadas.
export function limparOficina(raiz: string, agenteId: string | null = null): string[] {
  const base = canonico(raiz)
  if (!base) return []
  if (agenteId) {
    const id = sanearIdDeAgente(agenteId)
    const alvo = caminhoDentro(raiz, id)
    if (!alvo || alvo === base) throw new ErroEscritorio(400, `A pasta do agente ${id} não cai dentro de ${base}.`)
    rmSync(alvo, { recursive: true, force: true })
    return [id]
  }
  const apagadas: string[] = []
  for (const entrada of readdirSync(base, { withFileTypes: true })) {
    // isDirectory() é lstat: um link simbólico com nome de agente não entra, então não seguimos link nenhum.
    if (!entrada.isDirectory() || !ID_DE_AGENTE.test(entrada.name)) continue
    const alvo = caminhoDentro(base, entrada.name)
    if (!alvo || alvo === base) continue
    rmSync(alvo, { recursive: true, force: true })
    apagadas.push(entrada.name)
  }
  return apagadas
}

// Confere uma vez, e guarda a resposta, se o bubblewrap existe neste computador (a parede do
// confinamento, camada A5). Retorna true quando a oficina pode rodar de verdade.
export function oficinaDisponivel(recarregar = false): boolean {
  if (confinamento === null || recarregar) confinamento = caminhoDoBwrap() !== null
  return confinamento
}

// Onde está o bwrap: o primeiro do PATH, ou o /usr/bin/bwrap de sempre. Retorna o caminho, ou null
// quando o bubblewrap não existe neste computador.
export function caminhoDoBwrap(base: NodeJS.ProcessEnv = process.env): string | null {
  for (const pasta of (base.PATH ?? '').split(':')) {
    if (!pasta) continue
    const candidato = join(pasta, 'bwrap')
    if (existeArquivo(candidato)) return candidato
  }
  return existeArquivo(BWRAP) ? BWRAP : null
}

// Valida a pasta isolada, cria a pasta vazia da chamada de decisão e confere o confinamento, sem
// derrubar nada quando o bubblewrap falta. Retorna { raiz, vazio, disponivel }.
export function prepararSandbox(
  config: Pick<Config, 'dirAgentesProjeto' | 'dirDados' | 'dirProjetos'>,
  dirServidor: string = DIR_SERVIDOR,
): Sandbox {
  const raiz = raizDasOficinas(config, dirServidor)
  const vazio = join(raiz, PASTA_VAZIA)
  mkdirSync(vazio, { recursive: true, mode: MODO_PASTA })
  chmodSync(vazio, MODO_PASTA)
  return { raiz, vazio, disponivel: oficinaDisponivel() }
}

let confinamento: boolean | null = null

function lugaresProibidos(config: Pick<Config, 'dirDados' | 'dirProjetos'>): Array<[string, string]> {
  return [
    ['os dados do escritório', config.dirDados],
    ['os projetos do humano', config.dirProjetos],
    ['a pasta ~/.claude', join(homedir(), '.claude')],
  ]
}

function itemDaOficina(base: string, alvo: string, nome: string): ItemDaOficina {
  const dados = statSync(alvo, { throwIfNoEntry: false })
  return {
    nome,
    caminho: relative(base, alvo) || '.',
    pasta: Boolean(dados?.isDirectory()),
    bytes: dados?.isFile() ? dados.size : 0,
  }
}

function existeArquivo(caminho: string): boolean {
  return Boolean(statSync(caminho, { throwIfNoEntry: false })?.isFile())
}

function dentroDe(pai: string, filho: string): boolean {
  return filho.startsWith(pai.endsWith(sep) ? pai : pai + sep)
}

// '~' é a casa do humano, não uma pasta chamada "~" dentro da oficina: expandir é o que faz
// '~/.claude/agents/x.md' cair fora da raiz em vez de virar um caminho de dentro.
function expandirTil(caminho: string): string {
  if (caminho === '~') return homedir()
  if (caminho.startsWith('~/')) return join(homedir(), caminho.slice(2))
  return caminho
}

function canonico(caminho: string): string | null {
  try {
    return realpathSync(resolve(caminho))
  } catch {
    return null
  }
}

// realpath do ancestral mais próximo que existe, com o resto do caminho colado de volta: é assim que
// um arquivo que ainda não existe dentro de um link simbólico também é resolvido. Retorna null se falhar.
function realDoAncestral(caminho: string): string | null {
  let atual = caminho
  const restos: string[] = []
  for (let passo = 0; passo < 64; passo++) {
    try {
      if (existsSync(atual)) {
        const real = realpathSync(atual)
        return restos.length ? join(real, ...restos.reverse()) : real
      }
    } catch {
      return null
    }
    const pai = dirname(atual)
    if (pai === atual) return null
    restos.push(basename(atual))
    atual = pai
  }
  return null
}

function textoDoLeia(agenteId: string): string {
  return [
    `# A pasta de ${agenteId}`,
    '',
    'Esta é a pasta do modo Vida deste agente: é o único lugar do computador onde ele pode criar e',
    'mexer em arquivos por vontade própria. Nada aqui é projeto de verdade, nada aqui vira agente,',
    'projeto ou skill, e pode apagar a pasta inteira a qualquer momento: o escritório recria o que',
    'precisar.',
    '',
  ].join('\n')
}
