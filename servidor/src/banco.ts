import { chmodSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue, type SQLOutputValue, type StatementSync } from 'node:sqlite'
import type {
  Convocado,
  EstadoVida,
  Evento,
  EventoVida,
  Fala,
  MotivoPausa,
  Ordem,
  Pendencia,
  RecadoDaReuniao,
  StatusOrdem,
  StatusPendencia,
  Vontade,
} from './tipos.ts'

type TipoColuna = 'texto' | 'inteiro' | 'real' | 'logico' | 'json'
type Linha = Record<string, SQLOutputValue>
type Parametros = Record<string, SQLInputValue>

export type FiltroOrdens = {
  agenteId?: string
  status?: readonly StatusOrdem[]
  continuaDe?: string
  aguardaResposta?: boolean
  // Cursor do histórico: só as que terminaram antes desta ordem (no mesmo instante, as gravadas antes dela).
  antesDe?: string
  ordenarPor?: 'criacao' | 'finalizacao_desc'
  limite?: number
}

export type FiltroPendencias = {
  ordemId?: string
  agenteId?: string
  status?: StatusPendencia
}

export type FiltroVontades = {
  agenteId?: string
  lote?: string
  limite?: number
}

// A linha de vida_config: o toggle do modo Vida e os contadores dos tetos. É sempre a linha de id = 1.
export type VidaConfigLinha = {
  ligada: boolean
  motivoPausa: MotivoPausa | null
  ligadaEm: string | null
  // Dia e hora dos contadores: quando viram, o custo do dia e as decisões da hora zeram.
  dia: string | null
  custoUsdDoDia: number
  hora: string | null
  decisoesNaHora: number
  proximaRodadaEm: string | null
  atualizadaEm: string
}

// A linha de vida_agentes: o que a tela vê em VidaDoAgente mais o que só o motor usa (prazos, vontade aberta,
// tarefa da oficina, falhas e violações). Rótulo e pasta não são gravados: a vida os resolve na hora de mostrar.
export type VidaDoAgenteLinha = {
  agenteId: string
  estado: EstadoVida
  verbo: string | null
  objetoId: string | null
  comodoId: string | null
  vagaId: string | null
  comId: string | null
  motivo: string | null
  tarefa: string | null
  vontadeId: number | null
  desde: string
  chegaEm: string | null
  ate: string | null
  decidirDepoisDe: string | null
  falhas: number
  violacoes: number
  atualizadoEm: string
}

// A fala na hora de gravar: a mesma que a tela recebe, mais a vontade que a planejou (é por ela que uma conversa
// abortada apaga as falas que faltavam).
export type FalaNova = Omit<Fala, 'id'> & { vontadeId?: number | null }

// A linha de falas por inteiro: o que a tela recebe mais as duas colunas de controle do tique.
type FalaLinha = Fala & { vontadeId: number | null; emitida: boolean }

// A linha de reunioes: a sala tem no máximo uma reunião aberta de cada vez (um índice único garante isso), e as
// encerradas ficam gravadas para o histórico dos recados não ficar órfão.
export type ReuniaoLinha = {
  id: string
  aberta: boolean
  abertaEm: string
  encerradaEm: string | null
}

export type Banco = {
  tx<T>(fn: () => T): T
  fechar(): void
  inserirOrdem(ordem: Ordem): void
  obterOrdem(id: string): Ordem | null
  atualizarOrdem(id: string, campos: Partial<Omit<Ordem, 'id'>>, seStatus?: readonly StatusOrdem[]): Ordem | null
  listarOrdens(filtro?: FiltroOrdens): Ordem[]
  contarOrdensPorStatus(agenteId: string): Partial<Record<StatusOrdem, number>>
  limparAguardaResposta(alvo: { agenteId: string } | { ordemId: string }): Ordem[]
  interromperOrdensRodando(erro: string, quando: string): Ordem[]
  cadeiaDaOrdem(id: string): Ordem[]
  inserirEvento(evento: Omit<Evento, 'id'>): Evento
  listarEventos(ordemId: string, limite: number): Evento[]
  inserirPendencia(pendencia: Pendencia): void
  obterPendencia(id: string): Pendencia | null
  atualizarPendencia(
    id: string,
    campos: Partial<Omit<Pendencia, 'id'>>,
    seStatus?: readonly StatusPendencia[],
  ): Pendencia | null
  listarPendencias(filtro?: FiltroPendencias): Pendencia[]
  contarPendenciasAbertas(ordemId: string): number
  fecharPendenciasAbertas(status: 'cancelada' | 'expirada', ordemId?: string): Pendencia[]
  lerVidaConfig(): VidaConfigLinha
  gravarVidaConfig(campos: Partial<VidaConfigLinha>): VidaConfigLinha
  obterVidaAgente(agenteId: string): VidaDoAgenteLinha | null
  listarVidaAgentes(estados?: readonly EstadoVida[]): VidaDoAgenteLinha[]
  salvarVidaAgente(linha: VidaDoAgenteLinha): void
  // A guarda seEstado torna o tique idempotente, do mesmo jeito que atualizarOrdem(..., seStatus).
  atualizarVidaAgente(
    agenteId: string,
    campos: Partial<VidaDoAgenteLinha>,
    seEstado?: readonly EstadoVida[],
  ): VidaDoAgenteLinha | null
  // Falha fechada: devolve false (sem lançar) quando a vaga já é de outro ou o agente não está escolhendo.
  reservarVaga(agenteId: string, vagaId: string): boolean
  soltarVagas(alvo: { agenteId: string } | 'todas'): void
  // De vaga ocupada para o agente que está nela.
  vagasOcupadas(): Map<string, string>
  inserirVontade(vontade: Omit<Vontade, 'id'>): Vontade
  atualizarVontade(id: number, campos: Partial<Omit<Vontade, 'id'>>): Vontade | null
  listarVontades(filtro?: FiltroVontades): Vontade[]
  inserirFalas(falas: readonly FalaNova[]): Fala[]
  falasADizer(ate: string): Fala[]
  marcarFalasEmitidas(ids: readonly number[]): void
  apagarFalasDaVontade(vontadeId: number): void
  listarFalas(limite: number): Fala[]
  inserirVidaEvento(evento: Omit<EventoVida, 'id'>): EventoVida
  listarVidaEventos(desde: number | null, limite: number): EventoVida[]
  // Num tx: solta as vagas, fecha as vontades abertas, apaga as falas por dizer e zera vida_agentes.
  // `quando` é o instante gravado nas vontades que fecharam; sem ele, agora.
  limparVida(quando?: string): void
  // ── sala de reunião ──
  reuniaoAberta(): ReuniaoLinha | null
  abrirReuniao(id: string, quando: string): ReuniaoLinha
  encerrarReuniao(id: string, quando: string): void
  // Falha fechada: devolve false (sem lançar) quando o agente já está na reunião ou a cadeira é de outro.
  convocar(reuniaoId: string, agenteId: string, vagaId: string, quando: string): boolean
  dispensar(reuniaoId: string, agenteId: string): boolean
  convocados(reuniaoId: string): Convocado[]
  // Guarda o recado para quem está na sala agora e devolve o que foi gravado.
  inserirRecado(reuniaoId: string, texto: string, quando: string): RecadoDaReuniao
  recadosDaReuniao(reuniaoId: string, limite: number): RecadoDaReuniao[]
  // Tira do agente o recado mais novo que ele ainda não consumiu (e marca todos os dele como consumidos: um recado
  // mais velho não deve voltar numa ordem futura). Retorna o texto, ou null quando não havia nenhum.
  tomarRecado(agenteId: string, quando: string): string | null
}

