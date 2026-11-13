import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { setTimeout as esperar } from 'node:timers/promises'
import { AbortError } from '@anthropic-ai/claude-agent-sdk'
import type { AccountInfo, CanUseTool, Options, PermissionResult, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import {
  ambienteLimpo,
  criarCanUseTool,
  criarExecucao,
  criarExecucaoReal,
  criarFilaDeEntrada,
  montarOpcoes,
  sondarConta,
  textoDaOrdem,
} from '../src/execucao.ts'
import type { FuncaoQuery } from '../src/execucao.ts'
import { criarFerramentas } from '../src/ferramentas.ts'
import type { Agente, Config, FimExecucao, GanchosExecucao, Ordem, PedidoHumano, RespostaPendencia, TipoEvento, Todo, UsoConta } from '../src/tipos.ts'

const SESSAO = '5aae95e0-82e5-4107-9dba-1f23e39f5f48'

const config: Config = {
  porta: 0,
  host: '127.0.0.1',
  dirDados: '/tmp/escritorio-teste',
  dirProjetos: '/tmp',
  dirAgentes: '/tmp/agentes',
  dirAgentesProjeto: '/tmp/agentes-projeto',
  dirWeb: '/tmp/web',
  maxSimultaneas: 4,
  conectoresClaudeAi: false,
  usarApiKey: false,
  simulado: false,
  modeloGeneralista: null,
  token: 'chave-de-teste-com-mais-de-16',
  versao: '0.1.0',
  dirVida: '/tmp/vida',
  modeloVida: 'haiku',
  intervaloVidaMs: 25_000,
  maxNoLote: 4,
  tetoCustoUsdDoDia: 1,
  tetoHorasVida: 4,
  vidaNoBoot: false,
}

const generalista: Agente = {
  id: 'claude',
  nome: 'Claude',
  apelido: 'Claude',
  descricao: 'Generalista',
  modelo: null,
  cor: '#d97757',
  ferramentas: null,
  memoria: null,
  arquivo: null,
  generalista: true,
  origem: null,
}

const qa: Agente = { ...generalista, id: 'qa-ana', nome: 'QA-Ana', apelido: 'QA Ana', arquivo: '/home/x/.claude/agents/qa-analyst.md', generalista: false }

function criarOrdem(dados: Partial<Ordem> = {}): Ordem {
  return {
    id: 'ordem-1',
    agenteId: 'claude',
    projeto: '/home/ana/projects/loja',
    instrucao: 'Rode os testes e conserte o que falhar.',
    modo: 'default',
    status: 'trabalhando',
    sessaoId: null,
    continuaDe: null,
    modelo: null,
    atividade: null,
    recado: null,
    todos: null,
    resultado: null,
    erro: null,
    aguardaResposta: false,
    custoUsd: null,
    turnos: null,
    duracaoMs: null,
    tokensEntrada: null,
    tokensSaida: null,
    criadaEm: '2026-10-29T12:00:00.000Z',
    iniciadaEm: '2026-10-29T12:00:01.000Z',
    finalizadaEm: null,
    vistaEm: null,
    ...dados,
  }
}

type Registro = {
  sessoes: Array<{ sessaoId: string; modelo: string | null }>
  atividades: string[]
  eventos: Array<{ tipo: TipoEvento; texto: string; detalhe?: unknown }>
  todos: Todo[][]
  usos: Array<Partial<UsoConta>>
  pedidos: Array<{ pedido: PedidoHumano; sinal: AbortSignal }>
  fins: FimExecucao[]
}

function criarGanchos(responder?: (pedido: PedidoHumano, sinal: AbortSignal) => Promise<RespostaPendencia | null>) {
  const registro: Registro = { sessoes: [], atividades: [], eventos: [], todos: [], usos: [], pedidos: [], fins: [] }
  const ganchos: GanchosExecucao = {
    aoIniciarSessao: (info) => registro.sessoes.push(info),
    aoAtividade: (texto) => registro.atividades.push(texto),
    aoEvento: (tipo, texto, detalhe) => registro.eventos.push({ tipo, texto, detalhe }),
    aoTodos: (todos) => registro.todos.push(todos),
    aoUsoConta: (uso) => registro.usos.push(uso),
    pedirAoHumano: async (pedido, sinal) => {
      registro.pedidos.push({ pedido, sinal })
      return responder ? responder(pedido, sinal) : null
    },
    aoTerminar: (fim) => registro.fins.push(fim),
  }
  return { ganchos, registro }
}

function esperarOSinal(_pedido: PedidoHumano, sinal: AbortSignal): Promise<RespostaPendencia | null> {
  return new Promise((resolve) => {
    if (sinal.aborted) resolve(null)
    sinal.addEventListener('abort', () => resolve(null), { once: true })
  })
}

type ConsultaFalsa = {
  opcoes: Options
  prompt: AsyncIterable<SDKUserMessage>
  interrupcoes: number
  fechada: boolean
  emitir(dados: Record<string, unknown>): void
  acabar(): void
  falhar(erro: unknown): void
}

function criarQueryFalsa(comportamento: { aoInterromper?: (c: ConsultaFalsa) => void; conta?: () => Promise<AccountInfo> } = {}) {
  let atual: ConsultaFalsa | null = null
  let chamadas = 0
  const query: FuncaoQuery = ({ prompt, options }) => {
    chamadas++
    const fila: Array<{ msg?: SDKMessage; erro?: unknown; fim?: boolean }> = []
    let acordar: (() => void) | null = null
    const avisar = () => {
      const a = acordar
      acordar = null
      a?.()
    }
    const consulta = {
      opcoes: options as Options,
      prompt: prompt as AsyncIterable<SDKUserMessage>,
      interrupcoes: 0,
      fechada: false,
      emitir(dados: Record<string, unknown>) {
        fila.push({ msg: { uuid: 'u', session_id: SESSAO, ...dados } as unknown as SDKMessage })
        avisar()
      },
      acabar() {
        fila.push({ fim: true })
        avisar()
      },
      falhar(erro: unknown) {
        fila.push({ erro })
        avisar()
      },
      async next(): Promise<IteratorResult<SDKMessage, void>> {
        for (;;) {
          const item = fila.shift()
          if (item?.erro) throw item.erro
          if (item?.fim) return { done: true, value: undefined }
          if (item?.msg) return { done: false, value: item.msg }
          if (consulta.fechada) return { done: true, value: undefined }
          await new Promise<void>((resolve) => {
            acordar = resolve
          })
        }
      },
      async return(): Promise<IteratorResult<SDKMessage, void>> {
        consulta.fechada = true
        return { done: true, value: undefined }
      },
      [Symbol.asyncIterator]() {
        return consulta
      },
      async interrupt() {
        consulta.interrupcoes++
        comportamento.aoInterromper?.(consulta)
        return { still_queued: [] }
      },
      close() {
        consulta.fechada = true
        avisar()
      },
      accountInfo: () => (comportamento.conta ? comportamento.conta() : new Promise<AccountInfo>(() => {})),
    }
    atual = consulta
    return consulta as unknown as Query
  }
  return {
    query,
    get consulta(): ConsultaFalsa {
      assert.ok(atual, 'query() não foi chamada')
      return atual
    },
    get chamadas() {
      return chamadas
    },
  }
}

async function ate(condicao: () => boolean, ms = 2000): Promise<void> {
  const limite = Date.now() + ms
  while (!condicao()) {
    if (Date.now() > limite) throw new Error('condição não aconteceu a tempo')
    await esperar(5)
  }
}

const opcoesDaPermissao = (extra: Record<string, unknown> = {}) =>
  ({ signal: new AbortController().signal, toolUseID: 'toolu_1', requestId: 'req_1', ...extra }) as unknown as Parameters<CanUseTool>[2]

const pergunta = {
  questions: [{
    question: 'Qual nome de arquivo usar?',
    header: 'Arquivo',
    multiSelect: false,
    options: [{ label: 'a.txt', description: 'Arquivo A' }, { label: 'b.txt', description: 'Arquivo B' }],
  }],
}

const resultadoOk = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: 'pronto',
  num_turns: 3,
  duration_ms: 5000,
  duration_api_ms: 4000,
  total_cost_usd: 0.01,
  stop_reason: 'end_turn',
  usage: {},
  modelUsage: { 'claude-haiku-5-5': { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 100, cacheCreationInputTokens: 1000 } },
  permission_denials: [],
}

