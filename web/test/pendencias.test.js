import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cortarLinhas, foraDaPasta } from '../src/utils/pendencias.js'

describe('foraDaPasta', () => {
  const projeto = '/home/eu/projects/app'

  it('arquivo dentro da pasta do projeto (ou a própria pasta) não está fora', () => {
    assert.equal(foraDaPasta('/home/eu/projects/app/src/index.ts', projeto), false)
    assert.equal(foraDaPasta('/home/eu/projects/app', projeto), false)
    assert.equal(foraDaPasta('/home/eu/projects/app/', `${projeto}/`), false)
  })

  it('arquivo em outra pasta está fora', () => {
    assert.equal(foraDaPasta('/home/eu/.ssh/config', projeto), true)
    assert.equal(foraDaPasta('/etc/hosts', projeto), true)
  })

  it('pasta com o mesmo começo de nome não conta como dentro', () => {
    assert.equal(foraDaPasta('/home/eu/projects/app-antigo/x.ts', projeto), true)
  })

  it('.. que sai da pasta conta como fora; . e barras repetidas não', () => {
    assert.equal(foraDaPasta('/home/eu/projects/app/../segredo/x', projeto), true)
    assert.equal(foraDaPasta('/home/eu/projects/app/./src//x.ts', projeto), false)
  })

  it('sem a pasta do projeto, ou com caminho relativo, não afirma que está fora', () => {
    assert.equal(foraDaPasta('/etc/hosts', null), false)
    assert.equal(foraDaPasta('src/index.ts', projeto), false)
    assert.equal(foraDaPasta(null, projeto), false)
  })
})

describe('cortarLinhas', () => {
  it('corta nas primeiras linhas e conta as que sobraram', () => {
    assert.deepEqual(cortarLinhas('a\nb\nc\nd', 2), { texto: 'a\nb', sobra: 2 })
  })

  it('sem limite (Infinity) devolve o texto inteiro, sem a quebra final', () => {
    assert.deepEqual(cortarLinhas('a\nb\nc\n\n', Infinity), { texto: 'a\nb\nc', sobra: 0 })
  })
})
