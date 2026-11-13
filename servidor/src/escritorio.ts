import { randomUUID } from 'node:crypto'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { basename, join } from 'node:path'
import { carregarAgentes } from './agentes.ts'
import { abrirBanco } from './banco.ts'
import type { Banco } from './banco.ts'
import { MUNDO_VAGAS_REUNIAO } from './mundo.ts'
import { ehPasta, listarProjetos, resolverProjeto } from './projetos.ts'
import { estadoDaVidaDesligada } from './vida.ts'
import {
  DECISOES_POR_TIPO,
  ErroEscritorio,
  MODOS_PERMISSAO,
  type Agente,
  type AgenteComEstado,
  type Config,
  type ControleDaVida,
  type Conta,
  type DecisaoPendencia,
  type DetalheAgente,
  type DetalheOrdem,
  type Escritorio,
  type EstadoAgente,
  type EstadoGeral,
  type Evento,
  type EventoTempoReal,
  type Execucao,
  type FabricaExecucao,
  type FimExecucao,
  type GanchosExecucao,
  type ModoPermissao,
  type NovaOrdem,
  type Ordem,
  type PedidoHumano,
  type Pendencia,
  type RespostaPendencia,
  type ResumoOrdem,
  type Reuniao,
  type StatusOrdem,
  type StatusPendencia,
  type TipoEvento,
  type Todo,
  type UsoConta,
} from './tipos.ts'

const LIMITE_TEXTO_EVENTO = 8000
const LIMITE_DETALHE_BYTES = 16 * 1024
const LIMITE_ENTRADA_BYTES = 256 * 1024
const LIMITE_RESULTADO_BYTES = 100 * 1024
const LIMITE_INSTRUCAO = 20_000
const LIMITE_INSTRUCAO_RESUMO = 500
const LIMITE_ERRO = 4000
const LIMITE_ATIVIDADE = 300
const LIMITE_RESPOSTA = 4000
const LIMITE_RECADO = 4000
// Quantos recados da reunião o painel mostra (os mais novos).
const RECADOS_DA_REUNIAO = 30
const HISTORICO_DO_AGENTE = 30
const HISTORICO_MAXIMO = 100
const EVENTOS_DO_AGENTE = 100
const EVENTOS_DA_ORDEM = 2000
const ESPERA_PARADA_MS = 8000
const ESPERA_MAXIMA_PARA_GRAVAR_FIM_MS = 30_000
const DEBOUNCE_AGENTES_MS = 500
const INTERVALO_PASTA_AGENTES_MS = 2000
// Os agentes de projeto ficam espalhados pelas pastas dos projetos: em vez de vigiar cada uma, relê de tempos em tempos.
const INTERVALO_AGENTES_DE_PROJETO_MS = 10_000
const PASSOS_DE_CORTE = [[4000, 200], [1000, 50], [200, 20], [40, 5]] as const

// As cadeiras da reunião, na ordem em que a convocação as preenche (a cena desenha cada uma pela mesma chave).
const CADEIRAS_DA_REUNIAO: readonly string[] = Array.from({ length: MUNDO_VAGAS_REUNIAO }, (_, i) => `reuniao:${i}`)

const RODANDO: readonly StatusOrdem[] = ['trabalhando', 'aguardando']
const ATIVAS: readonly StatusOrdem[] = ['na_fila', 'trabalhando', 'aguardando']
const FINAIS: readonly StatusOrdem[] = ['concluida', 'erro', 'parada', 'interrompida', 'cancelada']
const TERMINADAS: readonly StatusOrdem[] = ['concluida', 'erro', 'parada', 'interrompida']
const RETOMAVEIS: readonly StatusOrdem[] = ['interrompida', 'parada', 'erro']
// Modo que a sessão passa a ter quando o humano aprova o plano (a execução muda o modo só no processo do Claude Code).
const MODO_DO_PLANO_APROVADO: Partial<Record<DecisaoPendencia, ModoPermissao>> = {
  aprovar: 'default',
  aprovar_editando: 'bypassPermissions',
}
const STATUS_DE_FIM: readonly FimExecucao['status'][] = ['concluida', 'erro', 'parada']
const STATUS_DE_TODO: readonly Todo['status'][] = ['pendente', 'andamento', 'feito']
const STATUS_DE_USO: readonly string[] = ['allowed', 'allowed_warning', 'rejected']
const TIPOS_DE_EVENTO = Object.keys({
  sistema: true,
  texto: true,
  ferramenta: true,
  resultado_ferramenta: true,
  status: true,
  todos: true,
  subagente: true,
  pendencia: true,
  resposta: true,
  erro: true,
  resultado: true,
} satisfies Record<TipoEvento, true>) as TipoEvento[]

const MENSAGEM_REINICIADO = 'O servidor foi reiniciado enquanto a ordem rodava.'
const MENSAGEM_DESLIGADO = 'O servidor foi desligado enquanto a ordem rodava.'
const MENSAGEM_EXPIROU = 'Essa pergunta expirou porque o servidor foi reiniciado.'
const MENSAGEM_PARADA = 'Você parou a ordem.'
const MENSAGEM_CONCLUIDA = 'Ordem concluída.'
const MENSAGEM_PENDENCIA_FECHADA: Record<Exclude<StatusPendencia, 'aberta'>, string> = {
  respondida: 'Essa pergunta já foi respondida.',
  cancelada: 'Essa pergunta foi cancelada porque a ordem terminou.',
  expirada: MENSAGEM_EXPIROU,
}

type Controle = {
  ordemId: string
  agenteId: string
  iniciadaEm: string | null
  execucao: Execucao | null
  terminou: boolean
  encerrada: boolean
  parada: Promise<void> | null
  fim: Promise<void>
  avisarFim: () => void
  // Texto do último evento 'texto' da ordem (a última fala do agente), para o evento de resultado não repeti-lo.
  ultimoTexto: string | null
  // Fim que a execução já avisou e o banco ainda não gravou; enquanto existir, a execução segue ocupando o agente.
  fimPendente: FimPendente | null
  tentativas: number
  novaTentativa: NodeJS.Timeout | null
}

type FimPendente = {
  campos: Partial<Ordem>
  evento: { tipo: TipoEvento; texto: string }
  momento: string
}

type Espera = {
  ordemId: string
  soltar: (resposta: RespostaPendencia | null) => void
}

export type OpcoesEscritorio = {
  config: Config
  criarExecucao: FabricaExecucao
  caminhoBanco?: string
  // O modo Vida é opcional: sem ele, o escritório é exatamente o de antes.
  criarVida?: (nucleo: NucleoDaVida) => ControleDaVida
}

// O que a vida precisa do escritório para existir. Ela nunca mexe no banco de ordens nem na fila.
export type NucleoDaVida = {
  banco: Banco
  agentes(): Agente[]
  ocupadoComOHumano(agenteId: string): boolean
  // true quando o agente está sentado na reunião que o humano abriu.
  naReuniao(agenteId: string): boolean
  algumaOrdemDoHumano(): boolean
  emitir(evento: EventoTempoReal): void
  aoMudarAgente(agenteId: string): void
}

