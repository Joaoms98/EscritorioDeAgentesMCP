import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { ehPasta, limparCacheProjetos, listarProjetos, resolverProjeto } from '../src/projetos.ts'
import { ErroEscritorio } from '../src/tipos.ts'

function criarProjetos(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'escritorio-projetos-'))
  for (const nome of ['Zeta', 'alfa', 'Beta', '.oculto', 'ágora']) mkdirSync(join(dir, nome))
  writeFileSync(join(dir, 'arquivo.txt'), 'não é pasta')
  symlinkSync(join(dir, 'alfa'), join(dir, 'atalho'))
  symlinkSync(join(dir, 'sumiu'), join(dir, 'quebrado'))
  t.after(() => {
    limparCacheProjetos()
    rmSync(dir, { recursive: true, force: true })
  })
  return dir
}

function erro400(mensagem: RegExp) {
  return (erro: unknown) => erro instanceof ErroEscritorio && erro.status === 400 && mensagem.test(erro.message)
}

test('lista só as subpastas visíveis, em ordem alfabética sem diferenciar maiúsculas', (t) => {
  const dir = criarProjetos(t)
  const projetos = listarProjetos(dir)
  assert.deepEqual(projetos.map((projeto) => projeto.nome), ['ágora', 'alfa', 'atalho', 'Beta', 'Zeta'])
  assert.deepEqual(projetos[1], { nome: 'alfa', caminho: join(dir, 'alfa') })
})

test('guarda a lista por 10 segundos', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() })
  const dir = criarProjetos(t)
  const antes = listarProjetos(dir)
  mkdirSync(join(dir, 'novo'))
  t.mock.timers.tick(9_999)
  assert.deepEqual(listarProjetos(dir), antes)
  antes.pop()
  assert.equal(listarProjetos(dir).length, 5)
  t.mock.timers.tick(1)
  assert.ok(listarProjetos(dir).some((projeto) => projeto.nome === 'novo'))
  mkdirSync(join(dir, 'outro'))
  limparCacheProjetos()
  assert.ok(listarProjetos(dir).some((projeto) => projeto.nome === 'outro'))
})

test('pasta que não existe dá lista vazia', () => {
  assert.deepEqual(listarProjetos(join(tmpdir(), 'escritorio-sem-projetos', 'nada')), [])
})

test('resolve nome da lista, nome sem diferenciar maiúsculas, caminho absoluto e ~', (t) => {
  const dir = criarProjetos(t)
  assert.equal(resolverProjeto(dir, 'alfa'), join(dir, 'alfa'))
  assert.equal(resolverProjeto(dir, '  BETA '), join(dir, 'Beta'))
  assert.equal(resolverProjeto(dir, join(dir, 'Zeta')), join(dir, 'Zeta'))
  assert.equal(resolverProjeto(dir, `${join(dir, 'Zeta')}/`), join(dir, 'Zeta'))
  assert.equal(resolverProjeto(dir, '~'), homedir())
  listarProjetos(dir)
  mkdirSync(join(dir, 'recente'))
  assert.equal(resolverProjeto(dir, 'recente'), join(dir, 'recente'))
})

test('ehPasta aceita pasta e link para pasta, e recusa arquivo, link quebrado e o que não existe', (t) => {
  const dir = criarProjetos(t)
  assert.equal(ehPasta(join(dir, 'alfa')), true)
  assert.equal(ehPasta(join(dir, 'atalho')), true)
  assert.equal(ehPasta(join(dir, 'arquivo.txt')), false)
  assert.equal(ehPasta(join(dir, 'quebrado')), false)
  assert.equal(ehPasta(join(dir, 'nao-existe')), false)
})

test('recusa projeto que não existe, arquivo, caminho relativo e vazio', (t) => {
  const dir = criarProjetos(t)
  assert.throws(() => resolverProjeto(dir, 'nao-existe'), erro400(/^Projeto não encontrado: nao-existe$/))
  assert.throws(() => resolverProjeto(dir, join(dir, 'arquivo.txt')), erro400(/Projeto não encontrado/))
  assert.throws(() => resolverProjeto(dir, '../alfa'), erro400(/Projeto não encontrado/))
  assert.throws(() => resolverProjeto(dir, 'alfa/sub'), erro400(/Projeto não encontrado/))
  assert.throws(() => resolverProjeto(dir, '.oculto'), erro400(/Projeto não encontrado/))
  assert.throws(() => resolverProjeto(dir, 'quebrado'), erro400(/Projeto não encontrado/))
  assert.throws(() => resolverProjeto(dir, '   '), erro400(/Informe o projeto/))
  assert.throws(() => resolverProjeto(dir, 42 as unknown as string), erro400(/Informe o projeto/))
})
