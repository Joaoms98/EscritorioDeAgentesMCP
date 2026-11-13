import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { carregarAgentes, lerDefinicaoDoAgente } from '../src/agentes.ts'

const PALETA = ['#60a5fa', '#a78bfa', '#f472b6', '#2dd4bf', '#e4e4e7', '#94a3b8']

const DESCRICAO_LONGA_SEM_PONTO = 'Use this agent when you need to write production code following a test first workflow, '
  + 'implement new features with small steps, refactor existing modules without changing behavior, create helper '
  + 'abstractions that stay easy to read, or whenever any coding task needs careful design and fast feedback from tests'

const ARQUIVOS: Record<string, string> = {
  'Agente-Mercadolivre.md': String.raw`---
name: Agente-Mercadolivre
description: "Use este agente para conferir anúncios de teste numa conta fictícia: listar itens, comparar preços e montar uma planilha para revisão. Ele conhece os limites da API de exemplo e espera quando ela pede calma.\n\nExemplos:\n\n- Exemplo 1:\n  user: \"me traz os anúncios\"\n  assistant: \"Vou usar o agente de teste.\""
model: opus
color: yellow
memory: user
---

Texto do corpo que não deve aparecer em lugar nenhum.
`,
  'Agente-RDS.md': `---
name: Agente-RDS
description: "Use para consultar um banco de dados de exemplo em modo somente leitura: contar linhas, medir volume e conferir a estrutura de uma tabela de teste sem escrever nada. Ele abre a conexão, roda a consulta e fecha tudo no final, mesmo quando algo dá errado no meio do caminho e precisa tentar de novo."
tools: Bash, Read, Grep, Glob
model: opus
color: orange
---
Corpo.
`,
  'qa-analyst.md': String.raw`---
name: QA-Ana
description: "Use this agent to review tests written by another agent and report what is missing. She never edits files, she only writes a report.\\n\\nExamples:\\n\\n- Example 1:\\n  user: \"revise os testes\"\\n  assistant: \"vou chamar a QA\""
model: sonnet
color: purple
memory: user
---
Corpo.
`,
  'senior-tdd-engineer.md': String.raw`---
name: senior-tdd-engineer
description: "${DESCRICAO_LONGA_SEM_PONTO}\\n\\nExamples:\\n\\n- User: \"crie um endpoint\""
model: opus
color: blue
memory: user
---
Corpo.
`,
  'dados-brutos.md': `---
name: agente-dados-brutos
description: Lê planilhas
tools:
  - Read
  - Grep
  - 42
model: inherit
color: Magenta
---
`,
  'zz-cor-estranha.md': '﻿---\r\nname: Zé da Cor\r\ncolor: RED\r\n---\r\nCorpo.\r\n',
  'sem-nome.md': '---\ndescription: Não tem nome\n---\n',
  'nome-vazio.md': '---\nname: ""\n---\n',
  'quebrado.md': '---\nname: [aberto\ndescription: x\n---\n',
  'sem-frontmatter.md': '# Só markdown\n\nname: Fantasma\n',
  'sem-fechamento.md': '---\nname: Sem Fim\ndescription: nunca fecha\n',
  'lista.md': '---\n- name: Lista\n---\n',
  'duplicado.md': '---\nname: agente rds\ndescription: cópia\n---\n',
  'claude.md': '---\nname: Claude\ndescription: tenta tomar o lugar do generalista\n---\n',
  'notas.txt': '---\nname: Texto\n---\n',
}