const COLUNAS_ORDEM = {
  id: 'texto',
  agenteId: 'texto',
  projeto: 'texto',
  instrucao: 'texto',
  modo: 'texto',
  status: 'texto',
  sessaoId: 'texto',
  continuaDe: 'texto',
  modelo: 'texto',
  atividade: 'texto',
  recado: 'texto',
  todos: 'json',
  resultado: 'texto',
  erro: 'texto',
  aguardaResposta: 'logico',
  custoUsd: 'real',
  turnos: 'inteiro',
  duracaoMs: 'inteiro',
  tokensEntrada: 'inteiro',
  tokensSaida: 'inteiro',
  criadaEm: 'texto',
  iniciadaEm: 'texto',
  finalizadaEm: 'texto',
  vistaEm: 'texto',
} as const satisfies Record<keyof Ordem, TipoColuna>

const COLUNAS_EVENTO = {
  id: 'inteiro',
  ordemId: 'texto',
  tipo: 'texto',
  texto: 'texto',
  detalhe: 'json',
  criadoEm: 'texto',
} as const satisfies Record<keyof Evento, TipoColuna>

const COLUNAS_PENDENCIA = {
  id: 'texto',
  ordemId: 'texto',
  agenteId: 'texto',
  tipo: 'texto',
  ferramenta: 'texto',
  titulo: 'texto',
  descricao: 'texto',
  entrada: 'json',
  permiteSempre: 'logico',
  caminhoBloqueado: 'texto',
  status: 'texto',
  resposta: 'json',
  criadaEm: 'texto',
  respondidaEm: 'texto',
} as const satisfies Record<keyof Pendencia, TipoColuna>

const COLUNAS_VIDA_CONFIG = {
  ligada: 'logico',
  motivoPausa: 'texto',
  ligadaEm: 'texto',
  dia: 'texto',
  custoUsdDoDia: 'real',
  hora: 'texto',
  decisoesNaHora: 'inteiro',
  proximaRodadaEm: 'texto',
  atualizadaEm: 'texto',
} as const satisfies Record<keyof VidaConfigLinha, TipoColuna>

const COLUNAS_VIDA_AGENTE = {
  agenteId: 'texto',
  estado: 'texto',
  verbo: 'texto',
  objetoId: 'texto',
  comodoId: 'texto',
  vagaId: 'texto',
  comId: 'texto',
  motivo: 'texto',
  tarefa: 'texto',
  vontadeId: 'inteiro',
  desde: 'texto',
  chegaEm: 'texto',
  ate: 'texto',
  decidirDepoisDe: 'texto',
  falhas: 'inteiro',
  violacoes: 'inteiro',
  atualizadoEm: 'texto',
} as const satisfies Record<keyof VidaDoAgenteLinha, TipoColuna>

const COLUNAS_VONTADE = {
  id: 'inteiro',
  agenteId: 'texto',
  verbo: 'texto',
  objetoId: 'texto',
  vagaId: 'texto',
  comId: 'texto',
  motivo: 'texto',
  assunto: 'texto',
  tarefa: 'texto',
  aceita: 'logico',
  recusa: 'texto',
  lote: 'texto',
  custoUsd: 'real',
  criadaEm: 'texto',
  terminadaEm: 'texto',
} as const satisfies Record<keyof Vontade, TipoColuna>

const COLUNAS_FALA = {
  id: 'inteiro',
  agenteId: 'texto',
  paraId: 'texto',
  vontadeId: 'inteiro',
  texto: 'texto',
  ditaEm: 'texto',
  emitida: 'logico',
} as const satisfies Record<keyof FalaLinha, TipoColuna>

const COLUNAS_REUNIAO = {
  id: 'texto',
  aberta: 'logico',
  abertaEm: 'texto',
  encerradaEm: 'texto',
} as const satisfies Record<keyof ReuniaoLinha, TipoColuna>

const COLUNAS_VIDA_EVENTO = {
  id: 'inteiro',
  agenteId: 'texto',
  tipo: 'texto',
  texto: 'texto',
  criadoEm: 'texto',
} as const satisfies Record<keyof EventoVida, TipoColuna>

