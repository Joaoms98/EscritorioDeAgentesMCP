import { isAbsolute, relative } from 'node:path'
import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKRateLimitInfo,
  SDKResultMessage,
  SDKUserMessage,
  SDKUserMessageReplay,
} from '@anthropic-ai/claude-agent-sdk'
import type { FimExecucao, StatusTodo, TipoEvento, Todo, UsoConta } from './tipos.ts'

export const FERRAMENTA_STATUS = 'mcp__escritorio__informar_status'

const LIMITE_ATIVIDADE = 140
const LIMITE_TEXTO = 8000
const LIMITE_ERRO = 2000
const LIMITE_ERRO_FERRAMENTA = 300
const LIMITE_RESUMO = 300

export type Acao =
  | { tipo: 'sessao'; sessaoId: string; modelo: string | null }
  | { tipo: 'atividade'; texto: string }
  | { tipo: 'evento'; evento: TipoEvento; texto: string; detalhe?: unknown }
  | { tipo: 'todos'; todos: Todo[] }
  | { tipo: 'uso'; uso: Partial<UsoConta> }
  | { tipo: 'fim'; fim: FimExecucao }

type FerramentaVista = { nome: string; subagente: string | null }

// Memória da tradução de uma execução: o que já foi visto no fluxo de mensagens do SDK.
export type EstadoTraducao = {
  cwd: string
  retomando: boolean
  sessaoIniciada: boolean
  erroAssistente: string | null
  ferramentas: Map<string, FerramentaVista>
  tarefas: Map<string, Todo>
  criacoesDeTarefa: Map<string, string>
  tarefasDeFundo: Map<string, string>
}

type Bloco = Record<string, unknown>

export function criarEstadoTraducao(cwd: string, retomando = false): EstadoTraducao {
  return {
    cwd,
    retomando,
    sessaoIniciada: false,
    erroAssistente: null,
    ferramentas: new Map(),
    tarefas: new Map(),
    criacoesDeTarefa: new Map(),
    tarefasDeFundo: new Map(),
  }
}

// Traduz uma mensagem do SDK nas ações que a execução aplica pelos ganchos. Retorna [] para o que não interessa.
export function traduzir(msg: SDKMessage, estado: EstadoTraducao): Acao[] {
  switch (msg.type) {
    case 'system':
      return traduzirSistema(msg, estado)
    case 'assistant':
      return traduzirAssistente(msg, estado)
    case 'user':
      return traduzirUsuario(msg, estado)
    case 'result':
      return [{ tipo: 'fim', fim: fimDoResultado(msg, estado.erroAssistente) }]
    case 'rate_limit_event':
      return msg.rate_limit_info ? [{ tipo: 'uso', uso: usoDoLimite(msg.rate_limit_info) }] : []
    default:
      return []
  }
}

