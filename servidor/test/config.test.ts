import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test, type TestContext } from 'node:test'
import { lerConfig } from '../src/config.ts'

const RAIZ_DO_PROJETO = resolve(import.meta.dirname, '..', '..')

function criarRaiz(t: TestContext): string {
  const raiz = mkdtempSync(join(tmpdir(), 'escritorio-config-'))
  writeFileSync(join(raiz, 'package.json'), JSON.stringify({ name: 'teste', version: '9.8.7' }))
  t.after(() => rmSync(raiz, { recursive: true, force: true }))
  return raiz
}

test('usa os padrões e cria a pasta de dados privada com a chave', (t) => {
  const raiz = criarRaiz(t)
  const config = lerConfig({}, raiz)

  assert.equal(config.porta, 41793)
  assert.equal(config.host, '0.0.0.0')
  assert.equal(config.dirDados, join(raiz, 'dados'))
  assert.equal(config.dirProjetos, join(homedir(), 'projects'))
  assert.equal(config.dirAgentes, join(homedir(), '.claude', 'agents'))
  assert.equal(config.dirWeb, join(raiz, 'web', 'dist'))
  assert.equal(config.maxSimultaneas, 4)
  assert.equal(config.conectoresClaudeAi, false)
  assert.equal(config.usarApiKey, false)
  assert.equal(config.simulado, false)
  assert.equal(config.modeloGeneralista, null)
  assert.equal(config.versao, '9.8.7')
  assert.match(config.token, /^[A-Za-z0-9_-]{43}$/)

  assert.equal(statSync(config.dirDados).mode & 0o777, 0o700)
  const chave = join(config.dirDados, 'chave')
  assert.equal(statSync(chave).mode & 0o777, 0o600)
  assert.equal(readFileSync(chave, 'utf8').trim(), config.token)
  assert.equal(lerConfig({}, raiz).token, config.token)
})

test('lê as variáveis de ambiente', (t) => {
  const raiz = criarRaiz(t)
  const dados = join(raiz, 'outro', 'lugar')
  const config = lerConfig({
    ESCRITORIO_PORTA: '5050',
    ESCRITORIO_HOST: '127.0.0.1',
    ESCRITORIO_DADOS: dados,
    ESCRITORIO_PROJETOS: '~/codigo',
    ESCRITORIO_AGENTES: join(raiz, 'agentes'),
    ESCRITORIO_MAX_SIMULTANEAS: '7',
    ESCRITORIO_CONECTORES: '1',
    ESCRITORIO_USAR_API_KEY: '1',
    ESCRITORIO_SIMULADO: '1',
    ESCRITORIO_MODELO_GENERALISTA: ' haiku ',
    ESCRITORIO_TOKEN: 'uma-chave-bem-comprida-123',
  }, raiz)

  assert.equal(config.porta, 5050)
  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.dirDados, dados)
  assert.equal(statSync(dados).mode & 0o777, 0o700)
  assert.equal(config.dirProjetos, join(homedir(), 'codigo'))
  assert.equal(config.dirAgentes, join(raiz, 'agentes'))
  assert.equal(config.maxSimultaneas, 7)
  assert.equal(config.conectoresClaudeAi, true)
  assert.equal(config.usarApiKey, true)
  assert.equal(config.simulado, true)
  assert.equal(config.modeloGeneralista, 'haiku')
  assert.equal(config.token, 'uma-chave-bem-comprida-123')
  assert.equal(existsSync(join(dados, 'chave')), false)
})

test('maxSimultaneas tem mínimo 1 e as opções só ligam com 1', (t) => {
  const raiz = criarRaiz(t)
  assert.equal(lerConfig({ ESCRITORIO_MAX_SIMULTANEAS: '0' }, raiz).maxSimultaneas, 1)
  assert.equal(lerConfig({ ESCRITORIO_MAX_SIMULTANEAS: '-3' }, raiz).maxSimultaneas, 1)
  assert.equal(lerConfig({ ESCRITORIO_MAX_SIMULTANEAS: 'muitas' }, raiz).maxSimultaneas, 4)
  const config = lerConfig({ ESCRITORIO_SIMULADO: 'true', ESCRITORIO_CONECTORES: 'sim', ESCRITORIO_MODELO_GENERALISTA: '  ' }, raiz)
  assert.equal(config.simulado, false)
  assert.equal(config.dirDados, join(raiz, 'dados'))
  assert.equal(config.conectoresClaudeAi, false)
  assert.equal(config.modeloGeneralista, null)
})

test('a simulação usa uma pasta de dados própria, com outra chave', (t) => {
  const raiz = criarRaiz(t)
  const real = lerConfig({}, raiz)
  const simulada = lerConfig({ ESCRITORIO_SIMULADO: '1' }, raiz)

  assert.equal(simulada.simulado, true)
  assert.equal(simulada.dirDados, join(raiz, 'dados', 'simulado'))
  assert.equal(statSync(simulada.dirDados).mode & 0o777, 0o700)
  assert.equal(readFileSync(join(simulada.dirDados, 'chave'), 'utf8').trim(), simulada.token)
  assert.notEqual(simulada.token, real.token)
  assert.equal(readFileSync(join(real.dirDados, 'chave'), 'utf8').trim(), real.token)
  assert.equal(lerConfig({ ESCRITORIO_SIMULADO: '1', ESCRITORIO_DADOS: join(raiz, 'demo') }, raiz).dirDados, join(raiz, 'demo'))
})

test('recria a chave quando o arquivo está vazio', (t) => {
  const raiz = criarRaiz(t)
  const primeira = lerConfig({}, raiz)
  const chave = join(primeira.dirDados, 'chave')
  writeFileSync(chave, '\n')
  const segunda = lerConfig({}, raiz)
  assert.match(segunda.token, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(segunda.token, primeira.token)
  assert.equal(readFileSync(chave, 'utf8').trim(), segunda.token)
  assert.equal(statSync(chave).mode & 0o777, 0o600)
})

test('recusa porta inválida e token curto ou com caracteres estranhos', (t) => {
  const raiz = criarRaiz(t)
  assert.throws(() => lerConfig({ ESCRITORIO_PORTA: '43l7' }, raiz), /ESCRITORIO_PORTA inválida/)
  assert.throws(() => lerConfig({ ESCRITORIO_PORTA: '70000' }, raiz), /ESCRITORIO_PORTA inválida/)
  assert.throws(() => lerConfig({ ESCRITORIO_TOKEN: 'curta' }, raiz), /pelo menos 16/)
  assert.throws(() => lerConfig({ ESCRITORIO_TOKEN: 'tem espaco; e ponto e virgula' }, raiz), /só pode ter/)
})

test('sem raiz, usa a raiz do projeto para a web e a versão', (t) => {
  const raiz = criarRaiz(t)
  const config = lerConfig({ ESCRITORIO_DADOS: join(raiz, 'dados'), ESCRITORIO_TOKEN: 'x'.repeat(24) })
  const pacote = JSON.parse(readFileSync(join(RAIZ_DO_PROJETO, 'package.json'), 'utf8')) as { version: string }
  assert.equal(config.dirWeb, join(RAIZ_DO_PROJETO, 'web', 'dist'))
  assert.equal(config.versao, pacote.version)
  assert.equal(config.dirDados, join(raiz, 'dados'))
})
