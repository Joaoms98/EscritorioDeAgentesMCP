// Contrato entre os módulos do servidor e o formato do JSON que a API entrega ao navegador.

// bypassPermissions = "Automático": edita e roda comandos sem pedir (perguntas e planos ainda chegam ao humano).
// acceptEdits continua aceito para as ordens antigas e para o MCP.
export type ModoPermissao = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'

export const MODOS_PERMISSAO: readonly ModoPermissao[] = ['default', 'acceptEdits', 'bypassPermissions', 'plan']

export type StatusOrdem =
  | 'na_fila'
  | 'trabalhando'
  | 'aguardando'
  | 'concluida'
  | 'erro'
  | 'parada'
  | 'interrompida'
  | 'cancelada'

export type EstadoAgente =
  | 'livre'
  | 'na_fila'
  | 'trabalhando'
  | 'aguardando'
  | 'concluiu'
  | 'erro'
  | 'interrompida'

export type Agente = {
  id: string
  nome: string
  apelido: string
  descricao: string
  modelo: string | null
  cor: string
  ferramentas: string[] | null
  memoria: string | null
  arquivo: string | null
  generalista: boolean
  // Pasta do projeto de onde vem um agente de projeto (<projeto>/.claude/agents); null nos pessoais e no generalista.
  origem: string | null
}

export type StatusTodo = 'pendente' | 'andamento' | 'feito'

export type Todo = {
  conteudo: string
  status: StatusTodo
  ativo?: string
}

export type Ordem = {
  id: string
  agenteId: string
  projeto: string
  instrucao: string
  modo: ModoPermissao
  status: StatusOrdem
  sessaoId: string | null
  continuaDe: string | null
  modelo: string | null
  atividade: string | null
  // Recado da reunião que entra no preâmbulo desta ordem (só em sessão nova); null quando não havia nenhum guardado.
  recado: string | null
  todos: Todo[] | null
  resultado: string | null
  erro: string | null
  aguardaResposta: boolean
  custoUsd: number | null
  turnos: number | null
  duracaoMs: number | null
  tokensEntrada: number | null
  tokensSaida: number | null
  criadaEm: string
  iniciadaEm: string | null
  finalizadaEm: string | null
  vistaEm: string | null
}

export type TipoEvento =
  | 'sistema'
  | 'texto'
  | 'ferramenta'
  | 'resultado_ferramenta'
  | 'status'
  | 'todos'
  | 'subagente'
  | 'pendencia'
  | 'resposta'
  | 'erro'
  | 'resultado'

export type Evento = {
  id: number
  ordemId: string
  tipo: TipoEvento
  texto: string
  detalhe: unknown
  criadoEm: string
}

export type TipoPendencia = 'permissao' | 'pergunta' | 'plano'

export type StatusPendencia = 'aberta' | 'respondida' | 'expirada' | 'cancelada'

export type DecisaoPendencia =
  | 'permitir'
  | 'permitir_sempre'
  | 'negar'
  | 'responder'
  | 'recusar'
  | 'aprovar'
  | 'aprovar_editando'
  | 'ajustar'

// Decisões válidas por tipo de pendência (o serviço valida a resposta com isto).
export const DECISOES_POR_TIPO: Readonly<Record<TipoPendencia, readonly DecisaoPendencia[]>> = {
  permissao: ['permitir', 'permitir_sempre', 'negar'],
  pergunta: ['responder', 'recusar'],
  plano: ['aprovar', 'aprovar_editando', 'ajustar'],
}

export type RespostaPendencia = {
  decisao: DecisaoPendencia
  // pergunta: texto exato da pergunta -> resposta (rótulos separados por vírgula no multiSelect, ou texto livre)
  respostas?: Record<string, string>
  // motivo da negação, ajuste pedido no plano ou observação ao recusar
  mensagem?: string
}

export type Pendencia = {
  id: string
  ordemId: string
  agenteId: string
  tipo: TipoPendencia
  ferramenta: string
  titulo: string
  descricao: string | null
  entrada: Record<string, unknown>
  permiteSempre: boolean
  caminhoBloqueado: string | null
  status: StatusPendencia
  resposta: RespostaPendencia | null
  criadaEm: string
  respondidaEm: string | null
}

export type ResumoOrdem = {
  id: string
  agenteId: string
  projeto: string
  projetoNome: string
  instrucao: string
  modo: ModoPermissao
  status: StatusOrdem
  atividade: string | null
  aguardaResposta: boolean
  continuaDe: string | null
  todosFeitos: number
  todosTotal: number
  criadaEm: string
  iniciadaEm: string | null
  finalizadaEm: string | null
  vistaEm: string | null
}