const MIGRACOES: readonly string[] = [
  `
  CREATE TABLE ordens (
    id TEXT PRIMARY KEY,
    agente_id TEXT NOT NULL,
    projeto TEXT NOT NULL,
    instrucao TEXT NOT NULL,
    modo TEXT NOT NULL,
    status TEXT NOT NULL,
    sessao_id TEXT,
    continua_de TEXT REFERENCES ordens (id) ON DELETE SET NULL,
    modelo TEXT,
    atividade TEXT,
    todos TEXT CHECK (todos IS NULL OR json_valid(todos)),
    resultado TEXT,
    erro TEXT,
    aguarda_resposta INTEGER NOT NULL DEFAULT 0 CHECK (aguarda_resposta IN (0, 1)),
    custo_usd REAL,
    turnos INTEGER,
    duracao_ms INTEGER,
    tokens_entrada INTEGER,
    tokens_saida INTEGER,
    criada_em TEXT NOT NULL,
    iniciada_em TEXT,
    finalizada_em TEXT,
    vista_em TEXT
  ) STRICT;
  CREATE INDEX ordens_por_agente ON ordens (agente_id, status, criada_em);
  CREATE INDEX ordens_por_status ON ordens (status, criada_em);
  CREATE INDEX ordens_por_continuacao ON ordens (continua_de) WHERE continua_de IS NOT NULL;

  CREATE TABLE eventos (
    id INTEGER PRIMARY KEY,
    ordem_id TEXT NOT NULL REFERENCES ordens (id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    texto TEXT NOT NULL,
    detalhe TEXT CHECK (detalhe IS NULL OR json_valid(detalhe)),
    criado_em TEXT NOT NULL
  ) STRICT;
  CREATE INDEX eventos_por_ordem ON eventos (ordem_id, id);

  CREATE TABLE pendencias (
    id TEXT PRIMARY KEY,
    ordem_id TEXT NOT NULL REFERENCES ordens (id) ON DELETE CASCADE,
    agente_id TEXT NOT NULL,
    tipo TEXT NOT NULL,
    ferramenta TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    entrada TEXT NOT NULL CHECK (json_valid(entrada)),
    permite_sempre INTEGER NOT NULL DEFAULT 0 CHECK (permite_sempre IN (0, 1)),
    caminho_bloqueado TEXT,
    status TEXT NOT NULL,
    resposta TEXT CHECK (resposta IS NULL OR json_valid(resposta)),
    criada_em TEXT NOT NULL,
    respondida_em TEXT
  ) STRICT;
  CREATE INDEX pendencias_por_ordem ON pendencias (ordem_id, criada_em);
  CREATE INDEX pendencias_por_status ON pendencias (status, agente_id, criada_em);
  `,
  // Última ordem terminada, histórico e pergunta final de cada agente sem ler e ordenar o histórico inteiro.
  `
  CREATE INDEX ordens_por_fim ON ordens (agente_id, finalizada_em);
  CREATE INDEX ordens_com_pergunta ON ordens (agente_id, finalizada_em) WHERE aguarda_resposta = 1;
  `,
  // O modo Vida. Nada daqui tem chave estrangeira para ordens: o histórico do trabalho que o humano mandou não é
  // poluído pelo que os agentes fazem por vontade própria, e apagar a vida nunca viola uma referência.
  `
  CREATE TABLE vida_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    ligada INTEGER NOT NULL DEFAULT 0 CHECK (ligada IN (0, 1)),
    motivo_pausa TEXT,
    ligada_em TEXT,
    dia TEXT,
    custo_usd_do_dia REAL NOT NULL DEFAULT 0,
    hora TEXT,
    decisoes_na_hora INTEGER NOT NULL DEFAULT 0,
    proxima_rodada_em TEXT,
    atualizada_em TEXT NOT NULL DEFAULT ''
  ) STRICT;
  INSERT INTO vida_config (id, ligada, atualizada_em) VALUES (1, 0, '');

  CREATE TABLE vida_agentes (
    agente_id TEXT PRIMARY KEY,
    estado TEXT NOT NULL,
    verbo TEXT,
    objeto_id TEXT,
    comodo_id TEXT,
    vaga_id TEXT,
    com_id TEXT,
    motivo TEXT,
    tarefa TEXT,
    vontade_id INTEGER,
    desde TEXT NOT NULL,
    chega_em TEXT,
    ate TEXT,
    decidir_depois_de TEXT,
    falhas INTEGER NOT NULL DEFAULT 0,
    violacoes INTEGER NOT NULL DEFAULT 0,
    atualizado_em TEXT NOT NULL
  ) STRICT;
  -- Cada vaga é o lugar de uma pessoa: duas na mesma vaga é erro do banco, não disciplina de código.
  CREATE UNIQUE INDEX vida_uma_por_vaga ON vida_agentes (vaga_id) WHERE vaga_id IS NOT NULL;
  CREATE INDEX vida_por_prazo ON vida_agentes (estado, chega_em, ate);

  CREATE TABLE vontades (
    id INTEGER PRIMARY KEY,
    agente_id TEXT NOT NULL,
    verbo TEXT NOT NULL,
    objeto_id TEXT,
    vaga_id TEXT,
    com_id TEXT,
    motivo TEXT,
    assunto TEXT,
    tarefa TEXT,
    aceita INTEGER NOT NULL DEFAULT 0 CHECK (aceita IN (0, 1)),
    recusa TEXT,
    lote TEXT NOT NULL,
    custo_usd REAL,
    criada_em TEXT NOT NULL,
    terminada_em TEXT
  ) STRICT;
  CREATE INDEX vontades_por_agente ON vontades (agente_id, id);
  CREATE INDEX vontades_por_lote ON vontades (lote);

  CREATE TABLE falas (
    id INTEGER PRIMARY KEY,
    agente_id TEXT NOT NULL,
    para_id TEXT,
    vontade_id INTEGER,
    texto TEXT NOT NULL,
    dita_em TEXT NOT NULL,
    emitida INTEGER NOT NULL DEFAULT 0 CHECK (emitida IN (0, 1))
  ) STRICT;
  CREATE INDEX falas_por_tempo ON falas (dita_em);

  CREATE TABLE vida_eventos (
    id INTEGER PRIMARY KEY,
    agente_id TEXT NOT NULL,
    tipo TEXT NOT NULL,
    texto TEXT NOT NULL,
    criado_em TEXT NOT NULL
  ) STRICT;
  CREATE INDEX vida_eventos_por_id ON vida_eventos (id);
  `,
  // A sala de reunião. O recado é guardado por agente (reuniao_recados_para) e consumido quando ele recebe a próxima
  // ordem: é por isso que a reunião encerrada continua gravada, e não apagada.
  `
  ALTER TABLE ordens ADD COLUMN recado TEXT;

  CREATE TABLE reunioes (
    id TEXT PRIMARY KEY,
    aberta INTEGER NOT NULL DEFAULT 1 CHECK (aberta IN (0, 1)),
    aberta_em TEXT NOT NULL,
    encerrada_em TEXT
  ) STRICT;
  -- Uma reunião aberta por vez é regra do banco, não disciplina de código (NULL não serviria: o SQLite trata cada
  -- NULL como distinto num índice único).
  CREATE UNIQUE INDEX reuniao_uma_aberta ON reunioes (aberta) WHERE aberta = 1;

  CREATE TABLE reuniao_convocados (
    reuniao_id TEXT NOT NULL REFERENCES reunioes (id) ON DELETE CASCADE,
    agente_id TEXT NOT NULL,
    vaga_id TEXT NOT NULL,
    desde TEXT NOT NULL,
    PRIMARY KEY (reuniao_id, agente_id)
  ) STRICT;
  -- Cada cadeira é de uma pessoa só, como as vagas da vida.
  CREATE UNIQUE INDEX reuniao_uma_por_cadeira ON reuniao_convocados (reuniao_id, vaga_id);

  CREATE TABLE reuniao_recados (
    id INTEGER PRIMARY KEY,
    reuniao_id TEXT NOT NULL REFERENCES reunioes (id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    criado_em TEXT NOT NULL
  ) STRICT;
  CREATE INDEX reuniao_recados_por_reuniao ON reuniao_recados (reuniao_id, id);

  CREATE TABLE reuniao_recados_para (
    recado_id INTEGER NOT NULL REFERENCES reuniao_recados (id) ON DELETE CASCADE,
    agente_id TEXT NOT NULL,
    consumido_em TEXT,
    PRIMARY KEY (recado_id, agente_id)
  ) STRICT;
  CREATE INDEX recados_por_agente ON reuniao_recados_para (agente_id, consumido_em);
  `,
]