function traduzirSistema(msg: Extract<SDKMessage, { type: 'system' }>, estado: EstadoTraducao): Acao[] {
  switch (msg.subtype) {
    case 'init': {
      if (estado.sessaoIniciada) return []
      estado.sessaoIniciada = true
      const modelo = textoOuNull(msg.model)
      const texto = `${estado.retomando ? 'Sessão retomada' : 'Sessão iniciada'} (modelo ${modelo ?? 'padrão'})`
      return [
        { tipo: 'sessao', sessaoId: msg.session_id, modelo },
        {
          tipo: 'evento',
          evento: 'sistema',
          texto,
          detalhe: {
            sessaoId: msg.session_id,
            modelo,
            modoPermissao: msg.permissionMode ?? null,
            ferramentas: Array.isArray(msg.tools) ? msg.tools.length : null,
            servidoresMcp: Array.isArray(msg.mcp_servers) ? msg.mcp_servers.map((s) => `${s.name}:${s.status}`) : [],
          },
        },
      ]
    }
    case 'status':
      return msg.status === 'compacting' ? [{ tipo: 'atividade', texto: 'Compactando a conversa…' }] : []
    case 'api_retry':
      return [{ tipo: 'atividade', texto: 'A API está ocupada, tentando de novo…' }]
    case 'task_started': {
      if (msg.skip_transcript || msg.ambient) return []
      const tipoTarefa = msg.task_type ?? 'local_agent'
      estado.tarefasDeFundo.set(msg.task_id, tipoTarefa)
      const descricao = cortar(umaLinha(msg.description ?? ''), LIMITE_RESUMO)
      if (tipoTarefa === 'local_bash') {
        return [{ tipo: 'evento', evento: 'ferramenta', texto: `Comando em segundo plano começou: ${descricao}` }]
      }
      return [{ tipo: 'evento', evento: 'subagente', texto: `Subagente começou: ${descricao}`, detalhe: { tarefa: msg.task_id, tipo: msg.subagent_type ?? null } }]
    }
    case 'task_notification': {
      if (msg.skip_transcript || msg.ambient) return []
      const tipoTarefa = estado.tarefasDeFundo.get(msg.task_id)
      const situacao = msg.status === 'completed' ? 'terminou' : msg.status === 'failed' ? 'falhou' : 'foi parado'
      const resumo = cortar(umaLinha(msg.summary ?? ''), LIMITE_RESUMO)
      const sujeito = tipoTarefa === 'local_bash' ? 'Comando em segundo plano' : 'Subagente'
      return [{
        tipo: 'evento',
        evento: tipoTarefa === 'local_bash' ? 'ferramenta' : 'subagente',
        texto: resumo ? `${sujeito} ${situacao}: ${resumo}` : `${sujeito} ${situacao}`,
        detalhe: { tarefa: msg.task_id, status: msg.status },
      }]
    }
    default:
      return []
  }
}

function traduzirAssistente(msg: SDKAssistantMessage, estado: EstadoTraducao): Acao[] {
  if (msg.error) estado.erroAssistente = erroDoAssistente(msg.error)
  const conteudo = blocos(msg.message?.content)
  const pai = msg.parent_tool_use_id
  if (pai) {
    const tipo = textoOuNull(msg.subagent_type) ?? estado.ferramentas.get(pai)?.subagente ?? 'subagente'
    const acoes: Acao[] = []
    for (const bloco of conteudo) {
      if (bloco.type !== 'tool_use') continue
      const nome = String(bloco.name ?? '')
      registrarFerramenta(bloco, estado)
      acoes.push({ tipo: 'atividade', texto: cortar(`↳ ${tipo}: ${descreverFerramenta(nome, bloco.input, estado.cwd)}`, LIMITE_ATIVIDADE) })
    }
    return acoes
  }
  const acoes: Acao[] = []
  for (const bloco of conteudo) {
    if (bloco.type === 'text') {
      const texto = typeof bloco.text === 'string' ? bloco.text.trim() : ''
      if (!texto) continue
      acoes.push({ tipo: 'evento', evento: 'texto', texto: cortar(texto, LIMITE_TEXTO) })
      acoes.push({ tipo: 'atividade', texto: cortar(primeiraLinha(texto), LIMITE_ATIVIDADE) })
    } else if (bloco.type === 'tool_use') {
      acoes.push(...traduzirFerramenta(bloco, estado))
    }
  }
  return acoes
}

function registrarFerramenta(bloco: Bloco, estado: EstadoTraducao): void {
  const nome = String(bloco.name ?? '')
  const entrada = objeto(bloco.input)
  const subagente = nome === 'Agent' || nome === 'Task' ? textoOuNull(entrada.subagent_type) : null
  if (typeof bloco.id === 'string') estado.ferramentas.set(bloco.id, { nome, subagente })
}

