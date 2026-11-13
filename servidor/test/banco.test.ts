import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test, type TestContext } from 'node:test'
import { abrirBanco, type Banco, type VidaDoAgenteLinha } from '../src/banco.ts'
import type { Ordem, Pendencia, Vontade } from '../src/tipos.ts'

const INICIO = Date.UTC(2026, 9, 29, 10, 0, 0)
let contador = 0

function quando(segundos: number): string {
  return new Date(INICIO + segundos * 1000).toISOString()
}

function novaOrdem(dados: Partial<Ordem> = {}): Ordem {
  contador++
  return {
    id: `ordem-${contador}`,
    agenteId: 'claude',
    projeto: '/tmp/projeto',
    instrucao: 'Faça algo',
    modo: 'default',
    status: 'na_fila',
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
    criadaEm: quando(contador),
    iniciadaEm: null,
    finalizadaEm: null,
    vistaEm: null,
    ...dados,
  }
}

function novaPendencia(ordem: Ordem, dados: Partial<Pendencia> = {}): Pendencia {
  contador++
  return {
    id: `pendencia-${contador}`,
    ordemId: ordem.id,
    agenteId: ordem.agenteId,
    tipo: 'permissao',
    ferramenta: 'Bash',
    titulo: 'Quer executar um comando',
    descricao: null,
    entrada: { command: 'npm test' },
    permiteSempre: false,
    caminhoBloqueado: null,
    status: 'aberta',
    resposta: null,
    criadaEm: quando(contador),
    respondidaEm: null,
    ...dados,
  }
}

function novaVidaDeAgente(agenteId: string, dados: Partial<VidaDoAgenteLinha> = {}): VidaDoAgenteLinha {
  return {
    agenteId,
    estado: 'ocioso',
    verbo: null,
    objetoId: null,
    comodoId: null,
    vagaId: null,
    comId: null,
    motivo: null,
    tarefa: null,
    vontadeId: null,
    desde: quando(1),
    chegaEm: null,
    ate: null,
    decidirDepoisDe: null,
    falhas: 0,
    violacoes: 0,
    atualizadoEm: quando(1),
    ...dados,
  }
}

function novaVontade(dados: Partial<Omit<Vontade, 'id'>> = {}): Omit<Vontade, 'id'> {
  return {
    agenteId: 'ana',
    verbo: 'usar',
    objetoId: 'copa',
    vagaId: null,
    comId: null,
    motivo: 'Estava há tempo na mesma cadeira.',
    assunto: null,
    tarefa: null,
    aceita: true,
    recusa: null,
    lote: 'lote-1',
    custoUsd: null,
    criadaEm: quando(10),
    terminadaEm: null,
    ...dados,
  }
}

function abrirNaMemoria(t: TestContext): Banco {
  const banco = abrirBanco(':memory:')
  t.after(() => banco.fechar())
  return banco
}

test('grava e lê ordens com todos os campos', (t) => {
  const banco = abrirNaMemoria(t)
  const ordem = novaOrdem({
    status: 'concluida',
    sessaoId: 'sessao-1',
    modelo: 'opus',
    atividade: 'Lendo package.json',
    recado: null,
    todos: [{ conteudo: 'Ler', status: 'feito' }, { conteudo: 'Testar', status: 'andamento', ativo: 'Testando' }],
    resultado: 'Pronto?',
    aguardaResposta: true,
    custoUsd: 0.4217,
    turnos: 7,
    duracaoMs: 1234.6,
    tokensEntrada: 52000,
    tokensSaida: 900,
    iniciadaEm: quando(100),
    finalizadaEm: quando(200),
  })
  banco.inserirOrdem(ordem)
  assert.deepEqual(banco.obterOrdem(ordem.id), { ...ordem, duracaoMs: 1235 })
  assert.equal(banco.obterOrdem('nao-existe'), null)
})

test('atualiza só os campos pedidos e respeita a condição de status', (t) => {
  const banco = abrirNaMemoria(t)
  const ordem = novaOrdem({ atividade: 'antes' })
  banco.inserirOrdem(ordem)

  const trabalhando = banco.atualizarOrdem(ordem.id, { status: 'trabalhando', iniciadaEm: quando(50), erro: undefined }, ['na_fila'])
  assert.equal(trabalhando?.status, 'trabalhando')
  assert.equal(trabalhando?.atividade, 'antes')
  assert.equal(trabalhando?.iniciadaEm, quando(50))

  assert.equal(banco.atualizarOrdem(ordem.id, { status: 'cancelada' }, ['na_fila']), null)
  assert.equal(banco.obterOrdem(ordem.id)?.status, 'trabalhando')
  assert.equal(banco.atualizarOrdem(ordem.id, { status: 'cancelada' }, []), null)

  const limpa = banco.atualizarOrdem(ordem.id, { atividade: null, aguardaResposta: true, todos: [] })
  assert.equal(limpa?.atividade, null)
  assert.equal(limpa?.aguardaResposta, true)
  assert.deepEqual(limpa?.todos, [])

  assert.deepEqual(banco.atualizarOrdem(ordem.id, {}), limpa)
  assert.equal(banco.atualizarOrdem(ordem.id, {}, ['na_fila']), null)
  assert.equal(banco.atualizarOrdem('nao-existe', { atividade: 'x' }), null)
})

