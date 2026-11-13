import { randomUUID } from 'node:crypto'
import { estimarCaminhadaMs, montarMundo, objetoDaVaga, vagaDoMundo, vagasLivres, validarDecisao, verboDoMundo } from './mundo.ts'
import type { Banco, VidaDoAgenteLinha } from './banco.ts'
import type {
  Agente,
  Config,
  FalaPlanejada,
  ControleDaVida,
  Decisao,
  Deliberador,
  EstadoDaVida,
  EstadoVida,
  EventoTempoReal,
  EventoVida,
  Execucao,
  FabricaExecucaoDaVida,
  Fala,
  MotivoPausa,
  Mundo,
  Personalidade,
  SituacaoDoAgente,
  SituacaoDoEscritorio,
  UsoConta,
  VidaDoAgente,
  Vontade,
  VontadeForcada,
} from './tipos.ts'

// A vida dos agentes: com o modo ligado, quem não tem ordem do humano ganha vontade própria. Esta é a máquina de
// estados — ela é dona do LUGAR e do TEMPO de cada boneco, e o navegador só desenha o que ela diz.
//
// Um relógio só (um tique de 1 s) e prazos absolutos gravados no banco: assim um restart, o notebook dormindo três
// horas e dois navegadores abertos são o mesmo caminho de código. A máquina nunca cita um móvel nem um verbo pelo
// nome: ela lê as regras do catálogo (alvo, duração, reservaAlvo, precisaAgente), e é por isso que cômodo, objeto ou
// verbo novo entra no catálogo e funciona sozinho.

const INTERVALO_TIQUE_MS = 1000
const SAIDA_MS = 1200
const INTERVALO_DECISAO_POR_AGENTE_MS = 90_000
const MAX_DECISOES_HORA = 200
const MAX_OFICINANDO = 1
const ESPERA_DECISAO_MS = 20_000
// Acima disto, o servidor ficou parado (notebook dormindo): ninguém "corre" para recuperar o tempo.
const ATRASO_MAXIMO_MS = 600_000
const BACKOFF_MS = [60_000, 120_000, 240_000, 480_000]
const BACKOFF_SEM_VAGA_MS = 20_000
const JITTER = 0.3
const DESCANSO_DEPOIS_DO_HUMANO_MS = 300_000
const VIOLACOES_PARA_ENCERRAR = 3
const LIMITE_DE_EVENTOS = 200

// A partir de quanto da conta gasta a vida entra em economia e em suspensa, e abaixo de quanto ela volta ao normal.
const BANDA_ECONOMIA = 0.8
const BANDA_SUSPENSA = 0.92
const BANDA_VOLTA = 0.7

export type OpcoesVida = {
  config: Config
  banco: Banco
  deliberador: Deliberador
  // Quem está no escritório agora (o escritório é quem sabe).
  agentes(): Agente[]
  // A personalidade de um agente, para o prompt e para o tom das falas.
  personalidadeDe(agente: Agente): Personalidade
  // As regras do mundo (o VIDA.md), relidas a quente: por isso é uma função, não um texto.
  regras?: () => string
  // true quando o humano mandou alguma coisa para esse agente (ordem na fila, rodando ou esperando resposta).
  ocupadoComOHumano(agenteId: string): boolean
  // true quando o agente está sentado na reunião: lá ele não decide nada, igual a quem tem ordem do humano.
  naReuniao?(agenteId: string): boolean
  // true quando existe qualquer ordem do humano rodando no escritório: a vida não disputa a máquina com o trabalho.
  algumaOrdemDoHumano(): boolean
  emitir(evento: EventoTempoReal): void
  // Avisa o escritório de que a vida daquele agente mudou, para ele reemitir o agente com o lugar novo.
  aoMudarAgente(agenteId: string): void
  criarExecucaoDaVida?: FabricaExecucaoDaVida
  // Injetáveis para o teste: o relógio e o sorteio.
  agora?: () => number
  sorteio?: () => number
}

type Linha = VidaDoAgenteLinha

