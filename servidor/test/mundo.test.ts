import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MUNDO_VAGAS_COPA,
  MUNDO_VAGAS_LAZER,
  MUNDO_VAGAS_REUNIAO,
  catalogoParaPrompt,
  esquemaDasDecisoes,
  estimarCaminhadaMs,
  mesasDoMundo,
  montarMundo,
  objetoDaVaga,
  vagasDoMundo,
  vagasLivres,
  validarDecisao,
  verboDoMundo,
} from '../src/mundo.ts'
import type { Mundo, SituacaoDoAgente, SituacaoDoEscritorio } from '../src/tipos.ts'

const MUNDO = montarMundo(8)
const VAZIO: ReadonlySet<string> = new Set()

function noLote(agenteId: string, ajustes: Partial<SituacaoDoAgente> = {}): SituacaoDoAgente {
  return {
    agenteId,
    apelido: agenteId,
    estado: 'ocioso',
    vagaId: null,
    verbo: null,
    desdeMs: 60_000,
    verbosPermitidos: ['ir_para', 'usar', 'conversar', 'programar', 'nada'],
    ultimas: [],
    ...ajustes,
  }
}

function situacao(lote: SituacaoDoAgente[]): SituacaoDoEscritorio {
  return { instante: '2026-10-31T12:00:00.000Z', vagasLivres: [], presentes: [], ocupadosComOHumano: [], lote }
}

const recusaDe = (resultado: ReturnType<typeof validarDecisao>) => ('recusa' in resultado ? resultado.recusa : null)

describe('vagas do mundo', () => {
  it('o escritório nasce com 8 mesas e cresce de quatro em quatro', () => {
    assert.equal(mesasDoMundo(0), 8)
    assert.equal(mesasDoMundo(5), 8)
    assert.equal(mesasDoMundo(8), 8)
    assert.equal(mesasDoMundo(9), 12)
    assert.equal(mesasDoMundo(13), 16)
    assert.equal(vagasDoMundo(13).filter((vaga) => vaga.objetoId === 'mesa').length, 32)
  })

  it('o id de toda vaga é a chave de lugar que a cena entende', () => {
    for (const vaga of vagasDoMundo(10)) assert.match(vaga.id, /^(mesa:\d+:(sentado|empe)|lazer:\d+|reuniao:\d+)$/, vaga.id)
  })

  it('a sala de reunião tem as sete cadeiras da convocação, todas reservadas ao humano', () => {
    const cadeiras = vagasDoMundo(8).filter((vaga) => vaga.comodoId === 'reuniao')
    assert.equal(cadeiras.length, MUNDO_VAGAS_REUNIAO)
    assert.deepEqual(cadeiras.map((vaga) => vaga.id), Array.from({ length: MUNDO_VAGAS_REUNIAO }, (_, i) => `reuniao:${i}`))
    assert.ok(cadeiras.every((vaga) => vaga.soPorConvocacao === true && vaga.objetoId === 'mesaDeReuniao'))
    // O cômodo é andável (a cena sabe levar o boneco até lá), mas ninguém se convida.
    assert.equal(MUNDO.comodos.find((comodo) => comodo.id === 'reuniao')?.andavel, true)
  })

  it('o lazer tem os oito lugares sentados e os seis da copa', () => {
    const lazer = vagasDoMundo(8).filter((vaga) => vaga.comodoId === 'lazer')
    assert.equal(lazer.length, MUNDO_VAGAS_LAZER + MUNDO_VAGAS_COPA)
    assert.equal(lazer.filter((vaga) => vaga.objetoId === 'copa').length, MUNDO_VAGAS_COPA)
    assert.equal(lazer.filter((vaga) => vaga.objetoId === 'tv').length, 4)
    assert.equal(objetoDaVaga(MUNDO, 'lazer:7')?.id, 'fliperama')
  })
})

describe('vagasLivres', () => {
  it('não oferece as cadeiras que o humano reserva para a convocação da reunião', () => {
    assert.ok(MUNDO.vagas.some((vaga) => vaga.soPorConvocacao), 'o catálogo precisa de uma vaga reservada para este teste')
    for (const vaga of vagasLivres(MUNDO, VAZIO)) assert.notEqual(vaga.comodoId, 'reuniao')
    assert.deepEqual(vagasLivres(MUNDO, VAZIO, { objetoId: 'mesaDeReuniao' }), [])
  })

  it('tira as ocupadas e respeita o filtro de verbo, de cômodo e de objeto', () => {
    const ocupadas = new Set(['lazer:0', 'lazer:3'])
    const livres = vagasLivres(MUNDO, ocupadas, { objetoId: 'tv' }).map((vaga) => vaga.id)
    assert.deepEqual(livres, ['lazer:4', 'lazer:5'])
    assert.ok(vagasLivres(MUNDO, VAZIO, { comodoId: 'escritorio' }).every((vaga) => vaga.id.startsWith('mesa:')))
    assert.ok(vagasLivres(MUNDO, VAZIO, { verbo: 'programar' }).every((vaga) => vaga.objetoId === 'mesa'))
  })
})