const resultadoInterrompido = {
  ...resultadoOk,
  subtype: 'error_during_execution',
  is_error: true,
  result: undefined,
  errors: ['[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=null'],
  terminal_reason: 'aborted_streaming',
}

describe('criarCanUseTool', () => {
  it('AskUserQuestion: responder vira allow com as respostas', async () => {
    const { ganchos, registro } = criarGanchos(async () => ({ decisao: 'responder', respostas: { 'Qual nome de arquivo usar?': 'b.txt' } }))
    const resultado = await criarCanUseTool(ganchos.pedirAoHumano)('AskUserQuestion', pergunta, opcoesDaPermissao())
    assert.deepEqual(resultado, { behavior: 'allow', updatedInput: { ...pergunta, answers: { 'Qual nome de arquivo usar?': 'b.txt' } } })
    assert.deepEqual(registro.pedidos[0]?.pedido, {
      tipo: 'pergunta',
      ferramenta: 'AskUserQuestion',
      titulo: 'Tem uma pergunta para você',
      descricao: null,
      entrada: pergunta,
      permiteSempre: false,
      caminhoBloqueado: null,
    })
  })

  it('AskUserQuestion: recusar vira deny com a mensagem (ou a padrão)', async () => {
    const comMotivo = criarGanchos(async () => ({ decisao: 'recusar', mensagem: 'Agora não.' }))
    assert.deepEqual(await criarCanUseTool(comMotivo.ganchos.pedirAoHumano)('AskUserQuestion', pergunta, opcoesDaPermissao()), { behavior: 'deny', message: 'Agora não.' })
    const semMotivo = criarGanchos(async () => ({ decisao: 'recusar' }))
    assert.deepEqual(
      await criarCanUseTool(semMotivo.ganchos.pedirAoHumano)('AskUserQuestion', pergunta, opcoesDaPermissao()),
      { behavior: 'deny', message: 'O humano preferiu não responder a pergunta.' },
    )
  })

  it('pendência cancelada (null) nega e interrompe, nos três tipos', async () => {
    const { ganchos } = criarGanchos(async () => null)
    const pedir = criarCanUseTool(ganchos.pedirAoHumano)
    const interrompida = { behavior: 'deny', message: 'A ordem foi interrompida.', interrupt: true }
    assert.deepEqual(await pedir('AskUserQuestion', pergunta, opcoesDaPermissao()), interrompida)
    assert.deepEqual(await pedir('ExitPlanMode', { plan: '# Plano' }, opcoesDaPermissao()), interrompida)
    assert.deepEqual(await pedir('Bash', { command: 'rm -rf build' }, opcoesDaPermissao()), interrompida)
  })

  it('ExitPlanMode: aprovar muda o modo da sessão; ajustar nega com a mensagem', async () => {
    const plano = { plan: '## Plano\n1. Ler\n2. Corrigir' }
    const aprovar = criarGanchos(async () => ({ decisao: 'aprovar' }))
    assert.deepEqual(await criarCanUseTool(aprovar.ganchos.pedirAoHumano)('ExitPlanMode', plano, opcoesDaPermissao()), {
      behavior: 'allow',
      updatedInput: plano,
      updatedPermissions: [{ type: 'setMode', mode: 'default', destination: 'session' }],
    })
    assert.equal(aprovar.registro.pedidos[0]?.pedido.tipo, 'plano')
    assert.equal(aprovar.registro.pedidos[0]?.pedido.titulo, 'Terminou o plano e quer sua aprovação')
    const editando = criarGanchos(async () => ({ decisao: 'aprovar_editando' }))
    assert.deepEqual(await criarCanUseTool(editando.ganchos.pedirAoHumano)('ExitPlanMode', plano, opcoesDaPermissao()), {
      behavior: 'allow',
      updatedInput: plano,
      updatedPermissions: [{ type: 'setMode', mode: 'bypassPermissions', destination: 'session' }],
    })
    const ajustar = criarGanchos(async () => ({ decisao: 'ajustar', mensagem: 'Faça em duas etapas.' }))
    assert.deepEqual(await criarCanUseTool(ajustar.ganchos.pedirAoHumano)('ExitPlanMode', plano, opcoesDaPermissao()), { behavior: 'deny', message: 'Faça em duas etapas.' })
    const ajustarSemTexto = criarGanchos(async () => ({ decisao: 'ajustar' }))
    assert.deepEqual(
      await criarCanUseTool(ajustarSemTexto.ganchos.pedirAoHumano)('ExitPlanMode', plano, opcoesDaPermissao()),
      { behavior: 'deny', message: 'O humano pediu ajustes no plano.' },
    )
  })

  it('EnterPlanMode e o informar_status do próprio escritório passam sem perguntar', async () => {
    const { ganchos, registro } = criarGanchos()
    const pedir = criarCanUseTool(ganchos.pedirAoHumano)
    assert.deepEqual(await pedir('EnterPlanMode', {}, opcoesDaPermissao()), { behavior: 'allow', updatedInput: {} })
    assert.deepEqual(
      await pedir('mcp__escritorio__informar_status', { texto: 'oi' }, opcoesDaPermissao({ mcpServer: { name: 'escritorio', source: 'sdk' } })),
      { behavior: 'allow', updatedInput: { texto: 'oi' } },
    )
    assert.equal(registro.pedidos.length, 0)
  })

  it('permissão genérica: título, descrição, caminho bloqueado e "permitir sempre" só na sessão', async () => {
    const entrada = { command: 'echo hello-escritorio > saida.txt', description: 'Write hello-escritorio into saida.txt' }
    const sugestoes = [
      { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'echo hello-escritorio *' }], behavior: 'allow', destination: 'localSettings' },
      { type: 'addDirectories', directories: ['/home/ana/projects/loja'], destination: 'session' },
    ]
    const opcoes = opcoesDaPermissao({ suggestions: sugestoes, blockedPath: '/home/ana/projects/loja/saida.txt', description: 'Write hello-escritorio into saida.txt' })
    const sempre = criarGanchos(async () => ({ decisao: 'permitir_sempre' }))
    const resultado = await criarCanUseTool(sempre.ganchos.pedirAoHumano)('Bash', entrada, opcoes)
    assert.deepEqual(resultado, {
      behavior: 'allow',
      updatedInput: entrada,
      updatedPermissions: [
        { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'echo hello-escritorio *' }], behavior: 'allow', destination: 'session' },
        { type: 'addDirectories', directories: ['/home/ana/projects/loja'], destination: 'session' },
      ],
    })
    assert.deepEqual(sempre.registro.pedidos[0]?.pedido, {
      tipo: 'permissao',
      ferramenta: 'Bash',
      titulo: 'Quer executar um comando',
      descricao: 'Write hello-escritorio into saida.txt',
      entrada,
      permiteSempre: true,
      caminhoBloqueado: '/home/ana/projects/loja/saida.txt',
    })
    const permitir = criarGanchos(async () => ({ decisao: 'permitir' }))
    assert.deepEqual(await criarCanUseTool(permitir.ganchos.pedirAoHumano)('Bash', entrada, opcoes), { behavior: 'allow', updatedInput: entrada })
    const negar = criarGanchos(async () => ({ decisao: 'negar', mensagem: 'Não escreva aí.' }))
    assert.deepEqual(await criarCanUseTool(negar.ganchos.pedirAoHumano)('Bash', entrada, opcoes), { behavior: 'deny', message: 'Não escreva aí.' })
    const negarSemMotivo = criarGanchos(async () => ({ decisao: 'negar' }))
    assert.deepEqual(await criarCanUseTool(negarSemMotivo.ganchos.pedirAoHumano)('Bash', entrada, opcoes), { behavior: 'deny', message: 'O humano negou.' })
  })

  it('sem sugestões não oferece "permitir sempre"; descrição cai para decisionReason', async () => {
    const { ganchos, registro } = criarGanchos(async () => ({ decisao: 'permitir' }))
    await criarCanUseTool(ganchos.pedirAoHumano)('mcp__github__create_issue', { title: 'x' }, opcoesDaPermissao({ decisionReason: 'Regra do projeto' }))
    const pedido = registro.pedidos[0]?.pedido
    assert.equal(pedido?.permiteSempre, false)
    assert.equal(pedido?.descricao, 'Regra do projeto')
    assert.equal(pedido?.titulo, 'Quer usar a ferramenta create_issue de github')
    assert.equal(pedido?.caminhoBloqueado, null)
  })

  it('pedido de dentro de um subagente ganha o sufixo no título', async () => {
    const { ganchos, registro } = criarGanchos(async () => ({ decisao: 'permitir' }))
    const pedir = criarCanUseTool(ganchos.pedirAoHumano)
    await pedir('Write', { file_path: '/x', content: 'y' }, opcoesDaPermissao({ agentID: 'agent-7' }))
    await pedir('AskUserQuestion', pergunta, opcoesDaPermissao({ agentID: 'agent-7' }))
    assert.equal(registro.pedidos[0]?.pedido.titulo, 'Quer criar ou sobrescrever um arquivo (subagente)')
    assert.equal(registro.pedidos[1]?.pedido.titulo, 'Tem uma pergunta para você (subagente)')
  })

  it('o sinal da execução também cancela a pendência; um gancho que falha nunca deixa o SDK sem resposta', async () => {
    const execucao = new AbortController()
    const { ganchos, registro } = criarGanchos(esperarOSinal)
    const promessa = criarCanUseTool(ganchos.pedirAoHumano, execucao.signal)('Bash', { command: 'ls' }, opcoesDaPermissao())
    await ate(() => registro.pedidos.length === 1)
    assert.equal(registro.pedidos[0]?.sinal.aborted, false)
    execucao.abort()
    assert.deepEqual(await promessa, { behavior: 'deny', message: 'A ordem foi interrompida.', interrupt: true })
    const quebrado = criarCanUseTool(async () => {
      throw new Error('banco fora do ar')
    })
    const original = console.error
    console.error = () => {}
    try {
      const resultado: PermissionResult | null = await quebrado('Bash', { command: 'ls' }, opcoesDaPermissao())
      assert.equal(resultado?.behavior, 'deny')
    } finally {
      console.error = original
    }
  })
})

