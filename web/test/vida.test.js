import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COLUNAS } from '../src/components/escritorio/arteEscritorio.js'
import { postoDoAgente, postoPorChave } from '../src/components/escritorio/caminhos.js'
import { lugarDoAgente, zonaDoAgente } from '../src/components/escritorio/disposicao.js'

const agente = (estado, vagaId = null) => ({ id: 'a', apelido: 'A', estado, vida: vagaId ? { vagaId } : null })

describe('postoPorChave', () => {
  it('resolve toda chave que o catálogo do servidor emite', () => {
    for (const fileiras of [2, 3, 5]) {
      for (let i = 0; i < fileiras * COLUNAS; i++) {
        for (const pose of ['sentado', 'empe']) {
          const posto = postoPorChave(fileiras, `mesa:${i}:${pose}`)
          assert.ok(posto, `mesa:${i}:${pose}`)
          assert.equal(posto.chave, `mesa:${i}:${pose}`)
          assert.equal(posto.mesa, i)
        }
      }
      for (let v = 0; v < 14; v++) assert.equal(postoPorChave(fileiras, `lazer:${v}`)?.chave, `lazer:${v}`)
    }
  })

  it('dá o mesmo posto que a regra de sempre daria para aquele lugar', () => {
    for (const fileiras of [2, 3]) {
      for (let i = 0; i < fileiras * COLUNAS; i++) {
        assert.deepEqual(postoPorChave(fileiras, `mesa:${i}:sentado`), postoDoAgente(fileiras, i, agente('trabalhando')))
        assert.deepEqual(postoPorChave(fileiras, `mesa:${i}:empe`), postoDoAgente(fileiras, i, agente('aguardando')))
        assert.deepEqual(postoPorChave(fileiras, `lazer:${i}`), postoDoAgente(fileiras, i, agente('livre')))
      }
    }
  })

  it('devolve null para chave que este escritório não tem, sem lançar', () => {
    for (const chave of ['mesa:99:sentado', 'mesa:0:deitado', 'lazer:-1', 'reuniao:0:sentado', 'sala:0', '', 'lazer:', null, undefined, 7]) {
      assert.equal(postoPorChave(2, chave), null, String(chave))
    }
  })

  it('sem chave nenhuma, o posto é exatamente o de antes do modo Vida', () => {
    for (const fileiras of [2, 4]) {
      for (let i = 0; i < 8; i++) {
        for (const estado of ['livre', 'trabalhando', 'aguardando', 'na_fila', 'concluiu', 'erro', 'interrompida']) {
          const semChave = postoDoAgente(fileiras, i, agente(estado))
          const comNull = postoDoAgente(fileiras, i, agente(estado), null)
          assert.deepEqual(comNull, semChave, `${estado} ${i}`)
          const esperada = zonaDoAgente(agente(estado)) === 'lazer' ? `lazer:${i}` : `mesa:${i}:${estado === 'trabalhando' ? 'sentado' : 'empe'}`
          assert.equal(semChave.chave, esperada)
        }
      }
    }
  })

  it('a chave do servidor manda mais que a posição na lista', () => {
    const posto = postoDoAgente(2, 0, agente('livre', 'mesa:5:sentado'), 'mesa:5:sentado')
    assert.equal(posto.chave, 'mesa:5:sentado')
    assert.equal(posto.mesa, 5)
  })
})

describe('lugarDoAgente', () => {
  it('sem o modo Vida, é a regra de sempre: a mesa e a vaga são a posição na lista', () => {
    for (const qtd of [1, 8, 20]) {
      for (let i = 0; i < qtd; i++) {
        const trabalhando = lugarDoAgente(agente('trabalhando'), i)
        assert.deepEqual(trabalhando, { zona: 'mesa', mesa: i, pose: 'sentado', vaga: null })
        assert.deepEqual(lugarDoAgente(agente('aguardando'), i), { zona: 'mesa', mesa: i, pose: 'empe', vaga: null })
        assert.deepEqual(lugarDoAgente(agente('livre'), i), { zona: 'lazer', mesa: null, pose: null, vaga: i })
      }
    }
  })

  it('com o modo Vida, o lugar é o que o servidor mandou, não a posição na lista', () => {
    assert.deepEqual(lugarDoAgente(agente('livre', 'lazer:7'), 0), { zona: 'lazer', mesa: null, pose: null, vaga: 7 })
    assert.deepEqual(lugarDoAgente(agente('livre', 'mesa:5:empe'), 2, 2), { zona: 'mesa', mesa: 5, pose: 'empe', vaga: null })
    assert.deepEqual(lugarDoAgente(agente('trabalhando', 'mesa:1:sentado'), 6, 2), { zona: 'mesa', mesa: 1, pose: 'sentado', vaga: null })
  })

  it('chave que a cena não sabe desenhar cai na regra de sempre, sem quebrar', () => {
    assert.deepEqual(lugarDoAgente(agente('livre', 'reuniao:3:sentado'), 4), { zona: 'lazer', mesa: null, pose: null, vaga: 4 })
    assert.deepEqual(lugarDoAgente(agente('livre', 'mesa:40:sentado'), 1, 2), { zona: 'lazer', mesa: null, pose: null, vaga: 1 })
    assert.deepEqual(lugarDoAgente(agente('trabalhando', 'coisa:1'), 3), { zona: 'mesa', mesa: 3, pose: 'sentado', vaga: null })
  })
})