function traduzirFerramenta(bloco: Bloco, estado: EstadoTraducao): Acao[] {
  registrarFerramenta(bloco, estado)
  const id = typeof bloco.id === 'string' ? bloco.id : ''
  const nome = String(bloco.name ?? '')
  const entrada = objeto(bloco.input)
  if (nome === FERRAMENTA_STATUS) return []
  const descricao = descreverFerramenta(nome, entrada, estado.cwd)
  switch (nome) {
    case 'TodoWrite': {
      const todos = mapearTodos(entrada.todos)
      const atual = todos.find((t) => t.status === 'andamento')
      return [
        { tipo: 'todos', todos },
        { tipo: 'atividade', texto: cortar(atual?.ativo ?? atual?.conteudo ?? descricao, LIMITE_ATIVIDADE) },
      ]
    }
    case 'TaskCreate': {
      const conteudo = textoOuNull(entrada.subject)
      if (!conteudo) return [{ tipo: 'atividade', texto: descricao }]
      const chave = `criando:${id}`
      const ativo = textoOuNull(entrada.activeForm)
      estado.tarefas.set(chave, { conteudo, status: 'pendente', ...(ativo ? { ativo } : {}) })
      estado.criacoesDeTarefa.set(id, chave)
      return [{ tipo: 'todos', todos: listaDeTarefas(estado) }, { tipo: 'atividade', texto: descricao }]
    }
    case 'TaskUpdate': {
      const atividade = atualizarTarefa(entrada, estado)
      return [{ tipo: 'todos', todos: listaDeTarefas(estado) }, { tipo: 'atividade', texto: cortar(atividade ?? descricao, LIMITE_ATIVIDADE) }]
    }
    case 'Agent':
    case 'Task': {
      const tipo = textoOuNull(entrada.subagent_type) ?? 'um subagente'
      const tarefa = umaLinha(String(entrada.description ?? ''))
      return [
        {
          tipo: 'evento',
          evento: 'subagente',
          texto: cortar(tarefa ? `Delegou para ${tipo}: ${tarefa}` : `Delegou para ${tipo}`, LIMITE_RESUMO),
          detalhe: { nome, entrada: compactarEntrada(entrada) },
        },
        { tipo: 'atividade', texto: descricao },
      ]
    }
    default:
      return [
        { tipo: 'evento', evento: 'ferramenta', texto: descricao, detalhe: { nome, entrada: compactarEntrada(entrada) } },
        { tipo: 'atividade', texto: descricao },
      ]
  }
}

function atualizarTarefa(entrada: Record<string, unknown>, estado: EstadoTraducao): string | null {
  const id = textoOuNull(entrada.taskId) ?? (typeof entrada.taskId === 'number' ? String(entrada.taskId) : null)
  if (!id) return null
  if (entrada.status === 'deleted') {
    estado.tarefas.delete(id)
    return null
  }
  const atual = estado.tarefas.get(id)
  const conteudo = textoOuNull(entrada.subject) ?? atual?.conteudo
  if (!conteudo) return null
  const status = STATUS_TODO[String(entrada.status)] ?? atual?.status ?? 'pendente'
  const ativo = textoOuNull(entrada.activeForm) ?? atual?.ativo
  estado.tarefas.set(id, { conteudo, status, ...(ativo ? { ativo } : {}) })
  return status === 'andamento' ? ativo ?? conteudo : null
}

function listaDeTarefas(estado: EstadoTraducao): Todo[] {
  return [...estado.tarefas.values()].map((t) => ({ ...t }))
}

function traduzirUsuario(msg: SDKUserMessage | SDKUserMessageReplay, estado: EstadoTraducao): Acao[] {
  if (msg.parent_tool_use_id) return []
  const conteudo = msg.message?.content
  if (!Array.isArray(conteudo)) return []
  const resultados = blocos(conteudo).filter((b) => b.type === 'tool_result')
  const acoes: Acao[] = []
  for (const bloco of resultados) {
    const id = typeof bloco.tool_use_id === 'string' ? bloco.tool_use_id : ''
    const chaveCriacao = estado.criacoesDeTarefa.get(id)
    if (chaveCriacao !== undefined) {
      estado.criacoesDeTarefa.delete(id)
      if (bloco.is_error === true) {
        estado.tarefas.delete(chaveCriacao)
        acoes.push({ tipo: 'todos', todos: listaDeTarefas(estado) })
      } else {
        const idTarefa = idDaTarefaCriada(resultados.length === 1 ? msg.tool_use_result : undefined, bloco.content)
        if (idTarefa) renomearTarefa(estado, chaveCriacao, idTarefa)
      }
    }
    if (bloco.is_error === true) {
      const erro = textoDoResultado(bloco.content).replace(/<\/?tool_use_error>/g, '').trim()
      acoes.push({
        tipo: 'evento',
        evento: 'resultado_ferramenta',
        texto: cortar(erro || 'A ferramenta falhou.', LIMITE_ERRO_FERRAMENTA),
        detalhe: { nome: estado.ferramentas.get(id)?.nome ?? null, toolUseId: id },
      })
    }
  }
  return acoes
}