test('lista ordens por agente, status, ordem de criação ou de fim e limite', (t) => {
  const banco = abrirNaMemoria(t)
  const a = novaOrdem({ agenteId: 'ana', status: 'concluida', finalizadaEm: quando(300) })
  const b = novaOrdem({ agenteId: 'ana', status: 'erro', finalizadaEm: quando(400) })
  const c = novaOrdem({ agenteId: 'ana', status: 'na_fila' })
  const d = novaOrdem({ agenteId: 'bia', status: 'na_fila' })
  for (const ordem of [d, c, b, a]) banco.inserirOrdem(ordem)

  assert.deepEqual(banco.listarOrdens().map((o) => o.id), [a.id, b.id, c.id, d.id])
  assert.deepEqual(banco.listarOrdens({ status: ['na_fila'] }).map((o) => o.id), [c.id, d.id])
  assert.deepEqual(banco.listarOrdens({ agenteId: 'ana', status: ['na_fila'] }).map((o) => o.id), [c.id])
  assert.deepEqual(
    banco.listarOrdens({ agenteId: 'ana', status: ['concluida', 'erro'], ordenarPor: 'finalizacao_desc' }).map((o) => o.id),
    [b.id, a.id],
  )
  assert.deepEqual(banco.listarOrdens({ agenteId: 'ana', limite: 1 }).map((o) => o.id), [a.id])
  assert.deepEqual(banco.listarOrdens({ status: [] }), [])
  assert.deepEqual(banco.listarOrdens({ agenteId: 'ninguem' }), [])
})

test('filtra por continuação e pergunta pendente, e pagina o histórico pelo cursor', (t) => {
  const banco = abrirNaMemoria(t)
  const a = novaOrdem({ agenteId: 'ana', status: 'concluida', finalizadaEm: quando(300) })
  const b = novaOrdem({ agenteId: 'ana', status: 'concluida', finalizadaEm: quando(400), aguardaResposta: true })
  const c = novaOrdem({ agenteId: 'ana', status: 'cancelada', finalizadaEm: quando(400) })
  const d = novaOrdem({ agenteId: 'ana', status: 'erro', finalizadaEm: quando(500) })
  const e = novaOrdem({ agenteId: 'ana', status: 'na_fila', continuaDe: a.id })
  const f = novaOrdem({ agenteId: 'ana', status: 'concluida', continuaDe: a.id, finalizadaEm: quando(200), aguardaResposta: true })
  const g = novaOrdem({ agenteId: 'bia', status: 'concluida', finalizadaEm: quando(600), aguardaResposta: true })
  for (const ordem of [a, b, c, d, e, f, g]) banco.inserirOrdem(ordem)
  const ids = (filtro: Parameters<Banco['listarOrdens']>[0]) => banco.listarOrdens(filtro).map((o) => o.id)
  const historico = { agenteId: 'ana', status: ['concluida', 'erro', 'cancelada'], ordenarPor: 'finalizacao_desc' } as const

  assert.deepEqual(ids({ continuaDe: a.id }), [e.id, f.id])
  assert.deepEqual(ids({ continuaDe: a.id, status: ['na_fila', 'trabalhando', 'aguardando'] }), [e.id])
  assert.deepEqual(ids({ continuaDe: g.id }), [])
  assert.deepEqual(ids({ agenteId: 'ana', aguardaResposta: true, ordenarPor: 'finalizacao_desc' }), [b.id, f.id])
  assert.deepEqual(ids({ agenteId: 'ana', aguardaResposta: false }), [a.id, c.id, d.id, e.id])

  // Mesmo fim (b e c): a gravada depois conta como mais recente, igual na primeira página e no cursor.
  assert.deepEqual(ids(historico), [d.id, c.id, b.id, a.id, f.id])
  assert.deepEqual(ids({ ...historico, antesDe: d.id }), [c.id, b.id, a.id, f.id])
  assert.deepEqual(ids({ ...historico, antesDe: c.id }), [b.id, a.id, f.id])
  assert.deepEqual(ids({ ...historico, antesDe: c.id, limite: 1 }), [b.id])
  assert.deepEqual(ids({ ...historico, antesDe: b.id }), [a.id, f.id])
  assert.deepEqual(ids({ ...historico, antesDe: f.id }), [])
  assert.deepEqual(ids({ ...historico, antesDe: e.id }), [])
  assert.deepEqual(ids({ ...historico, antesDe: 'nao-existe' }), [])
})

test('conta as ordens do agente por status', (t) => {
  const banco = abrirNaMemoria(t)
  for (const ordem of [
    novaOrdem({ agenteId: 'ana', status: 'concluida' }),
    novaOrdem({ agenteId: 'ana', status: 'concluida' }),
    novaOrdem({ agenteId: 'ana', status: 'cancelada' }),
    novaOrdem({ agenteId: 'ana', status: 'na_fila' }),
    novaOrdem({ agenteId: 'bia', status: 'erro' }),
  ]) banco.inserirOrdem(ordem)

  assert.deepEqual(banco.contarOrdensPorStatus('ana'), { concluida: 2, cancelada: 1, na_fila: 1 })
  assert.deepEqual(banco.contarOrdensPorStatus('bia'), { erro: 1 })
  assert.deepEqual(banco.contarOrdensPorStatus('ninguem'), {})
})