// Cria o serviço do escritório: agentes, projetos, fila de ordens, execuções, pendências e eventos ao vivo. Retorna o Escritorio.
export function criarEscritorio(opcoes: OpcoesEscritorio): Escritorio {
  const { config, criarExecucao } = opcoes
  const banco = abrirBanco(opcoes.caminhoBanco ?? join(config.dirDados, 'escritorio.db'))
  const maxSimultaneas = Math.max(1, Math.floor(config.maxSimultaneas) || 1)
  const ouvintes = new Set<(evento: EventoTempoReal) => void>()
  const execucoes = new Map<string, Controle>()
  const esperas = new Map<string, Espera>()
  const jsonDosAgentes = new Map<string, string>()
  const conhecidos = new Map<string, Agente>()
  let agentes: Agente[] = []
  let conta: Conta = {
    email: null,
    plano: null,
    autenticada: null,
    erro: null,
    uso: { status: null, cincoHoras: null, seteDias: null, reiniciaEm: null, atualizadoEm: null },
  }
  let iniciado = false
  let encerrado = false
  let agendando = false
  let reagendar = false
  let vigia: FSWatcher | null = null
  let recarga: NodeJS.Timeout | null = null
  let esperaDaPasta: NodeJS.Timeout | null = null
  let varredura: NodeJS.Timeout | null = null
  // A vida é opcional: sem ela, o escritório é exatamente o de antes.
  let vida: ControleDaVida | null = null
  // A reunião aberta (uma por vez) vem do banco: ela sobrevive a um reinício do servidor.
  let reuniaoId: string | null = banco.reuniaoAberta()?.id ?? null

  definirAgentes(carregarAgentes(config.dirAgentes, config.modeloGeneralista, config.dirProjetos))

  vida = opcoes.criarVida?.({
    banco,
    agentes: () => agentes,
    // Ocupado com o humano = tem ordem na fila, rodando ou esperando resposta dele.
    ocupadoComOHumano: (agenteId) => ocupadoComOHumano(agenteId),
    // Quem está sentado na reunião não decide nada: a convocação manda, como manda uma ordem do humano.
    naReuniao: (agenteId) => cadeiraDe(agenteId) !== null,
    algumaOrdemDoHumano: () => banco.listarOrdens({ status: RODANDO, limite: 1 }).length > 0,
    emitir,
    aoMudarAgente: (agenteId) => atualizarAgente(agenteId),
  }) ?? null

  function emitir(evento: EventoTempoReal): void {
    for (const ouvinte of [...ouvintes]) {
      try {
        ouvinte(evento)
      } catch (erro) {
        console.error('[escritorio] um ouvinte de eventos falhou:', erro)
      }
    }
  }

  function emitirOrdem(ordem: Ordem): void {
    emitir({ tipo: 'ordem', dados: ordem })
  }

  function emitirPendencia(pendencia: Pendencia): void {
    emitir({ tipo: 'pendencia', dados: pendencia })
  }

  function verificarAberto(): void {
    if (encerrado) throw new ErroEscritorio(409, 'O escritório está desligando.')
  }

  function definirAgentes(lista: Agente[]): void {
    agentes = lista
    for (const agente of lista) conhecidos.set(agente.id, agente)
  }

  function agenteAtivo(id: string): Agente | undefined {
    return agentes.find((agente) => agente.id === id)
  }

  function acharAgente(valor: unknown): Agente {
    const chave = typeof valor === 'string' ? valor.trim() : ''
    if (!chave) throw new ErroEscritorio(400, 'Escolha o agente da ordem.')
    const minusculo = chave.toLowerCase()
    const agente = agenteAtivo(chave)
      ?? agentes.find((item) => item.id === minusculo || item.nome.toLowerCase() === minusculo)
    if (!agente) throw new ErroEscritorio(404, `Agente não encontrado: ${chave}`)
    return agente
  }

  function obterOrdem(id: unknown): Ordem {
    const ordem = typeof id === 'string' && id ? banco.obterOrdem(id) : null
    if (!ordem) throw new ErroEscritorio(404, 'Ordem não encontrada.')
    return ordem
  }

  // A ordem terminada mais recente do agente que acabou com uma pergunta ainda sem resposta (aguardaResposta).
  function perguntaFinalDe(agenteId: string): Ordem | null {
    return banco.listarOrdens({
      agenteId,
      status: TERMINADAS,
      aguardaResposta: true,
      ordenarPor: 'finalizacao_desc',
      limite: 1,
    })[0] ?? null
  }

  function listarHistorico(agenteId: string, antesDe: string | undefined, limite: number): Ordem[] {
    return banco.listarOrdens({ agenteId, status: FINAIS, antesDe, ordenarPor: 'finalizacao_desc', limite })
  }

  // ─────────────────────────── sala de reunião ───────────────────────────

  // Ocupado com o humano = tem ordem na fila, rodando ou esperando resposta dele. Só quem não está é convocável.
  function ocupadoComOHumano(agenteId: string): boolean {
    return banco.listarOrdens({ agenteId, status: ATIVAS, limite: 1 }).length > 0
  }

  // A cadeira em que o agente está sentado na reunião, ou null quando ele não foi convocado.
  function cadeiraDe(agenteId: string): string | null {
    if (!reuniaoId) return null
    return banco.convocados(reuniaoId).find((c) => c.agenteId === agenteId)?.vagaId ?? null
  }

  function montarReuniao(): Reuniao | null {
    const linha = reuniaoId ? banco.reuniaoAberta() : null
    if (!linha) {
      reuniaoId = null
      return null
    }
    return {
      id: linha.id,
      abertaEm: linha.abertaEm,
      convocados: banco.convocados(linha.id),
      recados: banco.recadosDaReuniao(linha.id, RECADOS_DA_REUNIAO),
    }
  }

  function emitirReuniao(): Reuniao | null {
    const atual = montarReuniao()
    emitir({ tipo: 'reuniao', dados: atual })
    return atual
  }

  // A reunião depois de uma mudança, já avisada a quem está olhando pelo SSE. Retorna a Reuniao.
  function reuniaoDepoisDeMudar(): Reuniao {
    const atual = emitirReuniao()
    if (!atual) throw new ErroEscritorio(409, 'A reunião foi encerrada.')
    return atual
  }

  function reuniaoEmAndamento(): string {
    verificarAberto()
    if (!reuniaoId) throw new ErroEscritorio(409, 'Não há reunião aberta. Clique na mesa de reunião para abrir uma.')
    return reuniaoId
  }

  // Põe o agente na primeira cadeira livre da reunião. Retorna true quando ele entrou (false = ele já estava lá).
  function sentarNaReuniao(id: string, agente: Agente): boolean {
    const naMesa = banco.convocados(id)
    if (naMesa.some((convocado) => convocado.agenteId === agente.id)) return false
    const ocupadas = new Set(naMesa.map((convocado) => convocado.vagaId))
    const vaga = CADEIRAS_DA_REUNIAO.find((cadeira) => !ocupadas.has(cadeira))
    if (!vaga) throw new ErroEscritorio(409, `A mesa de reunião já está com ${CADEIRAS_DA_REUNIAO.length} agentes.`)
    if (!banco.convocar(id, agente.id, vaga, agora())) return false
    // Ele para de fazer o que a vida mandava, como pararia por uma ordem: a reunião é coisa do humano.
    vida?.cederAoHumano(agente.id)
    atualizarAgente(agente.id)
    return true
  }

  // Tira o agente da reunião (se estiver nela) e devolve a vida dele. Retorna true quando ele saiu.
  function levantarDaReuniao(id: string, agenteId: string): boolean {
    if (!banco.dispensar(id, agenteId)) return false
    vida?.ordemAcabou(agenteId)
    atualizarAgente(agenteId)
    return true
  }

  function derivar(agente: Agente): AgenteComEstado {
    const cadeira = cadeiraDe(agente.id)
    const atual = banco.listarOrdens({ agenteId: agente.id, status: RODANDO, limite: 1 })[0] ?? null
    const fila = banco.listarOrdens({ agenteId: agente.id, status: ['na_fila'] })
    const ultima = banco.listarOrdens({
      agenteId: agente.id,
      status: TERMINADAS,
      ordenarPor: 'finalizacao_desc',
      limite: 1,
    })[0] ?? null
    const abertas = banco.listarPendencias({ agenteId: agente.id, status: 'aberta' })
    const daAtual = atual ? abertas.filter((pendencia) => pendencia.ordemId === atual.id) : []
    const [estado, desde] = calcularEstado(atual, fila, ultima, perguntaFinalDe(agente.id), daAtual)
    return {
      ...agente,
      ferramentas: agente.ferramentas ? [...agente.ferramentas] : null,
      estado,
      desde,
      ordemAtual: atual ? resumir(atual) : null,
      ultimaOrdem: ultima ? resumir(ultima) : null,
      fila: fila.length,
      pendencias: abertas.length,
      vida: vida?.doAgente(agente.id) ?? null,
      reuniao: cadeira ? { vagaId: cadeira } : null,
    }
  }

  function atualizarAgente(agenteId: string): void {
    const agente = agenteAtivo(agenteId)
    if (!agente) return
    const derivado = derivar(agente)
    const json = JSON.stringify(derivado)
    if (jsonDosAgentes.get(agenteId) === json) return
    jsonDosAgentes.set(agenteId, json)
    emitir({ tipo: 'agente', dados: derivado })
  }

  function memorizarAgentes(): AgenteComEstado[] {
    jsonDosAgentes.clear()
    return agentes.map((agente) => {
      const derivado = derivar(agente)
      jsonDosAgentes.set(agente.id, JSON.stringify(derivado))
      return derivado
    })
  }

  function montarEstado(derivados: AgenteComEstado[]): EstadoGeral {
    return {
      agentes: derivados,
      projetos: listarProjetos(config.dirProjetos),
      conta: structuredClone(conta),
      vida: vida?.estado() ?? estadoDaVidaDesligada(config),
      reuniao: montarReuniao(),
      servidor: {
        versao: config.versao,
        simulado: config.simulado,
        maxSimultaneas,
        conectoresClaudeAi: config.conectoresClaudeAi,
        dirProjetos: config.dirProjetos,
        dirAgentes: config.dirAgentes,
        dirAgentesProjeto: config.dirAgentesProjeto,
      },
    }
  }

  function registrarEvento(ordemId: string, tipo: TipoEvento, texto: unknown, detalhe?: unknown): Evento {
    const evento = banco.inserirEvento(montarEvento(ordemId, tipo, texto, detalhe, agora()))
    emitir({ tipo: 'evento', dados: evento })
    return evento
  }

  // A ordem do humano é a porta única (criar e retomar): a vida do agente para aqui, antes de qualquer outra coisa.
  function registrarOrdem(dados: {
    agente: Agente
    projeto: string
    instrucao: string
    modo: ModoPermissao
    anterior: Ordem | null
  }): Ordem {
    vida?.cederAoHumano(dados.agente.id)
    // Ordem do humano também tira da reunião: ele volta para a mesa e trabalha.
    if (reuniaoId) levantarDaReuniao(reuniaoId, dados.agente.id)
    const { agente, anterior } = dados
    const nova: Ordem = {
      id: randomUUID(),
      agenteId: agente.id,
      projeto: dados.projeto,
      instrucao: dados.instrucao,
      modo: dados.modo,
      status: 'na_fila',
      sessaoId: anterior?.sessaoId ?? null,
      continuaDe: anterior?.id ?? null,
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
      criadaEm: agora(),
      iniciadaEm: null,
      finalizadaEm: null,
      vistaEm: null,
    }
    const { liberadas, gravada } = banco.tx(() => {
      const limpas = banco.limparAguardaResposta(anterior ? { ordemId: anterior.id } : { agenteId: agente.id })
      // O recado da reunião só serve em sessão nova: numa continuação o agente já está na mesma conversa, e gastá-lo
      // ali seria perdê-lo. Então ele fica guardado para a próxima ordem que começa de verdade.
      const recado = sessaoParaRetomar(nova) ? null : banco.tomarRecado(agente.id, nova.criadaEm)
      const comRecado: Ordem = { ...nova, recado }
      banco.inserirOrdem(comRecado)
      return { liberadas: limpas, gravada: comRecado }
    })
    for (const ordem of liberadas) emitirOrdem(ordem)
    emitirOrdem(gravada)
    agendar()
    atualizarAgente(agente.id)
    return banco.obterOrdem(gravada.id) ?? gravada
  }

  function agendar(): void {
    if (!iniciado || encerrado) return
    if (agendando) {
      reagendar = true
      return
    }
    agendando = true
    try {
      do {
        reagendar = false
        for (const ordem of banco.listarOrdens({ status: ['na_fila'] })) {
          if (encerrado || execucoes.size >= maxSimultaneas) break
          if (agenteOcupado(ordem.agenteId)) continue
          const agente = agenteAtivo(ordem.agenteId)
          if (agente) iniciarExecucao(ordem, agente)
        }
      } while (reagendar && !encerrado)
    } finally {
      agendando = false
    }
  }

  function agenteOcupado(agenteId: string): boolean {
    for (const controle of execucoes.values()) if (controle.agenteId === agenteId) return true
    return false
  }

  function sessaoParaRetomar(ordem: Ordem): string | null {
    if (ordem.sessaoId) return ordem.sessaoId
    if (!ordem.continuaDe) return null
    return banco.obterOrdem(ordem.continuaDe)?.sessaoId ?? null
  }

  function iniciarExecucao(ordem: Ordem, agente: Agente): void {
    const iniciada = banco.atualizarOrdem(ordem.id, { status: 'trabalhando', iniciadaEm: agora() }, ['na_fila'])
    if (!iniciada) return
    let avisarFim = (): void => {}
    const fim = new Promise<void>((resolver) => {
      avisarFim = resolver
    })
    const controle: Controle = {
      ordemId: iniciada.id,
      agenteId: agente.id,
      iniciadaEm: iniciada.iniciadaEm,
      execucao: null,
      terminou: false,
      encerrada: false,
      parada: null,
      fim,
      avisarFim,
      ultimoTexto: null,
      fimPendente: null,
      tentativas: 0,
      novaTentativa: null,
    }
    execucoes.set(iniciada.id, controle)
    emitirOrdem(iniciada)
    atualizarAgente(agente.id)
    // A pasta pode ter sumido enquanto a ordem esperava na fila; o Claude Code falharia com uma mensagem enganosa.
    if (!ehPasta(iniciada.projeto)) {
      finalizar(controle, fimSemDados('erro', `A pasta do projeto não existe mais: ${iniciada.projeto}`))
      return
    }
    try {
      controle.execucao = criarExecucao({
        ordem: { ...iniciada },
        agente: { ...agente },
        retomarSessao: sessaoParaRetomar(iniciada),
        ganchos: criarGanchos(controle),
        config,
      })
      controle.execucao.iniciar()
    } catch (erro) {
      finalizar(controle, fimSemDados('erro', `Não foi possível iniciar a ordem: ${mensagemDe(erro)}`))
    }
  }

  function vivo(controle: Controle): boolean {
    return !controle.terminou && !controle.encerrada && !encerrado
  }

  function criarGanchos(controle: Controle): GanchosExecucao {
    return {
      aoIniciarSessao: protegido('aoIniciarSessao', (info: { sessaoId: string; modelo: string | null }) => {
        if (!vivo(controle)) return
        const sessaoId = textoOuNulo(info?.sessaoId)
        const campos: Partial<Ordem> = { modelo: textoOuNulo(info?.modelo) }
        if (sessaoId) campos.sessaoId = sessaoId
        const ordem = banco.atualizarOrdem(controle.ordemId, campos)
        if (ordem) emitirOrdem(ordem)
        atualizarAgente(controle.agenteId)
      }),
      aoAtividade: protegido('aoAtividade', (texto: string) => {
        if (!vivo(controle)) return
        const atividade = typeof texto === 'string' && texto.trim() ? cortar(texto.trim(), LIMITE_ATIVIDADE) : null
        const ordem = banco.atualizarOrdem(controle.ordemId, { atividade })
        if (ordem) emitirOrdem(ordem)
        atualizarAgente(controle.agenteId)
      }),
      aoEvento: protegido('aoEvento', (tipo: TipoEvento, texto: string, detalhe?: unknown) => {
        if (!vivo(controle)) return
        const evento = registrarEvento(controle.ordemId, tipo, texto, detalhe)
        if (evento.tipo === 'texto') controle.ultimoTexto = evento.texto
      }),
      aoTodos: protegido('aoTodos', (todos: Todo[]) => {
        if (!vivo(controle)) return
        const ordem = banco.atualizarOrdem(controle.ordemId, { todos: normalizarTodos(todos) })
        if (ordem) emitirOrdem(ordem)
        atualizarAgente(controle.agenteId)
      }),
      aoUsoConta: protegido('aoUsoConta', (uso: Partial<UsoConta>) => {
        aplicarUso(uso)
      }),
      pedirAoHumano: (pedido, sinal) => pedirAoHumano(controle, pedido, sinal),
      aoTerminar: protegido('aoTerminar', (fim: FimExecucao) => {
        if (controle.encerrada || encerrado) return
        finalizar(controle, fim)
      }),
    }
  }

  function pedirAoHumano(
    controle: Controle,
    pedido: PedidoHumano,
    sinal: AbortSignal | undefined,
  ): Promise<RespostaPendencia | null> {
    return new Promise((resolver) => {
      let pendenciaId: string | null = null
      try {
        const tipoValido = Boolean(pedido) && Object.hasOwn(DECISOES_POR_TIPO, pedido.tipo)
        if (!vivo(controle) || controle.parada || sinal?.aborted || !tipoValido) {
          resolver(null)
          return
        }
        const pendencia: Pendencia = {
          id: randomUUID(),
          ordemId: controle.ordemId,
          agenteId: controle.agenteId,
          tipo: pedido.tipo,
          ferramenta: cortar(String(pedido.ferramenta ?? ''), 200),
          titulo: cortar(String(pedido.titulo ?? ''), 300),
          descricao: typeof pedido.descricao === 'string' && pedido.descricao ? cortar(pedido.descricao, 4000) : null,
          entrada: limitarEntrada(pedido.entrada),
          permiteSempre: pedido.permiteSempre === true,
          caminhoBloqueado: typeof pedido.caminhoBloqueado === 'string' ? cortar(pedido.caminhoBloqueado, 1000) : null,
          status: 'aberta',
          resposta: null,
          criadaEm: agora(),
          respondidaEm: null,
        }
        const ordem = banco.tx(() => {
          banco.inserirPendencia(pendencia)
          return banco.atualizarOrdem(controle.ordemId, { status: 'aguardando' }, ['trabalhando'])
        })
        pendenciaId = pendencia.id
        const aoAbortar = (): void => cancelarPendencia(pendencia.id)
        esperas.set(pendencia.id, {
          ordemId: controle.ordemId,
          soltar: (resposta) => {
            sinal?.removeEventListener('abort', aoAbortar)
            resolver(resposta)
          },
        })
        sinal?.addEventListener('abort', aoAbortar, { once: true })
        emitirPendencia(pendencia)
        registrarEvento(controle.ordemId, 'pendencia', pendencia.titulo, {
          pendenciaId: pendencia.id,
          tipo: pendencia.tipo,
          ferramenta: pendencia.ferramenta,
        })
        if (ordem) emitirOrdem(ordem)
        atualizarAgente(controle.agenteId)
      } catch (erro) {
        console.error('[escritorio] não foi possível abrir a pendência:', erro)
        if (pendenciaId && esperas.has(pendenciaId)) cancelarPendencia(pendenciaId)
        resolver(null)
      }
    })
  }

  function soltarEspera(pendenciaId: string, resposta: RespostaPendencia | null = null): void {
    const espera = esperas.get(pendenciaId)
    if (!espera) return
    esperas.delete(pendenciaId)
    espera.soltar(resposta)
  }

  function cancelarPendencia(pendenciaId: string): void {
    try {
      if (encerrado) {
        soltarEspera(pendenciaId)
        return
      }
      const pendencia = banco.atualizarPendencia(pendenciaId, { status: 'cancelada' }, ['aberta'])
      soltarEspera(pendenciaId)
      if (!pendencia) return
      emitirPendencia(pendencia)
      voltarATrabalhar(pendencia.ordemId, pendencia.agenteId)
    } catch (erro) {
      console.error('[escritorio] não foi possível cancelar a pendência:', erro)
      soltarEspera(pendenciaId)
    }
  }

  function voltarATrabalhar(ordemId: string, agenteId: string): void {
    const controle = execucoes.get(ordemId)
    if (controle && vivo(controle) && banco.contarPendenciasAbertas(ordemId) === 0) {
      const ordem = banco.atualizarOrdem(ordemId, { status: 'trabalhando' }, ['aguardando'])
      if (ordem) emitirOrdem(ordem)
    }
    atualizarAgente(agenteId)
  }

  function finalizar(controle: Controle, fim: FimExecucao): void {
    if (controle.terminou) return
    controle.terminou = true
    controle.fimPendente = montarFim(fim, controle.iniciadaEm, controle.ultimoTexto)
    try {
      gravarFim(controle)
    } finally {
      controle.avisarFim()
    }
  }

  // Grava o fim da ordem e só então solta o agente. Se o banco falhar (travado por outro programa, disco cheio), a
  // execução continua ocupando o agente e o mesmo fim é gravado de novo depois: o resultado não se perde e a próxima
  // ordem não começa por cima de uma que ainda aparece rodando.
  function gravarFim(controle: Controle): void {
    const pendente = controle.fimPendente
    if (!pendente) return
    if (controle.novaTentativa) clearTimeout(controle.novaTentativa)
    controle.novaTentativa = null
    let gravado: { canceladas: Pendencia[]; ordem: Ordem | null; evento: Evento | null }
    try {
      gravado = banco.tx(() => {
        const canceladas = banco.fecharPendenciasAbertas('cancelada', controle.ordemId)
        const ordem = banco.atualizarOrdem(controle.ordemId, pendente.campos, RODANDO)
        const evento = ordem
          ? banco.inserirEvento(montarEvento(ordem.id, pendente.evento.tipo, pendente.evento.texto, null, pendente.momento))
          : null
        return { canceladas, ordem, evento }
      })
    } catch (erro) {
      programarNovaGravacao(controle, erro)
      return
    }
    controle.fimPendente = null
    execucoes.delete(controle.ordemId)
    for (const pendencia of gravado.canceladas) {
      emitirPendencia(pendencia)
      soltarEspera(pendencia.id)
    }
    if (gravado.evento) emitir({ tipo: 'evento', dados: gravado.evento })
    if (gravado.ordem) emitirOrdem(gravado.ordem)
    try {
      atualizarAgente(controle.agenteId)
      vida?.ordemAcabou(controle.agenteId)
      agendar()
    } catch (erro) {
      console.error('[escritorio] não foi possível reagendar depois do fim da ordem:', erro)
    }
  }

  function programarNovaGravacao(controle: Controle, erro: unknown): void {
    if (encerrado) {
      console.error('[escritorio] não foi possível registrar o fim da ordem:', erro)
      return
    }
    const espera = Math.min(ESPERA_MAXIMA_PARA_GRAVAR_FIM_MS, 1000 * 2 ** controle.tentativas)
    controle.tentativas++
    console.error(`[escritorio] não foi possível registrar o fim da ordem; tento de novo em ${espera / 1000} s:`, erro)
    const temporizador = setTimeout(() => {
      controle.novaTentativa = null
      gravarFim(controle)
    }, espera)
    temporizador.unref()
    controle.novaTentativa = temporizador
  }

  async function executarParada(controle: Controle): Promise<void> {
    try {
      const canceladas = banco.fecharPendenciasAbertas('cancelada', controle.ordemId)
      for (const pendencia of canceladas) {
        emitirPendencia(pendencia)
        soltarEspera(pendencia.id)
      }
      if (canceladas.length > 0) voltarATrabalhar(controle.ordemId, controle.agenteId)
    } catch (erro) {
      // Com o banco travado a execução para mesmo assim: os pedidos abertos fecham junto com o fim da ordem (gravarFim).
      // Sem isso a parada rejeitada ficaria guardada no controle e todo Parar seguinte falharia também.
      console.error('[escritorio] não foi possível cancelar os pedidos ao parar a ordem:', erro)
    }
    try {
      await controle.execucao?.parar()
    } catch (erro) {
      console.error('[escritorio] a execução falhou ao parar:', erro)
    }
    if (vivo(controle)) {
      let temporizador: NodeJS.Timeout | undefined
      await Promise.race([
        controle.fim,
        new Promise<void>((resolver) => {
          temporizador = setTimeout(resolver, ESPERA_PARADA_MS)
        }),
      ])
      clearTimeout(temporizador)
    }
    if (!vivo(controle)) return
    try {
      controle.execucao?.encerrar()
    } catch (erro) {
      console.error('[escritorio] a execução falhou ao encerrar:', erro)
    }
    finalizar(controle, fimSemDados('parada', null))
  }

  function pararOrfa(ordem: Ordem): Ordem {
    const momento = agora()
    const { parada, canceladas } = banco.tx(() => ({
      canceladas: banco.fecharPendenciasAbertas('cancelada', ordem.id),
      parada: banco.atualizarOrdem(
        ordem.id,
        { status: 'parada', atividade: null, finalizadaEm: momento, vistaEm: momento },
        RODANDO,
      ),
    }))
    for (const pendencia of canceladas) {
      emitirPendencia(pendencia)
      soltarEspera(pendencia.id)
    }
    if (parada) {
      registrarEvento(parada.id, 'sistema', MENSAGEM_PARADA)
      emitirOrdem(parada)
    }
    atualizarAgente(ordem.agenteId)
    agendar()
    return parada ?? obterOrdem(ordem.id)
  }

  function aplicarUso(uso: Partial<UsoConta>): void {
    if (encerrado || !uso || typeof uso !== 'object') return
    const novo = { ...conta.uso }
    if (uso.status !== undefined) {
      novo.status = typeof uso.status === 'string' && STATUS_DE_USO.includes(uso.status) ? uso.status : null
    }
    if (uso.cincoHoras !== undefined) novo.cincoHoras = numeroOuNulo(uso.cincoHoras)
    if (uso.seteDias !== undefined) novo.seteDias = numeroOuNulo(uso.seteDias)
    if (uso.reiniciaEm !== undefined) novo.reiniciaEm = textoOuNulo(uso.reiniciaEm)
    novo.atualizadoEm = agora()
    conta = { ...conta, uso: novo }
    emitir({ tipo: 'conta', dados: structuredClone(conta) })
    // A vida é a primeira coisa a ser cortada quando a conta aperta; o trabalho que o humano mandou, nunca.
    vida?.aoUsoConta(novo)
  }

  function fecharVigia(): void {
    vigia?.close()
    vigia = null
  }

  function pararVigia(): void {
    fecharVigia()
    if (recarga) clearTimeout(recarga)
    if (esperaDaPasta) clearInterval(esperaDaPasta)
    if (varredura) clearInterval(varredura)
    recarga = null
    esperaDaPasta = null
    varredura = null
  }

  function varrerAgentesDeProjeto(): void {
    if (encerrado || varredura) return
    varredura = setInterval(programarRecarga, INTERVALO_AGENTES_DE_PROJETO_MS)
    varredura.unref()
  }

  function vigiarAgentes(): void {
    if (encerrado || vigia) return
    try {
      vigia = watch(config.dirAgentes, { persistent: false }, () => programarRecarga())
      vigia.on('error', () => {
        fecharVigia()
        programarRecarga()
      })
    } catch {
      vigia = null
      aguardarPasta()
    }
  }

  function aguardarPasta(): void {
    if (encerrado || esperaDaPasta) return
    const intervalo = setInterval(() => {
      if (!existsSync(config.dirAgentes)) return
      clearInterval(intervalo)
      esperaDaPasta = null
      vigiarAgentes()
      programarRecarga()
    }, INTERVALO_PASTA_AGENTES_MS)
    intervalo.unref()
    esperaDaPasta = intervalo
  }

  function programarRecarga(): void {
    if (encerrado) return
    if (recarga) clearTimeout(recarga)
    recarga = setTimeout(recarregarAgentes, DEBOUNCE_AGENTES_MS)
    recarga.unref()
  }

  // A lista de agentes mudou: o escritório pode ter ganhado mesas, e a vida precisa saber.
  function recarregarAgentes(): void {
    recarga = null
    if (encerrado) return
    try {
      fecharVigia()
      if (existsSync(config.dirAgentes)) vigiarAgentes()
      else aguardarPasta()
      const novos = carregarAgentes(config.dirAgentes, config.modeloGeneralista, config.dirProjetos)
      if (JSON.stringify(novos) === JSON.stringify(agentes)) return
      definirAgentes(novos)
      emitir({ tipo: 'estado', dados: montarEstado(memorizarAgentes()) })
      agendar()
    } catch (erro) {
      console.error('[escritorio] não foi possível recarregar os agentes:', erro)
    }
  }

  return {
    async iniciar() {
      if (iniciado || encerrado) return
      iniciado = true
      const momento = agora()
      const { interrompidas, expiradas } = banco.tx(() => ({
        interrompidas: banco.interromperOrdensRodando(MENSAGEM_REINICIADO, momento),
        expiradas: banco.fecharPendenciasAbertas('expirada'),
      }))
      for (const pendencia of expiradas) emitirPendencia(pendencia)
      for (const ordem of interrompidas) {
        registrarEvento(ordem.id, 'sistema', MENSAGEM_REINICIADO)
        emitirOrdem(ordem)
      }
      vigiarAgentes()
      varrerAgentesDeProjeto()
      vida?.reconciliar()
      memorizarAgentes()
      agendar()
      emitir({ tipo: 'estado', dados: montarEstado(memorizarAgentes()) })
    },

    async encerrar() {
      if (encerrado) return
      encerrado = true
      pararVigia()
      await vida?.encerrar()
      // Última tentativa de gravar o fim que esperava o banco; o que ainda assim não gravar fica interrompida.
      for (const controle of [...execucoes.values()]) gravarFim(controle)
      const controles = [...execucoes.values()]
      execucoes.clear()
      for (const controle of controles) controle.encerrada = true
      try {
        const momento = agora()
        const { interrompidas, expiradas } = banco.tx(() => ({
          expiradas: banco.fecharPendenciasAbertas('expirada'),
          interrompidas: controles
            .map((controle) => banco.atualizarOrdem(
              controle.ordemId,
              { status: 'interrompida', erro: MENSAGEM_DESLIGADO, atividade: null, finalizadaEm: momento },
              RODANDO,
            ))
            .filter((ordem): ordem is Ordem => ordem !== null),
        }))
        for (const id of [...esperas.keys()]) soltarEspera(id)
        for (const controle of controles) {
          try {
            controle.execucao?.encerrar()
          } catch (erro) {
            console.error('[escritorio] a execução falhou ao encerrar:', erro)
          }
        }
        for (const pendencia of expiradas) emitirPendencia(pendencia)
        for (const ordem of interrompidas) {
          registrarEvento(ordem.id, 'sistema', MENSAGEM_DESLIGADO)
          emitirOrdem(ordem)
        }
      } finally {
        for (const controle of controles) controle.avisarFim()
        banco.fechar()
      }
    },

    estado() {
      verificarAberto()
      return montarEstado(agentes.map(derivar))
    },

    detalheAgente(id) {
      verificarAberto()
      const agente = typeof id === 'string' ? agenteAtivo(id) : undefined
      if (!agente) return null
      const derivado = derivar(agente)
      const ordemAtual = banco.listarOrdens({ agenteId: agente.id, status: RODANDO, limite: 1 })[0] ?? null
      const foco = ordemAtual ?? (derivado.ultimaOrdem ? banco.obterOrdem(derivado.ultimaOrdem.id) : null)
      const porStatus = banco.contarOrdensPorStatus(agente.id)
      const detalhe: DetalheAgente = {
        agente: derivado,
        ordemAtual,
        fila: banco.listarOrdens({ agenteId: agente.id, status: ['na_fila'] }),
        historico: listarHistorico(agente.id, undefined, HISTORICO_DO_AGENTE),
        perguntaFinal: perguntaFinalDe(agente.id),
        totais: {
          historico: FINAIS.reduce((soma, status) => soma + (porStatus[status] ?? 0), 0),
          concluidas: porStatus.concluida ?? 0,
        },
        pendencias: banco.listarPendencias({ agenteId: agente.id, status: 'aberta' }),
        eventosAtuais: foco ? banco.listarEventos(foco.id, EVENTOS_DO_AGENTE) : [],
      }
      return detalhe
    },

    historicoDoAgente(id, antesDe, limite) {
      verificarAberto()
      const agente = typeof id === 'string' ? agenteAtivo(id) : undefined
      if (!agente) throw new ErroEscritorio(404, `Agente não encontrado: ${String(id)}`)
      let cursor: string | undefined
      if (typeof antesDe === 'string' && antesDe.trim()) {
        const referencia = banco.obterOrdem(antesDe.trim())
        if (!referencia || referencia.agenteId !== agente.id || !FINAIS.includes(referencia.status)) {
          throw new ErroEscritorio(400, 'Essa ordem não está no histórico do agente.')
        }
        cursor = referencia.id
      }
      return listarHistorico(agente.id, cursor, limiteDoHistorico(limite))
    },

    detalheOrdem(id) {
      verificarAberto()
      const ordem = typeof id === 'string' ? banco.obterOrdem(id) : null
      if (!ordem) return null
      const agente = agenteAtivo(ordem.agenteId) ?? conhecidos.get(ordem.agenteId) ?? agenteDesconhecido(ordem.agenteId)
      const detalhe: DetalheOrdem = {
        ordem,
        agente: { ...agente, ferramentas: agente.ferramentas ? [...agente.ferramentas] : null },
        eventos: banco.listarEventos(ordem.id, EVENTOS_DA_ORDEM),
        pendencias: banco.listarPendencias({ ordemId: ordem.id }),
        cadeia: banco.cadeiaDaOrdem(ordem.id).map(resumir),
      }
      return detalhe
    },

    criarOrdem(nova: NovaOrdem) {
      verificarAberto()
      if (!nova || typeof nova !== 'object') throw new ErroEscritorio(400, 'Pedido de ordem inválido.')
      const agente = acharAgente(nova.agenteId)
      const instrucao = validarInstrucao(nova.instrucao)
      let anterior: Ordem | null = null
      if (nova.continuaDe !== undefined && nova.continuaDe !== null && nova.continuaDe !== '') {
        anterior = obterOrdem(nova.continuaDe)
        if (anterior.agenteId !== agente.id) {
          throw new ErroEscritorio(400, 'Só dá para continuar uma ordem do mesmo agente.')
        }
      }
      const modo = validarModo(nova.modo)
      const projeto = resolverProjeto(config.dirProjetos, anterior ? anterior.projeto : nova.projeto)
      return registrarOrdem({ agente, projeto, instrucao, modo, anterior })
    },

    async pararOrdem(id) {
      verificarAberto()
      const ordem = obterOrdem(id)
      if (!RODANDO.includes(ordem.status)) throw new ErroEscritorio(409, 'Essa ordem não está rodando.')
      const controle = execucoes.get(ordem.id)
      if (!controle) return pararOrfa(ordem)
      if (controle.fimPendente) {
        // A execução já terminou e o fim só espera o banco: grava agora em vez de parar.
        gravarFim(controle)
        return banco.obterOrdem(ordem.id) ?? ordem
      }
      controle.parada ??= executarParada(controle)
      await controle.parada
      if (encerrado) return ordem
      return banco.obterOrdem(ordem.id) ?? ordem
    },

    cancelarOrdem(id) {
      verificarAberto()
      const ordem = obterOrdem(id)
      if (ordem.status !== 'na_fila') throw new ErroEscritorio(409, 'Só dá para cancelar uma ordem que ainda está na fila.')
      const cancelada = banco.atualizarOrdem(ordem.id, { status: 'cancelada', finalizadaEm: agora() }, ['na_fila'])
      if (!cancelada) throw new ErroEscritorio(409, 'Só dá para cancelar uma ordem que ainda está na fila.')
      emitirOrdem(cancelada)
      atualizarAgente(cancelada.agenteId)
      agendar()
      return cancelada
    },

    retomarOrdem(id, instrucao) {
      verificarAberto()
      const anterior = obterOrdem(id)
      if (!RETOMAVEIS.includes(anterior.status)) {
        throw new ErroEscritorio(409, 'Só dá para retomar uma ordem interrompida, parada ou com erro.')
      }
      if (banco.listarOrdens({ continuaDe: anterior.id, status: ATIVAS, limite: 1 }).length > 0) {
        throw new ErroEscritorio(409, 'Essa ordem já foi retomada.')
      }
      const agente = acharAgente(anterior.agenteId)
      // Se a ordem nem chegou à sessão, a instrução dela nunca foi lida pelo agente: manda de novo.
      const texto = typeof instrucao === 'string' && instrucao.trim()
        ? validarInstrucao(instrucao)
        : chegouASessao(anterior) ? 'Continue de onde parou.' : anterior.instrucao
      const projeto = resolverProjeto(config.dirProjetos, anterior.projeto)
      if (!anterior.vistaEm) {
        const vista = banco.atualizarOrdem(anterior.id, { vistaEm: agora() })
        if (vista) emitirOrdem(vista)
      }
      return registrarOrdem({ agente, projeto, instrucao: texto, modo: anterior.modo, anterior })
    },

    marcarVista(id) {
      verificarAberto()
      const ordem = obterOrdem(id)
      if (ordem.vistaEm || !FINAIS.includes(ordem.status)) return
      const vista = banco.atualizarOrdem(ordem.id, { vistaEm: agora() })
      if (!vista) return
      emitirOrdem(vista)
      atualizarAgente(vista.agenteId)
    },

    dispensarResposta(id) {
      verificarAberto()
      const ordem = obterOrdem(id)
      if (!ordem.aguardaResposta) return
      const dispensada = banco.atualizarOrdem(ordem.id, { aguardaResposta: false, vistaEm: ordem.vistaEm ?? agora() })
      if (!dispensada) return
      emitirOrdem(dispensada)
      atualizarAgente(dispensada.agenteId)
    },

    responderPendencia(id, resposta) {
      verificarAberto()
      const pendencia = typeof id === 'string' && id ? banco.obterPendencia(id) : null
      if (!pendencia) throw new ErroEscritorio(404, 'Pendência não encontrada.')
      if (pendencia.status !== 'aberta') throw new ErroEscritorio(409, MENSAGEM_PENDENCIA_FECHADA[pendencia.status])
      if (!esperas.has(pendencia.id)) {
        const expirada = banco.atualizarPendencia(pendencia.id, { status: 'expirada' }, ['aberta'])
        if (expirada) {
          emitirPendencia(expirada)
          atualizarAgente(expirada.agenteId)
        }
        throw new ErroEscritorio(409, MENSAGEM_EXPIROU)
      }
      const normalizada = validarResposta(pendencia, resposta)
      const modoAprovado = MODO_DO_PLANO_APROVADO[normalizada.decisao]
      const { respondida, ordem } = banco.tx(() => {
        const respondida = banco.atualizarPendencia(
          pendencia.id,
          { status: 'respondida', resposta: normalizada, respondidaEm: agora() },
          ['aberta'],
        )
        // Guarda o modo do plano aprovado na ordem: continuações e retomadas herdam esse modo, não o 'plan'.
        const ordem = respondida && modoAprovado ? banco.atualizarOrdem(respondida.ordemId, { modo: modoAprovado }) : null
        return { respondida, ordem }
      })
      if (!respondida) throw new ErroEscritorio(409, MENSAGEM_PENDENCIA_FECHADA.respondida)
      registrarEvento(respondida.ordemId, 'resposta', resumirResposta(normalizada), {
        pendenciaId: respondida.id,
        ...normalizada,
      })
      emitirPendencia(respondida)
      if (ordem) emitirOrdem(ordem)
      soltarEspera(respondida.id, normalizada)
      voltarATrabalhar(respondida.ordemId, respondida.agenteId)
      return respondida
    },

    pendenciasAbertas() {
      verificarAberto()
      return banco.listarPendencias({ status: 'aberta' })
    },

    ligarVida(ligada) {
      verificarAberto()
      if (!vida) throw new ErroEscritorio(409, 'O modo Vida não está disponível neste escritório.')
      return vida.ligar(ligada === true)
    },

    estadoDaVida() {
      return vida?.estado() ?? estadoDaVidaDesligada(config)
    },

    mundoDaVida() {
      if (!vida) throw new ErroEscritorio(409, 'O modo Vida não está disponível neste escritório.')
      return vida.mundo()
    },

    forcarVontade(pedido) {
      verificarAberto()
      if (!vida) throw new ErroEscritorio(409, 'O modo Vida não está disponível neste escritório.')
      if (!vida.estado().ligada) throw new ErroEscritorio(409, 'Ligue a vida dos agentes antes de mandar uma vontade.')
      acharAgente(pedido?.agenteId)
      try {
        return vida.forcar(pedido)
      } catch (erro) {
        throw new ErroEscritorio(400, mensagemDe(erro))
      }
    },

    vontadesDoAgente(agenteId, limite) {
      acharAgente(agenteId)
      return vida?.vontadesDoAgente(agenteId, limite) ?? []
    },

    eventosDaVida(desde, limite) {
      return vida?.eventos(desde ?? null, limite) ?? []
    },

    falasDaVida(limite) {
      return vida?.falasRecentes(limite) ?? []
    },

    pausarVidaDoAgente(agenteId, minutos) {
      verificarAberto()
      acharAgente(agenteId)
      return vida?.pausarAgente(agenteId, minutos) ?? null
    },

    reuniaoAberta() {
      verificarAberto()
      return montarReuniao()
    },

    // Abrir duas vezes é a mesma reunião: o clique na mesa não precisa saber se já havia uma.
    abrirReuniao() {
      verificarAberto()
      const jaAberta = montarReuniao()
      if (jaAberta) return jaAberta
      reuniaoId = banco.abrirReuniao(randomUUID(), agora()).id
      return reuniaoDepoisDeMudar()
    },

    convocarParaReuniao(agenteId) {
      const id = reuniaoEmAndamento()
      const agente = acharAgente(agenteId)
      if (ocupadoComOHumano(agente.id)) {
        throw new ErroEscritorio(409, `${agente.apelido} está com uma ordem sua: espere ele terminar para chamá-lo.`)
      }
      sentarNaReuniao(id, agente)
      return reuniaoDepoisDeMudar()
    },

    // Chama de uma vez todos os que estão livres, na ordem da lista, até a mesa encher.
    convocarLivresParaReuniao() {
      const id = reuniaoEmAndamento()
      const livres = agentes.filter((agente) => !ocupadoComOHumano(agente.id))
      for (const agente of livres) {
        if (banco.convocados(id).length >= CADEIRAS_DA_REUNIAO.length) break
        sentarNaReuniao(id, agente)
      }
      return reuniaoDepoisDeMudar()
    },

    dispensarDaReuniao(agenteId) {
      const id = reuniaoEmAndamento()
      levantarDaReuniao(id, acharAgente(agenteId).id)
      return reuniaoDepoisDeMudar()
    },

    darRecadoNaReuniao(texto) {
      const id = reuniaoEmAndamento()
      const limpo = typeof texto === 'string' ? texto.trim() : ''
      if (!limpo) throw new ErroEscritorio(400, 'Escreva o recado da reunião.')
      if (limpo.length > LIMITE_RECADO) {
        throw new ErroEscritorio(400, `O recado passou de ${LIMITE_RECADO.toLocaleString('pt-BR')} caracteres.`)
      }
      if (banco.convocados(id).length === 0) {
        throw new ErroEscritorio(409, 'Chame alguém para a mesa antes de deixar o recado.')
      }
      banco.inserirRecado(id, limpo, agora())
      return reuniaoDepoisDeMudar()
    },

    encerrarReuniao() {
      verificarAberto()
      if (!reuniaoId) return
      const id = reuniaoId
      const saindo = banco.convocados(id).map((c) => c.agenteId)
      banco.encerrarReuniao(id, agora())
      reuniaoId = null
      for (const agenteId of saindo) {
        vida?.ordemAcabou(agenteId)
        atualizarAgente(agenteId)
      }
      emitirReuniao()
    },

    atualizarConta(info) {
      if (encerrado || !info || typeof info !== 'object') return
      const nova = { ...conta }
      if (info.email !== undefined) nova.email = textoOuNulo(info.email)
      if (info.plano !== undefined) nova.plano = textoOuNulo(info.plano)
      if (info.autenticada !== undefined) nova.autenticada = typeof info.autenticada === 'boolean' ? info.autenticada : null
      if (info.erro !== undefined) nova.erro = textoOuNulo(info.erro)
      conta = nova
      emitir({ tipo: 'conta', dados: structuredClone(conta) })
    },

    assinar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },
  }
}

