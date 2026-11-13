import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk'
import { parseDocument } from 'yaml'
import type { Agente } from './tipos.ts'

const GENERALISTA: Agente = {
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
}

const CORES: Readonly<Record<string, string>> = {
  red: '#f87171',
  blue: '#60a5fa',
  green: '#4ade80',
  yellow: '#facc15',
  purple: '#a78bfa',
  orange: '#fb923c',
  pink: '#f472b6',
  cyan: '#22d3ee',
}

const PALETA = ['#60a5fa', '#a78bfa', '#f472b6', '#2dd4bf', '#e4e4e7', '#94a3b8'] as const
const LIMITE_DESCRICAO = 240

// Lê os agentes do Claude Code (frontmatter YAML de cada .md): os pessoais da pasta dir e os de projeto de cada
// <dirProjetos>/<projeto>/.claude/agents. Retorna o generalista (com o modelo configurado para ele, se houver), os
// pessoais por nome de arquivo e depois os de projeto. Um agente de projeto com o nome de um pessoal fica de fora; com
// o id de outro já carregado, ganha o nome do projeto no id.
export function carregarAgentes(dir: string, modeloGeneralista: string | null = null, dirProjetos: string | null = null): Agente[] {
  const agentes: Agente[] = [{ ...GENERALISTA, modelo: modeloGeneralista }]
  const ids = new Set([GENERALISTA.id])
  const nomesPessoais = new Set<string>()
  for (const arquivo of listarArquivos(dir)) {
    const agente = lerAgente(join(dir, arquivo), null)
    if (!agente || ids.has(agente.id)) continue
    ids.add(agente.id)
    nomesPessoais.add(agente.nome.toLowerCase())
    agentes.push(agente)
  }
  for (const projeto of listarProjetos(dirProjetos)) {
    const pasta = join(projeto, '.claude', 'agents')
    for (const arquivo of listarArquivos(pasta)) {
      const agente = lerAgente(join(pasta, arquivo), projeto)
      if (!agente || nomesPessoais.has(agente.nome.toLowerCase())) continue
      if (ids.has(agente.id)) agente.id = `${agente.id}-${criarSlug(basename(projeto))}`
      if (ids.has(agente.id)) continue
      ids.add(agente.id)
      agentes.push(agente)
    }
  }
  return agentes
}

// Definição completa de um agente lida do .md (descrição, ferramentas, modelo e o texto como prompt), para passar
// ao SDK quando o agente não existe na pasta da ordem. Retorna null se o arquivo não puder ser lido.
export function lerDefinicaoDoAgente(arquivo: string): AgentDefinition | null {
  const lido = lerArquivoDoAgente(arquivo)
  if (!lido || typeof lido.dados.name !== 'string') return null
  const { dados, corpo } = lido
  const definicao: AgentDefinition = {
    description: typeof dados.description === 'string' ? dados.description.trim() : '',
    prompt: corpo.trim(),
  }
  const ferramentas = lerFerramentas(dados.tools)
  const proibidas = lerFerramentas(dados.disallowedTools)
  const skills = lerFerramentas(dados.skills)
  const modelo = textoOuNulo(dados.model)
  if (ferramentas) definicao.tools = ferramentas
  if (proibidas) definicao.disallowedTools = proibidas
  if (skills) definicao.skills = skills
  if (modelo) definicao.model = modelo
  return definicao
}

function listarProjetos(dir: string | null): string[] {
  if (!dir) return []
  let nomes: string[]
  try {
    nomes = readdirSync(dir)
  } catch {
    return []
  }
  return nomes
    .filter((nome) => !nome.startsWith('.'))
    .sort(compararNomes)
    .map((nome) => resolve(dir, nome))
    .filter((caminho) => ehPasta(join(caminho, '.claude', 'agents')))
}

function ehPasta(caminho: string): boolean {
  try {
    return statSync(caminho).isDirectory()
  } catch {
    return false
  }
}