const mapaOrdem = criarMapa<Ordem>(COLUNAS_ORDEM)
const mapaEvento = criarMapa<Evento>(COLUNAS_EVENTO)
const mapaPendencia = criarMapa<Pendencia>(COLUNAS_PENDENCIA)
const mapaVidaConfig = criarMapa<VidaConfigLinha>(COLUNAS_VIDA_CONFIG)
const mapaVidaAgente = criarMapa<VidaDoAgenteLinha>(COLUNAS_VIDA_AGENTE)
const mapaVontade = criarMapa<Vontade>(COLUNAS_VONTADE)
const mapaFala = criarMapa<FalaLinha>(COLUNAS_FALA)
const mapaVidaEvento = criarMapa<EventoVida>(COLUNAS_VIDA_EVENTO)
const mapaReuniao = criarMapa<ReuniaoLinha>(COLUNAS_REUNIAO)

// Abre (ou cria) o banco SQLite do escritório e aplica as migrações. Aceita ':memory:'. Retorna o repositório.
export function abrirBanco(caminho: string): Banco {
  const db = new DatabaseSync(caminho, { timeout: 5000 })
  restringirArquivo(caminho)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrar(db)

  const preparados = new Map<string, StatementSync>()
  const preparar = (sql: string): StatementSync => {
    let comando = preparados.get(sql)
    if (!comando) {
      comando = db.prepare(sql)
      preparados.set(sql, comando)
    }
    return comando
  }
  const ordem = (linha: Linha | undefined): Ordem | null => (linha ? mapaOrdem.deLinha(linha) : null)
  const pendencia = (linha: Linha | undefined): Pendencia | null => (linha ? mapaPendencia.deLinha(linha) : null)
  const ordens = (linhas: Linha[]): Ordem[] => linhas.map((linha) => mapaOrdem.deLinha(linha)).sort(porCriacao)
  const pendencias = (linhas: Linha[]): Pendencia[] => linhas.map((linha) => mapaPendencia.deLinha(linha)).sort(porCriacao)
  const vidaAgente = (linha: Linha | undefined): VidaDoAgenteLinha | null => (linha ? mapaVidaAgente.deLinha(linha) : null)
  const vontade = (linha: Linha | undefined): Vontade | null => (linha ? mapaVontade.deLinha(linha) : null)
  // A fala sai sem as duas colunas de controle: para a tela, uma fala é só quem falou, o quê e quando.
  const fala = (linha: Linha): Fala => {
    const { id, agenteId, paraId, texto, ditaEm } = mapaFala.deLinha(linha)
    return { id, agenteId, paraId, texto, ditaEm }
  }

  function tx<T>(fn: () => T): T {
    if (db.isTransaction) return fn()
    db.exec('BEGIN IMMEDIATE')
    try {
      const resultado = fn()
      db.exec('COMMIT')
      return resultado
    } catch (erro) {
      if (db.isTransaction) db.exec('ROLLBACK')
      throw erro
    }
  }

  // Grava só os campos presentes, com a guarda opcional de status. `chave` e `status` são os campos que mandam na
  // linha: vida_agentes se identifica por agenteId e se protege por estado, em vez de id e status.
  function atualizar<T>(
    tabela: string,
    mapa: Mapa<T>,
    id: SQLInputValue,
    campos: Partial<T>,
    seStatus: readonly string[] | undefined,
    chave = 'id',
    status = 'status',
  ): Linha | undefined {
    const parametros = mapa.parametros(campos)
    delete parametros[chave]
    const nomes = Object.keys(parametros)
    const onde = `WHERE ${paraColuna(chave)} = :${chave}${condicaoStatus(seStatus, parametros, status)}`
    if (nomes.length === 0) {
      return preparar(`SELECT * FROM ${tabela} ${onde}`).get({ ...parametros, [chave]: id })
    }
    const definicoes = nomes.map((nome) => `${paraColuna(nome)} = :${nome}`).join(', ')
    return preparar(`UPDATE ${tabela} SET ${definicoes} ${onde} RETURNING *`).get({ ...parametros, [chave]: id })
  }

  return {
    tx,
    fechar() {
      if (db.isOpen) db.close()
    },
    inserirOrdem(nova) {
      preparar(sqlInserir('ordens', mapaOrdem.campos)).run(mapaOrdem.parametros(nova))
    },
    obterOrdem(id) {
      return ordem(preparar('SELECT * FROM ordens WHERE id = :id').get({ id }))
    },
    atualizarOrdem(id, campos, seStatus) {
      return ordem(atualizar('ordens', mapaOrdem, id, campos, seStatus))
    },
    listarOrdens(filtro = {}) {
      if (filtro.status && filtro.status.length === 0) return []
      const condicoes: string[] = []
      const parametros: Parametros = {}
      if (filtro.agenteId !== undefined) {
        condicoes.push('agente_id = :agenteId')
        parametros.agenteId = filtro.agenteId
      }
      if (filtro.status) condicoes.push(`status IN (${marcadores(filtro.status, parametros)})`)
      if (filtro.continuaDe !== undefined) {
        condicoes.push('continua_de = :continuaDe')
        parametros.continuaDe = filtro.continuaDe
      }
      // Valor fixo no SQL (não parâmetro) para o SQLite poder usar o índice parcial ordens_com_pergunta.
      if (filtro.aguardaResposta !== undefined) condicoes.push(`aguarda_resposta = ${filtro.aguardaResposta ? 1 : 0}`)
      if (filtro.antesDe !== undefined) {
        condicoes.push('(finalizada_em, rowid) < (SELECT finalizada_em, rowid FROM ordens WHERE id = :antesDe)')
        parametros.antesDe = filtro.antesDe
      }
      const onde = condicoes.length > 0 ? ` WHERE ${condicoes.join(' AND ')}` : ''
      const ordenacao = filtro.ordenarPor === 'finalizacao_desc' ? 'finalizada_em DESC, rowid DESC' : 'criada_em, rowid'
      let sql = `SELECT * FROM ordens${onde} ORDER BY ${ordenacao}`
      if (filtro.limite !== undefined) {
        sql += ' LIMIT :limite'
        parametros.limite = Math.max(0, Math.floor(filtro.limite))
      }
      return preparar(sql).all(parametros).map((linha) => mapaOrdem.deLinha(linha))
    },
    contarOrdensPorStatus(agenteId) {
      const linhas = preparar('SELECT status, count(*) AS total FROM ordens WHERE agente_id = :agenteId GROUP BY status')
        .all({ agenteId })
      return Object.fromEntries(linhas.map((linha) => [String(linha.status), Number(linha.total)]))
    },
    limparAguardaResposta(alvo) {
      const sql = 'agenteId' in alvo
        ? 'UPDATE ordens SET aguarda_resposta = 0 WHERE agente_id = :alvo AND aguarda_resposta = 1 RETURNING *'
        : 'UPDATE ordens SET aguarda_resposta = 0 WHERE id = :alvo AND aguarda_resposta = 1 RETURNING *'
      return ordens(preparar(sql).all({ alvo: 'agenteId' in alvo ? alvo.agenteId : alvo.ordemId }))
    },
    interromperOrdensRodando(erro, quando) {
      const sql = `UPDATE ordens SET status = 'interrompida', erro = :erro, finalizada_em = :quando, atividade = NULL
        WHERE status IN ('trabalhando', 'aguardando') RETURNING *`
      return ordens(preparar(sql).all({ erro, quando }))
    },
    cadeiaDaOrdem(id) {
      const sql = `WITH RECURSIVE
          acima (id, continua_de) AS (
            SELECT id, continua_de FROM ordens WHERE id = :id
            UNION
            SELECT o.id, o.continua_de FROM ordens o JOIN acima a ON o.id = a.continua_de
          ),
          abaixo (id) AS (
            SELECT :id
            UNION
            SELECT o.id FROM ordens o JOIN abaixo b ON o.continua_de = b.id
          )
        SELECT * FROM ordens WHERE id IN (SELECT id FROM acima UNION SELECT id FROM abaixo)
        ORDER BY criada_em, rowid`
      return preparar(sql).all({ id }).map((linha) => mapaOrdem.deLinha(linha))
    },
    inserirEvento(evento) {
      const campos = mapaEvento.campos.filter((campo) => campo !== 'id')
      const linha = preparar(`${sqlInserir('eventos', campos)} RETURNING *`).get(mapaEvento.parametros(evento))
      if (!linha) throw new Error('O banco não devolveu o evento gravado.')
      return mapaEvento.deLinha(linha)
    },
    listarEventos(ordemId, limite) {
      const sql = `SELECT * FROM (
          SELECT * FROM eventos WHERE ordem_id = :ordemId ORDER BY id DESC LIMIT :limite
        ) ORDER BY id`
      return preparar(sql).all({ ordemId, limite: Math.max(0, Math.floor(limite)) }).map((linha) => mapaEvento.deLinha(linha))
    },
    inserirPendencia(nova) {
      preparar(sqlInserir('pendencias', mapaPendencia.campos)).run(mapaPendencia.parametros(nova))
    },
    obterPendencia(id) {
      return pendencia(preparar('SELECT * FROM pendencias WHERE id = :id').get({ id }))
    },
    atualizarPendencia(id, campos, seStatus) {
      return pendencia(atualizar('pendencias', mapaPendencia, id, campos, seStatus))
    },
    listarPendencias(filtro = {}) {
      const condicoes: string[] = []
      const parametros: Parametros = {}
      for (const [campo, coluna] of [['ordemId', 'ordem_id'], ['agenteId', 'agente_id'], ['status', 'status']] as const) {
        const valor = filtro[campo]
        if (valor === undefined) continue
        condicoes.push(`${coluna} = :${campo}`)
        parametros[campo] = valor
      }
      const onde = condicoes.length > 0 ? ` WHERE ${condicoes.join(' AND ')}` : ''
      return preparar(`SELECT * FROM pendencias${onde} ORDER BY criada_em, rowid`)
        .all(parametros)
        .map((linha) => mapaPendencia.deLinha(linha))
    },
    contarPendenciasAbertas(ordemId) {
      const linha = preparar(`SELECT count(*) AS total FROM pendencias WHERE ordem_id = :ordemId AND status = 'aberta'`)
        .get({ ordemId })
      return Number(linha?.total ?? 0)
    },
    fecharPendenciasAbertas(status, ordemId) {
      if (ordemId === undefined) {
        return pendencias(preparar(`UPDATE pendencias SET status = :status WHERE status = 'aberta' RETURNING *`).all({ status }))
      }
      const sql = `UPDATE pendencias SET status = :status WHERE status = 'aberta' AND ordem_id = :ordemId RETURNING *`
      return pendencias(preparar(sql).all({ status, ordemId }))
    },
    lerVidaConfig() {
      const linha = preparar('SELECT * FROM vida_config WHERE id = 1').get()
      if (!linha) throw new Error('A configuração do modo Vida não está no banco.')
      return mapaVidaConfig.deLinha(linha)
    },
    gravarVidaConfig(campos) {
      const linha = atualizar('vida_config', mapaVidaConfig, 1, campos, undefined)
      if (!linha) throw new Error('O banco não devolveu a configuração do modo Vida.')
      return mapaVidaConfig.deLinha(linha)
    },
    obterVidaAgente(agenteId) {
      return vidaAgente(preparar('SELECT * FROM vida_agentes WHERE agente_id = :agenteId').get({ agenteId }))
    },
    listarVidaAgentes(estados) {
      if (estados && estados.length === 0) return []
      const parametros: Parametros = {}
      const onde = estados ? ` WHERE estado IN (${marcadores(estados, parametros)})` : ''
      return preparar(`SELECT * FROM vida_agentes${onde} ORDER BY agente_id`)
        .all(parametros)
        .map((linha) => mapaVidaAgente.deLinha(linha))
    },
    salvarVidaAgente(linha) {
      // Apaga e grava de novo em vez de INSERT OR REPLACE: assim o conflito tratado é só o do próprio agente, e
      // tentar gravar alguém na vaga de outro continua estourando no índice único em vez de expulsar quem estava lá.
      tx(() => {
        preparar('DELETE FROM vida_agentes WHERE agente_id = :agenteId').run({ agenteId: linha.agenteId })
        preparar(sqlInserir('vida_agentes', mapaVidaAgente.campos)).run(mapaVidaAgente.parametros(linha))
      })
    },
    atualizarVidaAgente(agenteId, campos, seEstado) {
      return vidaAgente(atualizar('vida_agentes', mapaVidaAgente, agenteId, campos, seEstado, 'agenteId', 'estado'))
    },
    reservarVaga(agenteId, vagaId) {
      const sql = `UPDATE vida_agentes SET vaga_id = :vagaId WHERE agente_id = :agenteId AND estado = 'escolhendo'`
      try {
        return Number(preparar(sql).run({ agenteId, vagaId }).changes) > 0
      } catch (erro) {
        // Perder a corrida pela vaga é resposta, não exceção: quem perdeu desce a escada e tenta outro lugar.
        if (ehConflitoDeUnicidade(erro)) return false
        throw erro
      }
    },
    soltarVagas(alvo) {
      if (alvo === 'todas') {
        preparar('UPDATE vida_agentes SET vaga_id = NULL WHERE vaga_id IS NOT NULL').run()
        return
      }
      preparar('UPDATE vida_agentes SET vaga_id = NULL WHERE agente_id = :agenteId').run({ agenteId: alvo.agenteId })
    },
    vagasOcupadas() {
      const linhas = preparar('SELECT agente_id, vaga_id FROM vida_agentes WHERE vaga_id IS NOT NULL').all()
      return new Map(linhas.map((linha) => [String(linha.vaga_id), String(linha.agente_id)]))
    },
    inserirVontade(nova) {
      const campos = mapaVontade.campos.filter((campo) => campo !== 'id')
      const linha = preparar(`${sqlInserir('vontades', campos)} RETURNING *`).get(mapaVontade.parametros(nova))
      if (!linha) throw new Error('O banco não devolveu a vontade gravada.')
      return mapaVontade.deLinha(linha)
    },
    atualizarVontade(id, campos) {
      return vontade(atualizar('vontades', mapaVontade, id, campos, undefined))
    },
    listarVontades(filtro = {}) {
      const condicoes: string[] = []
      const parametros: Parametros = {}
      if (filtro.agenteId !== undefined) {
        condicoes.push('agente_id = :agenteId')
        parametros.agenteId = filtro.agenteId
      }
      if (filtro.lote !== undefined) {
        condicoes.push('lote = :lote')
        parametros.lote = filtro.lote
      }
      const onde = condicoes.length > 0 ? ` WHERE ${condicoes.join(' AND ')}` : ''
      // Da mais nova para a mais velha: o limite corta o passado distante, não o que acabou de acontecer.
      let sql = `SELECT * FROM vontades${onde} ORDER BY id DESC`
      if (filtro.limite !== undefined) {
        sql += ' LIMIT :limite'
        parametros.limite = Math.max(0, Math.floor(filtro.limite))
      }
      return preparar(sql).all(parametros).map((linha) => mapaVontade.deLinha(linha))
    },
    inserirFalas(novas) {
      // 'emitida' fica fora do INSERT: toda fala nasce por dizer, e é o tique que a solta na hora marcada.
      const campos = mapaFala.campos.filter((campo) => campo !== 'id' && campo !== 'emitida')
      const sql = `${sqlInserir('falas', campos)} RETURNING *`
      return tx(() => novas.map((nova) => {
        const linha = preparar(sql).get(mapaFala.parametros(nova))
        if (!linha) throw new Error('O banco não devolveu a fala gravada.')
        return fala(linha)
      }))
    },
    falasADizer(ate) {
      const sql = 'SELECT * FROM falas WHERE emitida = 0 AND dita_em <= :ate ORDER BY dita_em, id'
      return preparar(sql).all({ ate }).map((linha) => fala(linha))
    },
    marcarFalasEmitidas(ids) {
      if (ids.length === 0) return
      const parametros: Parametros = {}
      preparar(`UPDATE falas SET emitida = 1 WHERE id IN (${marcadores(ids, parametros)})`).run(parametros)
    },
    apagarFalasDaVontade(vontadeId) {
      // Só as que faltavam: o que já foi dito aconteceu e fica no histórico.
      preparar('DELETE FROM falas WHERE vontade_id = :vontadeId AND emitida = 0').run({ vontadeId })
    },
    listarFalas(limite) {
      // As últimas já ditas, em ordem de fala: é o que um navegador que abre no meio da conversa precisa ver.
      const sql = `SELECT * FROM (
          SELECT * FROM falas WHERE emitida = 1 ORDER BY dita_em DESC, id DESC LIMIT :limite
        ) ORDER BY dita_em, id`
      return preparar(sql).all({ limite: Math.max(0, Math.floor(limite)) }).map((linha) => fala(linha))
    },
    inserirVidaEvento(evento) {
      const campos = mapaVidaEvento.campos.filter((campo) => campo !== 'id')
      const linha = preparar(`${sqlInserir('vida_eventos', campos)} RETURNING *`).get(mapaVidaEvento.parametros(evento))
      if (!linha) throw new Error('O banco não devolveu o evento da vida gravado.')
      return mapaVidaEvento.deLinha(linha)
    },
    listarVidaEventos(desde, limite) {
      const teto = Math.max(0, Math.floor(limite))
      // Sem cursor, os últimos (é o que a gaveta abre mostrando); com cursor, os que vieram depois dele.
      if (desde === null) {
        const sql = 'SELECT * FROM (SELECT * FROM vida_eventos ORDER BY id DESC LIMIT :limite) ORDER BY id'
        return preparar(sql).all({ limite: teto }).map((linha) => mapaVidaEvento.deLinha(linha))
      }
      const sql = 'SELECT * FROM vida_eventos WHERE id > :desde ORDER BY id LIMIT :limite'
      return preparar(sql).all({ desde, limite: teto }).map((linha) => mapaVidaEvento.deLinha(linha))
    },
    limparVida(quando = new Date().toISOString()) {
      tx(() => {
        preparar('UPDATE vida_agentes SET vaga_id = NULL WHERE vaga_id IS NOT NULL').run()
        preparar(`UPDATE vontades SET recusa = 'desligado', terminada_em = :quando WHERE terminada_em IS NULL`)
          .run({ quando })
        preparar('DELETE FROM falas WHERE emitida = 0').run()
        preparar('DELETE FROM vida_agentes').run()
      })
    },
    reuniaoAberta() {
      const linha = preparar('SELECT * FROM reunioes WHERE aberta = 1').get()
      return linha ? mapaReuniao.deLinha(linha) : null
    },
    abrirReuniao(id, quando) {
      const nova: ReuniaoLinha = { id, aberta: true, abertaEm: quando, encerradaEm: null }
      preparar(sqlInserir('reunioes', mapaReuniao.campos)).run(mapaReuniao.parametros(nova))
      return nova
    },
    encerrarReuniao(id, quando) {
      tx(() => {
        preparar('DELETE FROM reuniao_convocados WHERE reuniao_id = :id').run({ id })
        preparar('UPDATE reunioes SET aberta = 0, encerrada_em = :quando WHERE id = :id AND aberta = 1')
          .run({ id, quando })
      })
    },
    convocar(reuniaoId, agenteId, vagaId, quando) {
      // Agente já convocado (a chave) ou cadeira já ocupada (o índice) não é exceção: é resposta.
      const sql = `INSERT INTO reuniao_convocados (reuniao_id, agente_id, vaga_id, desde)
        VALUES (:reuniaoId, :agenteId, :vagaId, :quando) ON CONFLICT DO NOTHING`
      return Number(preparar(sql).run({ reuniaoId, agenteId, vagaId, quando }).changes) > 0
    },
    dispensar(reuniaoId, agenteId) {
      const sql = 'DELETE FROM reuniao_convocados WHERE reuniao_id = :reuniaoId AND agente_id = :agenteId'
      return Number(preparar(sql).run({ reuniaoId, agenteId }).changes) > 0
    },
    convocados(reuniaoId) {
      const sql = 'SELECT agente_id, vaga_id, desde FROM reuniao_convocados WHERE reuniao_id = :reuniaoId ORDER BY vaga_id'
      return preparar(sql).all({ reuniaoId }).map((linha) => ({
        agenteId: String(linha.agente_id),
        vagaId: String(linha.vaga_id),
        desde: String(linha.desde),
      }))
    },
    inserirRecado(reuniaoId, texto, quando) {
      return tx(() => {
        const sql = `INSERT INTO reuniao_recados (reuniao_id, texto, criado_em) VALUES (:reuniaoId, :texto, :quando)
          RETURNING id`
        const linha = preparar(sql).get({ reuniaoId, texto, quando })
        if (!linha) throw new Error('O banco não devolveu o recado gravado.')
        const id = Number(linha.id)
        const paraIds = preparar('SELECT agente_id FROM reuniao_convocados WHERE reuniao_id = :reuniaoId ORDER BY vaga_id')
          .all({ reuniaoId })
          .map((item) => String(item.agente_id))
        const guardar = preparar('INSERT INTO reuniao_recados_para (recado_id, agente_id) VALUES (:id, :agenteId)')
        for (const agenteId of paraIds) guardar.run({ id, agenteId })
        return { id, texto, criadoEm: quando, paraIds }
      })
    },
    recadosDaReuniao(reuniaoId, limite) {
      const sql = `SELECT * FROM (SELECT * FROM reuniao_recados WHERE reuniao_id = :reuniaoId ORDER BY id DESC
        LIMIT :limite) ORDER BY id`
      return preparar(sql).all({ reuniaoId, limite: Math.max(0, Math.floor(limite)) }).map((linha) => ({
        id: Number(linha.id),
        texto: String(linha.texto),
        criadoEm: String(linha.criado_em),
        paraIds: preparar('SELECT agente_id FROM reuniao_recados_para WHERE recado_id = :id ORDER BY agente_id')
          .all({ id: Number(linha.id) })
          .map((item) => String(item.agente_id)),
      }))
    },
    tomarRecado(agenteId, quando) {
      return tx(() => {
        const sql = `SELECT r.texto AS texto FROM reuniao_recados_para p JOIN reuniao_recados r ON r.id = p.recado_id
          WHERE p.agente_id = :agenteId AND p.consumido_em IS NULL ORDER BY r.id DESC LIMIT 1`
        const linha = preparar(sql).get({ agenteId })
        if (!linha) return null
        preparar('UPDATE reuniao_recados_para SET consumido_em = :quando WHERE agente_id = :agenteId AND consumido_em IS NULL')
          .run({ agenteId, quando })
        return String(linha.texto)
      })
    },
  }
}