// Diz se o texto termina com uma pergunta ao humano: a última linha não vazia, sem ênfase markdown, acaba em "?".
export function terminaComPergunta(texto: string): boolean {
  if (typeof texto !== 'string') return false
  const linhas = texto.split(/\r?\n/).filter((linha) => linha.trim())
  const ultima = linhas[linhas.length - 1]
  if (!ultima) return false
  return /[?？]$/.test(ultima.replace(/[*_`~]/g, '').trim())
}

// Estado do agente pela prioridade: pedido aberto da ordem que roda, ordem rodando, pergunta no fim de uma ordem (só
// com o agente parado; com outra ordem rodando ele aparece trabalhando e o painel mostra a pergunta mesmo assim),
// fila e o fim da última ordem ainda não visto.
function calcularEstado(
  atual: Ordem | null,
  fila: Ordem[],
  ultima: Ordem | null,
  perguntaFinal: Ordem | null,
  abertas: Pendencia[],
): [EstadoAgente, string | null] {
  const primeira = abertas[0]
  if (atual && primeira) return ['aguardando', primeira.criadaEm]
  if (atual) return ['trabalhando', atual.iniciadaEm]
  if (perguntaFinal) return ['aguardando', perguntaFinal.finalizadaEm]
  const proxima = fila[0]
  if (proxima) return ['na_fila', proxima.criadaEm]
  if (ultima && !ultima.vistaEm) {
    if (ultima.status === 'erro') return ['erro', ultima.finalizadaEm]
    if (ultima.status === 'interrompida') return ['interrompida', ultima.finalizadaEm]
    if (ultima.status === 'concluida') return ['concluiu', ultima.finalizadaEm]
  }
  return ['livre', ultima?.finalizadaEm ?? null]
}

function resumir(ordem: Ordem): ResumoOrdem {
  const todos = ordem.todos ?? []
  return {
    id: ordem.id,
    agenteId: ordem.agenteId,
    projeto: ordem.projeto,
    projetoNome: basename(ordem.projeto),
    instrucao: cortar(ordem.instrucao, LIMITE_INSTRUCAO_RESUMO),
    modo: ordem.modo,
    status: ordem.status,
    atividade: ordem.atividade,
    aguardaResposta: ordem.aguardaResposta,
    continuaDe: ordem.continuaDe,
    todosFeitos: todos.filter((todo) => todo.status === 'feito').length,
    todosTotal: todos.length,
    criadaEm: ordem.criadaEm,
    iniciadaEm: ordem.iniciadaEm,
    finalizadaEm: ordem.finalizadaEm,
    vistaEm: ordem.vistaEm,
  }
}

function montarEvento(
  ordemId: string,
  tipo: TipoEvento,
  texto: unknown,
  detalhe: unknown,
  criadoEm: string,
): Omit<Evento, 'id'> {
  return {
    ordemId,
    tipo: TIPOS_DE_EVENTO.includes(tipo) ? tipo : 'sistema',
    texto: cortar(typeof texto === 'string' ? texto : String(texto ?? ''), LIMITE_TEXTO_EVENTO),
    detalhe: limitarJson(detalhe, LIMITE_DETALHE_BYTES),
    criadoEm,
  }
}

// O que gravar no fim da ordem: os campos dela e o evento final do feed.
function montarFim(fim: FimExecucao, iniciadaEm: string | null, ultimoTexto: string | null): FimPendente {
  const momento = agora()
  const status = STATUS_DE_FIM.find((valor) => valor === fim?.status) ?? 'erro'
  const resultado = typeof fim?.resultado === 'string' && fim.resultado.trim()
    ? cortarBytes(fim.resultado.trim(), LIMITE_RESULTADO_BYTES)
    : null
  const mensagemDeErro = typeof fim?.erro === 'string' && fim.erro.trim() ? cortar(fim.erro.trim(), LIMITE_ERRO) : null
  const textoDoErro = mensagemDeErro ?? 'A ordem terminou com erro.'
  const inicio = iniciadaEm ? Date.parse(iniciadaEm) : Number.NaN
  const duracaoMs = numeroOuNulo(fim?.duracaoMs) ?? (Number.isNaN(inicio) ? null : Math.max(0, Date.now() - inicio))
  let evento: FimPendente['evento'] = { tipo: 'sistema', texto: MENSAGEM_PARADA }
  if (status === 'concluida') {
    const repetido = resultado === null || repeteAUltimaFala(resultado, ultimoTexto)
    evento = { tipo: 'resultado', texto: repetido ? MENSAGEM_CONCLUIDA : resultado }
  } else if (status === 'erro') {
    evento = { tipo: 'erro', texto: textoDoErro }
  }
  return {
    campos: {
      status,
      resultado,
      erro: status === 'erro' ? textoDoErro : mensagemDeErro,
      atividade: null,
      aguardaResposta: status === 'concluida' && resultado !== null && terminaComPergunta(resultado),
      custoUsd: numeroOuNulo(fim?.custoUsd),
      turnos: numeroOuNulo(fim?.turnos),
      duracaoMs,
      tokensEntrada: numeroOuNulo(fim?.tokensEntrada),
      tokensSaida: numeroOuNulo(fim?.tokensSaida),
      finalizadaEm: momento,
      vistaEm: status === 'parada' ? momento : null,
    },
    evento,
    momento,
  }
}

// Diz se o resultado é a última fala do agente, que o feed já mostra como evento 'texto' (cortado em 8000 caracteres).
function repeteAUltimaFala(resultado: string, ultimoTexto: string | null): boolean {
  const fala = ultimoTexto?.trim()
  if (!fala) return false
  if (resultado === fala) return true
  return fala.endsWith('…') && resultado.length > LIMITE_TEXTO_EVENTO && resultado.startsWith(fala.slice(0, -1).trimEnd())
}

// A execução da própria ordem chegou à sessão do Claude Code (aoIniciarSessao grava o modelo). O sessaoId não basta:
// a continuação já nasce com o da ordem anterior, antes de o agente ler a instrução dela.
function chegouASessao(ordem: Ordem): boolean {
  return ordem.sessaoId !== null && ordem.modelo !== null
}

function limiteDoHistorico(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return HISTORICO_DO_AGENTE
  return Math.min(HISTORICO_MAXIMO, Math.max(1, Math.floor(valor)))
}

function agenteDesconhecido(id: string): Agente {
  return {
    id,
    nome: id,
    apelido: id,
    descricao: 'Este agente não está mais na pasta de agentes.',
    modelo: null,
    cor: '#71717a',
    ferramentas: null,
    memoria: null,
    arquivo: null,
    generalista: false,
    origem: null,
  }
}

function validarInstrucao(valor: unknown): string {
  const texto = typeof valor === 'string' ? valor.trim() : ''
  if (!texto) throw new ErroEscritorio(400, 'Escreva a instrução da ordem.')
  if (texto.length > LIMITE_INSTRUCAO) {
    throw new ErroEscritorio(400, `A instrução passou do limite de ${LIMITE_INSTRUCAO.toLocaleString('pt-BR')} caracteres.`)
  }
  return texto
}

function validarModo(valor: unknown): ModoPermissao {
  if (valor === undefined || valor === null || valor === '') return 'default'
  const modo = MODOS_PERMISSAO.find((item) => item === valor)
  if (!modo) throw new ErroEscritorio(400, `Modo de permissão inválido: ${String(valor)}`)
  return modo
}

function validarResposta(pendencia: Pendencia, resposta: RespostaPendencia): RespostaPendencia {
  if (!resposta || typeof resposta !== 'object') throw new ErroEscritorio(400, 'Envie a resposta com uma decisão.')
  const decisao = DECISOES_POR_TIPO[pendencia.tipo].find((item) => item === resposta.decisao)
  if (!decisao) throw new ErroEscritorio(400, `Decisão inválida para esse pedido: ${String(resposta.decisao)}`)
  if (decisao === 'permitir_sempre' && !pendencia.permiteSempre) {
    throw new ErroEscritorio(400, 'Essa permissão não pode valer para a sessão toda.')
  }
  const normalizada: RespostaPendencia = { decisao }
  if (decisao === 'responder') {
    const respostas = normalizarRespostas(resposta.respostas)
    if (!respostas) throw new ErroEscritorio(400, 'Responda pelo menos uma pergunta.')
    normalizada.respostas = respostas
  }
  const mensagem = typeof resposta.mensagem === 'string' ? resposta.mensagem.trim() : ''
  if (mensagem) normalizada.mensagem = cortar(mensagem, LIMITE_RESPOSTA)
  return normalizada
}

function normalizarRespostas(valor: unknown): Record<string, string> | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
  const pares = Object.entries(valor).flatMap(([pergunta, resposta]): [string, string][] => {
    if (!pergunta || typeof resposta !== 'string' || !resposta.trim()) return []
    return [[pergunta, cortar(resposta.trim(), LIMITE_RESPOSTA)]]
  })
  return pares.length > 0 ? Object.fromEntries(pares) : null
}

function resumirResposta(resposta: RespostaPendencia): string {
  const motivo = resposta.mensagem ? `: ${resposta.mensagem}` : '.'
  switch (resposta.decisao) {
    case 'permitir':
      return 'Você permitiu.'
    case 'permitir_sempre':
      return 'Você permitiu sempre nesta sessão.'
    case 'negar':
      return `Você negou${motivo}`
    case 'responder':
      return `Você respondeu: ${Object.values(resposta.respostas ?? {}).map((texto) => cortar(texto, 200)).join('; ')}`
    case 'recusar':
      return `Você preferiu não responder${motivo}`
    case 'aprovar':
      return 'Você aprovou o plano.'
    case 'aprovar_editando':
      return 'Você aprovou o plano e liberou tudo (edições e comandos).'
    case 'ajustar':
      return `Você pediu ajustes no plano${motivo}`
  }
}

function normalizarTodos(todos: unknown): Todo[] | null {
  if (!Array.isArray(todos)) return null
  return todos.slice(0, 100).flatMap((item: unknown): Todo[] => {
    if (!item || typeof item !== 'object') return []
    const { conteudo, status, ativo } = item as Record<string, unknown>
    if (typeof conteudo !== 'string' || !conteudo.trim()) return []
    const todo: Todo = {
      conteudo: cortar(conteudo.trim(), 500),
      status: STATUS_DE_TODO.find((valor) => valor === status) ?? 'pendente',
    }
    if (typeof ativo === 'string' && ativo.trim()) todo.ativo = cortar(ativo.trim(), 500)
    return [todo]
  })
}

function fimSemDados(status: FimExecucao['status'], erro: string | null): FimExecucao {
  return {
    status,
    resultado: null,
    erro,
    custoUsd: null,
    turnos: null,
    duracaoMs: null,
    tokensEntrada: null,
    tokensSaida: null,
  }
}

function protegido<A extends unknown[]>(nome: string, fn: (...args: A) => void): (...args: A) => void {
  return (...args: A) => {
    try {
      fn(...args)
    } catch (erro) {
      console.error(`[escritorio] falha em ${nome}:`, erro)
    }
  }
}

function limitarEntrada(entrada: unknown): Record<string, unknown> {
  const limitada = limitarJson(entrada, LIMITE_ENTRADA_BYTES)
  return limitada && typeof limitada === 'object' && !Array.isArray(limitada) ? (limitada as Record<string, unknown>) : {}
}

function limitarJson(valor: unknown, limiteBytes: number): unknown {
  if (valor === undefined || valor === null) return null
  let atual = paraJsonSeguro(valor)
  if (atual === null || bytesDoJson(atual) <= limiteBytes) return atual
  for (const [maxTexto, maxItens] of PASSOS_DE_CORTE) {
    atual = encurtar(atual, maxTexto, maxItens, 0)
    if (bytesDoJson(atual) <= limiteBytes) return atual
  }
  return { truncado: true }
}

function paraJsonSeguro(valor: unknown): unknown {
  try {
    const texto = JSON.stringify(valor, (_chave, item: unknown) => {
      if (typeof item === 'bigint') return item.toString()
      if (item instanceof Error) return { nome: item.name, mensagem: item.message }
      return item
    })
    return texto === undefined ? null : JSON.parse(texto)
  } catch {
    return cortar(String(valor), 2000)
  }
}

function encurtar(valor: unknown, maxTexto: number, maxItens: number, profundidade: number): unknown {
  if (typeof valor === 'string') return cortar(valor, maxTexto)
  if (!valor || typeof valor !== 'object') return valor
  if (profundidade >= 8) return '…'
  if (Array.isArray(valor)) {
    const itens = valor.slice(0, maxItens).map((item) => encurtar(item, maxTexto, maxItens, profundidade + 1))
    if (valor.length > maxItens) itens.push(`… mais ${valor.length - maxItens} itens`)
    return itens
  }
  const entradas = Object.entries(valor)
  const pares = entradas
    .slice(0, maxItens)
    .map(([chave, item]) => [chave, encurtar(item, maxTexto, maxItens, profundidade + 1)] as const)
  if (entradas.length > maxItens) return Object.fromEntries([...pares, ['…', `mais ${entradas.length - maxItens} campos`]])
  return Object.fromEntries(pares)
}

function bytesDoJson(valor: unknown): number {
  return Buffer.byteLength(JSON.stringify(valor) ?? '')
}

function cortar(texto: string, maximo: number): string {
  if (texto.length <= maximo) return texto
  let corte = texto.slice(0, Math.max(0, maximo - 1))
  if (/[\uD800-\uDBFF]$/.test(corte)) corte = corte.slice(0, -1)
  return `${corte}…`
}

function cortarBytes(texto: string, limite: number): string {
  if (Buffer.byteLength(texto) <= limite) return texto
  const aviso = `\n\n[Resultado cortado: passou de ${Math.round(limite / 1024)} KB.]`
  const espaco = limite - Buffer.byteLength(aviso)
  let fim = Math.min(texto.length, espaco)
  let corte = texto.slice(0, fim)
  while (fim > 0 && Buffer.byteLength(corte) > espaco) {
    fim -= Math.max(1, Math.ceil((Buffer.byteLength(corte) - espaco) / 3))
    corte = texto.slice(0, fim)
  }
  if (/[\uD800-\uDBFF]$/.test(corte)) corte = corte.slice(0, -1)
  return `${corte}${aviso}`
}

function numeroOuNulo(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const texto = valor.trim()
  return texto ? texto : null
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

function agora(): string {
  return new Date().toISOString()
}