// Cria a vida dos agentes. Retorna o ControleDaVida, mais bater() e mundo() para os testes.
export function criarVida(opcoes: OpcoesVida): ControleDaVida & { bater(): void } {
  const { config, banco, deliberador, emitir, aoMudarAgente } = opcoes
  const agora = opcoes.agora ?? (() => Date.now())
  const sorteio = opcoes.sorteio ?? Math.random
  const execucoes = new Map<string, Execucao>()
  let tique: NodeJS.Timeout | null = null
  let rodadaEmVoo: AbortController | null = null
  let proximaRodadaEm = 0
  let decisoesNaHora: number[] = []
  let custoUsdDoDia = 0
  let diaDoCusto = ''
  let banda: EstadoDaVida['banda'] = 'normal'
  let motivoPausa: MotivoPausa | null = null
  let explicacao: string | null = null
  let ligadaEm: string | null = null
  let mundoCache: { qtd: number; mundo: Mundo } | null = null
  // Depois de encerrada, nada mais toca no banco: uma rodada que volta tarde não escreve num banco já fechado.
  let encerrada = false

  const instante = (ms = agora()) => new Date(ms).toISOString()
  const emMs = (iso: string | null) => (iso ? Date.parse(iso) : NaN)
  const venceu = (iso: string | null) => Boolean(iso) && emMs(iso) <= agora()
  const comJitter = (ms: number) => Math.round(ms * (1 - JITTER + sorteio() * JITTER * 2))
  const entre = ([min, max]: readonly [number, number]) => Math.round(min + sorteio() * (max - min))

  // O catálogo do escritório de agora (ele cresce com a quantidade de agentes). Retorna o Mundo.
  function mundo(): Mundo {
    const qtd = opcoes.agentes().length
    if (!mundoCache || mundoCache.qtd !== qtd) mundoCache = { qtd, mundo: montarMundo(qtd) }
    return mundoCache.mundo
  }

  function ligada(): boolean {
    return banco.lerVidaConfig().ligada
  }

  function anotar(agenteId: string, tipo: EventoVida['tipo'], texto: string): void {
    banco.inserirVidaEvento({ agenteId, tipo, texto, criadoEm: instante() })
  }

  // O que a tela escreve sobre o agente. Indo, é para onde ele vai; parado, é o que ele está fazendo ali.
  // O texto sai do catálogo (a ação do objeto), então um objeto novo já aparece escrito direito.
  function rotuloDo(linha: Pick<Linha, 'estado' | 'verbo' | 'objetoId' | 'comId'>): string | null {
    const verbo = linha.verbo ? verboDoMundo(mundo(), linha.verbo) : null
    if (!verbo) return null
    const objeto = linha.objetoId ? mundo().objetos.find((item) => item.id === linha.objetoId) : null
    if (linha.estado === 'indo') return objeto ? `indo para ${objeto.nome.toLowerCase()}` : 'indo para outro lugar'
    if (verbo.id === 'conversar') {
      const outro = linha.comId ? opcoes.agentes().find((agente) => agente.id === linha.comId) : null
      return outro ? `conversando com ${outro.apelido}` : 'conversando'
    }
    if (verbo.id === 'usar' || verbo.id === 'ir_para') return objeto?.acao ?? verbo.rotulo
    return verbo.rotulo
  }

  // O que a tela precisa saber sobre a vida de um agente. Retorna o VidaDoAgente, ou null quando ele está fora.
  function doAgente(agenteId: string): VidaDoAgente | null {
    const linha = banco.obterVidaAgente(agenteId) as Linha | null
    if (!linha || linha.estado === 'fora') return null
    return {
      agenteId: linha.agenteId,
      estado: linha.estado,
      verbo: linha.verbo,
      rotulo: rotuloDo(linha),
      objetoId: linha.objetoId,
      comodoId: linha.comodoId,
      vagaId: linha.vagaId,
      comId: linha.comId,
      motivo: linha.motivo,
      desde: linha.desde,
      ate: linha.ate ?? linha.chegaEm,
      pasta: linha.estado === 'oficinando' ? pastaDoAgente(linha.agenteId) : null,
    }
  }

  function pastaDoAgente(agenteId: string): string {
    return `${config.dirAgentesProjeto}/${agenteId}`
  }

  function oficinaDisponivel(): boolean {
    return Boolean(opcoes.criarExecucaoDaVida)
  }

  // O estado inteiro da vida, do jeito que a tela mostra. Retorna o EstadoDaVida.
  function estado(): EstadoDaVida {
    const linhas = banco.listarVidaAgentes() as Linha[]
    const vivos = linhas.filter((linha) => linha.estado !== 'fora')
    return {
      ligada: ligada(),
      disponivel: true,
      motivoPausa,
      explicacao,
      banda,
      oficinaDisponivel: oficinaDisponivel(),
      modelo: deliberador.nome === 'barato' ? 'sem modelo (determinístico)' : config.modeloVida,
      intervaloMs: config.intervaloVidaMs,
      ligadaEm,
      decisoesNaHora: decisoesNaHora.length,
      custoUsdDoDia: Number(custoUsdDoDia.toFixed(4)),
      tetoCustoUsdDoDia: config.tetoCustoUsdDoDia,
      vivos: vivos.length,
      pasta: config.dirAgentesProjeto,
      agentes: vivos.map((linha) => doAgente(linha.agenteId)).filter((item) => item !== null),
    }
  }

  function avisarTela(agenteId?: string): void {
    if (agenteId) aoMudarAgente(agenteId)
    emitir({ tipo: 'vida', dados: estado() })
  }

  // ─────────────────────────── transições ───────────────────────────

  function mudar(agenteId: string, campos: Partial<Linha>, seEstado?: readonly EstadoVida[]): Linha | null {
    return banco.atualizarVidaAgente(agenteId, { ...campos, atualizadoEm: instante() }, seEstado) as Linha | null
  }

  function paraOcioso(linha: Linha, atrasarMs = 0): void {
    banco.soltarVagas({ agenteId: linha.agenteId })
    mudar(linha.agenteId, {
      estado: 'ocioso',
      verbo: null,
      objetoId: null,
      comId: null,
      motivo: null,
      tarefa: null,
      vontadeId: null,
      chegaEm: null,
      ate: null,
      desde: instante(),
      decidirDepoisDe: instante(agora() + Math.max(atrasarMs, comJitter(INTERVALO_DECISAO_POR_AGENTE_MS))),
    })
    if (linha.vontadeId) banco.atualizarVontade(linha.vontadeId, { terminadaEm: instante() })
  }

  // Põe no escritório quem está livre e ainda não entrou na vida, e tira quem ganhou ordem do humano.
  function recrutar(): boolean {
    let mudou = false
    const existentes = new Map((banco.listarVidaAgentes() as Linha[]).map((linha) => [linha.agenteId, linha]))
    for (const agente of opcoes.agentes()) {
      const linha = existentes.get(agente.id)
      // A reunião é coisa do humano tanto quanto uma ordem: quem está na mesa dela sai da vida própria.
      const comHumano = opcoes.ocupadoComOHumano(agente.id) || opcoes.naReuniao?.(agente.id) === true
      if (comHumano) {
        if (linha && linha.estado !== 'fora' && linha.estado !== 'cedendo') {
          cederAoHumano(agente.id)
          mudou = true
        }
        continue
      }
      if (!linha) {
        banco.salvarVidaAgente({
          agenteId: agente.id,
          estado: 'ocioso',
          verbo: null,
          objetoId: null,
          comodoId: null,
          vagaId: null,
          comId: null,
          motivo: null,
          tarefa: null,
          vontadeId: null,
          desde: instante(),
          chegaEm: null,
          ate: null,
          decidirDepoisDe: instante(agora() + comJitter(5000)),
          falhas: 0,
          violacoes: 0,
          atualizadoEm: instante(),
        })
        mudou = true
      } else if (linha.estado === 'fora') {
        mudar(agente.id, { estado: 'ocioso', desde: instante(), decidirDepoisDe: instante(agora() + comJitter(5000)) })
        mudou = true
      }
    }
    return mudou
  }

  // Avança quem chegou ao fim de um prazo: chegou no lugar, acabou o tempo lá, terminou de sair.
  function vencerPrazos(): string[] {
    const mudaram: string[] = []
    for (const linha of banco.listarVidaAgentes() as Linha[]) {
      const parado = agora() - emMs(linha.atualizadoEm) > ATRASO_MAXIMO_MS
      if (parado && linha.estado !== 'fora' && linha.estado !== 'ocioso') {
        // O servidor ficou fora do ar (ou a máquina dormiu): ninguém corre atrás do tempo perdido.
        if (linha.estado === 'oficinando') encerrarOficina(linha.agenteId)
        paraOcioso(linha)
        mudaram.push(linha.agenteId)
        continue
      }
      if (linha.estado === 'indo' && venceu(linha.chegaEm)) {
        const verbo = verboDoMundo(mundo(), linha.verbo ?? '')
        const duracao = verbo ? entre(verbo.duracaoMs) : 60_000
        const conversa = Boolean(linha.comId)
        mudar(linha.agenteId, { estado: conversa ? 'conversando' : 'ocupado', chegaEm: null, ate: instante(agora() + duracao), desde: instante() }, ['indo'])
        if (verbo?.precisaAgente) comecarOficina(linha.agenteId)
        mudaram.push(linha.agenteId)
        continue
      }
      if ((linha.estado === 'ocupado' || linha.estado === 'conversando') && venceu(linha.ate)) {
        if (linha.estado === 'conversando' && linha.comId) {
          const outro = banco.obterVidaAgente(linha.comId) as Linha | null
          if (outro && outro.estado === 'conversando') {
            paraOcioso(outro)
            mudaram.push(outro.agenteId)
          }
        }
        paraOcioso(linha)
        mudaram.push(linha.agenteId)
        continue
      }
      if (linha.estado === 'oficinando' && venceu(linha.ate)) {
        encerrarOficina(linha.agenteId)
        paraOcioso(linha)
        mudaram.push(linha.agenteId)
        continue
      }
      if (linha.estado === 'cedendo' && venceu(linha.ate)) {
        mudar(linha.agenteId, { estado: 'fora', vagaId: null, chegaEm: null, ate: null, desde: instante() }, ['cedendo'])
        banco.soltarVagas({ agenteId: linha.agenteId })
        mudaram.push(linha.agenteId)
      }
    }
    return mudaram
  }

  // Manda para a tela as falas cuja hora chegou.
  function soltarFalas(): void {
    const prontas = banco.falasADizer(instante())
    if (!prontas.length) return
    for (const fala of prontas) emitir({ tipo: 'fala', dados: fala })
    banco.marcarFalasEmitidas(prontas.map((fala) => fala.id))
  }

  // ─────────────────────────── a rodada de vontades ───────────────────────────

  function verbosPermitidos(linha: Linha): string[] {
    const podeProgramar = banda === 'normal' && oficinaDisponivel() && !opcoes.algumaOrdemDoHumano() && contarOficinando() < MAX_OFICINANDO
    return mundo()
      .verbos.filter((verbo) => {
        if (verbo.precisaAgente && !podeProgramar) return false
        if (verbo.alvo === 'agente' && banda !== 'normal') return false
        return true
      })
      .map((verbo) => verbo.id)
  }

  function contarOficinando(): number {
    return (banco.listarVidaAgentes(['oficinando']) as Linha[]).length
  }

  function montarSituacao(lote: Linha[]): SituacaoDoEscritorio {
    const ocupadas = banco.vagasOcupadas()
    const porId = new Map(opcoes.agentes().map((agente) => [agente.id, agente]))
    const vivos = (banco.listarVidaAgentes() as Linha[]).filter((linha) => linha.estado !== 'fora')
    const presentes = vivos
      .filter((linha) => linha.vagaId)
      .map((linha) => {
        const vaga = vagaDoMundo(mundo(), linha.vagaId!)
        const apelido = porId.get(linha.agenteId)?.apelido ?? linha.agenteId
        return `${apelido} está em ${vaga?.nome ?? linha.vagaId} (${rotuloDo(linha) ?? 'parado'})`
      })
    const noLote: SituacaoDoAgente[] = lote.map((linha) => ({
      agenteId: linha.agenteId,
      apelido: porId.get(linha.agenteId)?.apelido ?? linha.agenteId,
      estado: linha.estado,
      vagaId: linha.vagaId,
      verbo: linha.verbo,
      desdeMs: Math.max(0, agora() - emMs(linha.desde)),
      verbosPermitidos: verbosPermitidos(linha),
      ultimas: banco
        .listarVontades({ agenteId: linha.agenteId, limite: 4 })
        .map((vontade: Vontade) => `${vontade.verbo}${vontade.objetoId ? ` ${vontade.objetoId}` : ''}`),
    }))
    return {
      instante: instante(),
      vagasLivres: vagasLivres(mundo(), new Set(ocupadas.keys())).map((vaga) => `${vaga.id} (${vaga.nome})`),
      presentes,
      // Só o fato de estar ocupado com o humano: o que o humano mandou nunca entra no contexto da vida.
      ocupadosComOHumano: opcoes
        .agentes()
        .filter((agente) => opcoes.ocupadoComOHumano(agente.id))
        .map((agente) => agente.apelido),
      lote: noLote,
    }
  }

  function escolherLote(): Linha[] {
    const limite = banda === 'economia' ? 1 : config.maxNoLote
    const prontos = (banco.listarVidaAgentes(['ocioso']) as Linha[]).filter((linha) => !linha.decidirDepoisDe || venceu(linha.decidirDepoisDe))
    // Embaralha de leve, para não ser sempre o primeiro da lista a querer as coisas.
    return prontos
      .map((linha) => ({ linha, chave: sorteio() }))
      .sort((a, b) => a.chave - b.chave)
      .slice(0, limite)
      .map((item) => item.linha)
  }

  async function rodada(): Promise<void> {
    if (rodadaEmVoo || agora() < proximaRodadaEm) return
    if (motivoPausa === 'teto_custo' || motivoPausa === 'teto_decisoes') return
    const lote = escolherLote()
    if (!lote.length) return
    proximaRodadaEm = agora() + comJitter(config.intervaloVidaMs)
    for (const linha of lote) mudar(linha.agenteId, { estado: 'escolhendo', desde: instante() }, ['ocioso'])
    const situacao = montarSituacao(lote)
    const controle = new AbortController()
    rodadaEmVoo = controle
    const prazo = setTimeout(() => controle.abort(), ESPERA_DECISAO_MS)
    const loteId = randomUUID()
    try {
      const resultado = await deliberador.decidir(
        { lote: loteId, mundo: mundo(), situacao, personalidades: mapaDePersonalidades(lote), regras: opcoes.regras?.() ?? '' },
        controle.signal,
      )
      if (encerrada || !ligada()) return
      registrarCusto(resultado.custoUsd)
      if (resultado.erro) {
        for (const linha of lote) falhou(linha, resultado.erro)
      } else {
        const decididos = new Set<string>()
        for (const decisao of resultado.decisoes) {
          if (decididos.has(decisao.agenteId)) continue
          decididos.add(decisao.agenteId)
          aplicarDecisao(decisao, loteId)
        }
        for (const linha of lote) {
          if (!decididos.has(linha.agenteId)) {
            const atual = banco.obterVidaAgente(linha.agenteId) as Linha | null
            if (atual?.estado === 'escolhendo') paraOcioso(atual, BACKOFF_SEM_VAGA_MS)
          }
        }
      }
    } catch (erro) {
      if (!encerrada && ligada()) for (const linha of lote) falhou(linha, erro instanceof Error ? erro.message : String(erro))
    } finally {
      clearTimeout(prazo)
      rodadaEmVoo = null
      if (!encerrada) avisarTela()
    }
  }

  function mapaDePersonalidades(lote: Linha[]): Map<string, Personalidade> {
    const mapa = new Map<string, Personalidade>()
    const porId = new Map(opcoes.agentes().map((agente) => [agente.id, agente]))
    for (const linha of lote) {
      const agente = porId.get(linha.agenteId)
      if (agente) mapa.set(agente.id, opcoes.personalidadeDe(agente))
    }
    return mapa
  }

  function falhou(linha: Linha, motivo: string): void {
    const atual = banco.obterVidaAgente(linha.agenteId) as Linha | null
    if (!atual || atual.estado !== 'escolhendo') return
    const falhas = Math.min(atual.falhas + 1, BACKOFF_MS.length)
    mudar(linha.agenteId, { falhas })
    anotar(linha.agenteId, 'recusa', `Não consegui decidir: ${motivo}`)
    paraOcioso(atual, BACKOFF_MS[falhas - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]!)
  }

  function registrarCusto(custoUsd: number | null): void {
    const dia = instante().slice(0, 10)
    if (dia !== diaDoCusto) {
      diaDoCusto = dia
      custoUsdDoDia = 0
    }
    decisoesNaHora = decisoesNaHora.filter((quando) => agora() - quando < 3_600_000)
    decisoesNaHora.push(agora())
    if (custoUsd) custoUsdDoDia += custoUsd
    if (custoUsdDoDia >= config.tetoCustoUsdDoDia && config.tetoCustoUsdDoDia > 0) {
      pausar('teto_custo', `A vida já gastou US$ ${custoUsdDoDia.toFixed(2)} hoje, que é o teto do dia. Ela volta amanhã, ou se você aumentar o teto.`)
    } else if (decisoesNaHora.length >= MAX_DECISOES_HORA) {
      pausar('teto_decisoes', 'A vida tomou decisões demais nesta hora e está descansando.')
    }
  }

  function pausar(motivo: MotivoPausa, texto: string): void {
    if (motivoPausa === motivo) return
    motivoPausa = motivo
    explicacao = texto
    anotar('', 'sistema', texto)
  }

  function despausar(): void {
    if (!motivoPausa) return
    motivoPausa = null
    explicacao = null
  }

  // Grava a vontade, reserva a vaga e muda o estado. Tudo junto: ou o agente sai do lugar com a vaga na mão, ou nada
  // acontece. Perdendo a vaga para outro, desce uma escada determinística em vez de chamar o modelo de novo.
  function aplicarDecisao(decisao: Decisao, loteId: string): void {
    const linha = banco.obterVidaAgente(decisao.agenteId) as Linha | null
    if (!linha || linha.estado !== 'escolhendo') return
    const verbo = verboDoMundo(mundo(), decisao.verbo)
    if (!verbo) {
      recusar(linha, decisao, loteId, 'verbo_desconhecido')
      return
    }
    const ocupadas = new Set(banco.vagasOcupadas().keys())
    const confirmada = validarDecisao(mundo(), montarSituacao([linha, ...parceiroNoLote(decisao)]), { ...decisao, duracaoSegundos: decisao.duracaoMs / 1000 }, ocupadas)
    if ('recusa' in confirmada) {
      recusar(linha, decisao, loteId, confirmada.recusa)
      return
    }
    const alvos = escadaDeVagas(confirmada, ocupadas)
    const vontade = banco.inserirVontade({
      agenteId: linha.agenteId,
      verbo: confirmada.verbo,
      objetoId: confirmada.objetoId,
      vagaId: confirmada.vagaId,
      comId: confirmada.comId,
      motivo: confirmada.motivo,
      assunto: confirmada.assunto,
      tarefa: confirmada.tarefa,
      aceita: true,
      recusa: null,
      lote: loteId,
      custoUsd: null,
      criadaEm: instante(),
      terminadaEm: null,
    })
    for (const vagaId of alvos) {
      if (!banco.reservarVaga(linha.agenteId, vagaId)) continue
      const vaga = vagaDoMundo(mundo(), vagaId)
      const caminhada = estimarCaminhadaMs(mundo(), linha.vagaId, vagaId)
      if (confirmada.comId && !puxarParceiro(confirmada, vontade, caminhada)) {
        banco.soltarVagas({ agenteId: linha.agenteId })
        banco.atualizarVontade(vontade.id, { aceita: false, recusa: 'parceiro_ocupado', terminadaEm: instante() })
        paraOcioso(linha, BACKOFF_SEM_VAGA_MS)
        return
      }
      mudar(linha.agenteId, {
        estado: 'indo',
        verbo: confirmada.verbo,
        objetoId: confirmada.objetoId ?? vaga?.objetoId ?? null,
        comodoId: vaga?.comodoId ?? null,
        comId: confirmada.comId,
        motivo: confirmada.motivo,
        tarefa: confirmada.tarefa,
        vontadeId: vontade.id,
        chegaEm: instante(agora() + caminhada),
        ate: null,
        desde: instante(),
        falhas: 0,
      }, ['escolhendo'])
      if (confirmada.falas.length) gravarFalas(confirmada, vontade.id, caminhada)
      anotar(linha.agenteId, 'decisao', confirmada.motivo)
      return
    }
    banco.atualizarVontade(vontade.id, { aceita: false, recusa: 'vaga_ocupada', terminadaEm: instante() })
    anotar(linha.agenteId, 'recusa', 'O lugar que eu queria já estava ocupado.')
    paraOcioso(linha, BACKOFF_SEM_VAGA_MS)
  }

  function parceiroNoLote(decisao: Decisao): Linha[] {
    if (!decisao.comId) return []
    const outro = banco.obterVidaAgente(decisao.comId) as Linha | null
    return outro ? [outro] : []
  }

  // A vaga pedida e, se ela cair, as outras que servem: do mesmo objeto, depois do mesmo cômodo. Retorna os ids.
  function escadaDeVagas(decisao: Decisao, ocupadas: ReadonlySet<string>): string[] {
    if (!decisao.vagaId) return []
    const vaga = vagaDoMundo(mundo(), decisao.vagaId)
    const doObjeto = vaga ? vagasLivres(mundo(), ocupadas, { objetoId: vaga.objetoId, verbo: decisao.verbo }).map((item) => item.id) : []
    const doComodo = vaga ? vagasLivres(mundo(), ocupadas, { comodoId: vaga.comodoId, verbo: decisao.verbo }).map((item) => item.id) : []
    return [...new Set([decisao.vagaId, ...doObjeto, ...doComodo])]
  }

  // Puxa o parceiro da conversa para uma vaga vizinha. Retorna false se ele já saiu de ocioso.
  function puxarParceiro(decisao: Decisao, vontade: Vontade, caminhadaMs: number): boolean {
    const outro = banco.obterVidaAgente(decisao.comId!) as Linha | null
    if (!outro || (outro.estado !== 'ocioso' && outro.estado !== 'escolhendo')) return false
    const vaga = vagaDoMundo(mundo(), decisao.vagaId ?? '')
    const ocupadas = new Set(banco.vagasOcupadas().keys())
    const candidatas = vaga ? vagasLivres(mundo(), ocupadas, { comodoId: vaga.comodoId }) : []
    // Perto de quem chamou: primeiro as vagas do mesmo móvel, depois as mais próximas dele.
    const vizinha = candidatas
      .map((item) => ({ item, perto: (item.objetoId === vaga?.objetoId ? 0 : 1) * 100_000 + estimarCaminhadaMs(mundo(), decisao.vagaId, item.id) }))
      .sort((a, b) => a.perto - b.perto)
      .map((item) => item.item)[0] ?? null
    if (!vizinha) return false
    if (!banco.reservarVaga(outro.agenteId, vizinha.id)) return false
    mudar(outro.agenteId, {
      estado: 'indo',
      verbo: decisao.verbo,
      objetoId: vizinha.objetoId,
      comodoId: vizinha.comodoId,
      comId: decisao.agenteId,
      motivo: decisao.assunto ? `Conversando sobre ${decisao.assunto}` : 'Parei para conversar',
      vontadeId: vontade.id,
      chegaEm: instante(agora() + caminhadaMs),
      ate: null,
      desde: instante(),
    })
    return true
  }

  function gravarFalas(decisao: Decisao, vontadeId: number, atrasoMs: number): void {
    banco.inserirFalas(
      decisao.falas.map((fala: FalaPlanejada) => ({
        agenteId: fala.agenteId,
        paraId: fala.agenteId === decisao.agenteId ? decisao.comId : decisao.agenteId,
        texto: fala.texto,
        ditaEm: instante(agora() + atrasoMs + fala.emMs),
        vontadeId,
      })),
    )
  }

  function recusar(linha: Linha, decisao: Decisao, loteId: string, motivo: string): void {
    banco.inserirVontade({
      agenteId: linha.agenteId,
      verbo: decisao.verbo,
      objetoId: decisao.objetoId,
      vagaId: decisao.vagaId,
      comId: decisao.comId,
      motivo: decisao.motivo,
      assunto: decisao.assunto,
      tarefa: decisao.tarefa,
      aceita: false,
      recusa: motivo,
      lote: loteId,
      custoUsd: null,
      criadaEm: instante(),
      terminadaEm: instante(),
    })
    anotar(linha.agenteId, 'recusa', `Quis ${decisao.verbo} mas não deu: ${motivo}.`)
    paraOcioso(linha, BACKOFF_SEM_VAGA_MS)
  }

  // ─────────────────────────── a oficina (programar de verdade) ───────────────────────────

  function comecarOficina(agenteId: string): void {
    const fabrica = opcoes.criarExecucaoDaVida
    const linha = banco.obterVidaAgente(agenteId) as Linha | null
    const agente = opcoes.agentes().find((item) => item.id === agenteId)
    if (!fabrica || !linha?.tarefa || !agente || opcoes.algumaOrdemDoHumano() || contarOficinando() >= MAX_OFICINANDO) return
    mudar(agenteId, { estado: 'oficinando' }, ['ocupado'])
    const execucao = fabrica({
      agente,
      personalidade: opcoes.personalidadeDe(agente),
      tarefa: linha.tarefa,
      raiz: pastaDoAgente(agenteId),
      config,
      ganchos: {
        aoFalar(texto) {
          const fala = banco.inserirFalas([{ agenteId, paraId: null, texto: texto.slice(0, 90), ditaEm: instante() }])[0]
          if (fala) emitir({ tipo: 'fala', dados: fala })
        },
        aoEvento(tipo, texto) {
          anotar(agenteId, tipo, texto)
        },
        aoViolacao(motivo) {
          const atual = banco.obterVidaAgente(agenteId) as Linha | null
          const violacoes = (atual?.violacoes ?? 0) + 1
          mudar(agenteId, { violacoes })
          anotar(agenteId, 'guarda', `Tentou mexer fora da pasta dele: ${motivo}`)
          if (violacoes >= VIOLACOES_PARA_ENCERRAR) encerrarOficina(agenteId)
        },
        aoTerminar(fim) {
          execucoes.delete(agenteId)
          const atual = banco.obterVidaAgente(agenteId) as Linha | null
          if (atual?.vontadeId) banco.atualizarVontade(atual.vontadeId, { custoUsd: fim.custoUsd, terminadaEm: instante() })
          anotar(agenteId, 'oficina', fim.status === 'concluida' ? (fim.resultado ?? 'Terminou o que estava fazendo.') : `Parou: ${fim.status}.`)
          if (atual?.estado === 'oficinando') paraOcioso(atual)
          avisarTela(agenteId)
        },
      },
    })
    execucoes.set(agenteId, execucao)
    execucao.iniciar()
    anotar(agenteId, 'oficina', `Começou a mexer em ${pastaDoAgente(agenteId)}: ${linha.tarefa}`)
  }

  function encerrarOficina(agenteId: string): void {
    const execucao = execucoes.get(agenteId)
    if (!execucao) return
    execucoes.delete(agenteId)
    // Trabalho de vida é descartável: encerra na hora, sem a despedida educada que uma ordem do humano merece.
    execucao.encerrar()
  }

  // ─────────────────────────── o humano manda ───────────────────────────

  function cederAoHumano(agenteId: string): void {
    const linha = banco.obterVidaAgente(agenteId) as Linha | null
    if (!linha || linha.estado === 'fora' || linha.estado === 'cedendo') return
    encerrarOficina(agenteId)
    if (linha.vontadeId) {
      banco.atualizarVontade(linha.vontadeId, { aceita: false, recusa: 'ordem_do_humano', terminadaEm: instante() })
      banco.apagarFalasDaVontade(linha.vontadeId)
    }
    if (linha.comId) {
      const outro = banco.obterVidaAgente(linha.comId) as Linha | null
      if (outro && (outro.estado === 'conversando' || outro.estado === 'indo')) paraOcioso(outro)
    }
    banco.soltarVagas({ agenteId })
    mudar(agenteId, {
      estado: 'cedendo',
      verbo: null,
      objetoId: null,
      comId: null,
      motivo: null,
      tarefa: null,
      vontadeId: null,
      chegaEm: null,
      ate: instante(agora() + SAIDA_MS),
      desde: instante(),
      decidirDepoisDe: instante(agora() + DESCANSO_DEPOIS_DO_HUMANO_MS),
    })
  }

  function ordemAcabou(agenteId: string): void {
    if (!ligada()) return
    const linha = banco.obterVidaAgente(agenteId) as Linha | null
    if (!linha || linha.estado === 'fora') {
      recrutar()
      avisarTela(agenteId)
    }
  }

  // ─────────────────────────── bandas, tetos e o relógio ───────────────────────────

  function aoUsoConta(uso: UsoConta): void {
    const usado = Math.max(uso.cincoHoras ?? 0, uso.seteDias ?? 0)
    const antes = banda
    if (uso.status === 'rejected' || usado >= BANDA_SUSPENSA) banda = 'suspensa'
    else if (uso.status === 'allowed_warning' || usado >= BANDA_ECONOMIA) banda = 'economia'
    else if (usado < BANDA_VOLTA) banda = 'normal'
    if (banda === antes) return
    if (banda === 'suspensa') {
      rodadaEmVoo?.abort()
      for (const agenteId of [...execucoes.keys()]) encerrarOficina(agenteId)
      pausar('conta', 'A sua conta Claude está perto do limite, então a vida parou de pensar. Eles continuam andando, mas sem gastar nada.')
    } else if (banda === 'economia') {
      pausar('conta', 'A sua conta Claude está carregada: a vida está mais lenta e ninguém programa por conta própria.')
    } else {
      despausar()
    }
    anotar('', 'banda', `A vida entrou em ritmo ${banda}.`)
    avisarTela()
  }

  function conferirTetoDeHoras(): void {
    if (!ligadaEm || config.tetoHorasVida <= 0) return
    if (agora() - emMs(ligadaEm) < config.tetoHorasVida * 3_600_000) return
    anotar('', 'sistema', `A vida ficou ligada ${config.tetoHorasVida} h e se desligou sozinha.`)
    ligar(false)
    motivoPausa = 'teto_horas'
    explicacao = `A vida ficou ligada por ${config.tetoHorasVida} horas e se desligou sozinha, para não gastar a sua conta esquecida.`
  }

  function bater(): void {
    if (encerrada || !ligada()) return
    conferirTetoDeHoras()
    if (!ligada()) {
      avisarTela()
      return
    }
    const mudaram = new Set(vencerPrazos())
    soltarFalas()
    if (recrutar()) mudaram.add('')
    const usarDeliberador = banda !== 'suspensa' || deliberador.nome === 'barato'
    if (usarDeliberador) void rodada()
    for (const agenteId of mudaram) if (agenteId) aoMudarAgente(agenteId)
    if (mudaram.size) emitir({ tipo: 'vida', dados: estado() })
  }

  function ligar(querLigada: boolean): EstadoDaVida {
    if (querLigada === ligada()) return estado()
    if (querLigada) {
      banco.gravarVidaConfig({ ligada: true, ligadaEm: instante() })
      ligadaEm = instante()
      despausar()
      proximaRodadaEm = agora() + 2000
      recrutar()
      if (!tique) {
        tique = setInterval(bater, INTERVALO_TIQUE_MS)
        tique.unref?.()
      }
      anotar('', 'sistema', 'Você ligou a vida dos agentes.')
    } else {
      if (tique) clearInterval(tique)
      tique = null
      rodadaEmVoo?.abort()
      rodadaEmVoo = null
      for (const agenteId of [...execucoes.keys()]) encerrarOficina(agenteId)
      banco.limparVida(instante())
      banco.gravarVidaConfig({ ligada: false })
      ligadaEm = null
      despausar()
      anotar('', 'sistema', 'Você desligou a vida dos agentes.')
    }
    for (const agente of opcoes.agentes()) aoMudarAgente(agente.id)
    const novo = estado()
    emitir({ tipo: 'vida', dados: novo })
    return novo
  }

  // Arruma o que ficou pela metade quando o servidor caiu, e religa o tique se a vida estava ligada.
  function reconciliar(): void {
    const config0 = banco.lerVidaConfig()
    if (config.vidaNoBoot === false && config0.ligada) {
      banco.limparVida(instante())
      banco.gravarVidaConfig({ ligada: false })
      return
    }
    if (!config0.ligada && config.vidaNoBoot !== true) {
      banco.limparVida(instante())
      return
    }
    ligadaEm = config0.ligadaEm ?? instante()
    for (const linha of banco.listarVidaAgentes() as Linha[]) {
      if (linha.estado === 'escolhendo') paraOcioso(linha)
      else if (linha.estado === 'oficinando') {
        if (linha.vontadeId) banco.atualizarVontade(linha.vontadeId, { recusa: 'interrompida', terminadaEm: instante() })
        paraOcioso(linha)
      } else if (linha.estado === 'cedendo') mudar(linha.agenteId, { estado: 'fora', vagaId: null, ate: null })
    }
    banco.gravarVidaConfig({ ligada: true, ligadaEm })
    recrutar()
    vencerPrazos()
    if (!tique) {
      tique = setInterval(bater, INTERVALO_TIQUE_MS)
      tique.unref?.()
    }
  }

  // Força uma vontade sem gastar token nenhum (a demo e os testes usam isto). Retorna a Vontade criada.
  function forcar(pedido: VontadeForcada): Vontade {
    const linha = banco.obterVidaAgente(pedido.agenteId) as Linha | null
    if (!linha) throw new Error(`O agente ${pedido.agenteId} não está vivendo agora.`)
    if (linha.estado !== 'ocioso') paraOcioso(linha)
    mudar(pedido.agenteId, { estado: 'escolhendo', desde: instante() })
    const verbo = verboDoMundo(mundo(), pedido.verbo)
    const decisao: Decisao = {
      agenteId: pedido.agenteId,
      verbo: pedido.verbo,
      objetoId: pedido.objetoId ?? null,
      vagaId: pedido.vagaId ?? null,
      comId: pedido.comId ?? null,
      assunto: null,
      duracaoMs: pedido.duracaoMs ?? (verbo ? entre(verbo.duracaoMs) : 60_000),
      motivo: 'Você mandou.',
      falas: [],
      tarefa: pedido.tarefa ?? null,
    }
    aplicarDecisao(decisao, 'forcada')
    avisarTela(pedido.agenteId)
    return banco.listarVontades({ agenteId: pedido.agenteId, limite: 1 })[0]!
  }

  async function encerrar(): Promise<void> {
    encerrada = true
    if (tique) clearInterval(tique)
    tique = null
    rodadaEmVoo?.abort()
    for (const agenteId of [...execucoes.keys()]) encerrarOficina(agenteId)
    deliberador.encerrar()
  }

  return {
    bater,
    reconciliar,
    ligar,
    estado,
    mundo,
    cederAoHumano,
    ordemAcabou,
    aoUsoConta,
    doAgente,
    forcar,
    vontadesDoAgente: (agenteId, limite = 10) => banco.listarVontades({ agenteId, limite }),
    eventos: (desde, limite = LIMITE_DE_EVENTOS) => banco.listarVidaEventos(desde, limite),
    falasRecentes: (limite = 20) => banco.listarFalas(limite),
    pausarAgente(agenteId, minutos) {
      const linha = banco.obterVidaAgente(agenteId) as Linha | null
      if (!linha) return null
      paraOcioso(linha, minutos * 60_000)
      avisarTela(agenteId)
      return doAgente(agenteId)
    },
    encerrar,
  }
}

// O estado que a tela recebe quando a vida nem subiu: desligada, sem ninguém vivo. Retorna o EstadoDaVida.
export function estadoDaVidaDesligada(config: Config): EstadoDaVida {
  return {
    ligada: false,
    disponivel: false,
    motivoPausa: null,
    explicacao: null,
    banda: 'normal',
    oficinaDisponivel: false,
    modelo: config.modeloVida,
    intervaloMs: config.intervaloVidaMs,
    ligadaEm: null,
    decisoesNaHora: 0,
    custoUsdDoDia: 0,
    tetoCustoUsdDoDia: config.tetoCustoUsdDoDia,
    vivos: 0,
    pasta: config.dirAgentesProjeto,
    agentes: [],
  }
}