function restringirArquivo(caminho: string): void {
  if (caminho === ':memory:' || caminho.startsWith('file:')) return
  try {
    chmodSync(caminho, 0o600)
  } catch (erro) {
    console.error('[escritorio] não consegui restringir as permissões do banco:', erro)
  }
}

function migrar(db: DatabaseSync): void {
  for (;;) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const versao = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0)
      if (versao > MIGRACOES.length) {
        throw new Error('O banco de dados é de uma versão mais nova do Escritório de Agentes. Atualize o programa.')
      }
      if (versao === MIGRACOES.length) {
        db.exec('COMMIT')
        return
      }
      db.exec(MIGRACOES[versao] ?? '')
      db.exec(`PRAGMA user_version = ${versao + 1}`)
      db.exec('COMMIT')
    } catch (erro) {
      if (db.isTransaction) db.exec('ROLLBACK')
      throw erro
    }
  }
}

type Mapa<T> = {
  campos: string[]
  deLinha(linha: Linha): T
  parametros(objeto: Partial<T>): Parametros
}

function criarMapa<T>(colunas: Readonly<Record<string, TipoColuna>>): Mapa<T> {
  const campos = Object.keys(colunas)
  return {
    campos,
    deLinha(linha) {
      const objeto: Record<string, unknown> = {}
      for (const campo of campos) objeto[campo] = deSql(colunas[campo] ?? 'texto', linha[paraColuna(campo)])
      return objeto as T
    },
    parametros(objeto) {
      const parametros: Parametros = {}
      for (const [campo, valor] of Object.entries(objeto)) {
        const tipo = colunas[campo]
        if (tipo && valor !== undefined) parametros[campo] = paraSql(tipo, valor)
      }
      return parametros
    },
  }
}

