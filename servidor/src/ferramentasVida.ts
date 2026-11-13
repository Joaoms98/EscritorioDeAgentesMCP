import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import type { McpSdkServerConfigWithInstance, SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { lugaresAbertos, objetoAberto, objetoDoMundo, vagaDoMundo, vagasLivres } from './mundo.ts'
import type { Mundo, Verbo } from './tipos.ts'

// O servidor MCP em processo que a sessão da oficina recebe: é por aqui que o agente que está programando por vontade
// própria fala com o escritório, olha quem está por perto e pede para fazer outra coisa.
//
// As ferramentas de verbo são GERADAS do catálogo (um laço sobre mundo.verbos), então verbo novo em mundo.ts vira
// ferramenta aqui sem uma linha nova. Quem executa cada ação entra por injeção (aoFalar, olhar, aoQuerer): este
// arquivo só confere a forma do pedido contra o catálogo e repassa; a máquina de estados do passo 8 é que decide.
//
// NADA que sai daqui pode vazar caminho de projeto de verdade, chave ou texto de ordem do humano: olhar devolve
// apelido, cômodo, objeto e verbo e mais nada, e o resto do conteúdo é o próprio catálogo.

export const NOME_DO_SERVIDOR_DA_VIDA = 'vida'

// Mesmo teto das falas do catálogo: o balão na cabeça do boneco é curto.
export const LIMITE_DA_FALA = 90

const LIMITE_DO_MOTIVO = 180
// Campo de presença maior que isso é cortado: o olhar é vitrine, não porta de vazamento.
const LIMITE_DA_PRESENCA = 80
// Quantos ids a mensagem de erro lista antes de dizer só quantos são.
const IDS_NO_ERRO = 24
const SOMENTE_LEITURA = { readOnlyHint: true, openWorldHint: false }

// A forma (shape) zod de uma ferramenta da vida. Ela sai do catálogo num laço, então os campos só se conhecem
// rodando: por isso a forma é um mapa de esquemas, e o handler lê a entrada como dado bruto.
export type FormaDaVida = Record<string, z.ZodType>

export type FerramentaDaVida = SdkMcpToolDefinition<FormaDaVida>

// Quem está onde, do jeito que a sessão pode ver. Campo a mais que venha de dentro é descartado antes de sair.
export type PresencaDaVida = {
  apelido: string
  comodo: string | null
  objeto: string | null
  verbo: string | null
}

// O pedido de um verbo, já conferido contra o catálogo, do jeito que a máquina de estados recebe.
export type PedidoDeVerbo = {
  agenteId: string
  verbo: string
  objetoId: string | null
  vagaId: string | null
  comId: string | null
  duracaoMs: number | null
  motivo: string | null
}

// A resposta do escritório a um pedido: o texto é o que a sessão lê de volta.
export type RespostaDoPedido = { aceito: boolean; texto: string }

export type OpcoesDasFerramentasDaVida = {
  mundo: Mundo
  // De quem é esta sessão: vai no pedido, e é por isso que ninguém conversa consigo mesmo.
  agenteId: string
  // Põe um balão de fala na cabeça do boneco dele na cena.
  aoFalar: (texto: string) => void
  // Só leitura: quem está onde agora.
  olhar: () => readonly PresencaDaVida[]
  // Executa o verbo pedido. Sem ele, a vida não está no comando desta sessão e todo verbo é recusado.
  aoQuerer?: (pedido: PedidoDeVerbo) => RespostaDoPedido
}

// O nome completo com que o Claude Code vê uma ferramenta da vida. Retorna 'mcp__vida__<id>'.
export function nomeMcpDaVida(id: string): string {
  return `mcp__${NOME_DO_SERVIDOR_DA_VIDA}__${id}`
}

// As duas únicas que a sessão da oficina libera sem passar pela guarda (o allowedTools do passo 5).
export const FERRAMENTAS_LIBERADAS_DA_VIDA: readonly string[] = [nomeMcpDaVida('falar'), nomeMcpDaVida('olhar')]

const cru = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '')

const textoDe = (valor: unknown, limite: number): string | null => {
  const texto = cru(valor)
  return texto ? texto.slice(0, limite) : null
}