export type AgenteComEstado = Agente & {
  estado: EstadoAgente
  desde: string | null
  ordemAtual: ResumoOrdem | null
  ultimaOrdem: ResumoOrdem | null
  fila: number
  pendencias: number
  // Onde ele está e o que está fazendo por vontade própria; null com o modo Vida desligado.
  vida: VidaDoAgente | null
  // A cadeira em que ele está sentado na reunião; null quando não foi convocado. Manda mais que a vaga da vida.
  reuniao: { vagaId: string } | null
}

export type Projeto = {
  nome: string
  caminho: string
}

export type UsoConta = {
  status: 'allowed' | 'allowed_warning' | 'rejected' | null
  // Fração usada do limite da janela, de 0 a 1 (0.42 = 42%). Pode passar de 1 quando a conta
  // estoura o limite; quem desenha a barra limita a [0, 1].
  cincoHoras: number | null
  seteDias: number | null
  reiniciaEm: string | null
  atualizadoEm: string | null
}

export type Conta = {
  email: string | null
  plano: string | null
  autenticada: boolean | null
  erro: string | null
  uso: UsoConta
}

export type InfoServidor = {
  versao: string
  simulado: boolean
  maxSimultaneas: number
  conectoresClaudeAi: boolean
  dirProjetos: string
  dirAgentes: string
  // Pasta isolada onde os agentes criam e mexem nos projetos deles (nada fora dela).
  dirAgentesProjeto: string
}

export type EstadoGeral = {
  agentes: AgenteComEstado[]
  projetos: Projeto[]
  conta: Conta
  servidor: InfoServidor
  vida: EstadoDaVida
  // A reunião aberta agora, ou null quando a sala está vazia.
  reuniao: Reuniao | null
}

export type DetalheAgente = {
  agente: AgenteComEstado
  ordemAtual: Ordem | null
  fila: Ordem[]
  // As ordens finalizadas mais recentes (no máximo 30); as mais antigas vêm de historicoDoAgente.
  historico: Ordem[]
  // A ordem finalizada mais recente que terminou com uma pergunta ainda sem resposta
  // (aguardaResposta), mesmo que outra ordem esteja rodando agora.
  perguntaFinal: Ordem | null
  // Contagens de todo o histórico, sem o limite da lista.
  totais: { historico: number; concluidas: number }
  pendencias: Pendencia[]
  eventosAtuais: Evento[]
}

export type DetalheOrdem = {
  ordem: Ordem
  agente: Agente
  eventos: Evento[]
  pendencias: Pendencia[]
  cadeia: ResumoOrdem[]
}

export type NovaOrdem = {
  agenteId: string
  projeto: string
  instrucao: string
  modo?: ModoPermissao
  continuaDe?: string | null
}

export type EventoTempoReal =
  | { tipo: 'estado'; dados: EstadoGeral }
  | { tipo: 'agente'; dados: AgenteComEstado }
  | { tipo: 'ordem'; dados: Ordem }
  | { tipo: 'evento'; dados: Evento }
  | { tipo: 'pendencia'; dados: Pendencia }
  | { tipo: 'conta'; dados: Conta }
  | { tipo: 'vida'; dados: EstadoDaVida }
  | { tipo: 'fala'; dados: Fala }
  | { tipo: 'reuniao'; dados: Reuniao | null }

export type Config = {
  porta: number
  host: string
  dirDados: string
  dirProjetos: string
  dirAgentes: string
  // Pasta isolada dos projetos dos agentes: tudo que eles criam por vontade própria fica aqui dentro.
  dirAgentesProjeto: string
  dirWeb: string
  maxSimultaneas: number
  conectoresClaudeAi: boolean
  usarApiKey: boolean
  simulado: boolean
  modeloGeneralista: string | null
  token: string
  versao: string
  // Modo Vida: pasta dos .md (regras e personalidades), modelo e ritmo das vontades, e os tetos de gasto.
  dirVida: string
  modeloVida: string
  intervaloVidaMs: number
  maxNoLote: number
  tetoCustoUsdDoDia: number
  tetoHorasVida: number
  // true liga no boot, false deixa desligada, null = o que estava gravado da última vez.
  vidaNoBoot: boolean | null
}

// O que a execução de uma ordem pede ao humano pelo painel.
export type PedidoHumano = {
  tipo: TipoPendencia
  ferramenta: string
  titulo: string
  descricao: string | null
  entrada: Record<string, unknown>
  permiteSempre: boolean
  caminhoBloqueado: string | null
}