function paraSql(tipo: TipoColuna, valor: unknown): SQLInputValue {
  if (valor === undefined || valor === null) return null
  if (tipo === 'logico') return valor ? 1 : 0
  if (tipo === 'json') return JSON.stringify(valor) ?? null
  if (tipo === 'inteiro') return typeof valor === 'number' && Number.isFinite(valor) ? Math.round(valor) : null
  if (tipo === 'real') return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
  return String(valor)
}

function deSql(tipo: TipoColuna, valor: SQLOutputValue | undefined): unknown {
  if (tipo === 'logico') return valor === 1 || valor === 1n
  if (valor === undefined || valor === null) return null
  if (tipo === 'json') return typeof valor === 'string' ? JSON.parse(valor) : null
  if (typeof valor === 'bigint') return Number(valor)
  return valor
}

function paraColuna(campo: string): string {
  return campo.replace(/[A-Z]/g, (letra) => `_${letra.toLowerCase()}`)
}

function sqlInserir(tabela: string, campos: readonly string[]): string {
  return `INSERT INTO ${tabela} (${campos.map(paraColuna).join(', ')}) VALUES (${campos.map((campo) => `:${campo}`).join(', ')})`
}

function marcadores(valores: readonly SQLInputValue[], parametros: Parametros): string {
  return valores
    .map((valor, indice) => {
      parametros[`s${indice}`] = valor
      return `:s${indice}`
    })
    .join(', ')
}

function condicaoStatus(seStatus: readonly string[] | undefined, parametros: Parametros, coluna = 'status'): string {
  if (!seStatus) return ''
  if (seStatus.length === 0) return ' AND 0'
  return ` AND ${paraColuna(coluna)} IN (${marcadores(seStatus, parametros)})`
}

// O índice único recusou a gravação: a vaga já era de outro. Retorna true só para esse conflito, nunca para outro erro.
function ehConflitoDeUnicidade(erro: unknown): boolean {
  const codigo = (erro as { errcode?: unknown } | null)?.errcode
  // 2067 é SQLITE_CONSTRAINT_UNIQUE; todo SQLITE_CONSTRAINT_* tem 19 nos oito bits de baixo.
  return typeof codigo === 'number' && (codigo & 0xff) === 19
}

function porCriacao(a: { criadaEm: string; id: string }, b: { criadaEm: string; id: string }): number {
  return a.criadaEm < b.criadaEm ? -1 : a.criadaEm > b.criadaEm ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