test('a migração 2 cria os índices do fim e da pergunta, e as consultas do agente usam eles', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'escritorio-banco-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const caminho = join(dir, 'escritorio.db')
  const ordem = novaOrdem({ agenteId: 'ana', status: 'concluida', finalizadaEm: quando(10) })
  const criado = abrirBanco(caminho)
  criado.inserirOrdem(ordem)
  criado.fechar()
  const versao1 = new DatabaseSync(caminho)
  versao1.exec(`DROP TABLE reuniao_recados_para; DROP TABLE reuniao_recados; DROP TABLE reuniao_convocados;
    DROP TABLE reunioes; ALTER TABLE ordens DROP COLUMN recado;
    DROP INDEX ordens_por_fim; DROP INDEX ordens_com_pergunta;
    DROP TABLE vida_eventos; DROP TABLE falas; DROP TABLE vontades; DROP TABLE vida_agentes; DROP TABLE vida_config;
    PRAGMA user_version = 1`)
  versao1.close()

  const migrado = abrirBanco(caminho)
  assert.equal(migrado.obterOrdem(ordem.id)?.status, 'concluida')
  migrado.fechar()
  const bruto = new DatabaseSync(caminho)
  t.after(() => bruto.close())
  assert.equal(bruto.prepare('PRAGMA user_version').get()?.user_version, 4)
  const plano = (sql: string): string => bruto.prepare(`EXPLAIN QUERY PLAN ${sql}`).all({ agenteId: 'ana' })
    .map((linha) => String(linha.detail))
    .join(' | ')
  const ultima = plano(`SELECT * FROM ordens WHERE agente_id = :agenteId AND status IN ('concluida', 'erro', 'parada', 'interrompida')
    ORDER BY finalizada_em DESC, rowid DESC LIMIT 1`)
  assert.match(ultima, /USING INDEX ordens_por_fim \(agente_id=\?\)/)
  assert.doesNotMatch(ultima, /TEMP B-TREE/)
  const pergunta = plano(`SELECT * FROM ordens WHERE agente_id = :agenteId AND status IN ('concluida', 'erro', 'parada', 'interrompida')
    AND aguarda_resposta = 1 ORDER BY finalizada_em DESC, rowid DESC LIMIT 1`)
  assert.match(pergunta, /USING INDEX ordens_com_pergunta \(agente_id=\?\)/)
  assert.doesNotMatch(pergunta, /TEMP B-TREE/)
})

test('limpa aguardaResposta por agente ou por ordem e devolve só as que mudaram', (t) => {
  const banco = abrirNaMemoria(t)
  const a = novaOrdem({ agenteId: 'ana', status: 'concluida', aguardaResposta: true })
  const b = novaOrdem({ agenteId: 'ana', status: 'concluida', aguardaResposta: true })
  const c = novaOrdem({ agenteId: 'ana', status: 'concluida' })
  const d = novaOrdem({ agenteId: 'bia', status: 'concluida', aguardaResposta: true })
  for (const ordem of [a, b, c, d]) banco.inserirOrdem(ordem)

  assert.deepEqual(banco.limparAguardaResposta({ ordemId: a.id }).map((o) => o.id), [a.id])
  assert.deepEqual(banco.limparAguardaResposta({ ordemId: a.id }), [])
  const limpas = banco.limparAguardaResposta({ agenteId: 'ana' })
  assert.deepEqual(limpas.map((o) => [o.id, o.aguardaResposta]), [[b.id, false]])
  assert.equal(banco.obterOrdem(d.id)?.aguardaResposta, true)
})

test('interrompe as ordens que estavam rodando', (t) => {
  const banco = abrirNaMemoria(t)
  const trabalhando = novaOrdem({ status: 'trabalhando', atividade: 'Lendo', iniciadaEm: quando(10) })
  const aguardando = novaOrdem({ status: 'aguardando', iniciadaEm: quando(11) })
  const naFila = novaOrdem({ status: 'na_fila' })
  for (const ordem of [aguardando, trabalhando, naFila]) banco.inserirOrdem(ordem)

  const interrompidas = banco.interromperOrdensRodando('Reiniciou.', quando(500))
  assert.deepEqual(interrompidas.map((o) => o.id), [trabalhando.id, aguardando.id])
  for (const ordem of interrompidas) {
    assert.equal(ordem.status, 'interrompida')
    assert.equal(ordem.erro, 'Reiniciou.')
    assert.equal(ordem.finalizadaEm, quando(500))
    assert.equal(ordem.atividade, null)
  }
  assert.equal(banco.obterOrdem(naFila.id)?.status, 'na_fila')
  assert.deepEqual(banco.interromperOrdensRodando('De novo.', quando(600)), [])
})

test('cadeia de continuações nos dois sentidos', (t) => {
  const banco = abrirNaMemoria(t)
  const a = novaOrdem({ status: 'concluida' })
  const b = novaOrdem({ status: 'concluida', continuaDe: a.id })
  const c = novaOrdem({ status: 'na_fila', continuaDe: b.id })
  const d = novaOrdem({ status: 'na_fila', continuaDe: b.id })
  const solta = novaOrdem()
  for (const ordem of [a, b, c, d, solta]) banco.inserirOrdem(ordem)

  assert.deepEqual(banco.cadeiaDaOrdem(b.id).map((o) => o.id), [a.id, b.id, c.id, d.id])
  assert.deepEqual(banco.cadeiaDaOrdem(a.id).map((o) => o.id), [a.id, b.id, c.id, d.id])
  assert.deepEqual(banco.cadeiaDaOrdem(c.id).map((o) => o.id), [a.id, b.id, c.id])
  assert.deepEqual(banco.cadeiaDaOrdem(solta.id).map((o) => o.id), [solta.id])
  assert.deepEqual(banco.cadeiaDaOrdem('nao-existe'), [])
})

test('eventos ganham id crescente e a lista traz os últimos em ordem', (t) => {
  const banco = abrirNaMemoria(t)
  const ordem = novaOrdem()
  banco.inserirOrdem(ordem)
  const gravados = [1, 2, 3, 4, 5].map((n) => banco.inserirEvento({
    ordemId: ordem.id,
    tipo: 'ferramenta',
    texto: `Passo ${n}`,
    detalhe: n === 1 ? { nome: 'Read', entrada: { file_path: 'a.ts' } } : n === 2 ? undefined : null,
    criadoEm: quando(n),
  }))
  assert.deepEqual(gravados.map((e) => typeof e.id), ['number', 'number', 'number', 'number', 'number'])
  assert.ok(gravados.every((e, i) => i === 0 || e.id > (gravados[i - 1]?.id ?? 0)))
  assert.deepEqual(gravados[0]?.detalhe, { nome: 'Read', entrada: { file_path: 'a.ts' } })
  assert.equal(gravados[1]?.detalhe, null)
  assert.deepEqual(banco.listarEventos(ordem.id, 3).map((e) => e.texto), ['Passo 3', 'Passo 4', 'Passo 5'])
  assert.equal(banco.listarEventos(ordem.id, 100).length, 5)
  assert.deepEqual(banco.listarEventos('outra', 10), [])
})

