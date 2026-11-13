import { basename, resolve } from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type {
  CanUseTool,
  McpSdkServerConfigWithInstance,
  Options,
  PermissionResult,
  Query,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import { lerDefinicaoDoAgente } from './agentes.ts'
import { criarFerramentas } from './ferramentas.ts'
import { criarEstadoTraducao, FERRAMENTA_STATUS, tituloDaPermissao, traduzir } from './traducao.ts'
import type { Acao } from './traducao.ts'
import type {
  Agente,
  Config,
  ContextoExecucao,
  Execucao,
  FabricaExecucao,
  FimExecucao,
  GanchosExecucao,
  Ordem,
} from './tipos.ts'

export type FuncaoQuery = (parametros: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }) => Query

export type DependenciasExecucao = {
  query?: FuncaoQuery
  esperaParadaMs?: number
  esperaSaidaMs?: number
}

export type FilaDeEntrada<T> = AsyncIterable<T> & {
  empurrar(item: T): void
  encerrar(): void
  readonly encerrada: boolean
}

const LINHAS_STDERR = 40
const NOMES_REMOVIDOS = new Set(['CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'AI_AGENT'])
const PREFIXOS_REMOVIDOS = ['CLAUDE_CODE_', 'CLAUDE_AGENT_SDK_', 'ESCRITORIO_']
const INTERROMPIDA: PermissionResult = { behavior: 'deny', message: 'A ordem foi interrompida.', interrupt: true }

// Fila "empurrável" que o SDK lê como entrada em streaming. Retorna a fila com empurrar/encerrar.
export function criarFilaDeEntrada<T>(): FilaDeEntrada<T> {
  const itens: T[] = []
  let espera: ((resultado: IteratorResult<T, undefined>) => void) | null = null
  let encerrada = false
  return {
    get encerrada() {
      return encerrada
    },
    empurrar(item) {
      if (encerrada) return
      if (espera) {
        const acordar = espera
        espera = null
        acordar({ value: item, done: false })
      } else {
        itens.push(item)
      }
    },
    encerrar() {
      encerrada = true
      if (espera) {
        const acordar = espera
        espera = null
        acordar({ value: undefined, done: true })
      }
    },
    [Symbol.asyncIterator]() {
      return {
        next: (): Promise<IteratorResult<T, undefined>> => {
          if (itens.length) return Promise.resolve({ value: itens.shift() as T, done: false })
          if (encerrada) return Promise.resolve({ value: undefined, done: true })
          return new Promise((resolve) => {
            espera = resolve
          })
        },
        return: (): Promise<IteratorResult<T, undefined>> => {
          encerrada = true
          return Promise.resolve({ value: undefined, done: true })
        },
      }
    },
  }
}

export function mensagemDoUsuario(texto: string): SDKUserMessage {
  return { type: 'user', message: { role: 'user', content: texto }, parent_tool_use_id: null }
}

// Texto enviado ao agente: com o preâmbulo do escritório (e o recado da reunião, quando há um) só em sessão nova;
// ao retomar, só a instrução.
export function textoDaOrdem(ordem: Pick<Ordem, 'projeto' | 'instrucao' | 'recado'>, retomarSessao: string | null): string {
  if (retomarSessao) return ordem.instrucao
  const recado = typeof ordem.recado === 'string' && ordem.recado.trim() ? ordem.recado.trim() : null
  return [
    '[Escritório de Agentes] Esta ordem veio do painel do Escritório de Agentes. O humano acompanha seu trabalho por esse painel (computador ou celular), não pelo terminal.',
    '- Quando precisar de uma decisão, confirmação ou informação do humano, use a ferramenta AskUserQuestion (se você tiver acesso a ela) em vez de terminar a resposta com uma pergunta.',
    '- Nas etapas importantes, conte em uma frase curta o que está fazendo usando a ferramenta mcp__escritorio__informar_status (se você tiver acesso a ela).',
    '- Ao terminar, responda com um resumo curto do que fez e do resultado.',
    `Projeto: ${ordem.projeto}`,
    ...(recado ? ['', '[Reunião] O humano te chamou para a sala de reunião e deixou este recado. Vale para esta ordem:', recado] : []),
    '',
    'Ordem:',
    ordem.instrucao,
  ].join('\n')
}

export function tituloDaSessao(agente: Pick<Agente, 'apelido'>, ordem: Pick<Ordem, 'instrucao'>): string {
  const instrucao = ordem.instrucao.replace(/\s+/g, ' ').trim()
  const curta = instrucao.length > 60 ? `${instrucao.slice(0, 59).trimEnd()}…` : instrucao
  return `Escritório · ${agente.apelido} · ${curta}`
}

// Cópia do ambiente sem as variáveis de uma sessão do Claude Code aninhada nem as do escritório (e sem a API key, salvo configuração).
export function ambienteLimpo(config: Pick<Config, 'usarApiKey' | 'versao'>, base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [nome, valor] of Object.entries(base)) {
    if (valor === undefined) continue
    if (NOMES_REMOVIDOS.has(nome) || PREFIXOS_REMOVIDOS.some((prefixo) => nome.startsWith(prefixo))) continue
    if (nome === 'ANTHROPIC_API_KEY' && !config.usarApiKey) continue
    env[nome] = valor
  }
  env.CLAUDE_AGENT_SDK_CLIENT_APP = `escritorio-de-agentes/${config.versao}`
  // Subagentes e comandos em segundo plano fariam o result chegar antes do fim do trabalho, e a ordem terminaria no meio.
  env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1'
  return env
}

export type ExtrasDasOpcoes = {
  canUseTool: CanUseTool
  ferramentas: McpSdkServerConfigWithInstance
  abortController: AbortController
  stderr: (dados: string) => void
}

// Opções do query() para uma ordem: agente nomeado via `agent`, generalista com o prompt do Claude Code.
export function montarOpcoes(
  contexto: Pick<ContextoExecucao, 'ordem' | 'agente' | 'config' | 'retomarSessao'>,
  extras: ExtrasDasOpcoes,
): Options {
  const { ordem, agente, config, retomarSessao } = contexto
  const opcoes: Options = {
    cwd: ordem.projeto,
    settingSources: ['user', 'project', 'local'],
    permissionMode: ordem.modo,
    canUseTool: extras.canUseTool,
    mcpServers: { escritorio: extras.ferramentas },
    allowedTools: [FERRAMENTA_STATUS],
    env: ambienteLimpo(config),
    abortController: extras.abortController,
    stderr: extras.stderr,
    title: tituloDaSessao(agente, ordem),
  }
  if (!config.conectoresClaudeAi) opcoes.settings = { disableClaudeAiConnectors: true }
  if (retomarSessao) opcoes.resume = retomarSessao
  // No plano, a aprovação "liberar tudo" troca a sessão para bypassPermissions, que só existe se liberado na largada.
  if (ordem.modo === 'bypassPermissions' || ordem.modo === 'plan') opcoes.allowDangerouslySkipPermissions = true
  if (agente.generalista) {
    opcoes.systemPrompt = { type: 'preset', preset: 'claude_code' }
    if (config.modeloGeneralista) opcoes.model = config.modeloGeneralista
  } else {
    opcoes.agent = agente.nome
    if (agente.origem) usarAgenteDeProjeto(opcoes, agente, ordem.projeto)
  }
  return opcoes
}

// Agente de projeto: só existe na pasta dele, então vai inteiro nas opções; rodando em outra pasta, ganha acesso à de
// origem e um aviso de que os caminhos relativos do texto dele apontam para lá.
function usarAgenteDeProjeto(opcoes: Options, agente: Agente, projeto: string): void {
  const definicao = agente.arquivo ? lerDefinicaoDoAgente(agente.arquivo) : null
  if (!definicao || !agente.origem) throw new Error(`Não consegui ler a definição do agente ${agente.nome} em ${agente.arquivo ?? agente.origem}.`)
  const origem = agente.origem
  const foraDeCasa = resolve(origem) !== resolve(projeto)
  const aviso = [
    '',
    '---',
    `Nota do Escritório de Agentes: você é um agente do projeto "${basename(origem)}" (${origem}). Quando o texto acima falar de arquivos deste projeto ou deste repositório (por exemplo skills/<nome>/SKILL.md), eles estão em ${origem}: use o caminho completo.`,
    `A pasta de trabalho desta ordem é ${projeto}.`,
  ].join('\n')
  opcoes.agents = { [agente.nome]: foraDeCasa ? { ...definicao, prompt: `${definicao.prompt}\n${aviso}` } : definicao }
  if (foraDeCasa) opcoes.additionalDirectories = [origem]
}

// canUseTool que leva cada pedido do agente ao humano pelo painel. Sempre resolve (nunca null).
export function criarCanUseTool(pedirAoHumano: GanchosExecucao['pedirAoHumano'], sinalExecucao?: AbortSignal): CanUseTool {
  return async (nome, entrada, opcoes) => {
    try {
      if (nome === 'EnterPlanMode') return { behavior: 'allow', updatedInput: entrada }
      if (nome === FERRAMENTA_STATUS && opcoes.mcpServer?.source === 'sdk') return { behavior: 'allow', updatedInput: entrada }
      const sinal = sinalExecucao ? AbortSignal.any([opcoes.signal, sinalExecucao]) : opcoes.signal
      const sufixo = opcoes.agentID ? ' (subagente)' : ''
      if (nome === 'AskUserQuestion') {
        const resposta = await pedirAoHumano({
          tipo: 'pergunta',
          ferramenta: nome,
          titulo: `Tem uma pergunta para você${sufixo}`,
          descricao: null,
          entrada,
          permiteSempre: false,
          caminhoBloqueado: null,
        }, sinal)
        if (!resposta) return INTERROMPIDA
        if (resposta.decisao === 'responder') return { behavior: 'allow', updatedInput: { ...entrada, answers: resposta.respostas ?? {} } }
        return { behavior: 'deny', message: resposta.mensagem || 'O humano preferiu não responder a pergunta.' }
      }
      if (nome === 'ExitPlanMode') {
        const resposta = await pedirAoHumano({
          tipo: 'plano',
          ferramenta: nome,
          titulo: `Terminou o plano e quer sua aprovação${sufixo}`,
          descricao: null,
          entrada,
          permiteSempre: false,
          caminhoBloqueado: null,
        }, sinal)
        if (!resposta) return INTERROMPIDA
        if (resposta.decisao === 'aprovar' || resposta.decisao === 'aprovar_editando') {
          const modo = resposta.decisao === 'aprovar' ? 'default' : 'bypassPermissions'
          return { behavior: 'allow', updatedInput: entrada, updatedPermissions: [{ type: 'setMode', mode: modo, destination: 'session' }] }
        }
        return { behavior: 'deny', message: resposta.mensagem || 'O humano pediu ajustes no plano.' }
      }
      const sugestoes = opcoes.suggestions ?? []
      const permiteSempre = sugestoes.length > 0 && !opcoes.suppressAlwaysAllowRule
      const resposta = await pedirAoHumano({
        tipo: 'permissao',
        ferramenta: nome,
        titulo: `${tituloDaPermissao(nome, entrada)}${sufixo}`,
        descricao: opcoes.description ?? opcoes.decisionReason ?? null,
        entrada,
        permiteSempre,
        caminhoBloqueado: opcoes.blockedPath ?? null,
      }, sinal)
      if (!resposta) return INTERROMPIDA
      if (resposta.decisao === 'permitir') return { behavior: 'allow', updatedInput: entrada }
      if (resposta.decisao === 'permitir_sempre') {
        if (!permiteSempre) return { behavior: 'allow', updatedInput: entrada }
        return {
          behavior: 'allow',
          updatedInput: entrada,
          updatedPermissions: sugestoes.map((sugestao) => ({ ...sugestao, destination: 'session' as const })),
        }
      }
      return { behavior: 'deny', message: resposta.mensagem || 'O humano negou.' }
    } catch (erro) {
      console.error('[escritorio] Falha ao pedir a decisão do humano:', erro)
      return { behavior: 'deny', message: 'Não foi possível pedir a decisão do humano.', interrupt: true }
    }
  }
}

function fimSemMetricas(status: FimExecucao['status'], erro: string | null = null): FimExecucao {
  return { status, resultado: null, erro, custoUsd: null, turnos: null, duracaoMs: null, tokensEntrada: null, tokensSaida: null }
}

function comoParada(fim: FimExecucao): FimExecucao {
  return { ...fim, status: 'parada', erro: null, resultado: fim.status === 'concluida' ? fim.resultado : null }
}

function guardarStderr(linhas: string[], dados: string): void {
  for (const linha of String(dados).split('\n')) {
    if (linha.trim()) linhas.push(linha.trimEnd())
  }
  if (linhas.length > LINHAS_STDERR) linhas.splice(0, linhas.length - LINHAS_STDERR)
}

function mensagemComStderr(mensagem: string, linhas: string[]): string {
  const finais = linhas.slice(-12)
  const texto = finais.length ? `${mensagem}\n\nÚltimas linhas do Claude Code:\n${finais.join('\n')}` : mensagem
  return texto.length > 2000 ? `${texto.slice(0, 1999)}…` : texto
}

function textoDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

// Execução de uma ordem com o Claude Agent SDK, com a função query injetável (os testes usam uma falsa).
export function criarExecucao(contexto: ContextoExecucao, dependencias: DependenciasExecucao = {}): Execucao {
  const fazerQuery = dependencias.query ?? query
  const esperaParadaMs = dependencias.esperaParadaMs ?? 5000
  const esperaSaidaMs = dependencias.esperaSaidaMs ?? 15_000
  const { ganchos, ordem } = contexto
  const entrada = criarFilaDeEntrada<SDKUserMessage>()
  const controlador = new AbortController()
  const pedidos = new AbortController()
  const estado = criarEstadoTraducao(ordem.projeto, Boolean(contexto.retomarSessao))
  const stderr: string[] = []
  let consulta: Query | null = null
  let iniciada = false
  let parando = false
  let abortada = false
  let encerrada = false
  let terminada = false
  let lacoAcabou = false
  let relogioSaida: NodeJS.Timeout | undefined
  let avisarFim: () => void = () => {}
  const fim = new Promise<void>((resolve) => {
    avisarFim = resolve
  })

  const ativa = () => !terminada && !encerrada && !abortada

  function chamar(gancho: string, acao: () => void): void {
    try {
      acao()
    } catch (erro) {
      console.error(`[escritorio] Gancho ${gancho} da ordem ${ordem.id} falhou:`, erro)
    }
  }

  function fechar(): void {
    try {
      consulta?.close()
    } catch {}
  }

  function terminar(dados: FimExecucao): void {
    if (terminada || encerrada) return
    terminada = true
    pedidos.abort()
    entrada.encerrar()
    chamar('aoTerminar', () => ganchos.aoTerminar(dados))
    avisarFim()
    if (!lacoAcabou) {
      relogioSaida = setTimeout(fechar, esperaSaidaMs)
      relogioSaida.unref?.()
    }
  }

  function aplicar(acao: Acao): void {
    switch (acao.tipo) {
      case 'sessao':
        return chamar('aoIniciarSessao', () => ganchos.aoIniciarSessao({ sessaoId: acao.sessaoId, modelo: acao.modelo }))
      case 'atividade':
        return chamar('aoAtividade', () => ganchos.aoAtividade(acao.texto))
      case 'evento':
        return chamar('aoEvento', () => ganchos.aoEvento(acao.evento, acao.texto, acao.detalhe))
      case 'todos':
        return chamar('aoTodos', () => ganchos.aoTodos(acao.todos))
      case 'uso':
        return chamar('aoUsoConta', () => ganchos.aoUsoConta(acao.uso))
      case 'fim':
        return terminar(parando ? comoParada(acao.fim) : acao.fim)
    }
  }

  function aoStatus(texto: string): void {
    if (!ativa()) return
    chamar('aoAtividade', () => ganchos.aoAtividade(texto))
    chamar('aoEvento', () => ganchos.aoEvento('status', texto))
  }

  async function rodar(): Promise<void> {
    try {
      const opcoes = montarOpcoes(contexto, {
        canUseTool: criarCanUseTool(ganchos.pedirAoHumano, pedidos.signal),
        ferramentas: criarFerramentas(aoStatus, contexto.config.versao),
        abortController: controlador,
        stderr: (dados) => guardarStderr(stderr, dados),
      })
      consulta = fazerQuery({ prompt: entrada, options: opcoes })
      entrada.empurrar(mensagemDoUsuario(textoDaOrdem(ordem, contexto.retomarSessao)))
      for await (const msg of consulta) {
        if (!ativa()) continue
        for (const acao of traduzir(msg, estado)) {
          if (!ativa()) break
          aplicar(acao)
        }
      }
      if (parando) terminar(fimSemMetricas('parada'))
      else terminar(fimSemMetricas('erro', mensagemComStderr('O Claude Code terminou sem entregar um resultado.', stderr)))
    } catch (erro) {
      if (parando) terminar(fimSemMetricas('parada'))
      else terminar(fimSemMetricas('erro', mensagemComStderr(`Falha ao rodar o Claude Code: ${textoDoErro(erro)}`, stderr)))
    } finally {
      lacoAcabou = true
      clearTimeout(relogioSaida)
    }
  }

  return {
    iniciar() {
      if (iniciada || terminada || encerrada) return
      iniciada = true
      void rodar()
    },
    async parar() {
      if (terminada || encerrada) return
      parando = true
      pedidos.abort()
      if (!iniciada || !consulta) {
        iniciada = true
        terminar(fimSemMetricas('parada'))
        return
      }
      const atual = consulta
      const limite = setTimeout(() => {
        abortada = true
        controlador.abort()
        fechar()
        terminar(fimSemMetricas('parada'))
      }, esperaParadaMs)
      try {
        await Promise.race([atual.interrupt(), fim])
      } catch {}
      entrada.encerrar()
      await fim
      clearTimeout(limite)
    },
    encerrar() {
      if (encerrada) return
      encerrada = true
      pedidos.abort()
      entrada.encerrar()
      fechar()
      avisarFim()
    },
  }
}

export const criarExecucaoReal: FabricaExecucao = (contexto) => criarExecucao(contexto)

// Pergunta ao Claude Code qual conta está logada, sem chamar o modelo. Rejeita se falhar ou passar do prazo.
export async function sondarConta(
  config: Config,
  dependencias: { query?: FuncaoQuery; prazoMs?: number } = {},
): Promise<{ email: string | null; plano: string | null }> {
  const fazerQuery = dependencias.query ?? query
  const prazoMs = dependencias.prazoMs ?? 25_000
  const entrada = criarFilaDeEntrada<SDKUserMessage>()
  const stderr: string[] = []
  let relogio: NodeJS.Timeout | undefined
  let consulta: Query | null = null
  let drenagem: Promise<void> = Promise.resolve()
  try {
    consulta = fazerQuery({
      prompt: entrada,
      options: {
        cwd: config.dirDados,
        settingSources: [],
        persistSession: false,
        env: ambienteLimpo(config),
        settings: { disableClaudeAiConnectors: true },
        stderr: (dados) => guardarStderr(stderr, dados),
      },
    })
    const atual = consulta
    let erroDoLaco: unknown = null
    drenagem = (async () => {
      try {
        for await (const _ of atual) {}
      } catch (erro) {
        erroDoLaco = erro
      }
    })()
    const saiuAntes = drenagem.then(() => {
      throw erroDoLaco ?? new Error('O Claude Code fechou antes de informar a conta.')
    })
    const prazo = new Promise<never>((_, rejeitar) => {
      relogio = setTimeout(() => rejeitar(new Error(`A conta Claude não respondeu em ${Math.round(prazoMs / 1000)} s.`)), prazoMs)
    })
    const info = await Promise.race([atual.accountInfo(), saiuAntes, prazo])
    const terceiro = info.apiProvider !== undefined && info.apiProvider !== 'firstParty'
    // Sem login nenhum o Claude Code responde tokenSource 'none', que não é credencial.
    const temCredencial = Boolean(
      info.email || info.subscriptionType || (info.tokenSource && info.tokenSource !== 'none') || (info.apiKeySource && info.apiKeySource !== 'none'),
    )
    if (!terceiro && !temCredencial) throw new Error('Nenhum login do Claude neste computador. Rode `claude` e faça /login.')
    return { email: info.email ?? null, plano: info.subscriptionType ?? null }
  } catch (erro) {
    throw new Error(mensagemComStderr(textoDoErro(erro), stderr), { cause: erro })
  } finally {
    clearTimeout(relogio)
    entrada.encerrar()
    try {
      consulta?.close()
    } catch {}
    await Promise.race([drenagem, new Promise((resolve) => setTimeout(resolve, 3000).unref())])
  }
}
