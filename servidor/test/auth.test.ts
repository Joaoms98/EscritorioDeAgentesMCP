import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  chaveConfere,
  chaveDoBearer,
  chaveDoCookie,
  cookieDeEntrada,
  cookieDeSaida,
  NOME_COOKIE,
  requisicaoAutorizada,
} from '../src/auth.ts'

const CHAVE = 'Qm9hLWNoYXZlLWRlLXRlc3RlLWNvbS0zMi1ieXRlcw'

describe('auth', () => {
  it('chaveConfere aceita só a chave exata', () => {
    assert.equal(chaveConfere(CHAVE, CHAVE), true)
    assert.equal(chaveConfere(`${CHAVE}x`, CHAVE), false)
    assert.equal(chaveConfere(CHAVE.slice(1), CHAVE), false)
    assert.equal(chaveConfere('', CHAVE), false)
    assert.equal(chaveConfere(null, CHAVE), false)
    assert.equal(chaveConfere(undefined, CHAVE), false)
    assert.equal(chaveConfere(CHAVE, ''), false)
  })

  it('lê a chave do cabeçalho Bearer', () => {
    assert.equal(chaveDoBearer(`Bearer ${CHAVE}`), CHAVE)
    assert.equal(chaveDoBearer(`bearer   ${CHAVE}  `), CHAVE)
    assert.equal(chaveDoBearer(`Basic ${CHAVE}`), null)
    assert.equal(chaveDoBearer('Bearer'), null)
    assert.equal(chaveDoBearer('Bearer a b'), null)
    assert.equal(chaveDoBearer(undefined), null)
  })

  it('lê a chave do cookie escritorio_chave', () => {
    assert.equal(NOME_COOKIE, 'escritorio_chave')
    assert.equal(chaveDoCookie(`tema=escuro; escritorio_chave=${CHAVE}; outro=1`), CHAVE)
    assert.equal(chaveDoCookie(`escritorio_chave=${encodeURIComponent('chave com; espaço')}`), 'chave com; espaço')
    assert.equal(chaveDoCookie('xescritorio_chave=abc'), null)
    assert.equal(chaveDoCookie('escritorio_chave=%E0%A4%A'), '%E0%A4%A')
    assert.equal(chaveDoCookie(''), null)
    assert.equal(chaveDoCookie(null), null)
  })

  it('autoriza por Bearer ou cookie; o cookie pode ser recusado', () => {
    assert.equal(requisicaoAutorizada(new Headers({ authorization: `Bearer ${CHAVE}` }), CHAVE), true)
    assert.equal(requisicaoAutorizada(new Headers({ cookie: `escritorio_chave=${CHAVE}` }), CHAVE), true)
    assert.equal(requisicaoAutorizada(new Headers({ cookie: `escritorio_chave=${CHAVE}` }), CHAVE, false), false)
    assert.equal(requisicaoAutorizada(new Headers({ authorization: 'Bearer errada', cookie: `escritorio_chave=${CHAVE}` }), CHAVE), true)
    assert.equal(requisicaoAutorizada(new Headers({ authorization: 'Bearer errada' }), CHAVE), false)
    assert.equal(requisicaoAutorizada(new Headers(), CHAVE), false)
  })

  it('monta e apaga o cookie', () => {
    assert.equal(cookieDeEntrada(CHAVE), `escritorio_chave=${CHAVE}; HttpOnly; SameSite=Strict; Path=/; Max-Age=34560000`)
    assert.equal(cookieDeEntrada('a b;c'), 'escritorio_chave=a%20b%3Bc; HttpOnly; SameSite=Strict; Path=/; Max-Age=34560000')
    assert.equal(cookieDeSaida(), 'escritorio_chave=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
  })
})