test('pendências: grava, atualiza, lista, conta e fecha as abertas', (t) => {
  const banco = abrirNaMemoria(t)
  const ordem = novaOrdem({ agenteId: 'ana', status: 'aguardando' })
  const outra = novaOrdem({ agenteId: 'bia', status: 'aguardando' })
  banco.inserirOrdem(ordem)
  banco.inserirOrdem(outra)
  const p1 = novaPendencia(ordem, { permiteSempre: true, caminhoBloqueado: '/etc' })
  const p2 = novaPendencia(ordem, { tipo: 'pergunta', ferramenta: 'AskUserQuestion', entrada: { questions: [{ question: 'Qual?' }] } })
  const p3 = novaPendencia(outra)
  for (const pendencia of [p3, p2, p1]) banco.inserirPendencia(pendencia)

  assert.deepEqual(banco.obterPendencia(p1.id), p1)
  assert.deepEqual(banco.obterPendencia(p2.id)?.entrada, { questions: [{ question: 'Qual?' }] })
  assert.equal(banco.contarPendenciasAbertas(ordem.id), 2)
  assert.deepEqual(banco.listarPendencias({ agenteId: 'ana', status: 'aberta' }).map((p) => p.id), [p1.id, p2.id])
  assert.deepEqual(banco.listarPendencias().map((p) => p.id), [p1.id, p2.id, p3.id])

  const resposta = { decisao: 'responder' as const, respostas: { 'Qual?': 'Esta' } }
  const respondida = banco.atualizarPendencia(p2.id, { status: 'respondida', resposta, respondidaEm: quando(900) }, ['aberta'])
  assert.deepEqual(respondida?.resposta, resposta)
  assert.equal(banco.atualizarPendencia(p2.id, { status: 'cancelada' }, ['aberta']), null)
  assert.equal(banco.contarPendenciasAbertas(ordem.id), 1)

  assert.deepEqual(banco.fecharPendenciasAbertas('cancelada', ordem.id).map((p) => [p.id, p.status]), [[p1.id, 'cancelada']])
  assert.deepEqual(banco.fecharPendenciasAbertas('expirada').map((p) => [p.id, p.status]), [[p3.id, 'expirada']])
  assert.deepEqual(banco.listarPendencias({ status: 'aberta' }), [])
  assert.deepEqual(banco.listarPendencias({ ordemId: ordem.id }).map((p) => p.status), ['cancelada', 'respondida'])
})

test('tx desfaz tudo quando dá erro e aceita tx dentro de tx', (t) => {
  const banco = abrirNaMemoria(t)
  const ordem = novaOrdem()
  assert.throws(() => banco.tx(() => {
    banco.inserirOrdem(ordem)
    throw new Error('falhou no meio')
  }), /falhou no meio/)
  assert.equal(banco.obterOrdem(ordem.id), null)

  const valor = banco.tx(() => banco.tx(() => {
    banco.inserirOrdem(ordem)
    return 42
  }))
  assert.equal(valor, 42)
  assert.equal(banco.obterOrdem(ordem.id)?.id, ordem.id)
})

test('chaves estrangeiras e checagens protegem os dados', (t) => {
  const banco = abrirNaMemoria(t)
  assert.throws(() => banco.inserirEvento({ ordemId: 'fantasma', tipo: 'texto', texto: 'oi', detalhe: null, criadoEm: quando(1) }))
  assert.throws(() => banco.inserirOrdem(novaOrdem({ continuaDe: 'fantasma' })))
  assert.throws(() => banco.inserirPendencia(novaPendencia(novaOrdem())))
})

test('arquivo em WAL com versão do esquema e dados que sobrevivem ao reabrir', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'escritorio-banco-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const caminho = join(dir, 'escritorio.db')
  const ordem = novaOrdem({ status: 'trabalhando' })

  const primeiro = abrirBanco(caminho)
  primeiro.inserirOrdem(ordem)
  assert.equal(statSync(caminho).mode & 0o777, 0o600)
  assert.equal(statSync(`${caminho}-wal`).mode & 0o777, 0o600)
  primeiro.fechar()
  primeiro.fechar()

  const bruto = new DatabaseSync(caminho)
  assert.equal(bruto.prepare('PRAGMA journal_mode').get()?.journal_mode, 'wal')
  assert.equal(bruto.prepare('PRAGMA user_version').get()?.user_version, 4)
  const esquema = bruto.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' ORDER BY name`).all()
  assert.equal(esquema.length, 12)
  assert.ok(esquema.every((linha) => String(linha.sql).trimEnd().endsWith('STRICT')))
  bruto.close()

  const segundo = abrirBanco(caminho)
  assert.equal(segundo.obterOrdem(ordem.id)?.status, 'trabalhando')
  segundo.fechar()

  const futuro = new DatabaseSync(caminho)
  futuro.exec('PRAGMA user_version = 99')
  futuro.close()
  assert.throws(() => abrirBanco(caminho), /versão mais nova/)
})