// Lista de ids para a mensagem de erro, cortada quando é longa demais. Retorna o texto.
function listaDeIds(ids: readonly string[]): string {
  if (ids.length === 0) return 'nenhum'
  const mostra = ids.slice(0, IDS_NO_ERRO)
  return mostra.length < ids.length ? `${mostra.join(', ')}… (${ids.length} no total)` : mostra.join(', ')
}

function comErro(texto: string): CallToolResult {
  return { content: [{ type: 'text', text: texto }], isError: true }
}

function emTexto(dados: unknown): CallToolResult {
  return { content: [{ type: 'text', text: typeof dados === 'string' ? dados : JSON.stringify(dados, null, 2) }] }
}

// Os objetos que aceitam o verbo e estão abertos a quem tem vida própria (cômodo alcançável e alguma vaga que não é
// só por convocação do humano). Retorna os ids.
export function objetosDoVerbo(mundo: Mundo, verbo: Verbo): string[] {
  return mundo.objetos
    .filter((objeto) => objeto.verbos.includes(verbo.id) && objetoAberto(mundo, objeto))
    .map((objeto) => objeto.id)
}

// As vagas onde dá para fazer o verbo (pelo objeto da vaga), de cômodo alcançável. Retorna os ids.
export function vagasDoVerbo(mundo: Mundo, verbo: Verbo): string[] {
  return vagasLivres(mundo, new Set(), { verbo: verbo.id }).map((vaga) => vaga.id)
}

// Os verbos que a sessão da oficina pode pedir: os do catálogo, menos os que subiriam outra sessão de agente
// (precisaAgente: quem já está na oficina não abre outra) e menos os que não têm alvo nenhum no mundo de hoje.
// Retorna os verbos, na ordem do catálogo.
export function verbosOferecidos(mundo: Mundo): Verbo[] {
  return mundo.verbos.filter((verbo) => {
    if (verbo.precisaAgente) return false
    if (verbo.alvo === 'objeto') return objetosDoVerbo(mundo, verbo).length > 0
    if (verbo.alvo === 'vaga') return vagasDoVerbo(mundo, verbo).length > 0
    return true
  })
}

// Os nomes completos de todas as ferramentas da vida neste mundo, para quem monta as opções da sessão.
// Retorna a lista de 'mcp__vida__<id>'.
export function nomesDasFerramentasDaVida(mundo: Mundo): string[] {
  return [...verbosOferecidos(mundo).map((verbo) => nomeMcpDaVida(verbo.id)), ...FERRAMENTAS_LIBERADAS_DA_VIDA]
}

const segundos = (ms: number): number => Math.round(ms / 1000)

// O formato zod da ferramenta de um verbo, tirado do próprio verbo: o alvo manda no campo, e o catálogo manda nos
// valores. Retorna a forma (shape) do zod.
export function esquemaZodDoVerbo(verbo: Verbo, mundo: Mundo): FormaDaVida {
  const [minMs, maxMs] = verbo.duracaoMs
  const comum: FormaDaVida = {
    motivo: z.string().min(1).max(LIMITE_DO_MOTIVO).optional()
      .describe('Por que você quer isso agora, em uma frase curta e na primeira pessoa'),
    duracaoSegundos: z.number().int().min(segundos(minMs)).max(segundos(maxMs)).optional()
      .describe(`Quanto tempo quer ficar nisso, de ${segundos(minMs)} a ${segundos(maxMs)} segundos`),
  }
  if (verbo.alvo === 'objeto') {
    return { objetoId: z.enum(objetosDoVerbo(mundo, verbo)).describe('O objeto que você quer usar'), ...comum }
  }
  if (verbo.alvo === 'vaga') {
    return { vagaId: z.enum(vagasDoVerbo(mundo, verbo)).describe('O lugar para onde você quer ir'), ...comum }
  }
  if (verbo.alvo === 'agente') {
    return { comId: z.string().min(1).max(100).describe('O id do outro agente, como ele aparece no escritório'), ...comum }
  }
  return comum
}

// O que a ferramenta do verbo diz ao modelo: a descrição do catálogo, o alvo e quanto tempo dura. Retorna o texto.
function descricaoDoVerbo(verbo: Verbo): string {
  const alvo = {
    objeto: 'Diga o objeto em objetoId.',
    vaga: 'Diga o lugar em vagaId.',
    agente: 'Diga o outro agente em comId.',
    nenhum: 'Não precisa de alvo.',
  }[verbo.alvo]
  return `${verbo.descricao} ${alvo} O escritório pode recusar (lugar ocupado, ordem do humano chegando): leia a resposta.`
}