function idDaTarefaCriada(resultado: unknown, conteudo: unknown): string | null {
  const tarefa = objeto(objeto(resultado).task)
  if (typeof tarefa.id === 'string' && tarefa.id) return tarefa.id
  if (typeof tarefa.id === 'number') return String(tarefa.id)
  const achado = /#(\w+)/.exec(textoDoResultado(conteudo))
  return achado?.[1] ?? null
}

function renomearTarefa(estado: EstadoTraducao, de: string, para: string): void {
  const entradas = [...estado.tarefas.entries()].map(([chave, todo]): [string, Todo] => [chave === de ? para : chave, todo])
  estado.tarefas = new Map(entradas)
}

function textoDoResultado(conteudo: unknown): string {
  if (typeof conteudo === 'string') return conteudo
  return blocos(conteudo)
    .map((b) => (b.type === 'text' && typeof b.text === 'string' ? b.text : ''))
    .filter(Boolean)
    .join('\n')
}

const STATUS_TODO: Record<string, StatusTodo> = {
  pending: 'pendente',
  in_progress: 'andamento',
  completed: 'feito',
}

// Converte a lista do TodoWrite (content/status/activeForm) para os todos do escritório.
export function mapearTodos(lista: unknown): Todo[] {
  if (!Array.isArray(lista)) return []
  const todos: Todo[] = []
  for (const item of lista) {
    const t = objeto(item)
    const conteudo = textoOuNull(t.content)
    if (!conteudo) continue
    const ativo = textoOuNull(t.activeForm)
    todos.push({ conteudo, status: STATUS_TODO[String(t.status)] ?? 'pendente', ...(ativo ? { ativo } : {}) })
  }
  return todos
}

// Uso da conta (janelas de 5 h e 7 dias, frações de 0 a 1) a partir do rate_limit_event do SDK.
export function usoDoLimite(info: SDKRateLimitInfo, agora: Date = new Date()): Partial<UsoConta> {
  const uso: Partial<UsoConta> = { atualizadoEm: agora.toISOString() }
  if (info.status === 'allowed' || info.status === 'allowed_warning' || info.status === 'rejected') uso.status = info.status
  const janelas = objeto((info as { unifiedWindows?: unknown }).unifiedWindows)
  const cinco = numeroOuNull(objeto(janelas.five_hour).utilization) ?? (info.rateLimitType === 'five_hour' ? numeroOuNull(info.utilization) : null)
  const sete = numeroOuNull(objeto(janelas.seven_day).utilization) ?? (info.rateLimitType === 'seven_day' ? numeroOuNull(info.utilization) : null)
  if (cinco !== null) uso.cincoHoras = cinco
  if (sete !== null) uso.seteDias = sete
  const reinicia = numeroOuNull(info.resetsAt)
  if (reinicia !== null) uso.reiniciaEm = new Date(reinicia > 1e12 ? reinicia : reinicia * 1000).toISOString()
  return uso
}

// Mensagem em pt-BR para o erro que o SDK marca numa mensagem do assistente.
export function erroDoAssistente(codigo: string): string {
  switch (codigo) {
    case 'authentication_failed':
      return 'Não foi possível autenticar na sua conta Claude. Rode `claude` neste computador e faça /login.'
    case 'rate_limit':
      return 'A conta atingiu o limite de uso. Tente de novo mais tarde.'
    case 'billing_error':
    case 'account_on_hold':
      return 'Problema de cobrança/conta na Anthropic.'
    default:
      return `A API da Anthropic devolveu um erro (${codigo}).`
  }
}

// Converte a mensagem result do SDK no fim da execução (status, resultado ou erro, métricas).
export function fimDoResultado(msg: SDKResultMessage, erroAssistente: string | null = null): FimExecucao {
  const metricas = metricasDoResultado(msg)
  if (msg.subtype === 'success' && !msg.is_error) {
    return { status: 'concluida', resultado: typeof msg.result === 'string' ? msg.result : '', erro: null, ...metricas }
  }
  return { status: 'erro', resultado: null, erro: cortar(erroAssistente ?? erroDoResultado(msg), LIMITE_ERRO), ...metricas }
}