function listarArquivos(dir: string): string[] {
  let nomes: string[]
  try {
    nomes = readdirSync(dir)
  } catch {
    return []
  }
  return nomes.filter((nome) => nome.endsWith('.md')).sort(compararNomes)
}

function compararNomes(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0)
}

function lerAgente(arquivo: string, origem: string | null): Agente | null {
  const dados = lerArquivoDoAgente(arquivo)?.dados
  const nome = dados?.name
  if (!dados || typeof nome !== 'string' || !nome.trim()) return null
  const id = criarSlug(nome)
  if (!id) return null
  return {
    id,
    nome,
    apelido: criarApelido(nome),
    descricao: resumirDescricao(dados.description),
    modelo: lerModelo(dados.model),
    cor: escolherCor(dados.color, id),
    ferramentas: lerFerramentas(dados.tools),
    memoria: textoOuNulo(dados.memory),
    arquivo: resolve(arquivo),
    generalista: false,
    origem,
  }
}

function lerArquivoDoAgente(arquivo: string): { dados: Record<string, unknown>; corpo: string } | null {
  let texto: string
  try {
    if (!statSync(arquivo).isFile()) return null
    texto = readFileSync(arquivo, 'utf8')
  } catch {
    return null
  }
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/)
  if (linhas[0]?.trim() !== '---') return null
  const fim = linhas.findIndex((linha, indice) => indice > 0 && linha.trim() === '---')
  if (fim < 0) return null
  try {
    const documento = parseDocument(linhas.slice(1, fim).join('\n'))
    if (documento.errors.length > 0) return null
    const dados: unknown = documento.toJS()
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return null
    return { dados: dados as Record<string, unknown>, corpo: linhas.slice(fim + 1).join('\n') }
  } catch {
    return null
  }
}

function criarSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function criarApelido(nome: string): string {
  const semPrefixo = nome.trim().replace(/^agente[-\s]/i, '')
  const comEspacos = semPrefixo.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!comEspacos) return nome
  if (comEspacos !== comEspacos.toLowerCase()) return comEspacos
  return comEspacos.replace(/(^|\s)(\S)/g, (_, espaco: string, letra: string) => espaco + letra.toUpperCase())
}

function resumirDescricao(valor: unknown): string {
  if (typeof valor !== 'string') return ''
  let texto = valor.replace(/\\n/g, '\n')
  const cortes = [texto.search(/\n[ \t]*\n/), texto.search(/Exemplos:|Examples:|<example>/)].filter((i) => i >= 0)
  if (cortes.length > 0) texto = texto.slice(0, Math.min(...cortes))
  texto = texto.replace(/\s+/g, ' ').trim()
  if (texto.length <= LIMITE_DESCRICAO) return texto
  const fimDaFrase = texto.lastIndexOf('. ', LIMITE_DESCRICAO - 2)
  if (fimDaFrase > 0) return texto.slice(0, fimDaFrase + 1)
  return `${texto.slice(0, LIMITE_DESCRICAO - 1).trimEnd()}…`
}

function lerModelo(valor: unknown): string | null {
  const modelo = textoOuNulo(valor)
  return modelo && modelo.toLowerCase() !== 'inherit' ? modelo : null
}

function escolherCor(valor: unknown, id: string): string {
  const conhecida = typeof valor === 'string' ? CORES[valor.trim().toLowerCase()] : undefined
  return conhecida ?? PALETA[fnv1a(id) % PALETA.length] ?? PALETA[0]
}

function fnv1a(texto: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function lerFerramentas(valor: unknown): string[] | null {
  const lista = typeof valor === 'string'
    ? valor.split(',')
    : Array.isArray(valor)
      ? valor.filter((item): item is string => typeof item === 'string')
      : null
  if (!lista) return null
  const ferramentas = lista.map((item) => item.trim()).filter(Boolean)
  return ferramentas.length > 0 ? ferramentas : null
}

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const texto = valor.trim()
  return texto ? texto : null
}