// Confere o pedido de um verbo contra o catálogo. Retorna o pedido pronto, ou o erro já escrito para o modelo.
function pedidoDoVerbo(verbo: Verbo, mundo: Mundo, agenteId: string, bruto: Record<string, unknown>): PedidoDeVerbo | { erro: string } {
  let objetoId: string | null = null
  let vagaId: string | null = null
  let comId: string | null = null

  if (verbo.alvo === 'objeto') {
    const validos = objetosDoVerbo(mundo, verbo)
    const pedido = textoDe(bruto.objetoId, 60)
    if (!pedido) return { erro: `Falta dizer o objeto em objetoId. Os que aceitam ${verbo.id}: ${listaDeIds(validos)}.` }
    if (!validos.includes(pedido)) {
      const existe = objetoDoMundo(mundo, pedido) !== null
      return {
        erro: existe
          ? `O objeto "${pedido}" não aceita ${verbo.id} agora. Os que aceitam: ${listaDeIds(validos)}.`
          : `Não existe objeto "${pedido}". Os que aceitam ${verbo.id}: ${listaDeIds(validos)}.`,
      }
    }
    objetoId = pedido
  }

  if (verbo.alvo === 'vaga') {
    const validos = vagasDoVerbo(mundo, verbo)
    const pedido = textoDe(bruto.vagaId, 60)
    if (!pedido) return { erro: `Falta dizer o lugar em vagaId. Os que servem para ${verbo.id}: ${listaDeIds(validos)}.` }
    if (!validos.includes(pedido)) {
      const existe = vagaDoMundo(mundo, pedido) !== null
      return {
        erro: existe
          ? `O lugar "${pedido}" não serve para ${verbo.id}. Os que servem: ${listaDeIds(validos)}.`
          : `Não existe lugar "${pedido}". Os que servem para ${verbo.id}: ${listaDeIds(validos)}.`,
      }
    }
    vagaId = pedido
    objetoId = vagaDoMundo(mundo, pedido)?.objetoId ?? null
  }

  if (verbo.alvo === 'agente') {
    comId = textoDe(bruto.comId, 100)
    if (!comId) return { erro: 'Falta dizer com quem, em comId. Use olhar para ver quem está por perto.' }
    if (comId === agenteId) return { erro: 'Não dá para fazer isso com você mesmo: escolha outro agente.' }
  }

  const pedida = typeof bruto.duracaoSegundos === 'number' && Number.isFinite(bruto.duracaoSegundos) ? bruto.duracaoSegundos * 1000 : null
  // Duração fora do intervalo do verbo não é erro: entra presa ao intervalo, como validarDecisao faz com o modelo.
  const duracaoMs = pedida === null ? null : Math.round(Math.min(verbo.duracaoMs[1], Math.max(verbo.duracaoMs[0], pedida)))
  return { agenteId, verbo: verbo.id, objetoId, vagaId, comId, duracaoMs, motivo: textoDe(bruto.motivo, LIMITE_DO_MOTIVO) }
}

// A ferramenta de um verbo do catálogo. Retorna a definição, com o handler que confere e repassa a quem executa.
function ferramentaDoVerbo(verbo: Verbo, opcoes: OpcoesDasFerramentasDaVida): FerramentaDaVida {
  return tool(verbo.id, descricaoDoVerbo(verbo), esquemaZodDoVerbo(verbo, opcoes.mundo), async (args) => {
    const pedido = pedidoDoVerbo(verbo, opcoes.mundo, opcoes.agenteId, args)
    if ('erro' in pedido) return comErro(pedido.erro)
    if (!opcoes.aoQuerer) return comErro(`Agora não dá para ${verbo.id}: a vida não está no comando desta sessão.`)
    try {
      const resposta = opcoes.aoQuerer(pedido)
      return { content: [{ type: 'text', text: resposta.texto }], isError: !resposta.aceito }
    } catch (erro) {
      console.error('[escritorio] Erro numa ferramenta da vida:', erro)
      return comErro('Deu erro no escritório ao atender o pedido.')
    }
  })
}