test('a migração 3 cria as tabelas do modo Vida, o índice que impede duas pessoas na mesma vaga e a configuração', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'escritorio-banco-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const caminho = join(dir, 'escritorio.db')

  const banco = abrirBanco(caminho)
  assert.deepEqual(banco.lerVidaConfig(), {
    ligada: false,
    motivoPausa: null,
    ligadaEm: null,
    dia: null,
    custoUsdDoDia: 0,
    hora: null,
    decisoesNaHora: 0,
    proximaRodadaEm: null,
    atualizadaEm: '',
  })
  banco.fechar()

  const bruto = new DatabaseSync(caminho)
  t.after(() => bruto.close())
  assert.equal(bruto.prepare('PRAGMA user_version').get()?.user_version, 4)
  const tabelas = bruto.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .all()
    .map((linha) => String(linha.name))
  assert.deepEqual(tabelas, [
    'eventos', 'falas', 'ordens', 'pendencias', 'reuniao_convocados', 'reuniao_recados', 'reuniao_recados_para',
    'reunioes', 'vida_agentes', 'vida_config', 'vida_eventos', 'vontades',
  ])
  const indice = String(bruto.prepare(`SELECT sql FROM sqlite_master WHERE name = 'vida_uma_por_vaga'`).get()?.sql)
  assert.match(indice, /UNIQUE INDEX vida_uma_por_vaga ON vida_agentes \(vaga_id\) WHERE vaga_id IS NOT NULL/)
})

test('um banco que estava na versão 2 ganha as tabelas da vida sem perder as ordens que já tinha', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'escritorio-banco-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const caminho = join(dir, 'escritorio.db')
  const ordem = novaOrdem({ agenteId: 'ana', status: 'concluida', finalizadaEm: quando(10) })
  const criado = abrirBanco(caminho)
  criado.inserirOrdem(ordem)
  criado.fechar()
  const versao2 = new DatabaseSync(caminho)
  versao2.exec(`DROP TABLE reuniao_recados_para; DROP TABLE reuniao_recados; DROP TABLE reuniao_convocados;
    DROP TABLE reunioes; ALTER TABLE ordens DROP COLUMN recado;
    DROP TABLE vida_eventos; DROP TABLE falas; DROP TABLE vontades; DROP TABLE vida_agentes;
    DROP TABLE vida_config; PRAGMA user_version = 2`)
  versao2.close()

  const migrado = abrirBanco(caminho)
  t.after(() => migrado.fechar())
  assert.equal(migrado.obterOrdem(ordem.id)?.status, 'concluida')
  assert.equal(migrado.lerVidaConfig().ligada, false)
  assert.deepEqual(migrado.listarVidaAgentes(), [])
})

test('a vaga é lugar de uma pessoa só: o segundo a reservar recebe false, fica sem vaga e desce a escada no mesmo tx', (t) => {
  const banco = abrirNaMemoria(t)
  banco.salvarVidaAgente(novaVidaDeAgente('ana', { estado: 'escolhendo' }))
  banco.salvarVidaAgente(novaVidaDeAgente('bia', { estado: 'escolhendo' }))

  assert.equal(banco.reservarVaga('ana', 'lazer:4'), true)
  assert.equal(banco.reservarVaga('bia', 'lazer:4'), false)
  assert.equal(banco.obterVidaAgente('bia')?.vagaId, null)
  assert.equal(banco.obterVidaAgente('ana')?.vagaId, 'lazer:4')
  assert.deepEqual(banco.vagasOcupadas(), new Map([['lazer:4', 'ana']]))

  const desceu = banco.tx(() => {
    if (banco.reservarVaga('bia', 'lazer:4')) return 'lazer:4'
    return banco.reservarVaga('bia', 'lazer:5') ? 'lazer:5' : 'nenhuma'
  })
  assert.equal(desceu, 'lazer:5')
  assert.deepEqual(banco.vagasOcupadas(), new Map([['lazer:4', 'ana'], ['lazer:5', 'bia']]))
})

test('quem não está escolhendo não reserva vaga, e soltar devolve a vaga ao mundo', (t) => {
  const banco = abrirNaMemoria(t)
  banco.salvarVidaAgente(novaVidaDeAgente('ana', { estado: 'ocioso' }))
  assert.equal(banco.reservarVaga('ana', 'mesa:0:sentado'), false)
  assert.equal(banco.reservarVaga('fantasma', 'mesa:0:sentado'), false)
  assert.equal(banco.obterVidaAgente('ana')?.vagaId, null)
  assert.equal(banco.obterVidaAgente('fantasma'), null)

  banco.atualizarVidaAgente('ana', { estado: 'escolhendo' })
  assert.equal(banco.reservarVaga('ana', 'mesa:0:sentado'), true)
  banco.soltarVagas({ agenteId: 'bia' })
  assert.deepEqual(banco.vagasOcupadas(), new Map([['mesa:0:sentado', 'ana']]))
  banco.soltarVagas({ agenteId: 'ana' })
  assert.deepEqual(banco.vagasOcupadas(), new Map())

  banco.atualizarVidaAgente('ana', { estado: 'escolhendo' })
  assert.equal(banco.reservarVaga('ana', 'lazer:7'), true)
  banco.soltarVagas('todas')
  assert.deepEqual(banco.vagasOcupadas(), new Map())
})

