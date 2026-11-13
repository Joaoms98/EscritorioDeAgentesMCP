import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import type { TestContext } from 'node:test'
import {
  caminhoDentro,
  caminhoDoBwrap,
  criarOficina,
  limparOficina,
  listarOficina,
  oficinaDisponivel,
  prepararSandbox,
  raizDasOficinas,
  sanearIdDeAgente,
} from '../src/oficina.ts'
import type { Config } from '../src/tipos.ts'

// Uma pasta de mentira por teste, apagada no fim: nada aqui toca a pasta de verdade do usuário.
function pastaDeTeste(t: TestContext): string {
  const base = mkdtempSync(join(tmpdir(), 'escritorio-oficina-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  return realpathSync(base)
}

// Um escritório de mentira: <base>/servidor/agentes-projeto, com dados/ e projects/ ao lado.
function escritorioDeMentira(t: TestContext) {
  const base = pastaDeTeste(t)
  const servidor = join(base, 'servidor')
  const raiz = join(servidor, 'agentes-projeto')
  const fora = join(base, 'fora')
  mkdirSync(raiz, { recursive: true })
  mkdirSync(fora, { recursive: true })
  mkdirSync(join(base, 'dados'), { recursive: true })
  mkdirSync(join(base, 'projects'), { recursive: true })
  const config: Pick<Config, 'dirAgentesProjeto' | 'dirDados' | 'dirProjetos'> = {
    dirAgentesProjeto: raiz,
    dirDados: join(base, 'dados'),
    dirProjetos: join(base, 'projects'),
  }
  return { base, servidor, raiz, fora, config }
}

describe('caminhoDentro', () => {
  it('um caminho relativo e a própria raiz ficam dentro', (t) => {
    const { raiz } = escritorioDeMentira(t)
    assert.equal(caminhoDentro(raiz, 'a/b.txt'), join(raiz, 'a', 'b.txt'))
    assert.equal(caminhoDentro(raiz, './nota.md'), join(raiz, 'nota.md'))
    assert.equal(caminhoDentro(raiz, '.'), raiz)
    assert.equal(caminhoDentro(raiz, raiz), raiz)
    assert.equal(caminhoDentro(raiz, join(raiz, 'projeto', 'src', 'index.ts')), join(raiz, 'projeto', 'src', 'index.ts'))
  })

  it('caminho de fora, subida com .. e a casa do humano são recusados', (t) => {
    const { raiz } = escritorioDeMentira(t)
    assert.equal(caminhoDentro(raiz, '../fora'), null)
    assert.equal(caminhoDentro(raiz, '/etc/passwd'), null)
    assert.equal(caminhoDentro(raiz, '~/.claude/agents/x.md'), null)
    assert.equal(caminhoDentro(raiz, '~'), null)
    assert.equal(caminhoDentro(raiz, 'a/../../fora'), null)
    assert.equal(caminhoDentro(raiz, join(homedir(), '.claude', 'settings.json')), null)
    assert.equal(caminhoDentro(raiz, ''), null)
    assert.equal(caminhoDentro(raiz, '   '), null)
  })

  it('link simbólico que aponta para fora é recusado, mesmo com o arquivo ainda sem existir', (t) => {
    const { raiz, fora } = escritorioDeMentira(t)
    writeFileSync(join(fora, 'segredo.txt'), 'segredo')
    symlinkSync(fora, join(raiz, 'atalho'))
    assert.equal(caminhoDentro(raiz, 'atalho'), null)
    assert.equal(caminhoDentro(raiz, 'atalho/segredo.txt'), null)
    assert.equal(caminhoDentro(raiz, 'atalho/ainda-nao-existe.txt'), null)
  })

  it('o pai de um arquivo que ainda não existe também precisa cair dentro', (t) => {
    const { raiz, fora } = escritorioDeMentira(t)
    assert.equal(caminhoDentro(raiz, join(fora, 'nova', 'nota.md')), null)
    assert.equal(caminhoDentro(raiz, '../fora/nova/nota.md'), null)
    assert.equal(caminhoDentro(raiz, 'nova/nota.md'), join(raiz, 'nova', 'nota.md'))
  })
})

describe('criarOficina', () => {
  it('cria a pasta do agente 0700 com um LEIA.md, e chamar de novo não muda nada', (t) => {
    const { raiz } = escritorioDeMentira(t)
    const pasta = criarOficina(raiz, 'agente-rds')
    assert.equal(pasta, join(raiz, 'agente-rds'))
    assert.equal(statSync(pasta).mode & 0o777, 0o700)
    const leia = join(pasta, 'LEIA.md')
    assert.ok(readFileSync(leia, 'utf8').includes('agente-rds'))
    writeFileSync(join(pasta, 'nota.md'), 'minha ideia')
    writeFileSync(leia, 'mexido')
    assert.equal(criarOficina(raiz, 'agente-rds'), pasta)
    assert.equal(readFileSync(join(pasta, 'nota.md'), 'utf8'), 'minha ideia')
    assert.equal(readFileSync(leia, 'utf8'), 'mexido')
  })

  it('id de agente com barra, com .. ou com maiúscula não vira pasta', (t) => {
    const { raiz } = escritorioDeMentira(t)
    for (const id of ['../fora', 'a/b', '..', 'Agente-RDS', '', ' ', '/etc', 'agente rds', 'agente_rds', 'a'.repeat(65)]) {
      assert.throws(() => criarOficina(raiz, id), /Id de agente inválido/, id)
    }
    assert.equal(sanearIdDeAgente('agente-rds-2'), 'agente-rds-2')
    assert.deepEqual(listarOficina(raiz), [])
  })
})

describe('raizDasOficinas', () => {
  it('a pasta dentro de servidor/, longe de dados/ e dos projetos, é aceita', (t) => {
    const { servidor, raiz, config } = escritorioDeMentira(t)
    assert.equal(raizDasOficinas(config, servidor), raiz)
  })

  it('recusa subir com a pasta fora de servidor/', (t) => {
    const { base, servidor, fora, config } = escritorioDeMentira(t)
    assert.throws(() => raizDasOficinas({ ...config, dirAgentesProjeto: fora }, servidor), /precisa ficar dentro de/)
    assert.throws(() => raizDasOficinas({ ...config, dirAgentesProjeto: servidor }, servidor), /precisa ficar dentro de/)
    assert.throws(() => raizDasOficinas({ ...config, dirAgentesProjeto: join(base, 'nao-existe') }, servidor), /não existe/)
  })

  it('recusa subir com a pasta dentro de dados/ ou com os projetos do humano dentro dela', (t) => {
    const { servidor, raiz, config } = escritorioDeMentira(t)
    const dentroDeDados = join(servidor, 'dados', 'agentes-projeto')
    mkdirSync(dentroDeDados, { recursive: true })
    assert.throws(
      () => raizDasOficinas({ ...config, dirAgentesProjeto: dentroDeDados, dirDados: join(servidor, 'dados') }, servidor),
      /os dados do escritório/,
    )
    const projetosDentro = join(raiz, 'projects')
    mkdirSync(projetosDentro, { recursive: true })
    assert.throws(() => raizDasOficinas({ ...config, dirProjetos: projetosDentro }, servidor), /os projetos do humano/)
  })

  it('recusa subir com a pasta dentro de ~/.claude', (t) => {
    const { servidor, config } = escritorioDeMentira(t)
    const casa = join(servidor, 'casa')
    const raiz = join(casa, '.claude', 'agentes-projeto')
    mkdirSync(raiz, { recursive: true })
    const antes = process.env.HOME
    process.env.HOME = casa
    t.after(() => {
      if (antes === undefined) delete process.env.HOME
      else process.env.HOME = antes
    })
    assert.throws(() => raizDasOficinas({ ...config, dirAgentesProjeto: raiz }, servidor), /~\/\.claude/)
  })
})

describe('listarOficina e limparOficina', () => {
  it('a listagem é confinada e não segue link simbólico para fora', (t) => {
    const { raiz, fora } = escritorioDeMentira(t)
    writeFileSync(join(fora, 'segredo.txt'), 'segredo')
    symlinkSync(fora, join(raiz, 'atalho'))
    const pasta = criarOficina(raiz, 'claude')
    writeFileSync(join(pasta, 'jogo.js'), 'console.log(1)')
    assert.deepEqual(listarOficina(raiz).map((item) => item.nome), ['claude'])
    const dentro = listarOficina(raiz, 'claude')
    assert.deepEqual(dentro.map((item) => item.nome), ['jogo.js', 'LEIA.md'])
    assert.deepEqual(dentro.map((item) => item.caminho), [join('claude', 'jogo.js'), join('claude', 'LEIA.md')])
    assert.equal(dentro[0]?.bytes, 14)
    assert.equal(dentro[0]?.pasta, false)
    assert.deepEqual(listarOficina(raiz, 'nao-existe'), [])
    for (const caminho of ['../fora', '/etc', '~/.claude', 'atalho']) {
      assert.throws(() => listarOficina(raiz, caminho), /não fica na pasta dos agentes/, caminho)
    }
  })

  it('limpar apaga as pastas dos agentes e nada fora da raiz', (t) => {
    const { raiz, fora } = escritorioDeMentira(t)
    const segredo = join(fora, 'segredo.txt')
    writeFileSync(segredo, 'segredo')
    symlinkSync(fora, join(raiz, 'atalho'))
    writeFileSync(join(raiz, 'LEIA-ME.md'), '# leia')
    criarOficina(raiz, 'claude')
    criarOficina(raiz, 'agente-rds')
    assert.deepEqual(limparOficina(raiz, 'claude'), ['claude'])
    assert.equal(existsSync(join(raiz, 'claude')), false)
    assert.deepEqual(limparOficina(raiz), ['agente-rds'])
    assert.equal(existsSync(join(raiz, 'agente-rds')), false)
    assert.equal(existsSync(segredo), true, 'o arquivo de fora continua lá')
    assert.equal(existsSync(join(raiz, 'LEIA-ME.md')), true, 'o LEIA-ME da pasta continua lá')
    assert.throws(() => limparOficina(raiz, '../fora'), /Id de agente inválido/)
    assert.throws(() => limparOficina(raiz, 'atalho/..'), /Id de agente inválido/)
    assert.equal(existsSync(fora), true)
  })
})

describe('confinamento', () => {
  it('o bwrap é procurado no PATH e no lugar de sempre, sem rodar nada', (t) => {
    const base = pastaDeTeste(t)
    const bin = join(base, 'bin')
    mkdirSync(bin, { recursive: true })
    writeFileSync(join(bin, 'bwrap'), '')
    assert.equal(caminhoDoBwrap({ PATH: bin }), join(bin, 'bwrap'))
    assert.equal(caminhoDoBwrap({ PATH: `${join(base, 'vazio')}:${bin}` }), join(bin, 'bwrap'))
    const semPath = caminhoDoBwrap({ PATH: join(base, 'vazio') })
    assert.equal(semPath, existsSync('/usr/bin/bwrap') ? '/usr/bin/bwrap' : null)
  })

  it('a resposta sobre o confinamento é guardada e nunca derruba quem pergunta', () => {
    const primeira = oficinaDisponivel()
    assert.equal(typeof primeira, 'boolean')
    assert.equal(oficinaDisponivel(), primeira)
    assert.equal(oficinaDisponivel(true), primeira)
  })

  it('prepararSandbox devolve a raiz, a pasta vazia da decisão e se a oficina roda', (t) => {
    const { servidor, raiz, config } = escritorioDeMentira(t)
    const sandbox = prepararSandbox(config, servidor)
    assert.equal(sandbox.raiz, raiz)
    assert.equal(sandbox.vazio, join(raiz, '.vazio'))
    assert.equal(statSync(sandbox.vazio).mode & 0o777, 0o700)
    assert.equal(sandbox.disponivel, oficinaDisponivel())
    // Chamar de novo é inofensivo, e a pasta vazia continua vazia.
    assert.deepEqual(prepararSandbox(config, servidor), sandbox)
    assert.deepEqual(listarOficina(raiz, '.vazio'), [])
  })
})
