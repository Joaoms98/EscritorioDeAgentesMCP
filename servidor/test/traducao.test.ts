import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import {
  compactarEntrada,
  criarEstadoTraducao,
  descreverFerramenta,
  fimDoResultado,
  mapearTodos,
  tituloDaPermissao,
  traduzir,
  usoDoLimite,
} from '../src/traducao.ts'
import type { Acao } from '../src/traducao.ts'

const SESSAO = '17a269e5-9dc3-491f-adef-445695f82126'
const CWD = '/home/ana/projects/loja'

const msg = (dados: Record<string, unknown>) => ({ uuid: 'u-1', session_id: SESSAO, ...dados }) as unknown as SDKMessage

const init = msg({
  type: 'system',
  subtype: 'init',
  model: 'claude-haiku-5-5',
  permissionMode: 'default',
  cwd: CWD,
  tools: ['Task', 'AskUserQuestion', 'Bash', 'Read', 'mcp__escritorio__informar_status'],
  mcp_servers: [{ name: 'escritorio', status: 'connected', source: 'sdk' }],
  apiKeySource: 'none',
  claude_code_version: '2.1.312',
  slash_commands: [],
  output_style: 'default',
  skills: [],
  plugins: [],
})

const assistente = (conteudo: unknown[], extra: Record<string, unknown> = {}) =>
  msg({ type: 'assistant', parent_tool_use_id: null, message: { model: 'claude-haiku-5-5', role: 'assistant', content: conteudo }, ...extra })

const usoModelo = {
  'claude-haiku-5-5': {
    inputTokens: 1286,
    outputTokens: 460,
    cacheReadInputTokens: 16599,
    cacheCreationInputTokens: 31069,
    webSearchRequests: 0,
    costUSD: 0.00673839,
    contextWindow: 1000000,
    maxOutputTokens: 128000,
  },
}

function tipos(acoes: Acao[]): string[] {
  return acoes.map((a) => (a.tipo === 'evento' ? `evento:${a.evento}` : a.tipo))
}