function erroDoResultado(msg: SDKResultMessage): string {
  if (msg.subtype === 'success') return textoOuNull(msg.result) ?? 'A API da Anthropic devolveu um erro.'
  if (msg.subtype === 'error_max_turns') return 'Atingiu o limite de turnos.'
  if (msg.subtype === 'error_max_budget_usd') return 'Atingiu o limite de custo.'
  const erros = (Array.isArray(msg.errors) ? msg.errors : [])
    .map((e) => String(e).trim())
    .filter((e) => e && !e.startsWith('[ede_diagnostic]'))
  return erros.length ? erros.join('\n') : 'A execução terminou antes de concluir a ordem.'
}

function metricasDoResultado(msg: SDKResultMessage): Omit<FimExecucao, 'status' | 'resultado' | 'erro'> {
  const desteProcesso = (msg as { model_usage_since_last_result?: unknown }).model_usage_since_last_result
  const temDesteProcesso = Boolean(desteProcesso) && typeof desteProcesso === 'object'
  const usos = Object.values(objeto(temDesteProcesso ? desteProcesso : msg.modelUsage)).map(objeto)
  const somar = (campos: string[]) => usos.reduce((total, uso) => total + campos.reduce((s, c) => s + (numeroOuNull(uso[c]) ?? 0), 0), 0)
  return {
    custoUsd: temDesteProcesso ? somar(['costUSD']) : numeroOuNull(msg.total_cost_usd),
    turnos: numeroOuNull(msg.num_turns),
    duracaoMs: numeroOuNull(msg.duration_ms),
    tokensEntrada: usos.length || temDesteProcesso ? somar(['inputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens']) : null,
    tokensSaida: usos.length || temDesteProcesso ? somar(['outputTokens']) : null,
  }
}

// Frase curta em pt-BR do que a ferramenta está fazendo (no máximo 140 caracteres).
export function descreverFerramenta(nome: string, entrada: unknown, cwd: string): string {
  return cortar(umaLinha(descrever(nome, objeto(entrada), cwd)), LIMITE_ATIVIDADE)
}

function descrever(nome: string, e: Record<string, unknown>, cwd: string): string {
  switch (nome) {
    case 'Read':
      return `Lendo ${arquivo(e.file_path, cwd)}`
    case 'Write':
      return `Escrevendo ${arquivo(e.file_path, cwd)}`
    case 'Edit':
    case 'MultiEdit':
      return `Editando ${arquivo(e.file_path, cwd)}`
    case 'NotebookEdit':
      return `Editando o notebook ${arquivo(e.notebook_path, cwd)}`
    case 'Bash':
      return textoOuNull(e.description) ?? `Executando: ${cortar(umaLinha(String(e.command ?? '')), 90)}`
    case 'Glob':
      return `Procurando arquivos ${String(e.pattern ?? '')}`
    case 'Grep':
      return `Buscando "${String(e.pattern ?? '')}"`
    case 'WebFetch':
      return `Abrindo ${host(e.url)}`
    case 'WebSearch':
      return `Pesquisando: ${String(e.query ?? '')}`
    case 'Agent':
    case 'Task': {
      const tarefa = umaLinha(String(e.description ?? ''))
      const tipo = textoOuNull(e.subagent_type) ?? 'um subagente'
      return tarefa ? `Delegando para ${tipo}: ${tarefa}` : `Delegando para ${tipo}`
    }
    case 'TodoWrite':
    case 'TaskUpdate':
      return 'Atualizando a lista de tarefas'
    case 'TaskCreate':
      return textoOuNull(e.subject) ? `Anotando a tarefa: ${String(e.subject)}` : 'Anotando uma tarefa'
    case 'TaskList':
    case 'TaskGet':
      return 'Consultando a lista de tarefas'
    case 'Skill':
      return `Usando a skill ${String(e.skill ?? e.command ?? '')}`
    case 'ToolSearch':
      return 'Procurando ferramentas'
    case 'AskUserQuestion':
      return 'Preparando uma pergunta para você'
    case 'ExitPlanMode':
      return 'Apresentando o plano'
    case 'EnterPlanMode':
      return 'Entrando no modo de planejamento'
  }
  const mcp = partesMcp(nome)
  if (mcp) return `Usando ${mcp.servidor}: ${mcp.ferramenta}`
  return `Usando ${nome}`
}