export type FimExecucao = {
  status: 'concluida' | 'erro' | 'parada'
  resultado: string | null
  erro: string | null
  custoUsd: number | null
  turnos: number | null
  duracaoMs: number | null
  tokensEntrada: number | null
  tokensSaida: number | null
}

// Callbacks que o escritório dá a cada execução. A execução nunca mexe no banco diretamente.
export type GanchosExecucao = {
  aoIniciarSessao(info: { sessaoId: string; modelo: string | null }): void
  aoAtividade(texto: string): void
  aoEvento(tipo: TipoEvento, texto: string, detalhe?: unknown): void
  aoTodos(todos: Todo[]): void
  aoUsoConta(uso: Partial<UsoConta>): void
  // Abre uma pendência e espera o humano. Resolve null se a pendência foi cancelada (ordem parada,
  // sinal abortado) ou expirou. Nunca rejeita.
  pedirAoHumano(pedido: PedidoHumano, sinal: AbortSignal): Promise<RespostaPendencia | null>
  // Chamado exatamente uma vez por execução, exceto depois de encerrar().
  aoTerminar(fim: FimExecucao): void
}

export type ContextoExecucao = {
  ordem: Ordem
  agente: Agente
  retomarSessao: string | null
  ganchos: GanchosExecucao
  config: Config
}

export type Execucao = {
  iniciar(): void
  parar(): Promise<void>
  encerrar(): void
}

export type FabricaExecucao = (contexto: ContextoExecucao) => Execucao

export type Escritorio = {
  iniciar(): Promise<void>
  encerrar(): Promise<void>
  estado(): EstadoGeral
  detalheAgente(id: string): DetalheAgente | null
  // Página do histórico do agente, mais recentes primeiro, estritamente mais antigas que a ordem
  // `antesDe` (null = primeira página). limite padrão 30, máximo 100. 404 se o agente não existe,
  // 400 se a ordem do cursor não está no histórico desse agente.
  historicoDoAgente(id: string, antesDe: string | null, limite?: number): Ordem[]
  detalheOrdem(id: string): DetalheOrdem | null
  criarOrdem(nova: NovaOrdem): Ordem
  pararOrdem(id: string): Promise<Ordem>
  cancelarOrdem(id: string): Ordem
  retomarOrdem(id: string, instrucao?: string): Ordem
  marcarVista(id: string): void
  dispensarResposta(id: string): void
  responderPendencia(id: string, resposta: RespostaPendencia): Pendencia
  pendenciasAbertas(): Pendencia[]
  atualizarConta(info: Partial<Omit<Conta, 'uso'>>): void
  assinar(ouvinte: (evento: EventoTempoReal) => void): () => void
  // Modo Vida (quando o escritório foi montado sem ele, ligarVida/mundoDaVida/forcarVontade respondem 409).
  ligarVida(ligada: boolean): EstadoDaVida
  estadoDaVida(): EstadoDaVida
  mundoDaVida(): Mundo
  forcarVontade(pedido: VontadeForcada): Vontade
  vontadesDoAgente(agenteId: string, limite?: number): Vontade[]
  eventosDaVida(desde: number | null, limite?: number): EventoVida[]
  falasDaVida(limite?: number): Fala[]
  pausarVidaDoAgente(agenteId: string, minutos: number): VidaDoAgente | null
  // Sala de reunião: abrir, chamar quem está livre, dispensar, deixar o recado e encerrar.
  reuniaoAberta(): Reuniao | null
  abrirReuniao(): Reuniao
  convocarParaReuniao(agenteId: string): Reuniao
  convocarLivresParaReuniao(): Reuniao
  dispensarDaReuniao(agenteId: string): Reuniao
  darRecadoNaReuniao(texto: string): Reuniao
  encerrarReuniao(): void
}

// ───────────────────────────── sala de reunião ─────────────────────────────
// O humano abre a reunião, chama para a mesa os agentes que estão livres (nunca quem tem ordem do lado dele) e deixa
// um recado. O recado não vira ordem: ele fica guardado e entra no começo da próxima ordem de cada um que estava lá.

export type Convocado = {
  agenteId: string
  // A cadeira em que ele senta ('reuniao:0' a 'reuniao:6'): é a mesma chave de posto que a cena usa para desenhar.
  vagaId: string
  desde: string
}

export type RecadoDaReuniao = {
  id: number
  texto: string
  criadoEm: string
  // Quem estava na sala quando o recado foi dado (é para esses que ele vai entrar na próxima ordem).
  paraIds: string[]
}

export type Reuniao = {
  id: string
  abertaEm: string
  convocados: Convocado[]
  // Do mais antigo para o mais novo.
  recados: RecadoDaReuniao[]
}