describe('traduzir', () => {
  it('system/init inicia a sessão só na primeira vez', () => {
    const estado = criarEstadoTraducao(CWD)
    const acoes = traduzir(init, estado)
    assert.deepEqual(acoes[0], { tipo: 'sessao', sessaoId: SESSAO, modelo: 'claude-haiku-5-5' })
    assert.equal(acoes[1]?.tipo, 'evento')
    assert.equal(acoes[1]?.tipo === 'evento' && acoes[1].texto, 'Sessão iniciada (modelo claude-haiku-5-5)')
    assert.deepEqual(traduzir(init, estado), [])
  })

  it('system/init de sessão retomada diz que a sessão foi retomada', () => {
    const acoes = traduzir(init, criarEstadoTraducao(CWD, true))
    assert.equal(acoes[1]?.tipo === 'evento' && acoes[1].texto, 'Sessão retomada (modelo claude-haiku-5-5)')
  })

  it('texto do assistente vira evento texto e a primeira linha vira atividade', () => {
    const acoes = traduzir(assistente([{ type: 'text', text: '\n## Vou rodar os testes agora\n\nDepois conserto o que falhar.' }]), criarEstadoTraducao(CWD))
    assert.deepEqual(acoes, [
      { tipo: 'evento', evento: 'texto', texto: '## Vou rodar os testes agora\n\nDepois conserto o que falhar.' },
      { tipo: 'atividade', texto: 'Vou rodar os testes agora' },
    ])
  })

  it('texto longo é cortado em 8000 e a atividade em 140', () => {
    const longo = 'a'.repeat(9000)
    const acoes = traduzir(assistente([{ type: 'text', text: longo }]), criarEstadoTraducao(CWD))
    const evento = acoes[0]
    const atividade = acoes[1]
    assert.equal(evento?.tipo === 'evento' && evento.texto.length, 8000)
    assert.equal(atividade?.tipo === 'atividade' && atividade.texto.length, 140)
    assert.ok(atividade?.tipo === 'atividade' && atividade.texto.endsWith('…'))
  })

  it('thinking e texto vazio são ignorados', () => {
    const acoes = traduzir(assistente([{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: '   ' }]), criarEstadoTraducao(CWD))
    assert.deepEqual(acoes, [])
  })

  it('tool_use vira evento ferramenta + atividade com a descrição em pt-BR', () => {
    const acoes = traduzir(assistente([{
      type: 'tool_use',
      id: 'toolu_017CYXTksXXGLLBTLycxxAU7',
      name: 'Bash',
      input: { command: 'echo hello-escritorio', description: 'Print hello-escritorio via echo' },
      caller: { type: 'direct' },
    }]), criarEstadoTraducao(CWD))
    assert.deepEqual(acoes, [
      {
        tipo: 'evento',
        evento: 'ferramenta',
        texto: 'Print hello-escritorio via echo',
        detalhe: { nome: 'Bash', entrada: { command: 'echo hello-escritorio', description: 'Print hello-escritorio via echo' } },
      },
      { tipo: 'atividade', texto: 'Print hello-escritorio via echo' },
    ])
  })

  it('AskUserQuestion avisa que está preparando a pergunta', () => {
    const acoes = traduzir(assistente([{
      type: 'tool_use',
      id: 'toolu_01KDSD2UsGJzomdYAfBC5HMF',
      name: 'AskUserQuestion',
      input: {
        questions: [{
          question: 'Qual cor você prefere?',
          header: 'Cor',
          multiSelect: false,
          options: [{ label: 'azul', description: 'Escolher a cor azul' }, { label: 'verde', description: 'Escolher a cor verde' }],
        }],
      },
    }]), criarEstadoTraducao(CWD))
    assert.deepEqual(tipos(acoes), ['evento:ferramenta', 'atividade'])
    assert.equal(acoes[1]?.tipo === 'atividade' && acoes[1].texto, 'Preparando uma pergunta para você')
  })

  it('a ferramenta informar_status fica com o handler (nada aqui)', () => {
    const acoes = traduzir(assistente([{ type: 'tool_use', id: 't1', name: 'mcp__escritorio__informar_status', input: { texto: 'teste' } }]), criarEstadoTraducao(CWD))
    assert.deepEqual(acoes, [])
  })

  it('TodoWrite atualiza os todos e a atividade vem do item em andamento', () => {
    const acoes = traduzir(assistente([{
      type: 'tool_use',
      id: 't2',
      name: 'TodoWrite',
      input: {
        todos: [
          { content: 'Ler o código', status: 'completed', activeForm: 'Lendo o código' },
          { content: 'Rodar os testes', status: 'in_progress', activeForm: 'Rodando os testes' },
          { content: 'Corrigir', status: 'pending', activeForm: 'Corrigindo' },
        ],
      },
    }]), criarEstadoTraducao(CWD))
    assert.deepEqual(acoes, [
      {
        tipo: 'todos',
        todos: [
          { conteudo: 'Ler o código', status: 'feito', ativo: 'Lendo o código' },
          { conteudo: 'Rodar os testes', status: 'andamento', ativo: 'Rodando os testes' },
          { conteudo: 'Corrigir', status: 'pendente', ativo: 'Corrigindo' },
        ],
      },
      { tipo: 'atividade', texto: 'Rodando os testes' },
    ])
  })

  it('TaskCreate/TaskUpdate mantêm a lista pelo id da tarefa', () => {
    const estado = criarEstadoTraducao(CWD)
    let acoes = traduzir(assistente([{ type: 'tool_use', id: 'tc1', name: 'TaskCreate', input: { subject: 'Escrever testes', description: 'x', activeForm: 'Escrevendo testes' } }]), estado)
    assert.deepEqual(acoes[0], { tipo: 'todos', todos: [{ conteudo: 'Escrever testes', status: 'pendente', ativo: 'Escrevendo testes' }] })
    traduzir(assistente([{ type: 'tool_use', id: 'tc2', name: 'TaskCreate', input: { subject: 'Abrir o PR', description: 'y' } }]), estado)
    traduzir(msg({
      type: 'user',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tc1', content: 'Task #1 created successfully: Escrever testes' }] },
      tool_use_result: { task: { id: '1', subject: 'Escrever testes' } },
    }), estado)
    traduzir(msg({
      type: 'user',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tc2', content: [{ type: 'text', text: 'Task #2 created successfully: Abrir o PR' }] }] },
    }), estado)
    acoes = traduzir(assistente([{ type: 'tool_use', id: 'tu1', name: 'TaskUpdate', input: { taskId: '1', status: 'in_progress' } }]), estado)
    assert.deepEqual(acoes, [
      {
        tipo: 'todos',
        todos: [
          { conteudo: 'Escrever testes', status: 'andamento', ativo: 'Escrevendo testes' },
          { conteudo: 'Abrir o PR', status: 'pendente' },
        ],
      },
      { tipo: 'atividade', texto: 'Escrevendo testes' },
    ])
    acoes = traduzir(assistente([{ type: 'tool_use', id: 'tu2', name: 'TaskUpdate', input: { taskId: '2', status: 'deleted' } }]), estado)
    assert.deepEqual(acoes[0], { tipo: 'todos', todos: [{ conteudo: 'Escrever testes', status: 'andamento', ativo: 'Escrevendo testes' }] })
  })

  it('TaskCreate que falha some da lista', () => {
    const estado = criarEstadoTraducao(CWD)
    traduzir(assistente([{ type: 'tool_use', id: 'tc9', name: 'TaskCreate', input: { subject: 'Algo' } }]), estado)
    const acoes = traduzir(msg({
      type: 'user',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tc9', is_error: true, content: 'falhou' }] },
    }), estado)
    assert.deepEqual(acoes[0], { tipo: 'todos', todos: [] })
  })

  it('Agent vira evento subagente e as ferramentas do subagente viram atividade com ↳', () => {
    const estado = criarEstadoTraducao(CWD)
    const acoes = traduzir(assistente([{
      type: 'tool_use',
      id: 'toolu_agent',
      name: 'Agent',
      input: { description: 'Mapear as rotas', prompt: 'Liste as rotas da API', subagent_type: 'Explore' },
    }]), estado)
    assert.equal(acoes[0]?.tipo === 'evento' && acoes[0].evento, 'subagente')
    assert.equal(acoes[0]?.tipo === 'evento' && acoes[0].texto, 'Delegou para Explore: Mapear as rotas')
    assert.equal(acoes[1]?.tipo === 'atividade' && acoes[1].texto, 'Delegando para Explore: Mapear as rotas')
    const dentro = traduzir(assistente(
      [{ type: 'tool_use', id: 'toolu_x', name: 'Read', input: { file_path: `${CWD}/src/rotas.ts` } }, { type: 'text', text: 'pensando alto' }],
      { parent_tool_use_id: 'toolu_agent' },
    ), estado)
    assert.deepEqual(dentro, [{ tipo: 'atividade', texto: '↳ Explore: Lendo src/rotas.ts' }])
  })

  it('Task sem subagent_type delega para "um subagente"', () => {
    const acoes = traduzir(assistente([{ type: 'tool_use', id: 'tk', name: 'Task', input: { description: 'Revisar', prompt: 'p' } }]), criarEstadoTraducao(CWD))
    assert.equal(acoes[0]?.tipo === 'evento' && acoes[0].texto, 'Delegou para um subagente: Revisar')
  })

  it('resultado de ferramenta com erro vira evento; sucesso não é guardado', () => {
    const estado = criarEstadoTraducao(CWD)
    traduzir(assistente([{ type: 'tool_use', id: 'toolu_01ENEZ2BHJun9pUdNDJm1PjV', name: 'Bash', input: { command: 'echo hello-escritorio > saida-exp3.txt' } }]), estado)
    const erro = traduzir(msg({
      type: 'user',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ type: 'tool_result', content: 'O humano negou', is_error: true, tool_use_id: 'toolu_01ENEZ2BHJun9pUdNDJm1PjV' }] },
      tool_use_result: 'Error: O humano negou',
    }), estado)
    assert.deepEqual(erro, [{
      tipo: 'evento',
      evento: 'resultado_ferramenta',
      texto: 'O humano negou',
      detalhe: { nome: 'Bash', toolUseId: 'toolu_01ENEZ2BHJun9pUdNDJm1PjV' },
    }])
    const longo = traduzir(msg({
      type: 'user',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ type: 'tool_result', content: `<tool_use_error>${'x'.repeat(500)}</tool_use_error>`, is_error: true, tool_use_id: 'z' }] },
    }), estado)
    assert.equal(longo[0]?.tipo === 'evento' && longo[0].texto.length, 300)
    assert.ok(longo[0]?.tipo === 'evento' && !longo[0].texto.includes('tool_use_error'))
    const ok = traduzir(msg({
      type: 'user',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ tool_use_id: 'toolu_017', type: 'tool_result', content: 'hello-escritorio', is_error: false }] },
      tool_use_result: { stdout: 'hello-escritorio', stderr: '' },
    }), estado)
    assert.deepEqual(ok, [])
  })

  it('resultado de ferramenta dentro de subagente é ignorado', () => {
    const acoes = traduzir(msg({
      type: 'user',
      parent_tool_use_id: 'toolu_agent',
      message: { role: 'user', content: [{ type: 'tool_result', content: 'falhou', is_error: true, tool_use_id: 'q' }] },
    }), criarEstadoTraducao(CWD))
    assert.deepEqual(acoes, [])
  })

  it('result success vira fim concluída com as métricas', () => {
    const acoes = traduzir(msg({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'Você escolheu **verde**.',
      num_turns: 2,
      duration_ms: 4417,
      duration_api_ms: 7710,
      total_cost_usd: 0.00673839,
      stop_reason: 'end_turn',
      usage: {},
      modelUsage: usoModelo,
      permission_denials: [],
    }), criarEstadoTraducao(CWD))
    assert.deepEqual(acoes, [{
      tipo: 'fim',
      fim: {
        status: 'concluida',
        resultado: 'Você escolheu **verde**.',
        erro: null,
        custoUsd: 0.00673839,
        turnos: 2,
        duracaoMs: 4417,
        tokensEntrada: 1286 + 16599 + 31069,
        tokensSaida: 460,
      },
    }])
  })

  it('sessão retomada: métricas vêm só deste processo (model_usage_since_last_result), não do total da conversa', () => {
    const fim = fimDoResultado(msg({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'Criei o b.txt',
      num_turns: 1,
      duration_ms: 2398,
      total_cost_usd: 0.00836856,
      modelUsage: { 'claude-haiku-5-5': { inputTokens: 3000, outputTokens: 677, cacheReadInputTokens: 100000, cacheCreationInputTokens: 31704, costUSD: 0.00836856 } },
      model_usage_since_last_result: { 'claude-haiku-5-5': { inputTokens: 600, outputTokens: 102, cacheReadInputTokens: 30000, cacheCreationInputTokens: 4000, costUSD: 0.0006 } },
    }) as never)
    assert.equal(fim.custoUsd, 0.0006)
    assert.equal(fim.tokensEntrada, 34600)
    assert.equal(fim.tokensSaida, 102)
    assert.equal(fim.turnos, 1)
    const vazio = fimDoResultado(msg({ type: 'result', subtype: 'success', is_error: false, result: '', num_turns: 0, duration_ms: 1, total_cost_usd: 0.5, modelUsage: { m: { inputTokens: 9 } }, model_usage_since_last_result: {} }) as never)
    assert.equal(vazio.custoUsd, 0)
    assert.equal(vazio.tokensEntrada, 0)
  })

  it('erros de result viram mensagens em pt-BR', () => {
    const base = { type: 'result', is_error: true, num_turns: 2, duration_ms: 10, total_cost_usd: 0.0002, modelUsage: {}, permission_denials: [] }
    const interrompida = fimDoResultado(msg({ ...base, subtype: 'error_during_execution', errors: ['[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=null'] }) as never)
    assert.equal(interrompida.status, 'erro')
    assert.equal(interrompida.erro, 'A execução terminou antes de concluir a ordem.')
    assert.equal(interrompida.tokensEntrada, null)
    assert.equal(fimDoResultado(msg({ ...base, subtype: 'error_max_turns', errors: [] }) as never).erro, 'Atingiu o limite de turnos.')
    assert.equal(fimDoResultado(msg({ ...base, subtype: 'error_max_budget_usd', errors: [] }) as never).erro, 'Atingiu o limite de custo.')
    assert.equal(fimDoResultado(msg({ ...base, subtype: 'error_during_execution', errors: ['No conversation found with session ID: abc'] }) as never).erro, 'No conversation found with session ID: abc')
    assert.equal(fimDoResultado(msg({ ...base, subtype: 'success', result: 'API Error: 500' }) as never).erro, 'API Error: 500')
  })

  it('erro marcado na mensagem do assistente tem prioridade no fim', () => {
    const estado = criarEstadoTraducao(CWD)
    traduzir(assistente([{ type: 'text', text: 'Invalid API key · Please run /login' }], { error: 'authentication_failed' }), estado)
    const acoes = traduzir(msg({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key', num_turns: 1, duration_ms: 5, total_cost_usd: 0, modelUsage: {} }), estado)
    assert.equal(acoes[0]?.tipo === 'fim' && acoes[0].fim.erro, 'Não foi possível autenticar na sua conta Claude. Rode `claude` neste computador e faça /login.')
    const limite = criarEstadoTraducao(CWD)
    traduzir(assistente([], { error: 'rate_limit' }), limite)
    assert.equal(limite.erroAssistente, 'A conta atingiu o limite de uso. Tente de novo mais tarde.')
    const conta = criarEstadoTraducao(CWD)
    traduzir(assistente([], { error: 'billing_error' }), conta)
    assert.equal(conta.erroAssistente, 'Problema de cobrança/conta na Anthropic.')
    const outro = criarEstadoTraducao(CWD)
    traduzir(assistente([], { error: 'server_error' }), outro)
    assert.equal(outro.erroAssistente, 'A API da Anthropic devolveu um erro (server_error).')
  })

  it('rate_limit_event vira o uso da conta', () => {
    const acoes = traduzir(msg({
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'allowed',
        resetsAt: 1793311800,
        rateLimitType: 'five_hour',
        overageStatus: 'rejected',
        unifiedWindows: { five_hour: { utilization: 0.05, resetsAt: 1793311800 }, seven_day: { utilization: 0.13, resetsAt: 1793804400 } },
      },
    }), criarEstadoTraducao(CWD))
    assert.equal(acoes.length, 1)
    const uso = acoes[0]?.tipo === 'uso' ? acoes[0].uso : null
    assert.equal(uso?.status, 'allowed')
    assert.equal(uso?.cincoHoras, 0.05)
    assert.equal(uso?.seteDias, 0.13)
    assert.equal(uso?.reiniciaEm, new Date(1793311800 * 1000).toISOString())
    assert.ok(uso?.atualizadoEm)
  })

  it('rate_limit sem unifiedWindows usa utilization + rateLimitType', () => {
    const uso = usoDoLimite({ status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.91 }, new Date('2026-10-29T12:00:00Z'))
    assert.deepEqual(uso, { atualizadoEm: '2026-10-29T12:00:00.000Z', status: 'allowed_warning', seteDias: 0.91 })
  })

  it('mensagens de sistema: compactando, nova tentativa, tarefas de subagente', () => {
    const estado = criarEstadoTraducao(CWD)
    assert.deepEqual(traduzir(msg({ type: 'system', subtype: 'status', status: 'compacting' }), estado), [{ tipo: 'atividade', texto: 'Compactando a conversa…' }])
    assert.deepEqual(traduzir(msg({ type: 'system', subtype: 'status', status: null }), estado), [])
    assert.deepEqual(
      traduzir(msg({ type: 'system', subtype: 'api_retry', attempt: 1, max_retries: 10, retry_delay_ms: 500, error_status: 529, error: 'overloaded' }), estado),
      [{ tipo: 'atividade', texto: 'A API está ocupada, tentando de novo…' }],
    )
    const comecou = traduzir(msg({ type: 'system', subtype: 'task_started', task_id: 'a1', description: 'Mapear as rotas', subagent_type: 'Explore', task_type: 'local_agent' }), estado)
    assert.equal(comecou[0]?.tipo === 'evento' && comecou[0].texto, 'Subagente começou: Mapear as rotas')
    const acabou = traduzir(msg({ type: 'system', subtype: 'task_notification', task_id: 'a1', status: 'completed', output_file: '/tmp/x', summary: 'Achei 12 rotas' }), estado)
    assert.equal(acabou[0]?.tipo === 'evento' && acabou[0].evento, 'subagente')
    assert.equal(acabou[0]?.tipo === 'evento' && acabou[0].texto, 'Subagente terminou: Achei 12 rotas')
    const falhou = traduzir(msg({ type: 'system', subtype: 'task_notification', task_id: 'a2', status: 'failed', output_file: '', summary: '' }), estado)
    assert.equal(falhou[0]?.tipo === 'evento' && falhou[0].texto, 'Subagente falhou')
    const comando = traduzir(msg({ type: 'system', subtype: 'task_started', task_id: 'b1', description: 'npm run dev', task_type: 'local_bash' }), estado)
    assert.equal(comando[0]?.tipo === 'evento' && comando[0].texto, 'Comando em segundo plano começou: npm run dev')
    assert.deepEqual(traduzir(msg({ type: 'system', subtype: 'task_started', task_id: 'c1', description: 'x', ambient: true }), estado), [])
  })

  it('tipos e subtipos desconhecidos são ignorados', () => {
    const estado = criarEstadoTraducao(CWD)
    assert.deepEqual(traduzir(msg({ type: 'system', subtype: 'thinking_tokens', estimated_tokens: 50 }), estado), [])
    assert.deepEqual(traduzir(msg({ type: 'system', subtype: 'commands_changed', commands: [] }), estado), [])
    assert.deepEqual(traduzir(msg({ type: 'tool_progress', tool_use_id: 'x', tool_name: 'Bash' }), estado), [])
    assert.deepEqual(traduzir(msg({ type: 'algo_novo' }), estado), [])
    assert.deepEqual(traduzir(msg({ type: 'user', parent_tool_use_id: null, message: { role: 'user', content: '[Request interrupted by user]' } }), estado), [])
  })
})

