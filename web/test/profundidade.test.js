import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dimensoesDoEscritorio, divisoria, montarMesa, origemDaMesa } from '../src/components/escritorio/arteEscritorio.js'
import { caixa, caixaNaTela, encaixarAndantes, relacao } from '../src/components/escritorio/profundidade.js'

const O = [400, 40]
const ana = { id: 'ana', apelido: 'Ana', estado: 'aguardando', cor: '#60a5fa' }

// Peças fixas do escritório de 2 fileiras: Ana em pé na mesa 5, as outras mesas vazias, e a mureta da frente.
function pecasDoEscritorio() {
  const pecas = []
  for (let i = 0; i < 8; i++) {
    const ocupante = i === 5 ? { agente: ana, pose: 'empe' } : null
    pecas.push(...montarMesa(O, i, ocupante).pecas)
  }
  pecas.push(...divisoria(O, 2))
  return pecas.map((p) => ({ ...p, tela: caixaNaTela(O, p.caixa) }))
}

function andanteEm(x, y) {
  return { caixa: caixa(x - 3, y - 3, 0, x + 3, y + 3, 44), tela: caixaNaTela(O, caixa(x - 8, y - 8, 0, x + 8, y + 8, 46)) }
}

const posicao = (pecas, x, y) => encaixarAndantes(pecas, [andanteEm(x, y)])[0]
const indice = (pecas, chave) => pecas.findIndex((p) => p.chave === chave)
const sobrepoem = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2

// Toda peça que divide a tela com o andante e fica atrás dele é pintada antes; a que fica na frente, depois.
function confereOrdem(pecas, x, y) {
  const andante = andanteEm(x, y)
  const p = encaixarAndantes(pecas, [andante])[0]
  for (const [j, peca] of pecas.entries()) {
    if (!sobrepoem(peca.tela, andante.tela)) continue
    const r = relacao(peca.caixa, andante.caixa)
    if (r < 0) assert.ok(j < p, `${peca.chave} fica atrás de quem anda em (${x}, ${y}) mas é pintada depois`)
    if (r > 0) assert.ok(j >= p, `${peca.chave} fica na frente de quem anda em (${x}, ${y}) mas é pintada antes`)
  }
  return p
}

describe('relacao', () => {
  it('separadas em x, y ou z: quem tem o menor valor fica atrás', () => {
    assert.equal(relacao(caixa(0, 0, 0, 1, 1, 1), caixa(2, 0, 0, 3, 1, 1)), -1)
    assert.equal(relacao(caixa(0, 2, 0, 1, 3, 1), caixa(0, 0, 0, 1, 1, 1)), 1)
    assert.equal(relacao(caixa(0, 0, 0, 1, 1, 1), caixa(0, 0, 2, 1, 1, 3)), -1)
  })

  it('caixas que se cruzam não têm ordem', () => {
    assert.equal(relacao(caixa(0, 0, 0, 2, 2, 2), caixa(1, 1, 1, 3, 3, 3)), 0)
  })

  it('separadas em sentidos opostos no chão (uma mais para +x, a outra para +y) não se cobrem na tela: tanto faz', () => {
    assert.equal(relacao(caixa(0, 5, 0, 1, 6, 9), caixa(3, 0, 0, 4, 1, 9)), null)
    assert.equal(relacao(caixa(3, 0, 0, 4, 1, 9), caixa(0, 5, 0, 1, 6, 9)), null)
  })
})

describe('encaixarAndantes entre si', () => {
  it('de dois andantes que dividem a tela, o de trás nunca é desenhado depois do da frente', () => {
    // A peça só cobre o andante de trás; sem a regra entre andantes, ele iria para depois dela e o da frente para antes.
    const peca = { caixa: caixa(0, 0, 0, 10, 10, 30), tela: { x1: -100, x2: 100, y1: -100, y2: 100 } }
    const tras = { caixa: caixa(12, 5, 0, 18, 11, 44), tela: { x1: 0, x2: 20, y1: 0, y2: 50 } }
    const frente = { caixa: caixa(16, 9, 0, 22, 15, 44), tela: { x1: 10, x2: 30, y1: 5, y2: 55 } }
    const posicoes = encaixarAndantes([{ ...peca, tela: { x1: -100, x2: 15, y1: -100, y2: 100 } }], [frente, tras])
    assert.ok(posicoes[0] >= posicoes[1], `frente=${posicoes[0]} tras=${posicoes[1]}`)
  })

  it('andantes longe um do outro ficam cada um no seu lugar', () => {
    const peca = { caixa: caixa(0, 0, 0, 10, 10, 30), tela: { x1: 0, x2: 10, y1: 0, y2: 10 } }
    const a = { caixa: caixa(12, 0, 0, 18, 6, 44), tela: { x1: 5, x2: 15, y1: 0, y2: 10 } }
    const b = { caixa: caixa(40, 40, 0, 46, 46, 44), tela: { x1: 500, x2: 510, y1: 500, y2: 510 } }
    assert.deepEqual(encaixarAndantes([peca], [b, a]), [0, 1])
  })
})

describe('encaixarAndantes', () => {
  it('no corredor entre as fileiras, fica na frente da 1ª fileira e atrás da 2ª', () => {
    const pecas = pecasDoEscritorio()
    const p = confereOrdem(pecas, 174, 81)
    assert.ok(p > indice(pecas, 'mesa-1'), 'atrás da mesa 1')
    assert.ok(p <= indice(pecas, 'mesa-2'), 'na frente da mesa 2')
  })

  it('em qualquer ponto dos corredores, quem divide a tela com ele fica do lado certo', () => {
    const pecas = pecasDoEscritorio()
    const { largura, profundidade } = dimensoesDoEscritorio(2)
    for (let x = 8; x < largura - 8; x += 6) for (const y of [81, 161]) confereOrdem(pecas, x, y)
    for (let y = 8; y < profundidade - 4; y += 4) for (const x of [88, 174, 272]) confereOrdem(pecas, x, y)
  })

  it('logo atrás de quem está em pé numa mesa da frente, fica atrás dela', () => {
    const pecas = pecasDoEscritorio()
    const [X0, Y0] = origemDaMesa(5)
    const p = confereOrdem(pecas, X0 + 4, Y0 - 6)
    assert.ok(p <= indice(pecas, 'pessoa-ana-mesa-5-empe'))
  })

  it('dentro da cadeira, fica logo depois do assento e antes do encosto', () => {
    const pecas = pecasDoEscritorio()
    const [X0, Y0] = origemDaMesa(2)
    assert.equal(posicao(pecas, X0 + 30, Y0 + 25), indice(pecas, 'assento-2') + 1)
  })

  it('na soleira da porta, fica na frente do lado esquerdo da mureta e atrás do direito', () => {
    const pecas = pecasDoEscritorio()
    const { profundidade } = dimensoesDoEscritorio(2)
    const p = posicao(pecas, 174, profundidade + 2.5)
    assert.ok(p > indice(pecas, 'soleira'))
    assert.ok(p <= indice(pecas, 'mureta-direita'))
  })

  it('longe de tudo (sem dividir a tela com nenhuma peça), vai para o começo', () => {
    const pecas = pecasDoEscritorio()
    assert.equal(posicao(pecas, -500, -500), 0)
  })
})
