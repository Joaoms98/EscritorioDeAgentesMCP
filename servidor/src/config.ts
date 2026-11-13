import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Config } from './tipos.ts'

const RAIZ = resolve(import.meta.dirname, '..', '..')
const PORTA_PADRAO = 41793
const MODELO_VIDA_PADRAO = 'haiku'
const INTERVALO_VIDA_PADRAO_MS = 25_000
const INTERVALO_VIDA_MINIMO_MS = 10_000
const LOTE_PADRAO = 4
const TETO_CUSTO_DIA_PADRAO = 1
const TETO_HORAS_PADRAO = 4
const MAX_SIMULTANEAS_PADRAO = 4
const TAMANHO_MINIMO_TOKEN = 16
const CARACTERES_TOKEN = /^[A-Za-z0-9._~+/=-]+$/

// Lê a configuração do ambiente e prepara a pasta de dados (0700) com a chave de acesso (0600). Retorna a Config.
export function lerConfig(env: NodeJS.ProcessEnv = process.env, raiz: string = RAIZ): Config {
  const simulado = env.ESCRITORIO_SIMULADO === '1'
  // A simulação tem banco e chave próprios: as ordens de mentira não aparecem (nem rodam de verdade) no escritório real.
  const dirDados = lerCaminho(env.ESCRITORIO_DADOS, simulado ? join(raiz, 'dados', 'simulado') : join(raiz, 'dados'))
  criarPastaPrivada(dirDados)
  return {
    porta: lerPorta(env.ESCRITORIO_PORTA),
    host: lerTexto(env.ESCRITORIO_HOST) ?? '0.0.0.0',
    dirDados,
    dirProjetos: lerCaminho(env.ESCRITORIO_PROJETOS, join(homedir(), 'projects')),
    dirAgentes: lerCaminho(env.ESCRITORIO_AGENTES, join(homedir(), '.claude', 'agents')),
    dirAgentesProjeto: prepararPasta(lerCaminho(env.ESCRITORIO_AGENTES_PROJETO, join(raiz, 'servidor', 'agentes-projeto'))),
    dirWeb: join(raiz, 'web', 'dist'),
    maxSimultaneas: lerMaxSimultaneas(env.ESCRITORIO_MAX_SIMULTANEAS),
    conectoresClaudeAi: env.ESCRITORIO_CONECTORES === '1',
    usarApiKey: env.ESCRITORIO_USAR_API_KEY === '1',
    simulado,
    modeloGeneralista: lerTexto(env.ESCRITORIO_MODELO_GENERALISTA),
    token: lerToken(env.ESCRITORIO_TOKEN, dirDados),
    versao: lerVersao(raiz),
    dirVida: prepararPasta(lerCaminho(env.ESCRITORIO_VIDA_DIR, join(raiz, 'servidor', 'vida'))),
    modeloVida: lerTexto(env.ESCRITORIO_MODELO_VIDA) ?? MODELO_VIDA_PADRAO,
    // Piso de 10 s: mais rápido que isso só gasta a conta sem a cena ficar melhor.
    intervaloVidaMs: Math.max(INTERVALO_VIDA_MINIMO_MS, lerNumero(env.ESCRITORIO_VIDA_INTERVALO_MS, INTERVALO_VIDA_PADRAO_MS)),
    maxNoLote: Math.min(8, Math.max(1, Math.round(lerNumero(env.ESCRITORIO_VIDA_LOTE, LOTE_PADRAO)))),
    tetoCustoUsdDoDia: Math.max(0, lerNumero(env.ESCRITORIO_VIDA_CUSTO_DIA, TETO_CUSTO_DIA_PADRAO)),
    tetoHorasVida: Math.max(0, lerNumero(env.ESCRITORIO_VIDA_HORAS, TETO_HORAS_PADRAO)),
    vidaNoBoot: lerLigaDesliga(env.ESCRITORIO_VIDA),
  }
}

// Número do ambiente, com padrão quando falta ou não é número. Retorna o número.
function lerNumero(valor: string | undefined, padrao: number): number {
  const texto = lerTexto(valor)
  if (!texto) return padrao
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : padrao
}

// '1' liga, '0' desliga, ausente deixa como estava da última vez. Retorna true, false ou null.
function lerLigaDesliga(valor: string | undefined): boolean | null {
  const texto = lerTexto(valor)
  if (texto === '1') return true
  if (texto === '0') return false
  return null
}

// Cria a pasta se faltar (a dos projetos dos agentes é visível para o dono, não é pasta de segredo). Retorna o caminho.
function prepararPasta(caminho: string): string {
  mkdirSync(caminho, { recursive: true })
  return caminho
}

function lerTexto(valor: string | undefined): string | null {
  const texto = valor?.trim()
  return texto ? texto : null
}

function lerCaminho(valor: string | undefined, padrao: string): string {
  const texto = lerTexto(valor)
  if (!texto) return resolve(padrao)
  if (texto === '~') return homedir()
  return resolve(texto.startsWith('~/') ? join(homedir(), texto.slice(2)) : texto)
}

function lerPorta(valor: string | undefined): number {
  const texto = lerTexto(valor)
  if (!texto) return PORTA_PADRAO
  const porta = Number(texto)
  if (!Number.isInteger(porta) || porta < 0 || porta > 65535) {
    throw new Error(`ESCRITORIO_PORTA inválida: "${texto}". Use um número de porta, por exemplo ${PORTA_PADRAO}.`)
  }
  return porta
}

function lerMaxSimultaneas(valor: string | undefined): number {
  const numero = Number.parseInt(valor ?? '', 10)
  return Number.isNaN(numero) ? MAX_SIMULTANEAS_PADRAO : Math.max(1, numero)
}

function criarPastaPrivada(dir: string): void {
  const criada = mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (criada !== undefined) chmodSync(dir, 0o700)
}

function lerToken(valor: string | undefined, dirDados: string): string {
  const doAmbiente = lerTexto(valor)
  if (doAmbiente) {
    if (doAmbiente.length < TAMANHO_MINIMO_TOKEN) {
      throw new Error(`ESCRITORIO_TOKEN precisa ter pelo menos ${TAMANHO_MINIMO_TOKEN} caracteres.`)
    }
    if (!CARACTERES_TOKEN.test(doAmbiente)) {
      throw new Error('ESCRITORIO_TOKEN só pode ter letras, números e os sinais . _ ~ + / = -')
    }
    return doAmbiente
  }
  const arquivo = join(dirDados, 'chave')
  const salvo = lerArquivo(arquivo)?.trim()
  if (salvo && salvo.length >= TAMANHO_MINIMO_TOKEN) return salvo
  const novo = randomBytes(32).toString('base64url')
  writeFileSync(arquivo, `${novo}\n`, { mode: 0o600 })
  chmodSync(arquivo, 0o600)
  return novo
}

function lerArquivo(arquivo: string): string | null {
  try {
    return readFileSync(arquivo, 'utf8')
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw erro
  }
}

function lerVersao(raiz: string): string {
  try {
    const pacote: unknown = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8'))
    const versao = (pacote as { version?: unknown } | null)?.version
    return typeof versao === 'string' ? versao : '0.0.0'
  } catch {
    return '0.0.0'
  }
}