describe('descreverFerramenta', () => {
  const casos: Array<[string, Record<string, unknown>, string]> = [
    ['Read', { file_path: `${CWD}/src/app.ts` }, 'Lendo src/app.ts'],
    ['Read', { file_path: '/etc/hosts' }, 'Lendo /etc/hosts'],
    ['Write', { file_path: `${CWD}/notas.md`, content: 'x' }, 'Escrevendo notas.md'],
    ['Edit', { file_path: `${CWD}/a.ts` }, 'Editando a.ts'],
    ['MultiEdit', { file_path: 'rel/b.ts' }, 'Editando rel/b.ts'],
    ['NotebookEdit', { notebook_path: `${CWD}/n.ipynb` }, 'Editando o notebook n.ipynb'],
    ['Bash', { command: 'npm test', description: 'Rodar a suíte de testes' }, 'Rodar a suíte de testes'],
    ['Bash', { command: 'npm   test\n  -- --watch' }, 'Executando: npm test -- --watch'],
    ['Glob', { pattern: 'src/**/*.ts' }, 'Procurando arquivos src/**/*.ts'],
    ['Grep', { pattern: 'TODO' }, 'Buscando "TODO"'],
    ['WebFetch', { url: 'https://docs.anthropic.com/pt/x?y=1', prompt: 'p' }, 'Abrindo docs.anthropic.com'],
    ['WebSearch', { query: 'hono sse' }, 'Pesquisando: hono sse'],
    ['Agent', { description: 'Revisar o PR', subagent_type: 'QA-Ana' }, 'Delegando para QA-Ana: Revisar o PR'],
    ['Task', { description: 'Revisar' }, 'Delegando para um subagente: Revisar'],
    ['TodoWrite', { todos: [] }, 'Atualizando a lista de tarefas'],
    ['Skill', { skill: 'pdf' }, 'Usando a skill pdf'],
    ['ToolSearch', { query: 'select:x' }, 'Procurando ferramentas'],
    ['AskUserQuestion', {}, 'Preparando uma pergunta para você'],
    ['ExitPlanMode', { plan: '# Plano' }, 'Apresentando o plano'],
    ['mcp__claude_ai_Bling__listProducts', {}, 'Usando claude_ai_Bling: listProducts'],
    ['Monitor', {}, 'Usando Monitor'],
  ]
  for (const [nome, entrada, esperado] of casos) {
    it(`${nome} → ${esperado}`, () => assert.equal(descreverFerramenta(nome, entrada, CWD), esperado))
  }

  it('caminho longo é cortado no meio em 70 caracteres', () => {
    const caminho = `/var/${'pasta-comprida/'.repeat(10)}arquivo-final.ts`
    const texto = descreverFerramenta('Read', { file_path: caminho }, CWD)
    const arquivo = texto.replace('Lendo ', '')
    assert.equal(arquivo.length, 70)
    assert.ok(arquivo.startsWith('/var/pasta'))
    assert.ok(arquivo.endsWith('arquivo-final.ts'))
    assert.ok(arquivo.includes('…'))
  })

  it('comando sem descrição é cortado em 90 e tudo fica em até 140', () => {
    const texto = descreverFerramenta('Bash', { command: 'x'.repeat(300) }, CWD)
    assert.equal(texto.length, 'Executando: '.length + 90)
    assert.ok(descreverFerramenta('Bash', { description: 'y'.repeat(400) }, CWD).length <= 140)
  })
})