describe('validarDecisao', () => {
  const comDois = situacao([noLote('ana'), noLote('bruno')])

  it('aceita uma vontade boa e completa o que falta', () => {
    const decisao = validarDecisao(MUNDO, comDois, { agenteId: 'ana', verbo: 'usar', objetoId: 'fliperama', motivo: 'quero jogar' }, VAZIO)
    assert.ok(!('recusa' in decisao))
    assert.equal(decisao.vagaId, 'lazer:7')
    assert.equal(decisao.objetoId, 'fliperama')
    assert.ok(decisao.duracaoMs >= verboDoMundo(MUNDO, 'usar')!.duracaoMs[0])
    assert.ok(decisao.duracaoMs <= verboDoMundo(MUNDO, 'usar')!.duracaoMs[1])
  })

  it('recusa cada jeito de estar errado, com o motivo certo', () => {
    const casos: Array<[Record<string, unknown>, string]> = [
      [{ agenteId: 'ninguem', verbo: 'nada', motivo: 'x' }, 'agente_fora_do_lote'],
      [{ agenteId: 'ana', verbo: 'voar', motivo: 'x' }, 'verbo_desconhecido'],
      [{ agenteId: 'ana', verbo: 'usar', objetoId: 'elefante', motivo: 'x' }, 'objeto_desconhecido'],
      [{ agenteId: 'ana', verbo: 'programar', objetoId: 'fliperama', tarefa: 'algo', motivo: 'x' }, 'objeto_nao_aceita_o_verbo'],
      [{ agenteId: 'ana', verbo: 'usar', objetoId: 'tv', vagaId: 'lazer:7', motivo: 'x' }, 'vaga_de_outro_objeto'],
      [{ agenteId: 'ana', verbo: 'usar', vagaId: 'lazer:99', motivo: 'x' }, 'vaga_desconhecida'],
      [{ agenteId: 'ana', verbo: 'usar', objetoId: 'tv', motivo: 'x' }, 'objeto_lotado'],
      [{ agenteId: 'ana', verbo: 'programar', objetoId: 'mesa', motivo: 'x' }, 'sem_tarefa'],
      [{ agenteId: 'ana', verbo: 'conversar', objetoId: 'copa', comId: 'ana', motivo: 'x' }, 'parceiro_invalido'],
      [{ agenteId: 'ana', verbo: 'conversar', objetoId: 'copa', comId: 'ninguem', motivo: 'x' }, 'parceiro_invalido'],
      [{ agenteId: 'ana', verbo: 'usar', motivo: 'x' }, 'sem_alvo'],
    ]
    const lotado = new Set(MUNDO.vagas.filter((vaga) => vaga.objetoId === 'tv').map((vaga) => vaga.id))
    for (const [bruta, esperada] of casos) {
      const ocupadas = esperada === 'objeto_lotado' ? lotado : VAZIO
      assert.equal(recusaDe(validarDecisao(MUNDO, comDois, bruta, ocupadas)), esperada, JSON.stringify(bruta))
    }
  })

  it('recusa vaga ocupada e parceiro que já não está à toa', () => {
    assert.equal(recusaDe(validarDecisao(MUNDO, comDois, { agenteId: 'ana', verbo: 'usar', vagaId: 'lazer:7', motivo: 'x' }, new Set(['lazer:7']))), 'vaga_ocupada')
    const bruno = situacao([noLote('ana'), noLote('bruno', { estado: 'indo' })])
    assert.equal(recusaDe(validarDecisao(MUNDO, bruno, { agenteId: 'ana', verbo: 'conversar', objetoId: 'copa', comId: 'bruno', motivo: 'x' }, VAZIO)), 'parceiro_ocupado')
  })

  it('o verbo que o agente não pode querer agora é recusado', () => {
    const sem = situacao([noLote('ana', { verbosPermitidos: ['nada'] })])
    assert.equal(recusaDe(validarDecisao(MUNDO, sem, { agenteId: 'ana', verbo: 'programar', objetoId: 'mesa', tarefa: 'algo', motivo: 'x' }, VAZIO)), 'verbo_nao_permitido')
  })

  it('a duração fica dentro do que o verbo permite e as falas são limitadas às duas vozes', () => {
    const curta = validarDecisao(MUNDO, comDois, { agenteId: 'ana', verbo: 'usar', objetoId: 'copa', duracaoSegundos: 1, motivo: 'x' }, VAZIO)
    assert.ok(!('recusa' in curta) && curta.duracaoMs === verboDoMundo(MUNDO, 'usar')!.duracaoMs[0])
    const longa = validarDecisao(MUNDO, comDois, { agenteId: 'ana', verbo: 'usar', objetoId: 'copa', duracaoSegundos: 99_999, motivo: 'x' }, VAZIO)
    assert.ok(!('recusa' in longa) && longa.duracaoMs === verboDoMundo(MUNDO, 'usar')!.duracaoMs[1])
    const conversa = validarDecisao(MUNDO, comDois, {
      agenteId: 'ana',
      verbo: 'conversar',
      objetoId: 'copa',
      comId: 'bruno',
      motivo: 'x',
      falas: [
        { agenteId: 'ana', texto: 'oi' },
        { agenteId: 'bruno', texto: 'oi!' },
        { agenteId: 'estranho', texto: 'eu também' },
        { agenteId: 'ana', texto: 'tchau' },
        { agenteId: 'ana', texto: 'sobrando' },
      ],
    }, VAZIO)
    assert.ok(!('recusa' in conversa))
    assert.deepEqual(conversa.falas.map((fala) => fala.agenteId), ['ana', 'bruno', 'ana'])
    assert.ok(conversa.falas[1]!.emMs > conversa.falas[0]!.emMs)
  })
})

