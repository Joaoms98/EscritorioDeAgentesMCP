import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { comOrdem, continuacaoNaFila, juntarHistorico } from '../src/utils/ordens.js'

const ordem = (id, finalizadaEm, extra = {}) => ({ id, finalizadaEm, status: 'concluida', ...extra })

describe('juntarHistorico', () => {
  it('sem páginas antigas devolve a primeira página como veio', () => {
    const recentes = [ordem('b', '2026-10-29T10:00:00.000Z')]
    assert.equal(juntarHistorico(recentes, []), recentes)
  })

  it('junta as páginas na ordem do servidor: finalizadaEm e depois id, decrescentes', () => {
    const recentes = [ordem('c', '2026-10-29T12:00:00.000Z'), ordem('b', '2026-10-29T11:00:00.000Z')]
    const antigas = [ordem('a2', '2026-10-29T10:00:00.000Z'), ordem('a1', '2026-10-29T10:00:00.000Z'), ordem('z', '2026-10-28T09:00:00.000Z')]
    assert.deepEqual(juntarHistorico(recentes, antigas).map((o) => o.id), ['c', 'b', 'a2', 'a1', 'z'])
  })

  it('a ordem que a primeira página empurrou para fora continua na lista (sem buraco)', () => {
    const vistas = [ordem('b', '2026-10-29T11:00:00.000Z'), ordem('a', '2026-10-29T10:00:00.000Z'), ordem('z', '2026-10-28T09:00:00.000Z')]
    const primeiraPaginaNova = [ordem('c', '2026-10-29T12:00:00.000Z'), ordem('b', '2026-10-29T11:00:00.000Z')]
    assert.deepEqual(juntarHistorico(primeiraPaginaNova, vistas).map((o) => o.id), ['c', 'b', 'a', 'z'])
  })

  it('a cópia da primeira página vale mais que a guardada', () => {
    const guardada = ordem('a', '2026-10-29T10:00:00.000Z', { vistaEm: null })
    const nova = ordem('a', '2026-10-29T10:00:00.000Z', { vistaEm: '2026-10-29T10:05:00.000Z' })
    const [unica] = juntarHistorico([nova], [guardada])
    assert.equal(unica.vistaEm, '2026-10-29T10:05:00.000Z')
  })
})

describe('continuacaoNaFila', () => {
  const parada = ordem('p', '2026-10-29T10:00:00.000Z', { status: 'parada' })

  it('a retomada esperando vaga na fila conta', () => {
    const fila = [ordem('x', null, { status: 'na_fila', continuaDe: null }), ordem('c', null, { status: 'na_fila', continuaDe: 'p' })]
    assert.equal(continuacaoNaFila(fila, parada), true)
  })

  it('cancelada (fora da fila) ou de outra ordem não conta', () => {
    assert.equal(continuacaoNaFila([], parada), false)
    assert.equal(continuacaoNaFila([ordem('c', null, { status: 'na_fila', continuaDe: 'outra' })], parada), false)
  })

  it('sem última ordem não há o que retomar', () => {
    assert.equal(continuacaoNaFila([ordem('c', null, { continuaDe: 'p' })], null), false)
  })
})

describe('comOrdem', () => {
  it('troca a ordem pela cópia nova', () => {
    const lista = [ordem('a', '2026-10-29T10:00:00.000Z'), ordem('b', '2026-10-29T09:00:00.000Z')]
    const nova = ordem('b', '2026-10-29T09:00:00.000Z', { vistaEm: '2026-10-29T10:00:00.000Z' })
    assert.equal(comOrdem(lista, nova)[1], nova)
  })

  it('ordem que não está na lista devolve a mesma lista (sem novo render)', () => {
    const lista = [ordem('a', '2026-10-29T10:00:00.000Z')]
    assert.equal(comOrdem(lista, ordem('x', null)), lista)
  })
})