describe('opções e ambiente', () => {
  it('ambienteLimpo tira as variáveis da sessão aninhada, as do escritório e a API key', () => {
    const base = {
      PATH: '/usr/bin',
      HOME: '/home/ana',
      CLAUDE_CONFIG_DIR: '/home/ana/.claude',
      CLAUDECODE: '1',
      CLAUDE_PID: '123',
      CLAUDE_EFFORT: 'xhigh',
      AI_AGENT: 'claude-code',
      CLAUDE_CODE_ENTRYPOINT: 'claude-vscode',
      CLAUDE_CODE_SESSION_ID: 'abc',
      CLAUDE_AGENT_SDK_VERSION: '0.3.312',
      ANTHROPIC_API_KEY: 'sk-ant-x',
      ESCRITORIO_TOKEN: 'segredo-da-chave-123456',
      ESCRITORIO_PORTA: '41793',
      ESCRITORIO_URL_WEB: 'http://localhost:5173',
      VAZIA: undefined,
    }
    assert.deepEqual(ambienteLimpo(config, base), {
      PATH: '/usr/bin',
      HOME: '/home/ana',
      CLAUDE_CONFIG_DIR: '/home/ana/.claude',
      CLAUDE_AGENT_SDK_CLIENT_APP: 'escritorio-de-agentes/0.1.0',
      CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
    })
    assert.equal(ambienteLimpo({ ...config, usarApiKey: true }, base).ANTHROPIC_API_KEY, 'sk-ant-x')
  })

  it('tarefas em segundo plano ficam desligadas mesmo com o filtro de CLAUDE_CODE_* e um valor herdado', () => {
    const env = ambienteLimpo(config, { PATH: '/usr/bin', CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '0' })
    assert.equal(env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, '1')
    const extras = { canUseTool: criarCanUseTool(async () => null), ferramentas: criarFerramentas(() => {}), abortController: new AbortController(), stderr: () => {} }
    const opcoes = montarOpcoes({ ordem: criarOrdem(), agente: qa, config, retomarSessao: null }, extras)
    assert.equal(opcoes.env?.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, '1')
  })

  it('generalista usa o prompt do Claude Code e o modelo configurado; agente nomeado usa `agent`', () => {
    const extras = {
      canUseTool: criarCanUseTool(async () => null),
      ferramentas: criarFerramentas(() => {}),
      abortController: new AbortController(),
      stderr: () => {},
    }
    const ordem = criarOrdem({ modo: 'plan' })
    const geral = montarOpcoes({ ordem, agente: generalista, config: { ...config, modeloGeneralista: 'haiku' }, retomarSessao: null }, extras)
    assert.deepEqual(geral.systemPrompt, { type: 'preset', preset: 'claude_code' })
    assert.equal(geral.model, 'haiku')
    assert.equal(geral.agent, undefined)
    assert.equal(geral.permissionMode, 'plan')
    assert.equal(geral.cwd, '/home/ana/projects/loja')
    assert.deepEqual(geral.settingSources, ['user', 'project', 'local'])
    assert.deepEqual(geral.allowedTools, ['mcp__escritorio__informar_status'])
    assert.deepEqual(geral.settings, { disableClaudeAiConnectors: true })
    assert.equal(geral.resume, undefined)
    assert.equal(geral.persistSession, undefined)
    assert.equal(geral.title, 'Escritório · Claude · Rode os testes e conserte o que falhar.')
    assert.equal(geral.mcpServers?.escritorio, extras.ferramentas)
    assert.equal(geral.env?.CLAUDE_AGENT_SDK_CLIENT_APP, 'escritorio-de-agentes/0.1.0')
    const semModelo = montarOpcoes({ ordem, agente: generalista, config, retomarSessao: null }, extras)
    assert.equal(semModelo.model, undefined)
    const nomeado = montarOpcoes({ ordem: criarOrdem(), agente: qa, config: { ...config, conectoresClaudeAi: true, modeloGeneralista: 'haiku' }, retomarSessao: SESSAO }, extras)
    assert.equal(nomeado.agent, 'QA-Ana')
    assert.equal(nomeado.systemPrompt, undefined)
    assert.equal(nomeado.model, undefined)
    assert.equal(nomeado.permissionMode, 'default')
    assert.equal(nomeado.settings, undefined)
    assert.equal(nomeado.resume, SESSAO)
  })

  it('automático liga o bypass; o plano já sai liberado para a aprovação "liberar tudo"; os outros modos não', () => {
    const extras = { canUseTool: criarCanUseTool(async () => null), ferramentas: criarFerramentas(() => {}), abortController: new AbortController(), stderr: () => {} }
    const opcoesDo = (modo: Ordem['modo']) => montarOpcoes({ ordem: criarOrdem({ modo }), agente: qa, config, retomarSessao: null }, extras)
    assert.equal(opcoesDo('bypassPermissions').permissionMode, 'bypassPermissions')
    assert.equal(opcoesDo('bypassPermissions').allowDangerouslySkipPermissions, true)
    assert.equal(opcoesDo('plan').allowDangerouslySkipPermissions, true)
    assert.equal(opcoesDo('default').allowDangerouslySkipPermissions, undefined)
    assert.equal(opcoesDo('acceptEdits').allowDangerouslySkipPermissions, undefined)
  })

  it('agente de projeto vai inteiro nas opções; fora da pasta dele ganha acesso a ela e o aviso dos caminhos', (t) => {
    const raiz = mkdtempSync(join(tmpdir(), 'escritorio-agente-projeto-'))
    t.after(() => rmSync(raiz, { recursive: true, force: true }))
    const origem = join(raiz, 'skills')
    mkdirSync(join(origem, '.claude', 'agents'), { recursive: true })
    const arquivo = join(origem, '.claude', 'agents', 'designer.md')
    writeFileSync(arquivo, [
      '---',
      'name: designer',
      'description: >-',
      '  Use para interface e animação.',
      'tools: Read, Edit',
      'model: sonnet',
      '---',
      '',
      '# Designer',
      'Carregue skills/<nome>/SKILL.md deste repositório.',
      '',
    ].join('\n'))
    const designer: Agente = { ...qa, id: 'designer', nome: 'designer', apelido: 'Designer', arquivo, origem }
    const extras = { canUseTool: criarCanUseTool(async () => null), ferramentas: criarFerramentas(() => {}), abortController: new AbortController(), stderr: () => {} }

    const fora = montarOpcoes({ ordem: criarOrdem(), agente: designer, config, retomarSessao: null }, extras)
    assert.equal(fora.agent, 'designer')
    const definicao = fora.agents?.designer
    assert.equal(definicao?.description, 'Use para interface e animação.')
    assert.deepEqual(definicao?.tools, ['Read', 'Edit'])
    assert.equal(definicao?.model, 'sonnet')
    assert.ok(definicao?.prompt.startsWith('# Designer\nCarregue skills/<nome>/SKILL.md deste repositório.'))
    assert.match(definicao?.prompt ?? '', new RegExp(`você é um agente do projeto "skills" \\(${origem}\\)`))
    assert.match(definicao?.prompt ?? '', /A pasta de trabalho desta ordem é \/home\/ana\/projects\/loja\./)
    assert.deepEqual(fora.additionalDirectories, [origem])

    const emCasa = montarOpcoes({ ordem: criarOrdem({ projeto: origem }), agente: designer, config, retomarSessao: null }, extras)
    assert.equal(emCasa.agents?.designer?.prompt, '# Designer\nCarregue skills/<nome>/SKILL.md deste repositório.')
    assert.equal(emCasa.additionalDirectories, undefined)

    assert.throws(
      () => montarOpcoes({ ordem: criarOrdem(), agente: { ...designer, arquivo: join(origem, 'sumiu.md') }, config, retomarSessao: null }, extras),
      /Não consegui ler a definição do agente designer/,
    )
  })

  it('título da sessão corta a instrução em 60 caracteres', () => {
    const extras = { canUseTool: criarCanUseTool(async () => null), ferramentas: criarFerramentas(() => {}), abortController: new AbortController(), stderr: () => {} }
    const opcoes = montarOpcoes({ ordem: criarOrdem({ instrucao: `Faça ${'muita coisa '.repeat(20)}` }), agente: qa, config, retomarSessao: null }, extras)
    const curta = opcoes.title?.replace('Escritório · QA Ana · ', '') ?? ''
    assert.ok(curta.length <= 60 && curta.length >= 55)
    assert.ok(curta.endsWith('…'))
    assert.ok(!curta.endsWith(' …'))
  })

  it('o preâmbulo do escritório só vai em sessão nova', () => {
    const ordem = criarOrdem()
    const nova = textoDaOrdem(ordem, null)
    assert.ok(nova.startsWith('[Escritório de Agentes] Esta ordem veio do painel do Escritório de Agentes.'))
    assert.ok(nova.includes('- Quando precisar de uma decisão, confirmação ou informação do humano, use a ferramenta AskUserQuestion'))
    assert.ok(nova.includes('mcp__escritorio__informar_status (se você tiver acesso a ela).'))
    assert.ok(nova.endsWith('Projeto: /home/ana/projects/loja\n\nOrdem:\nRode os testes e conserte o que falhar.'))
    assert.equal(textoDaOrdem(ordem, SESSAO), 'Rode os testes e conserte o que falhar.')
  })

  it('o recado da reunião entra num bloco próprio, antes da instrução e só em sessão nova', () => {
    const ordem = criarOrdem({ recado: 'Todo PR precisa de teste.' })
    const nova = textoDaOrdem(ordem, null)
    assert.ok(nova.includes('\n[Reunião] O humano te chamou para a sala de reunião e deixou este recado. Vale para esta ordem:\nTodo PR precisa de teste.\n'))
    assert.ok(nova.indexOf('Todo PR precisa de teste.') < nova.indexOf('Ordem:'), 'o recado veio depois da instrução')
    assert.ok(nova.endsWith('Ordem:\nRode os testes e conserte o que falhar.'))
    // Ao retomar, o agente já tem o contexto: vai só a instrução.
    assert.equal(textoDaOrdem(ordem, SESSAO), 'Rode os testes e conserte o que falhar.')
    // Recado em branco não abre bloco nenhum.
    assert.equal(textoDaOrdem(criarOrdem({ recado: '   ' }), null), textoDaOrdem(criarOrdem(), null))
  })

  it('a fila de entrada entrega o que foi empurrado e termina ao encerrar', async () => {
    const fila = criarFilaDeEntrada<number>()
    fila.empurrar(1)
    const iterador = fila[Symbol.asyncIterator]()
    assert.deepEqual(await iterador.next(), { value: 1, done: false })
    const proximo = iterador.next()
    fila.empurrar(2)
    assert.deepEqual(await proximo, { value: 2, done: false })
    const ultimo = iterador.next()
    fila.encerrar()
    assert.deepEqual(await ultimo, { value: undefined, done: true })
    fila.empurrar(3)
    assert.deepEqual(await iterador.next(), { value: undefined, done: true })
  })

  it('a ferramenta informar_status chama aoStatus', async () => {
    const recebidos: string[] = []
    const servidor = criarFerramentas((texto) => recebidos.push(texto), '9.9.9')
    assert.equal(servidor.type, 'sdk')
    assert.equal(servidor.name, 'escritorio')
    const [lado, outroLado] = InMemoryTransport.createLinkedPair()
    await servidor.instance.connect(lado)
    const cliente = new Client({ name: 'teste', version: '0.0.0' })
    await cliente.connect(outroLado)
    const { tools } = await cliente.listTools()
    assert.deepEqual(tools.map((t) => t.name), ['informar_status'])
    const resposta = await cliente.callTool({ name: 'informar_status', arguments: { texto: 'Rodando os testes' } })
    assert.deepEqual(resposta.content, [{ type: 'text', text: 'Status mostrado no painel.' }])
    assert.deepEqual(recebidos, ['Rodando os testes'])
    const vazia = await cliente.callTool({ name: 'informar_status', arguments: { texto: '' } })
    assert.equal(vazia.isError, true)
    await cliente.close()
  })
})