describe('esquemaDasDecisoes e catalogoParaPrompt', () => {
  it('o esquema só deixa escolher verbo, objeto e vaga que existem, e nenhum cômodo fechado', () => {
    const esquema = esquemaDasDecisoes(MUNDO) as any
    const item = esquema.properties.decisoes.items.properties
    assert.deepEqual(item.verbo.enum, MUNDO.verbos.map((verbo) => verbo.id))
    assert.deepEqual(item.objetoId.enum, [...MUNDO.objetos.map((objeto) => objeto.id), null])
    assert.ok(!item.vagaId.enum.some((id: string | null) => id?.startsWith('reuniao:')))
    assert.ok(item.vagaId.enum.includes('mesa:0:sentado') && item.vagaId.enum.includes('lazer:7'))
  })

  it('o texto do catálogo mostra os objetos e os verbos, e esconde o cômodo fechado', () => {
    const texto = catalogoParaPrompt(MUNDO)
    for (const objeto of ['Fliperama', 'Copa', 'Mesa de trabalho']) assert.ok(texto.includes(objeto), objeto)
    for (const verbo of MUNDO.verbos) assert.ok(texto.includes(verbo.id), verbo.id)
    assert.ok(!texto.includes('Sala de reunião'))
  })
})

describe('estimarCaminhadaMs', () => {
  it('fica dentro do razoável e é maior quando o caminho é maior', () => {
    const perto = estimarCaminhadaMs(MUNDO, 'lazer:0', 'lazer:5')
    const longe = estimarCaminhadaMs(MUNDO, 'mesa:3:sentado', 'lazer:10')
    for (const ms of [perto, longe]) assert.ok(ms >= 900 && ms <= 9000, String(ms))
    assert.ok(longe > perto)
    assert.equal(estimarCaminhadaMs(MUNDO, null, 'lazer:0') > 0, true)
  })
})

describe('o motor não conhece o escritório: um mundo inventado funciona igual', () => {
  const laboratorio: Mundo = {
    comodos: [{ id: 'laboratorio', nome: 'Laboratório', descricao: 'Tem uma impressora 3D.', andavel: true }],
    objetos: [{ id: 'impressora3d', comodoId: 'laboratorio', nome: 'Impressora 3D', descricao: 'Imprime peças.', acao: 'fazendo alguma coisa', verbos: ['imprimir'], vagas: ['lab:0', 'lab:1'] }],
    vagas: [
      { id: 'lab:0', comodoId: 'laboratorio', objetoId: 'impressora3d', nome: 'Na frente da impressora', pose: 'empe' },
      { id: 'lab:1', comodoId: 'laboratorio', objetoId: 'impressora3d', nome: 'Do lado da impressora', pose: 'empe' },
    ],
    verbos: [{ id: 'imprimir', rotulo: 'imprimindo', descricao: 'Imprimir uma peça.', alvo: 'objeto', duracaoMs: [1000, 5000], reservaAlvo: true, precisaAgente: false, precisaSandbox: false }],
  }

  it('oferece as vagas, valida a decisão e monta o esquema sem uma linha nova', () => {
    assert.deepEqual(vagasLivres(laboratorio, new Set(['lab:0'])).map((vaga) => vaga.id), ['lab:1'])
    const lote = situacao([noLote('ana', { verbosPermitidos: ['imprimir'] })])
    const decisao = validarDecisao(laboratorio, lote, { agenteId: 'ana', verbo: 'imprimir', objetoId: 'impressora3d', motivo: 'quero uma peça' }, new Set(['lab:0']))
    assert.ok(!('recusa' in decisao))
    assert.equal(decisao.vagaId, 'lab:1')
    const esquema = esquemaDasDecisoes(laboratorio) as any
    assert.deepEqual(esquema.properties.decisoes.items.properties.verbo.enum, ['imprimir'])
    assert.ok(catalogoParaPrompt(laboratorio).includes('Impressora 3D'))
  })
})