test('a guarda de estado faz o tique ser idempotente: quem já avançou não é avançado de novo', (t) => {
  const banco = abrirNaMemoria(t)
  banco.salvarVidaAgente(novaVidaDeAgente('ana', { estado: 'indo', chegaEm: quando(30), vagaId: 'lazer:1' }))
  banco.salvarVidaAgente(novaVidaDeAgente('bia', { estado: 'ocupado', ate: quando(90) }))

  const chegou = banco.atualizarVidaAgente('ana', { estado: 'ocupado', chegaEm: null, ate: quando(200) }, ['indo'])
  assert.equal(chegou?.estado, 'ocupado')
  assert.equal(chegou?.chegaEm, null)
  assert.equal(chegou?.vagaId, 'lazer:1')
  assert.equal(banco.atualizarVidaAgente('ana', { estado: 'ocupado', ate: quando(400) }, ['indo']), null)
  assert.equal(banco.obterVidaAgente('ana')?.ate, quando(200))

  assert.equal(banco.atualizarVidaAgente('bia', { estado: 'ocioso' }, ['indo']), null)
  assert.equal(banco.obterVidaAgente('bia')?.estado, 'ocupado')
  assert.equal(banco.atualizarVidaAgente('bia', { estado: 'ocioso' }, []), null)
  assert.equal(banco.atualizarVidaAgente('fantasma', { estado: 'ocioso' }), null)
  assert.deepEqual(banco.atualizarVidaAgente('bia', {}), banco.obterVidaAgente('bia'))
  assert.equal(banco.atualizarVidaAgente('bia', {}, ['indo']), null)
  // Nem com o campo na mão: a linha nunca troca de dono.
  assert.equal(banco.atualizarVidaAgente('bia', { agenteId: 'outra', violacoes: 2 })?.agenteId, 'bia')
  assert.equal(banco.obterVidaAgente('bia')?.violacoes, 2)
})

test('gravar a vida do agente de novo troca a linha dele e nunca expulsa quem estava na vaga', (t) => {
  const banco = abrirNaMemoria(t)
  banco.salvarVidaAgente(novaVidaDeAgente('ana', { estado: 'escolhendo' }))
  assert.equal(banco.reservarVaga('ana', 'lazer:0'), true)

  banco.salvarVidaAgente(novaVidaDeAgente('ana', {
    estado: 'ocupado',
    vagaId: 'lazer:0',
    verbo: 'usar',
    objetoId: 'tv',
    comodoId: 'lazer',
    ate: quando(99),
  }))
  assert.equal(banco.listarVidaAgentes().length, 1)
  assert.equal(banco.obterVidaAgente('ana')?.verbo, 'usar')

  assert.throws(() => banco.salvarVidaAgente(novaVidaDeAgente('bia', { vagaId: 'lazer:0' })), /UNIQUE/)
  assert.equal(banco.obterVidaAgente('ana')?.vagaId, 'lazer:0')
  assert.equal(banco.obterVidaAgente('bia'), null)

  banco.salvarVidaAgente(novaVidaDeAgente('bia', { estado: 'indo', chegaEm: quando(40) }))
  assert.deepEqual(banco.listarVidaAgentes().map((linha) => linha.agenteId), ['ana', 'bia'])
  assert.deepEqual(banco.listarVidaAgentes(['ocupado']).map((linha) => linha.agenteId), ['ana'])
  assert.deepEqual(banco.listarVidaAgentes(['indo', 'ocupado']).map((linha) => linha.agenteId), ['ana', 'bia'])
  assert.deepEqual(banco.listarVidaAgentes(['oficinando']), [])
  assert.deepEqual(banco.listarVidaAgentes([]), [])
})

test('a configuração da vida é uma linha só, e gravar campo nenhum devolve o que está gravado', (t) => {
  const banco = abrirNaMemoria(t)
  const ligada = banco.gravarVidaConfig({
    ligada: true,
    ligadaEm: quando(5),
    dia: '2026-10-29',
    custoUsdDoDia: 0.0071,
    hora: '2026-10-29T10',
    decisoesNaHora: 23,
    proximaRodadaEm: quando(30),
    atualizadaEm: quando(5),
  })
  assert.equal(ligada.ligada, true)
  assert.equal(ligada.custoUsdDoDia, 0.0071)
  assert.equal(ligada.decisoesNaHora, 23)
  assert.deepEqual(banco.lerVidaConfig(), ligada)

  const pausada = banco.gravarVidaConfig({ motivoPausa: 'teto_custo' })
  assert.equal(pausada.motivoPausa, 'teto_custo')
  assert.equal(pausada.ligada, true)
  assert.deepEqual(banco.gravarVidaConfig({}), pausada)

  const desligada = banco.gravarVidaConfig({ ligada: false, motivoPausa: null, ligadaEm: null })
  assert.equal(desligada.ligada, false)
  assert.equal(desligada.motivoPausa, null)
  assert.equal(desligada.ligadaEm, null)
  assert.equal(desligada.custoUsdDoDia, 0.0071)
})

test('vontades ganham id crescente e a lista vem da mais nova para a mais velha', (t) => {
  const banco = abrirNaMemoria(t)
  const primeira = banco.inserirVontade(novaVontade({ agenteId: 'ana' }))
  const segunda = banco.inserirVontade(novaVontade({
    agenteId: 'ana',
    verbo: 'conversar',
    objetoId: null,
    comId: 'bia',
    assunto: 'o café que acabou',
    aceita: false,
    recusa: 'vaga_ocupada',
  }))
  const terceira = banco.inserirVontade(novaVontade({ agenteId: 'bia', lote: 'lote-2', custoUsd: 0.0002 }))
  assert.ok(segunda.id > primeira.id && terceira.id > segunda.id)
  assert.equal(primeira.aceita, true)
  assert.equal(primeira.recusa, null)
  assert.equal(segunda.aceita, false)
  assert.equal(segunda.assunto, 'o café que acabou')
  assert.equal(terceira.custoUsd, 0.0002)

  const terminada = banco.atualizarVontade(primeira.id, { terminadaEm: quando(99), custoUsd: 0.0003 })
  assert.equal(terminada?.terminadaEm, quando(99))
  assert.equal(terminada?.custoUsd, 0.0003)
  assert.equal(banco.atualizarVontade(9999, { recusa: 'tarde' }), null)

  const ids = (filtro: Parameters<Banco['listarVontades']>[0]) => banco.listarVontades(filtro).map((v) => v.id)
  assert.deepEqual(ids({}), [terceira.id, segunda.id, primeira.id])
  assert.deepEqual(ids({ agenteId: 'ana' }), [segunda.id, primeira.id])
  assert.deepEqual(ids({ agenteId: 'ana', limite: 1 }), [segunda.id])
  assert.deepEqual(ids({ lote: 'lote-1' }), [segunda.id, primeira.id])
  assert.deepEqual(ids({ lote: 'lote-2', agenteId: 'bia' }), [terceira.id])
  assert.deepEqual(ids({ agenteId: 'ninguem' }), [])
})