describe('criarExecucao', () => {
  const contexto = (ganchos: GanchosExecucao, dados: { agente?: Agente; retomarSessao?: string | null; ordem?: Ordem } = {}) => ({
    ordem: dados.ordem ?? criarOrdem(),
    agente: dados.agente ?? generalista,
    retomarSessao: dados.retomarSessao ?? null,
    ganchos,
    config,
  })

  it('fluxo completo: sessão, atividade, eventos, uso e fim concluída; a entrada fecha depois do result', async () => {
    const falsa = criarQueryFalsa()
    const { ganchos, registro } = criarGanchos()
    const execucao = criarExecucao(contexto(ganchos), { query: falsa.query })
    execucao.iniciar()
    execucao.iniciar()
    assert.equal(falsa.chamadas, 1)
    const entrada = falsa.consulta.prompt[Symbol.asyncIterator]()
    const primeira = await entrada.next()
    assert.equal(primeira.done, false)
    const mensagem = primeira.value as SDKUserMessage
    assert.equal(mensagem.type, 'user')
    assert.equal(mensagem.parent_tool_use_id, null)
    assert.ok(String(mensagem.message.content).startsWith('[Escritório de Agentes]'))
    falsa.consulta.emitir({ type: 'system', subtype: 'init', model: 'claude-haiku-5-5', permissionMode: 'default', tools: [], mcp_servers: [] })
    falsa.consulta.emitir({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.04 } } } })
    falsa.consulta.emitir({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/home/ana/projects/loja/package.json' } }] } })
    falsa.consulta.emitir({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'pronto' }] } })
    falsa.consulta.emitir(resultadoOk)
    await ate(() => registro.fins.length === 1)
    assert.deepEqual(await entrada.next(), { value: undefined, done: true })
    falsa.consulta.emitir({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'depois do fim' }] } })
    falsa.consulta.acabar()
    await esperar(20)
    assert.deepEqual(registro.sessoes, [{ sessaoId: SESSAO, modelo: 'claude-haiku-5-5' }])
    assert.deepEqual(registro.atividades, ['Lendo package.json', 'pronto'])
    assert.deepEqual(registro.eventos.map((e) => `${e.tipo}:${e.texto}`), [
      'sistema:Sessão iniciada (modelo claude-haiku-5-5)',
      'ferramenta:Lendo package.json',
      'texto:pronto',
    ])
    assert.equal(registro.usos[0]?.cincoHoras, 0.04)
    assert.deepEqual(registro.fins, [{
      status: 'concluida',
      resultado: 'pronto',
      erro: null,
      custoUsd: 0.01,
      turnos: 3,
      duracaoMs: 5000,
      tokensEntrada: 1110,
      tokensSaida: 5,
    }])
  })

  it('sessão retomada manda só a instrução', async () => {
    const falsa = criarQueryFalsa()
    const { ganchos } = criarGanchos()
    const execucao = criarExecucao(contexto(ganchos, { retomarSessao: SESSAO, agente: qa }), { query: falsa.query })
    execucao.iniciar()
    const primeira = await falsa.consulta.prompt[Symbol.asyncIterator]().next()
    assert.equal((primeira.value as SDKUserMessage).message.content, 'Rode os testes e conserte o que falhar.')
    assert.equal(falsa.consulta.opcoes.resume, SESSAO)
    assert.equal(falsa.consulta.opcoes.agent, 'QA-Ana')
    execucao.encerrar()
  })

  it('informar_status do agente vira atividade + evento status', async () => {
    const falsa = criarQueryFalsa()
    const { ganchos, registro } = criarGanchos()
    const execucao = criarExecucao(contexto(ganchos), { query: falsa.query })
    execucao.iniciar()
    const servidor = falsa.consulta.opcoes.mcpServers?.escritorio
    assert.ok(servidor && 'instance' in servidor)
    const [lado, outroLado] = InMemoryTransport.createLinkedPair()
    await servidor.instance.connect(lado)
    const cliente = new Client({ name: 'teste', version: '0.0.0' })
    await cliente.connect(outroLado)
    await cliente.callTool({ name: 'informar_status', arguments: { texto: 'Lendo o código' } })
    assert.deepEqual(registro.atividades, ['Lendo o código'])
    assert.deepEqual(registro.eventos, [{ tipo: 'status', texto: 'Lendo o código', detalhe: undefined }])
    await cliente.close()
    execucao.encerrar()
  })

  it('parar: interrompe, o result vira "parada" com métricas e aoTerminar é chamado uma vez', async () => {
    const falsa = criarQueryFalsa({ aoInterromper: (c) => c.emitir(resultadoInterrompido) })
    const { ganchos, registro } = criarGanchos()
    const execucao = criarExecucao(contexto(ganchos), { query: falsa.query, esperaParadaMs: 2000 })
    execucao.iniciar()
    falsa.consulta.emitir({ type: 'system', subtype: 'init', model: 'claude-haiku-5-5', tools: [], mcp_servers: [] })
    await ate(() => registro.sessoes.length === 1)
    await execucao.parar()
    assert.equal(falsa.consulta.interrupcoes, 1)
    assert.equal(registro.fins.length, 1)
    assert.equal(registro.fins[0]?.status, 'parada')
    assert.equal(registro.fins[0]?.erro, null)
    assert.equal(registro.fins[0]?.custoUsd, 0.01)
    falsa.consulta.falhar(new Error('Claude Code returned an error result: [ede_diagnostic]'))
    await execucao.parar()
    await esperar(20)
    assert.equal(registro.fins.length, 1)
  })

  it('parar sem result em 5 s (aqui 50 ms): aborta, fecha e termina "parada" uma vez', async () => {
    const falsa = criarQueryFalsa()
    const { ganchos, registro } = criarGanchos()
    const execucao = criarExecucao(contexto(ganchos), { query: falsa.query, esperaParadaMs: 50 })
    execucao.iniciar()
    const inicio = Date.now()
    await execucao.parar()
    assert.ok(Date.now() - inicio >= 45)
    assert.equal(falsa.consulta.fechada, true)
    assert.equal(falsa.consulta.opcoes.abortController?.signal.aborted, true)
    assert.deepEqual(registro.fins, [{ status: 'parada', resultado: null, erro: null, custoUsd: null, turnos: null, duracaoMs: null, tokensEntrada: null, tokensSaida: null }])
    falsa.consulta.emitir(resultadoOk)
    await esperar(20)
    assert.equal(registro.fins.length, 1)
  })

  it('parar com uma pendência aberta: o pedido é cancelado e o SDK recebe deny + interrupt', async () => {
    const falsa = criarQueryFalsa()
    const { ganchos, registro } = criarGanchos(esperarOSinal)
    const execucao = criarExecucao(contexto(ganchos), { query: falsa.query, esperaParadaMs: 100 })
    execucao.iniciar()
    const canUseTool = falsa.consulta.opcoes.canUseTool
    assert.ok(canUseTool)
    const decisao = canUseTool('Bash', { command: 'npm publish' }, opcoesDaPermissao())
    await ate(() => registro.pedidos.length === 1)
    const parada = execucao.parar()
    assert.deepEqual(await decisao, { behavior: 'deny', message: 'A ordem foi interrompida.', interrupt: true })
    falsa.consulta.emitir(resultadoInterrompido)
    await parada
    assert.equal(registro.fins.length, 1)
    assert.equal(registro.fins[0]?.status, 'parada')
  })

  it('AbortError depois de parar não é erro', async () => {
    const falsa = criarQueryFalsa({ aoInterromper: (c) => c.falhar(new AbortError('Claude Code process aborted by user')) })
    const { ganchos, registro } = criarGanchos()
    const execucao = criarExecucao(contexto(ganchos), { query: falsa.query })
    execucao.iniciar()
    await execucao.parar()
    assert.equal(registro.fins.length, 1)
    assert.equal(registro.fins[0]?.status, 'parada')
  })

  it('parar antes de iniciar termina "parada" sem chamar o SDK', async () => {
    const falsa = criarQueryFalsa()
    const { ganchos, registro } = criarGanchos()
    const execucao = criarExecucao(contexto(ganchos), { query: falsa.query })
    await execucao.parar()
    execucao.iniciar()
    assert.equal(falsa.chamadas, 0)
    assert.equal(registro.fins.length, 1)
    assert.equal(registro.fins[0]?.status, 'parada')
  })

  it('encerrar fecha na hora e não chama aoTerminar', async () => {
    const falsa = criarQueryFalsa()
    const { ganchos, registro } = criarGanchos()
    const execucao = criarExecucao(contexto(ganchos), { query: falsa.query })
    execucao.iniciar()
    falsa.consulta.emitir({ type: 'system', subtype: 'init', model: 'm', tools: [], mcp_servers: [] })
    await ate(() => registro.sessoes.length === 1)
    execucao.encerrar()
    assert.equal(falsa.consulta.fechada, true)
    falsa.consulta.emitir(resultadoOk)
    await execucao.parar()
    await esperar(20)
    assert.deepEqual(registro.fins, [])
  })

  it('erro lançado vira "erro" com a mensagem e as últimas linhas do stderr', async () => {
    const falsa = criarQueryFalsa()
    const { ganchos, registro } = criarGanchos()
    const execucao = criarExecucao(contexto(ganchos), { query: falsa.query })
    execucao.iniciar()
    falsa.consulta.opcoes.stderr?.('Error: spawn falhou\n    at algum lugar\n')
    falsa.consulta.opcoes.stderr?.('linha final do stderr\n')
    falsa.consulta.falhar(new Error('Claude Code process exited with code 1'))
    await ate(() => registro.fins.length === 1)
    const fim = registro.fins[0]
    assert.equal(fim?.status, 'erro')
    assert.ok(fim?.erro?.startsWith('Falha ao rodar o Claude Code: Claude Code process exited with code 1'))
    assert.ok(fim?.erro?.includes('Últimas linhas do Claude Code:\nError: spawn falhou\n    at algum lugar\nlinha final do stderr'))
  })

  it('query() que falha na hora também termina com erro', async () => {
    const { ganchos, registro } = criarGanchos()
    const execucao = criarExecucao(contexto(ganchos), {
      query: () => {
        throw new Error('Native CLI binary for linux-x64 not found.')
      },
    })
    execucao.iniciar()
    await ate(() => registro.fins.length === 1)
    assert.equal(registro.fins[0]?.status, 'erro')
    assert.ok(registro.fins[0]?.erro?.includes('Native CLI binary'))
  })

  it('fluxo que acaba sem result termina com erro', async () => {
    const falsa = criarQueryFalsa()
    const { ganchos, registro } = criarGanchos()
    const execucao = criarExecucao(contexto(ganchos), { query: falsa.query })
    execucao.iniciar()
    falsa.consulta.acabar()
    await ate(() => registro.fins.length === 1)
    assert.equal(registro.fins[0]?.status, 'erro')
    assert.ok(registro.fins[0]?.erro?.startsWith('O Claude Code terminou sem entregar um resultado.'))
  })

  it('result de erro sem parada vira "erro"; o throw que vem depois é ignorado', async () => {
    const falsa = criarQueryFalsa()
    const { ganchos, registro } = criarGanchos()
    const execucao = criarExecucao(contexto(ganchos), { query: falsa.query })
    execucao.iniciar()
    falsa.consulta.emitir({ ...resultadoInterrompido, subtype: 'error_max_turns', errors: [] })
    falsa.consulta.falhar(new Error('Claude Code returned an error result'))
    await ate(() => registro.fins.length === 1)
    await esperar(20)
    assert.equal(registro.fins.length, 1)
    assert.equal(registro.fins[0]?.erro, 'Atingiu o limite de turnos.')
  })

  it('processo que não sai depois do fim é fechado', async () => {
    const falsa = criarQueryFalsa()
    const { ganchos, registro } = criarGanchos()
    const execucao = criarExecucao(contexto(ganchos), { query: falsa.query, esperaSaidaMs: 30 })
    execucao.iniciar()
    falsa.consulta.emitir(resultadoOk)
    await ate(() => registro.fins.length === 1)
    await ate(() => falsa.consulta.fechada)
  })

  it('criarExecucaoReal é a fábrica que o escritório usa', () => {
    assert.equal(typeof criarExecucaoReal, 'function')
  })
})