// ───────────────────────────── modo Vida ─────────────────────────────
// Com o modo Vida ligado, cada agente sem ordem do humano ganha vontade própria: anda pelo escritório,
// usa os objetos, conversa com os outros e às vezes programa algo na pasta isolada dele.

export type EstadoVida =
  | 'fora'
  | 'ocioso'
  | 'escolhendo'
  | 'indo'
  | 'ocupado'
  | 'conversando'
  | 'oficinando'
  | 'cedendo'

export const ESTADOS_VIDA: readonly EstadoVida[] = [
  'fora', 'ocioso', 'escolhendo', 'indo', 'ocupado', 'conversando', 'oficinando', 'cedendo',
]

// Quanto a vida pode gastar agora: normal, economia (conta perto do limite) ou suspensa (sem chamar modelo).
export type BandaDaVida = 'normal' | 'economia' | 'suspensa'

export type MotivoPausa =
  | 'conta'
  | 'teto_custo'
  | 'teto_decisoes'
  | 'teto_horas'
  | 'sem_conta'
  | 'sem_sandbox'
  | 'catalogo'
  | 'erro'

export type AlvoDoVerbo = 'objeto' | 'vaga' | 'agente' | 'nenhum'

export type PoseDaVaga = 'sentado' | 'empe' | 'costas'

export type Comodo = {
  id: string
  nome: string
  descricao: string
  // false = existe no catálogo mas a cena ainda não sabe levar ninguém até lá: nenhuma vaga dele é oferecida.
  andavel: boolean
}

export type Objeto = {
  id: string
  comodoId: string
  nome: string
  descricao: string
  // O que a pessoa está fazendo quando usa este objeto ('tomando um café'): é o texto que a tela mostra.
  acao: string
  verbos: string[]
  vagas: string[]
}

// O id de uma vaga é, de propósito, a mesma chave de posto que a cena usa: 'mesa:3:sentado', 'lazer:7'.
export type Vaga = {
  id: string
  comodoId: string
  objetoId: string
  nome: string
  pose: PoseDaVaga
  // Lugar que só o humano preenche (as cadeiras da reunião): a vida nunca o escolhe nem o mostra no catálogo.
  soPorConvocacao?: boolean
}

export type Verbo = {
  id: string
  rotulo: string
  descricao: string
  alvo: AlvoDoVerbo
  duracaoMs: readonly [number, number]
  reservaAlvo: boolean
  // true = sobe uma sessão de verdade do agente, na pasta isolada dele.
  precisaAgente: boolean
  precisaSandbox: boolean
}

export type Mundo = {
  comodos: Comodo[]
  objetos: Objeto[]
  vagas: Vaga[]
  verbos: Verbo[]
}

export type Tracos = { energia: number; sociabilidade: number; curiosidade: number; foco: number }

export type Personalidade = {
  agenteId: string
  nome: string
  temperamento: string
  tracos: Tracos
  favoritos: string[]
  evita: string[]
  // Texto livre do .md (ou a descrição do agente, quando não há arquivo). Só molda tom e preferência.
  voz: string
  arquivo: string | null
  // A linha curta que vai no prompt da rodada.
  resumo: string
}

export type Fala = {
  id: number
  agenteId: string
  paraId: string | null
  texto: string
  ditaEm: string
}

export type FalaPlanejada = { agenteId: string; texto: string; emMs: number }

// O que a camada de IA escolheu para um agente, já validado contra o catálogo.
export type Decisao = {
  agenteId: string
  verbo: string
  objetoId: string | null
  vagaId: string | null
  comId: string | null
  assunto: string | null
  duracaoMs: number
  motivo: string
  falas: FalaPlanejada[]
  tarefa: string | null
}

export type Vontade = {
  id: number
  agenteId: string
  verbo: string
  objetoId: string | null
  vagaId: string | null
  comId: string | null
  motivo: string | null
  assunto: string | null
  tarefa: string | null
  aceita: boolean
  // Por que o motor recusou ('vaga_ocupada', 'verbo_desconhecido', 'ordem_do_humano'…), ou null.
  recusa: string | null
  // Identifica a chamada ao modelo que gerou esta vontade: amarra o lote e o custo.
  lote: string
  custoUsd: number | null
  criadaEm: string
  terminadaEm: string | null
}

export type VidaDoAgente = {
  agenteId: string
  estado: EstadoVida
  verbo: string | null
  // Rótulo já resolvido pelo servidor: um verbo novo aparece na tela sem tocar no front.
  rotulo: string | null
  objetoId: string | null
  comodoId: string | null
  vagaId: string | null
  comId: string | null
  motivo: string | null
  desde: string
  ate: string | null
  // Pasta da oficina enquanto está 'oficinando'; null nos outros estados.
  pasta: string | null
}