test('as falas só saem na hora marcada, e marcá-las como emitidas as tira da fila', (t) => {
  const banco = abrirNaMemoria(t)
  const vontade = banco.inserirVontade(novaVontade({ verbo: 'conversar', objetoId: null, comId: 'bia' }))
  const gravadas = banco.inserirFalas([
    { agenteId: 'ana', paraId: 'bia', texto: 'Vai de café?', ditaEm: quando(10), vontadeId: vontade.id },
    { agenteId: 'bia', paraId: 'ana', texto: 'Vou.', ditaEm: quando(14), vontadeId: vontade.id },
    { agenteId: 'ana', paraId: 'bia', texto: 'Então vem.', ditaEm: quando(18), vontadeId: vontade.id },
  ])
  assert.deepEqual(gravadas.map((fala) => fala.texto), ['Vai de café?', 'Vou.', 'Então vem.'])
  // A fala que a tela recebe não carrega as colunas de controle do tique.
  assert.deepEqual(Object.keys(gravadas[0] ?? {}), ['id', 'agenteId', 'paraId', 'texto', 'ditaEm'])
  assert.deepEqual(banco.inserirFalas([]), [])

  assert.deepEqual(banco.falasADizer(quando(14)).map((fala) => fala.texto), ['Vai de café?', 'Vou.'])
  banco.marcarFalasEmitidas(banco.falasADizer(quando(14)).map((fala) => fala.id))
  assert.deepEqual(banco.falasADizer(quando(14)), [])
  banco.marcarFalasEmitidas([])
  assert.deepEqual(banco.falasADizer(quando(99)).map((fala) => fala.texto), ['Então vem.'])
  assert.deepEqual(banco.listarFalas(10).map((fala) => fala.texto), ['Vai de café?', 'Vou.'])
  assert.deepEqual(banco.listarFalas(1).map((fala) => fala.texto), ['Vou.'])

  // Conversa abortada: o que faltava dizer desaparece, o que já foi dito continua no histórico.
  banco.apagarFalasDaVontade(vontade.id)
  assert.deepEqual(banco.falasADizer(quando(9999)), [])
  assert.deepEqual(banco.listarFalas(10).map((fala) => fala.texto), ['Vai de café?', 'Vou.'])
})

test('os eventos da vida paginam por id e não precisam de nenhuma ordem para existir', (t) => {
  const banco = abrirNaMemoria(t)
  // O histórico de ordens tem chave estrangeira; o da vida, de propósito, não tem.
  assert.throws(() => banco.inserirEvento({ ordemId: 'fantasma', tipo: 'texto', texto: 'oi', detalhe: null, criadoEm: quando(1) }))
  const gravados = [1, 2, 3, 4, 5].map((n) => banco.inserirVidaEvento({
    agenteId: 'agente-sem-ordem-nenhuma',
    tipo: n === 1 ? 'sistema' : 'decisao',
    texto: `Passo ${n}`,
    criadoEm: quando(n),
  }))
  assert.ok(gravados.every((evento, i) => i === 0 || evento.id > (gravados[i - 1]?.id ?? 0)))
  assert.equal(gravados[0]?.tipo, 'sistema')

  const textos = (desde: number | null, limite: number) => banco.listarVidaEventos(desde, limite).map((e) => e.texto)
  assert.deepEqual(textos(null, 3), ['Passo 3', 'Passo 4', 'Passo 5'])
  assert.deepEqual(textos(null, 99), ['Passo 1', 'Passo 2', 'Passo 3', 'Passo 4', 'Passo 5'])
  assert.deepEqual(textos(gravados[1]?.id ?? 0, 10), ['Passo 3', 'Passo 4', 'Passo 5'])
  assert.deepEqual(textos(gravados[1]?.id ?? 0, 2), ['Passo 3', 'Passo 4'])
  assert.deepEqual(textos(gravados[4]?.id ?? 0, 10), [])
  assert.deepEqual(textos(0, 2), ['Passo 1', 'Passo 2'])
  assert.deepEqual(textos(null, 0), [])
})