describe('tituloDaPermissao', () => {
  const casos: Array<[string, string]> = [
    ['Bash', 'Quer executar um comando'],
    ['Write', 'Quer criar ou sobrescrever um arquivo'],
    ['Edit', 'Quer editar um arquivo'],
    ['MultiEdit', 'Quer editar um arquivo'],
    ['NotebookEdit', 'Quer editar um notebook'],
    ['WebFetch', 'Quer acessar um site'],
    ['WebSearch', 'Quer pesquisar na web'],
    ['Agent', 'Quer chamar um subagente'],
    ['Task', 'Quer chamar um subagente'],
    ['mcp__escritorio__informar_status', 'Quer usar a ferramenta informar_status de escritorio'],
    ['CronCreate', 'Quer usar CronCreate'],
  ]
  for (const [nome, esperado] of casos) {
    it(`${nome} → ${esperado}`, () => assert.equal(tituloDaPermissao(nome, {}), esperado))
  }
})

describe('auxiliares', () => {
  it('mapearTodos ignora itens inválidos e status desconhecido vira pendente', () => {
    assert.deepEqual(mapearTodos([{ content: 'A', status: 'weird' }, null, { status: 'pending' }, 'x']), [{ conteudo: 'A', status: 'pendente' }])
    assert.deepEqual(mapearTodos(undefined), [])
  })

  it('compactarEntrada corta textos e listas longas', () => {
    const compacta = compactarEntrada({ content: 'z'.repeat(1000), lista: Array.from({ length: 25 }, (_, i) => i) }) as { content: string; lista: unknown[] }
    assert.equal(compacta.content.length, 601)
    assert.equal(compacta.lista.length, 21)
    assert.equal(compacta.lista[20], '… (+5)')
  })
})