describe('sondarConta', () => {
  it('devolve e-mail e plano, e fecha a consulta', async () => {
    const falsa = criarQueryFalsa({ conta: async () => ({ email: 'ana@exemplo.com', subscriptionType: 'Claude Max', apiProvider: 'firstParty' }) })
    const conta = await sondarConta(config, { query: falsa.query })
    assert.deepEqual(conta, { email: 'ana@exemplo.com', plano: 'Claude Max' })
    assert.equal(falsa.consulta.fechada, true)
    assert.deepEqual(falsa.consulta.opcoes.settingSources, [])
    assert.equal(falsa.consulta.opcoes.persistSession, false)
    assert.deepEqual(falsa.consulta.opcoes.settings, { disableClaudeAiConnectors: true })
    assert.equal(falsa.consulta.opcoes.env?.CLAUDECODE, undefined)
    assert.equal(falsa.consulta.opcoes.env?.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS, '1')
    const entrada = await falsa.consulta.prompt[Symbol.asyncIterator]().next()
    assert.equal(entrada.done, true)
  })

  it('rejeita quando passa do prazo', async () => {
    const falsa = criarQueryFalsa()
    await assert.rejects(sondarConta(config, { query: falsa.query, prazoMs: 30 }), /não respondeu/)
    assert.equal(falsa.consulta.fechada, true)
  })

  it('rejeita quando o processo cai antes de responder, com o stderr', async () => {
    const falsa = criarQueryFalsa()
    const promessa = sondarConta(config, { query: falsa.query, prazoMs: 2000 })
    falsa.consulta.opcoes.stderr?.('erro de login\n')
    falsa.consulta.falhar(new Error('Claude Code process exited with code 1'))
    await assert.rejects(promessa, (erro: Error) => erro.message.includes('exited with code 1') && erro.message.includes('erro de login'))
  })

  it('rejeita quando não há login nenhum (o Claude Code responde tokenSource "none")', async () => {
    const falsa = criarQueryFalsa({ conta: async () => ({ tokenSource: 'none', apiProvider: 'firstParty' }) })
    await assert.rejects(sondarConta(config, { query: falsa.query }), /Nenhum login/)
    const semNada = criarQueryFalsa({ conta: async () => ({ apiKeySource: 'none' }) })
    await assert.rejects(sondarConta(config, { query: semNada.query }), /Nenhum login/)
  })

  it('aceita uma credencial sem e-mail (token de outra fonte) e provedores de terceiros', async () => {
    const token = criarQueryFalsa({ conta: async () => ({ tokenSource: 'apiKeyHelper', apiProvider: 'firstParty' }) })
    assert.deepEqual(await sondarConta(config, { query: token.query }), { email: null, plano: null })
    const bedrock = criarQueryFalsa({ conta: async () => ({ apiProvider: 'bedrock' }) })
    assert.deepEqual(await sondarConta(config, { query: bedrock.query }), { email: null, plano: null })
  })
})
