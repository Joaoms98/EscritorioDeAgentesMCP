import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { travarPastaDeDados } from '../src/trava.ts'

const pastas: string[] = []

function novaPasta(): string {
  const pasta = mkdtempSync(join(tmpdir(), 'escritorio-trava-'))
  pastas.push(pasta)
  return pasta
}

// PID de um processo que já terminou (o spawnSync espera o filho sair).
function pidMorto(): number {
  const filho = spawnSync(process.execPath, ['-e', ''])
  assert.ok(filho.pid)
  return filho.pid
}

describe('trava da pasta de dados', () => {
  after(() => {
    for (const pasta of pastas) rmSync(pasta, { recursive: true, force: true })
  })

  it('cria a trava com o PID (só o dono lê) e solta uma vez', () => {
    const pasta = novaPasta()
    const trava = travarPastaDeDados(pasta)
    assert.equal(trava.arquivo, join(pasta, 'servidor.trava'))
    assert.equal(readFileSync(trava.arquivo, 'utf8'), `${process.pid}\n`)
    assert.equal(statSync(trava.arquivo).mode & 0o777, 0o600)
    trava.soltar()
    assert.equal(existsSync(trava.arquivo), false)
    trava.soltar()
  })

  it('com o dono vivo, recusa e diz o PID; a trava continua dele', () => {
    const pasta = novaPasta()
    const primeira = travarPastaDeDados(pasta)
    assert.throws(() => travarPastaDeDados(pasta, 4242), (erro: Error) => {
      assert.ok(erro.message.startsWith(`Outro servidor do escritório (PID ${process.pid}) já está usando a pasta de dados ${pasta}.`))
      assert.ok(erro.message.includes('ESCRITORIO_DADOS'))
      assert.ok(erro.message.includes(primeira.arquivo))
      return true
    })
    assert.equal(readFileSync(primeira.arquivo, 'utf8'), `${process.pid}\n`)
    primeira.soltar()
  })

  it('assume a trava de um processo que morreu, ou a que tem o próprio PID (contêiner reiniciado)', () => {
    const pasta = novaPasta()
    const arquivo = join(pasta, 'servidor.trava')
    writeFileSync(arquivo, `${pidMorto()}\n`)
    const trava = travarPastaDeDados(pasta)
    assert.equal(readFileSync(arquivo, 'utf8'), `${process.pid}\n`)
    trava.soltar()
    writeFileSync(arquivo, `${process.pid}\n`)
    const deNovo = travarPastaDeDados(pasta)
    assert.equal(readFileSync(arquivo, 'utf8'), `${process.pid}\n`)
    deNovo.soltar()
  })

  it('trava sem PID: recente é de quem está subindo; antiga é assumida', () => {
    const pasta = novaPasta()
    const arquivo = join(pasta, 'servidor.trava')
    writeFileSync(arquivo, '')
    assert.throws(() => travarPastaDeDados(pasta), /está abrindo a pasta de dados/)
    const antes = new Date(Date.now() - 60_000)
    utimesSync(arquivo, antes, antes)
    const trava = travarPastaDeDados(pasta)
    assert.equal(readFileSync(arquivo, 'utf8'), `${process.pid}\n`)
    trava.soltar()
    writeFileSync(arquivo, 'lixo')
    utimesSync(arquivo, antes, antes)
    travarPastaDeDados(pasta).soltar()
    assert.equal(existsSync(arquivo), false)
  })

  it('soltar não apaga a trava que outro processo assumiu', () => {
    const pasta = novaPasta()
    const trava = travarPastaDeDados(pasta)
    writeFileSync(trava.arquivo, '4242\n')
    trava.soltar()
    assert.equal(readFileSync(trava.arquivo, 'utf8'), '4242\n')
  })

  it('pasta que não existe é erro do sistema, não trava', () => {
    assert.throws(() => travarPastaDeDados(join(novaPasta(), 'nao', 'existe')), (erro: NodeJS.ErrnoException) => erro.code === 'ENOENT')
  })
})
