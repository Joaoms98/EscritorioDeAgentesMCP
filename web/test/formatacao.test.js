import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { custoAproximado, fracaoDeUso, quandoRenova } from '../src/utils/formatacao.js'

// Datas montadas na hora local, como o navegador mostra.
const em = (ano, mes, dia, hora, minuto = 0) => new Date(ano, mes - 1, dia, hora, minuto).getTime()

describe('fracaoDeUso', () => {
  it('usa a fração do servidor como está, de 0 a 1', () => {
    assert.equal(fracaoDeUso(0), 0)
    assert.equal(fracaoDeUso(0.42), 0.42)
    assert.equal(fracaoDeUso(1), 1)
  })

  it('passou do limite (> 1) é barra cheia, não porcentagem', () => {
    assert.equal(fracaoDeUso(1.2), 1)
    assert.equal(fracaoDeUso(42), 1)
  })

  it('negativo vira 0 e valor desconhecido vira null', () => {
    assert.equal(fracaoDeUso(-0.1), 0)
    assert.equal(fracaoDeUso(null), null)
    assert.equal(fracaoDeUso(undefined), null)
    assert.equal(fracaoDeUso(Number.NaN), null)
  })
})

describe('quandoRenova', () => {
  const agora = em(2026, 10, 29, 10, 30)

  it('hoje mostra só a hora', () => {
    assert.equal(quandoRenova(new Date(em(2026, 10, 29, 14, 0)).toISOString(), agora), 'às 14:00')
  })

  it('amanhã diz amanhã, mesmo que falte menos de 24 h', () => {
    assert.equal(quandoRenova(new Date(em(2026, 10, 30, 9, 0)).toISOString(), agora), 'amanhã às 09:00')
  })

  it('outro dia mostra a data e o dia da semana', () => {
    assert.equal(quandoRenova(new Date(em(2026, 11, 2, 14, 0)).toISOString(), agora), 'em 02/11 (seg.) às 14:00')
  })

  it('renovação que já passou (ou inválida) não aparece', () => {
    assert.equal(quandoRenova(new Date(em(2026, 10, 29, 9, 0)).toISOString(), agora), null)
    assert.equal(quandoRenova(new Date(agora).toISOString(), agora), null)
    assert.equal(quandoRenova(null, agora), null)
    assert.equal(quandoRenova('ontem', agora), null)
  })
})

describe('custoAproximado', () => {
  it('marca o custo como estimativa', () => {
    assert.equal(custoAproximado(0.4234), '≈ US$\u00a00,42')
  })

  it('sem custo fica o travessão, sem "≈"', () => {
    assert.equal(custoAproximado(null), '—')
    assert.equal(custoAproximado(undefined), '—')
  })
})
