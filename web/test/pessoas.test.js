import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aparenciaDoAgente, bonecoAndando, bonecoEmPe, caixasDoBonecoAndando } from '../src/components/escritorio/pessoas.js'

const DIRECOES = ['+y', '+x', '-y', '-x']
const QUADROS = ['parado', 0, 1, 2, 3]
const base = aparenciaDoAgente({ id: 'teste' })
const APARENCIAS = [0, 1, 2].flatMap((penteado) => [false, true].map((oculos) => ({ ...base, penteado, oculos })))
const FOLGA = 0.01

const cruzam = (a, b) =>
  Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > FOLGA &&
  Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > FOLGA &&
  Math.min(a.z2, b.z2) - Math.max(a.z1, b.z1) > FOLGA

// a fica atrás de b: separados por um plano x, y ou z com a do lado de longe de quem olha.
const atras = (a, b) => a.x2 <= b.x1 + FOLGA || a.y2 <= b.y1 + FOLGA || a.z2 <= b.z1 + FOLGA

function naTela(c) {
  const xs = []
  const ys = []
  for (const x of [c.x1, c.x2]) for (const y of [c.y1, c.y2]) for (const z of [c.z1, c.z2]) {
    xs.push((x - y) * 0.866)
    ys.push((x + y) * 0.5 - z)
  }
  return { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) }
}

const seCobrem = (a, b) => {
  const [p, q] = [naTela(a), naTela(b)]
  return Math.min(p.x2, q.x2) - Math.max(p.x1, q.x1) > FOLGA && Math.min(p.y2, q.y2) - Math.max(p.y1, q.y1) > FOLGA
}

function caixaDaTela(poligonos) {
  const pontos = poligonos.flatMap((p) => p.pontos.split(' ').map((par) => par.split(',').map(Number)))
  return {
    x1: Math.min(...pontos.map(([x]) => x)), x2: Math.max(...pontos.map(([x]) => x)),
    y1: Math.min(...pontos.map(([, y]) => y)), y2: Math.max(...pontos.map(([, y]) => y)),
  }
}

function todos(fazer) {
  for (const a of APARENCIAS) for (const direcao of DIRECOES) for (const quadro of QUADROS) fazer(a, direcao, quadro, `${direcao} ${quadro} penteado ${a.penteado}${a.oculos ? ' com óculos' : ''}`)
}

describe('bonecoAndando', () => {
  it('desenha toda direção, quadro e penteado', () => {
    todos((a, direcao, quadro, nome) => {
      const poligonos = bonecoAndando([100, 100], 10, 20, a, direcao, quadro)
      assert.ok(poligonos.length > 40, nome)
      for (const p of poligonos) {
        assert.match(p.pontos, /^(-?\d+(\.\d)?,-?\d+(\.\d)? ){3}-?\d+(\.\d)?,-?\d+(\.\d)?$/, nome)
        assert.equal(typeof p.cor, 'string', nome)
      }
    })
  })

  it('rosto só aparece de frente (+y e +x)', () => {
    const a = { ...APARENCIAS[0], oculos: true }
    const lente = (direcao) => bonecoAndando([0, 0], 0, 0, a, direcao, 'parado').filter((p) => p.cor === a.lente).length
    assert.equal(lente('+y'), 2)
    assert.equal(lente('+x'), 2)
    assert.equal(lente('-y'), 0)
    assert.equal(lente('-x'), 0)
  })

  it('nenhum bloco atravessa outro', () => {
    todos((a, direcao, quadro, nome) => {
      const caixas = caixasDoBonecoAndando(10, 20, a, direcao, quadro)
      for (let i = 0; i < caixas.length; i++) {
        for (let j = i + 1; j < caixas.length; j++) assert.ok(!cruzam(caixas[i], caixas[j]), `${nome}: blocos ${i} e ${j} se cruzam`)
      }
    })
  })

  it('nunca pinta um bloco depois de outro que está na frente dele', () => {
    todos((a, direcao, quadro, nome) => {
      const caixas = caixasDoBonecoAndando(10, 20, a, direcao, quadro)
      for (let i = 0; i < caixas.length; i++) {
        for (let j = i + 1; j < caixas.length; j++) {
          if (!seCobrem(caixas[i], caixas[j])) continue
          assert.ok(!(atras(caixas[j], caixas[i]) && !atras(caixas[i], caixas[j])), `${nome}: bloco ${j} está atrás do ${i} mas vem depois`)
        }
      }
    })
  })

  it('o meio do tronco fica 0,52 atrás de (X, Y) em qualquer direção', () => {
    for (const direcao of DIRECOES) {
      const tronco = caixasDoBonecoAndando(10, 20, APARENCIAS[0], direcao, 'parado').find((c) => Math.abs(c.z1 - 12.4 * 1.3) < FOLGA && c.z2 - c.z1 > 14)
      assert.ok(tronco, direcao)
      assert.ok(Math.abs((tronco.x1 + tronco.x2) / 2 - 10) < FOLGA, direcao)
      assert.ok(Math.abs((tronco.y1 + tronco.y2) / 2 - 19.48) < FOLGA, direcao)
    }
  })

  it('parado de frente ocupa o mesmo lugar do bonecoEmPe (troca sem salto)', () => {
    for (const a of APARENCIAS) {
      const andando = caixaDaTela(bonecoAndando([50, 80], 10, 20, a, '+y', 'parado'))
      const emPe = caixaDaTela(bonecoEmPe([50, 80], 10 - 4.42, 20 - 3.64, a))
      for (const lado of ['x1', 'x2', 'y1', 'y2']) assert.ok(Math.abs(andando[lado] - emPe[lado]) <= 0.6, `penteado ${a.penteado}: ${lado} ${andando[lado]} x ${emPe[lado]}`)
    }
  })

  it('os quadros de passo mexem as pernas para lados opostos', () => {
    const pes = (quadro) => caixasDoBonecoAndando(0, 0, APARENCIAS[0], '+y', quadro).filter((c) => c.z1 === 0).sort((p, q) => p.x1 - q.x1)
    const [direito0, esquerdo0] = pes(0)
    const [direito2, esquerdo2] = pes(2)
    assert.ok(esquerdo0.y2 > direito0.y2)
    assert.ok(direito2.y2 > esquerdo2.y2)
    const [d1, e1] = pes(1)
    assert.equal(d1.y2, e1.y2)
  })
})