// Título em pt-BR do pedido de permissão para a ferramenta.
export function tituloDaPermissao(nome: string, _entrada?: unknown): string {
  switch (nome) {
    case 'Bash':
      return 'Quer executar um comando'
    case 'Write':
      return 'Quer criar ou sobrescrever um arquivo'
    case 'Edit':
    case 'MultiEdit':
      return 'Quer editar um arquivo'
    case 'NotebookEdit':
      return 'Quer editar um notebook'
    case 'Read':
      return 'Quer ler um arquivo'
    case 'Glob':
    case 'Grep':
      return 'Quer procurar nos arquivos'
    case 'WebFetch':
      return 'Quer acessar um site'
    case 'WebSearch':
      return 'Quer pesquisar na web'
    case 'Agent':
    case 'Task':
      return 'Quer chamar um subagente'
  }
  const mcp = partesMcp(nome)
  if (mcp) return `Quer usar a ferramenta ${mcp.ferramenta} de ${mcp.servidor}`
  return `Quer usar ${nome}`
}

function partesMcp(nome: string): { servidor: string; ferramenta: string } | null {
  if (!nome.startsWith('mcp__')) return null
  const resto = nome.slice(5)
  const corte = resto.indexOf('__')
  if (corte <= 0 || corte + 2 >= resto.length) return null
  return { servidor: resto.slice(0, corte), ferramenta: resto.slice(corte + 2) }
}

function arquivo(caminho: unknown, cwd: string): string {
  if (typeof caminho !== 'string' || !caminho.trim()) return 'um arquivo'
  let exibido = caminho
  if (cwd && isAbsolute(caminho)) {
    const relativo = relative(cwd, caminho)
    if (relativo && !relativo.startsWith('..') && !isAbsolute(relativo)) exibido = relativo
  }
  return cortarNoMeio(exibido, 70)
}

function host(url: unknown): string {
  if (typeof url !== 'string' || !url) return 'um site'
  try {
    return new URL(url).host || cortarNoMeio(url, 70)
  } catch {
    return cortarNoMeio(url, 70)
  }
}

// Versão enxuta da entrada de uma ferramenta para guardar no evento (textos e listas longas cortados).
export function compactarEntrada(valor: unknown, profundidade = 0): unknown {
  if (typeof valor === 'string') return valor.length > 600 ? `${valor.slice(0, 600)}…` : valor
  if (Array.isArray(valor)) {
    const itens = valor.slice(0, 20).map((v) => compactarEntrada(v, profundidade + 1))
    if (valor.length > 20) itens.push(`… (+${valor.length - 20})`)
    return itens
  }
  if (valor && typeof valor === 'object') {
    if (profundidade >= 4) return '…'
    return Object.fromEntries(Object.entries(valor).slice(0, 30).map(([k, v]) => [k, compactarEntrada(v, profundidade + 1)]))
  }
  return valor
}

function primeiraLinha(texto: string): string {
  const linha = texto.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  return linha
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .trim()
}

function cortar(texto: string, limite: number): string {
  return texto.length > limite ? `${texto.slice(0, limite - 1).trimEnd()}…` : texto
}

function cortarNoMeio(texto: string, limite: number): string {
  if (texto.length <= limite) return texto
  const inicio = Math.ceil((limite - 1) / 2)
  const fim = Math.floor((limite - 1) / 2)
  return `${texto.slice(0, inicio)}…${texto.slice(texto.length - fim)}`
}

function umaLinha(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

function textoOuNull(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

function numeroOuNull(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {}
}

function blocos(conteudo: unknown): Bloco[] {
  return Array.isArray(conteudo) ? conteudo.filter((b): b is Bloco => Boolean(b) && typeof b === 'object') : []
}
