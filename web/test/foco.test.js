import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { focarProximoPedido } from '../src/utils/foco.js'

// Cartões de mentira com o mínimo que a função usa: dataset, o <h4> e focus().
function cenario(...ids) {
  const focados = []
  const cartoes = ids.map((id) => {
    const titulo = { focus: () => focados.push(id) }
    const dataset = id.startsWith('final:') ? { perguntaFinal: id.slice(6) } : { pendencia: id }
    return { dataset, querySelector: (seletor) => (seletor === 'h4' ? titulo : null) }
  })
  const lista = { querySelectorAll: () => cartoes }
  const reserva = { focus: () => focados.push('reserva') }
  return { lista, reserva, focados }
}

describe('focarProximoPedido', () => {
  it('foca o cartão que vem depois do respondido', () => {
    const { lista, reserva, focados } = cenario('a', 'b', 'c')
    focarProximoPedido(lista, 'b', reserva)
    assert.deepEqual(focados, ['c'])
  })

  it('respondido o último, foca o anterior', () => {
    const { lista, reserva, focados } = cenario('a', 'b')
    focarProximoPedido(lista, 'b', reserva)
    assert.deepEqual(focados, ['a'])
  })

  it('a pergunta final também conta como pedido', () => {
    const { lista, reserva, focados } = cenario('a', 'final:o1')
    focarProximoPedido(lista, 'o1', reserva)
    assert.deepEqual(focados, ['a'])
  })

  it('sem outro pedido, foca a reserva (aba ou status)', () => {
    const { lista, reserva, focados } = cenario('a')
    focarProximoPedido(lista, 'a', reserva)
    assert.deepEqual(focados, ['reserva'])
  })

  it('cartão que já saiu da tela (o ao vivo chegou antes): foca o primeiro que sobrou', () => {
    const { lista, reserva, focados } = cenario('b', 'c')
    focarProximoPedido(lista, 'a', reserva)
    assert.deepEqual(focados, ['b'])
  })

  it('sem a lista (bloco já desmontado), foca a reserva', () => {
    const { reserva, focados } = cenario()
    focarProximoPedido(null, 'a', reserva)
    assert.deepEqual(focados, ['reserva'])
  })
})