test('desligar a vida não deixa lixo, e não toca no histórico do que o humano mandou', (t) => {
  const banco = abrirNaMemoria(t)
  const ordem = novaOrdem({ status: 'concluida' })
  banco.inserirOrdem(ordem)
  const evento = banco.inserirEvento({ ordemId: ordem.id, tipo: 'texto', texto: 'Pronto.', detalhe: null, criadoEm: quando(1) })
  banco.salvarVidaAgente(novaVidaDeAgente('ana', { estado: 'escolhendo' }))
  banco.salvarVidaAgente(novaVidaDeAgente('bia', { estado: 'ocioso' }))
  assert.equal(banco.reservarVaga('ana', 'lazer:2'), true)
  const aberta = banco.inserirVontade(novaVontade({ agenteId: 'ana' }))
  const fechada = banco.inserirVontade(novaVontade({ agenteId: 'bia', terminadaEm: quando(20) }))
  const [dita] = banco.inserirFalas([
    { agenteId: 'ana', paraId: null, texto: 'Já disse.', ditaEm: quando(5) },
    { agenteId: 'ana', paraId: null, texto: 'Ia dizer.', ditaEm: quando(500), vontadeId: aberta.id },
  ])
  banco.marcarFalasEmitidas([dita?.id ?? 0])

  banco.limparVida(quando(600))

  assert.deepEqual(banco.listarVidaAgentes(), [])
  assert.equal(banco.obterVidaAgente('ana'), null)
  assert.deepEqual(banco.vagasOcupadas(), new Map())
  assert.deepEqual(banco.falasADizer(quando(9999)), [])
  assert.deepEqual(banco.listarFalas(10).map((fala) => fala.texto), ['Já disse.'])
  assert.deepEqual(
    banco.listarVontades().map((v) => [v.id, v.recusa, v.terminadaEm]),
    [[fechada.id, null, quando(20)], [aberta.id, 'desligado', quando(600)]],
  )
  assert.equal(banco.obterOrdem(ordem.id)?.status, 'concluida')
  assert.deepEqual(banco.listarEventos(ordem.id, 10).map((e) => e.id), [evento.id])
  assert.equal(banco.lerVidaConfig().ligada, false)

  // E é idempotente: desligar de novo não remarca o que já estava fechado.
  banco.limparVida(quando(700))
  assert.deepEqual(banco.listarVontades().map((v) => v.terminadaEm), [quando(20), quando(600)])
})

test('a sala de reunião: uma aberta por vez, uma cadeira por pessoa e o recado consumido uma vez só', (t) => {
  const banco = abrirNaMemoria(t)
  assert.equal(banco.reuniaoAberta(), null)
  const reuniao = banco.abrirReuniao('reu-1', quando(1))
  assert.deepEqual(banco.reuniaoAberta(), { id: 'reu-1', aberta: true, abertaEm: quando(1), encerradaEm: null })
  assert.throws(() => banco.abrirReuniao('reu-2', quando(2)), /UNIQUE|constraint/i)

  assert.equal(banco.convocar(reuniao.id, 'ana', 'reuniao:0', quando(3)), true)
  // O mesmo agente de novo, ou outro na mesma cadeira: falha fechada, sem lançar.
  assert.equal(banco.convocar(reuniao.id, 'ana', 'reuniao:1', quando(4)), false)
  assert.equal(banco.convocar(reuniao.id, 'bia', 'reuniao:0', quando(4)), false)
  assert.equal(banco.convocar(reuniao.id, 'bia', 'reuniao:1', quando(5)), true)
  assert.deepEqual(banco.convocados(reuniao.id), [
    { agenteId: 'ana', vagaId: 'reuniao:0', desde: quando(3) },
    { agenteId: 'bia', vagaId: 'reuniao:1', desde: quando(5) },
  ])

  const recado = banco.inserirRecado(reuniao.id, 'Teste em todo PR.', quando(6))
  assert.deepEqual(recado.paraIds, ['ana', 'bia'])
  // Quem saiu antes do recado não leva nada; quem entrou depois também não.
  assert.equal(banco.dispensar(reuniao.id, 'bia'), true)
  assert.equal(banco.dispensar(reuniao.id, 'bia'), false)
  banco.convocar(reuniao.id, 'cris', 'reuniao:2', quando(7))
  assert.equal(banco.tomarRecado('cris', quando(8)), null)

  assert.equal(banco.tomarRecado('ana', quando(8)), 'Teste em todo PR.')
  assert.equal(banco.tomarRecado('ana', quando(9)), null, 'o recado foi consumido duas vezes')
  // Quem já tinha saído continua com o recado guardado: ele estava na sala quando foi dado.
  assert.equal(banco.tomarRecado('bia', quando(9)), 'Teste em todo PR.')

  // Dois recados pendentes: vale o mais novo, e o velho não volta depois.
  banco.inserirRecado(reuniao.id, 'Primeiro.', quando(10))
  banco.inserirRecado(reuniao.id, 'Segundo.', quando(11))
  assert.equal(banco.tomarRecado('ana', quando(12)), 'Segundo.')
  assert.equal(banco.tomarRecado('ana', quando(13)), null)

  assert.deepEqual(banco.recadosDaReuniao(reuniao.id, 10).map((item) => item.texto), ['Teste em todo PR.', 'Primeiro.', 'Segundo.'])
  assert.deepEqual(banco.recadosDaReuniao(reuniao.id, 2).map((item) => item.texto), ['Primeiro.', 'Segundo.'])

  // Encerrar esvazia a mesa, libera a sala para outra reunião e guarda o histórico dos recados.
  banco.encerrarReuniao(reuniao.id, quando(14))
  assert.equal(banco.reuniaoAberta(), null)
  assert.deepEqual(banco.convocados(reuniao.id), [])
  assert.equal(banco.recadosDaReuniao(reuniao.id, 10).length, 3)
  assert.equal(banco.abrirReuniao('reu-2', quando(15)).id, 'reu-2')
})

test('o recado da reunião fica gravado na ordem', (t) => {
  const banco = abrirNaMemoria(t)
  const sem = novaOrdem()
  const com = novaOrdem({ recado: 'Combinamos na reunião: nada em produção sem avisar.' })
  banco.inserirOrdem(sem)
  banco.inserirOrdem(com)
  assert.equal(banco.obterOrdem(sem.id)?.recado, null)
  assert.equal(banco.obterOrdem(com.id)?.recado, 'Combinamos na reunião: nada em produção sem avisar.')
})