export type EventoVida = {
  id: number
  agenteId: string
  tipo: 'decisao' | 'recusa' | 'guarda' | 'banda' | 'oficina' | 'sistema'
  texto: string
  criadoEm: string
}

export type EstadoDaVida = {
  ligada: boolean
  // false quando nem dá para ligar: conta não autenticada, catálogo quebrado, pasta isolada fora do lugar.
  disponivel: boolean
  motivoPausa: MotivoPausa | null
  explicacao: string | null
  banda: BandaDaVida
  // false quando o confinamento não está disponível: eles andam e conversam, mas não programam.
  oficinaDisponivel: boolean
  modelo: string
  intervaloMs: number
  ligadaEm: string | null
  decisoesNaHora: number
  custoUsdDoDia: number
  tetoCustoUsdDoDia: number
  vivos: number
  pasta: string
  agentes: VidaDoAgente[]
}

export type VontadeForcada = {
  agenteId: string
  verbo: string
  objetoId?: string | null
  vagaId?: string | null
  comId?: string | null
  duracaoMs?: number
  tarefa?: string | null
}

export type SituacaoDoAgente = {
  agenteId: string
  apelido: string
  estado: EstadoVida
  vagaId: string | null
  verbo: string | null
  desdeMs: number
  // Os verbos que ele pode querer agora (banda, confinamento e tetos já aplicados).
  verbosPermitidos: string[]
  ultimas: string[]
}

export type SituacaoDoEscritorio = {
  instante: string
  // Vagas livres agora, na forma 'lazer:0 (Sofá)'.
  vagasLivres: string[]
  // Quem está onde fazendo o quê. Nunca o texto de uma ordem do humano.
  presentes: string[]
  ocupadosComOHumano: string[]
  // Quem esta rodada deve decidir.
  lote: SituacaoDoAgente[]
}

export type Rodada = {
  lote: string
  mundo: Mundo
  situacao: SituacaoDoEscritorio
  personalidades: Map<string, Personalidade>
  regras: string
}

export type ResultadoDaRodada = {
  decisoes: Decisao[]
  custoUsd: number | null
  tokensEntrada: number | null
  tokensSaida: number | null
  erro: string | null
}

// A fronteira da IA: a máquina de estados não sabe qual implementação está em uso.
export type Deliberador = {
  nome: 'haiku' | 'barato'
  decidir(rodada: Rodada, sinal: AbortSignal): Promise<ResultadoDaRodada>
  encerrar(): void
}

export type GanchosOficina = {
  aoFalar(texto: string): void
  aoEvento(tipo: EventoVida['tipo'], texto: string): void
  // A guarda negou uma chamada; na terceira, a sessão é morta.
  aoViolacao(motivo: string): void
  aoTerminar(fim: { status: 'concluida' | 'erro' | 'parada'; resultado: string | null; custoUsd: number | null }): void
}

export type ContextoOficina = {
  agente: Agente
  personalidade: Personalidade
  tarefa: string
  raiz: string
  config: Config
  ganchos: GanchosOficina
}

export type FabricaExecucaoDaVida = (contexto: ContextoOficina) => Execucao

// O que o escritório chama na vida (dependência invertida: a vida é opcional).
export type ControleDaVida = {
  reconciliar(): void
  ligar(ligada: boolean): EstadoDaVida
  estado(): EstadoDaVida
  mundo(): Mundo
  // Síncrono, no começo de registrarOrdem(): ordem do humano mata a vida daquele agente.
  cederAoHumano(agenteId: string): void
  ordemAcabou(agenteId: string): void
  aoUsoConta(uso: UsoConta): void
  doAgente(agenteId: string): VidaDoAgente | null
  forcar(pedido: VontadeForcada): Vontade
  vontadesDoAgente(agenteId: string, limite?: number): Vontade[]
  eventos(desde: number | null, limite?: number): EventoVida[]
  falasRecentes(limite?: number): Fala[]
  pausarAgente(agenteId: string, minutos: number): VidaDoAgente | null
  encerrar(): Promise<void>
}

export type StatusErro = 400 | 401 | 404 | 409

// Erro esperado (validação, não encontrado, conflito) que a API devolve com o status e a mensagem.
export class ErroEscritorio extends Error {
  status: StatusErro

  constructor(status: StatusErro, mensagem: string) {
    super(mensagem)
    this.name = 'ErroEscritorio'
    this.status = status
  }
}