// Copia de uma presença só o que pode ser visto, cortado no tamanho. Retorna a presença limpa.
function presencaLimpa(bruta: PresencaDaVida): PresencaDaVida {
  return {
    apelido: cru(bruta.apelido).slice(0, LIMITE_DA_PRESENCA),
    comodo: textoDe(bruta.comodo, LIMITE_DA_PRESENCA),
    objeto: textoDe(bruta.objeto, LIMITE_DA_PRESENCA),
    verbo: textoDe(bruta.verbo, LIMITE_DA_PRESENCA),
  }
}

// O que tem em cada cômodo que o agente pode alcançar, direto do catálogo: só os objetos abertos a ele, e cômodo que
// sobrou sem objeto nenhum (a sala de reunião, que é só por convocação) nem aparece. Retorna a lista.
function comodosDoCatalogo(mundo: Mundo) {
  return mundo.comodos
    .filter((comodo) => comodo.andavel)
    .map((comodo) => ({
      comodo: comodo.id,
      nome: comodo.nome,
      objetos: mundo.objetos
        .filter((objeto) => objeto.comodoId === comodo.id && objetoAberto(mundo, objeto))
        .map((objeto) => ({ objeto: objeto.id, nome: objeto.nome, lugares: lugaresAbertos(mundo, objeto), verbos: objeto.verbos })),
    }))
    .filter((comodo) => comodo.objetos.length > 0)
}

// A lista de ferramentas da vida: uma por verbo oferecido do catálogo, mais falar e olhar.
// Retorna as definições, com os handlers, para o servidor MCP e para os testes.
export function montarFerramentasDaVida(opcoes: OpcoesDasFerramentasDaVida): FerramentaDaVida[] {
  const { mundo } = opcoes
  const ferramentas: FerramentaDaVida[] = verbosOferecidos(mundo).map((verbo) => ferramentaDoVerbo(verbo, opcoes))

  const formaDaFala: FormaDaVida = {
    texto: z.string().min(1).max(LIMITE_DA_FALA).describe(`O que você diz em voz alta, no máximo ${LIMITE_DA_FALA} caracteres`),
  }
  ferramentas.push(tool(
    'falar',
    'Diz uma frase curta em voz alta: ela aparece num balão na cabeça do seu boneco, na tela do escritório. Use para contar o que está fazendo.',
    formaDaFala,
    async (args) => {
      const texto = cru(args.texto)
      if (!texto) return comErro('Falta dizer o que você fala, em texto.')
      if (texto.length > LIMITE_DA_FALA) return comErro(`A fala tem no máximo ${LIMITE_DA_FALA} caracteres; a sua tem ${texto.length}.`)
      try {
        opcoes.aoFalar(texto)
      } catch (erro) {
        console.error('[escritorio] Erro ao pôr uma fala da vida na cena:', erro)
        return comErro('Deu erro no escritório ao mostrar a sua fala.')
      }
      return emTexto('O balão apareceu na cabeça do seu boneco.')
    },
  ))

  const formaDoOlhar: FormaDaVida = {}
  ferramentas.push(tool(
    'olhar',
    'Olha o escritório: quem está em cada cômodo, com que objeto e fazendo o quê, e o que existe em cada cômodo. Só leitura.',
    formaDoOlhar,
    async () => {
      try {
        // Só os quatro campos de cada presença e o catálogo: nunca ordem do humano, caminho ou chave.
        return emTexto({ presentes: opcoes.olhar().map(presencaLimpa), comodos: comodosDoCatalogo(mundo) })
      } catch (erro) {
        console.error('[escritorio] Erro ao olhar o escritório na vida:', erro)
        return comErro('Deu erro no escritório ao olhar em volta.')
      }
    },
    { annotations: SOMENTE_LEITURA },
  ))

  return ferramentas
}

// O servidor MCP em processo da vida, para options.mcpServers. Retorna a config com a instância.
export function criarFerramentasDaVida(opcoes: OpcoesDasFerramentasDaVida, versao = '1.0.0'): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: NOME_DO_SERVIDOR_DA_VIDA,
    version: versao,
    alwaysLoad: true,
    instructions:
      'O escritório onde você mora. falar põe um balão na cabeça do seu boneco; olhar mostra quem está onde; ' +
      'as outras ferramentas pedem para você fazer outra coisa, e o escritório pode recusar.',
    tools: montarFerramentasDaVida(opcoes),
  })
}