function criarPasta(t: TestContext, arquivos: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'escritorio-agentes-'))
  for (const [nome, conteudo] of Object.entries(arquivos)) writeFileSync(join(dir, nome), conteudo)
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function fnv1a(texto: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

test('lê os agentes da pasta com o generalista primeiro e na ordem dos arquivos', (t) => {
  const dir = criarPasta(t, ARQUIVOS)
  mkdirSync(join(dir, 'pasta.md'))
  const agentes = carregarAgentes(dir)

  assert.deepEqual(agentes.map((agente) => agente.id), [
    'claude',
    'agente-mercadolivre',
    'agente-rds',
    'agente-dados-brutos',
    'qa-ana',
    'senior-tdd-engineer',
    'ze-da-cor',
  ])
  assert.deepEqual(agentes[0], {
    id: 'claude',
    nome: 'Claude',
    apelido: 'Claude',
    descricao: 'Generalista: faz qualquer tarefa com o Claude Code completo, sem um papel específico.',
    modelo: null,
    cor: '#d97757',
    ferramentas: null,
    memoria: null,
    arquivo: null,
    generalista: true,
    origem: null,
  })
  assert.doesNotMatch(JSON.stringify(agentes), /Texto do corpo|Corpo\./)
})

test('aplica as regras de apelido, descrição, cor, modelo, ferramentas e memória', (t) => {
  const dir = criarPasta(t, ARQUIVOS)
  const porId = new Map(carregarAgentes(dir).map((agente) => [agente.id, agente]))

  assert.deepEqual(porId.get('agente-mercadolivre'), {
    id: 'agente-mercadolivre',
    nome: 'Agente-Mercadolivre',
    apelido: 'Mercadolivre',
    descricao: 'Use este agente para conferir anúncios de teste numa conta fictícia: listar itens, comparar preços e montar '
      + 'uma planilha para revisão. Ele conhece os limites da API de exemplo e espera quando ela pede calma.',
    modelo: 'opus',
    cor: '#facc15',
    ferramentas: null,
    memoria: 'user',
    arquivo: join(dir, 'Agente-Mercadolivre.md'),
    generalista: false,
    origem: null,
  })

  const rds = porId.get('agente-rds')
  assert.equal(rds?.apelido, 'RDS')
  assert.equal(rds?.descricao, 'Use para consultar um banco de dados de exemplo em modo somente leitura: contar linhas, '
    + 'medir volume e conferir a estrutura de uma tabela de teste sem escrever nada.')
  assert.deepEqual(rds?.ferramentas, ['Bash', 'Read', 'Grep', 'Glob'])
  assert.equal(rds?.cor, '#fb923c')
  assert.equal(rds?.memoria, null)

  const qa = porId.get('qa-ana')
  assert.equal(qa?.nome, 'QA-Ana')
  assert.equal(qa?.apelido, 'QA Ana')
  assert.equal(qa?.descricao, 'Use this agent to review tests written by another agent and report what is missing. '
    + 'She never edits files, she only writes a report.')
  assert.equal(qa?.modelo, 'sonnet')
  assert.equal(qa?.cor, '#a78bfa')
  assert.equal(qa?.arquivo, join(dir, 'qa-analyst.md'))

  const senior = porId.get('senior-tdd-engineer')
  assert.equal(senior?.apelido, 'Senior Tdd Engineer')
  assert.equal(senior?.descricao, `${DESCRICAO_LONGA_SEM_PONTO.slice(0, 239).trimEnd()}…`)
  assert.ok((senior?.descricao.length ?? 0) <= 240)
  assert.equal(senior?.cor, '#60a5fa')

  const brutos = porId.get('agente-dados-brutos')
  assert.equal(brutos?.apelido, 'Dados Brutos')
  assert.equal(brutos?.descricao, 'Lê planilhas')
  assert.equal(brutos?.modelo, null)
  assert.deepEqual(brutos?.ferramentas, ['Read', 'Grep'])
  assert.equal(brutos?.cor, PALETA[fnv1a('agente-dados-brutos') % PALETA.length])

  const ze = porId.get('ze-da-cor')
  assert.equal(ze?.nome, 'Zé da Cor')
  assert.equal(ze?.apelido, 'Zé da Cor')
  assert.equal(ze?.descricao, '')
  assert.equal(ze?.cor, '#f87171')
})

test('a cor de reserva é estável e sai da paleta', (t) => {
  const dir = criarPasta(t, {
    'um.md': '---\nname: Robô Um\n---\n',
    'dois.md': '---\nname: robo-dois\ncolor: "#123456"\n---\n',
  })
  const primeira = carregarAgentes(dir)
  const segunda = carregarAgentes(dir)
  assert.deepEqual(primeira.map((agente) => agente.cor), segunda.map((agente) => agente.cor))
  assert.equal(primeira[1]?.id, 'robo-dois')
  assert.equal(primeira[1]?.cor, PALETA[fnv1a('robo-dois') % PALETA.length])
  assert.equal(primeira[2]?.id, 'robo-um')
  assert.equal(primeira[2]?.cor, PALETA[fnv1a('robo-um') % PALETA.length])
})

test('nomes repetidos ficam com o primeiro arquivo em ordem alfabética', (t) => {
  const dir = criarPasta(t, {
    'b.md': '---\nname: Xis\ndescription: segundo\n---\n',
    'a.md': '---\nname: xis\ndescription: primeiro\n---\n',
  })
  const agentes = carregarAgentes(dir)
  assert.equal(agentes.length, 2)
  assert.equal(agentes[1]?.nome, 'xis')
  assert.equal(agentes[1]?.descricao, 'primeiro')
})

test('agentes de projeto: lê <projeto>/.claude/agents, o pessoal com o mesmo nome ganha e id repetido leva o projeto', (t) => {
  const pessoais = criarPasta(t, { 'Agente-RDS.md': ARQUIVOS['Agente-RDS.md'] ?? '' })
  const projetos = mkdtempSync(join(tmpdir(), 'escritorio-projetos-'))
  t.after(() => rmSync(projetos, { recursive: true, force: true }))
  const agenteDe = (nome: string, corpo: string) => `---\nname: ${nome}\ndescription: >-\n  Agente ${nome} de teste.\n\n  Exemplos:\n  - nada\ntools: Read, Edit\nmodel: sonnet\n---\n\n${corpo}\n`
  const escrever = (projeto: string, arquivo: string, conteudo: string) => {
    mkdirSync(join(projetos, projeto, '.claude', 'agents'), { recursive: true })
    writeFileSync(join(projetos, projeto, '.claude', 'agents', arquivo), conteudo)
  }
  escrever('skills', 'designer.md', agenteDe('designer', '# Designer\nUse as skills deste repositório.'))
  escrever('skills', 'rds.md', agenteDe('Agente-RDS', 'cópia de projeto'))
  escrever('web', 'designer.md', agenteDe('designer', 'outro designer'))
  escrever('.escondido', 'x.md', agenteDe('xis', 'não aparece'))
  mkdirSync(join(projetos, 'sem-agentes'))

  const agentes = carregarAgentes(pessoais, null, projetos)
  assert.deepEqual(agentes.map((agente) => agente.id), ['claude', 'agente-rds', 'designer', 'designer-web'])
  const porId = new Map(agentes.map((agente) => [agente.id, agente]))
  assert.equal(porId.get('claude')?.origem, null)
  assert.equal(porId.get('agente-rds')?.origem, null)
  assert.equal(porId.get('designer')?.origem, join(projetos, 'skills'))
  assert.equal(porId.get('designer')?.apelido, 'Designer')
  assert.equal(porId.get('designer')?.descricao, 'Agente designer de teste.')
  assert.equal(porId.get('designer-web')?.origem, join(projetos, 'web'))
  assert.equal(porId.get('designer-web')?.nome, 'designer')
  assert.deepEqual(carregarAgentes(pessoais).map((agente) => agente.id), ['claude', 'agente-rds'])

  const definicao = lerDefinicaoDoAgente(porId.get('designer')?.arquivo ?? '')
  assert.deepEqual(definicao, {
    description: 'Agente designer de teste.\nExemplos: - nada',
    prompt: '# Designer\nUse as skills deste repositório.',
    tools: ['Read', 'Edit'],
    model: 'sonnet',
  })
  assert.equal(lerDefinicaoDoAgente(join(projetos, 'nao-existe.md')), null)
})

test('pasta que não existe devolve só o generalista', () => {
  const agentes = carregarAgentes(join(tmpdir(), 'escritorio-nao-existe-agentes', 'nada'))
  assert.deepEqual(agentes.map((agente) => agente.id), ['claude'])
})

test('o generalista mostra o modelo configurado para ele e os outros ficam com o do arquivo', (t) => {
  const dir = criarPasta(t, ARQUIVOS)
  const agentes = carregarAgentes(dir, 'haiku')
  assert.equal(agentes[0]?.id, 'claude')
  assert.equal(agentes[0]?.modelo, 'haiku')
  assert.equal(agentes.find((agente) => agente.id === 'qa-ana')?.modelo, 'sonnet')
  assert.equal(agentes.find((agente) => agente.id === 'agente-dados-brutos')?.modelo, null)
  assert.equal(carregarAgentes(dir)[0]?.modelo, null)
})
