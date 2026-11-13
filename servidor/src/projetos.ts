import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { ErroEscritorio, type Projeto } from './tipos.ts'

const VALIDADE_CACHE_MS = 10_000

const cache = new Map<string, { lidoEm: number; projetos: Projeto[] }>()

// Lista as subpastas visíveis da pasta de projetos, em ordem alfabética sem diferenciar maiúsculas. Retorna do cache por 10 s.
export function listarProjetos(dir: string): Projeto[] {
  const raiz = resolve(dir)
  const agora = Date.now()
  const guardado = cache.get(raiz)
  if (guardado && agora - guardado.lidoEm < VALIDADE_CACHE_MS) return guardado.projetos.map((p) => ({ ...p }))
  const projetos = lerProjetos(raiz)
  cache.set(raiz, { lidoEm: agora, projetos })
  return projetos.map((p) => ({ ...p }))
}

// Esquece as listas guardadas (usado nos testes e quando a pasta muda de propósito).
export function limparCacheProjetos(): void {
  cache.clear()
}

// Aceita o nome de um projeto da lista ou um caminho absoluto (com ~). Retorna o caminho absoluto da pasta.
export function resolverProjeto(dir: string, entrada: string): string {
  const texto = typeof entrada === 'string' ? entrada.trim() : ''
  if (!texto) throw new ErroEscritorio(400, 'Informe o projeto da ordem.')
  const expandido = texto === '~' ? homedir() : texto.startsWith('~/') ? join(homedir(), texto.slice(2)) : texto
  if (isAbsolute(expandido)) {
    const caminho = resolve(expandido)
    if (ehPasta(caminho)) return caminho
    throw naoEncontrado(texto)
  }
  const projetos = listarProjetos(dir)
  const minusculo = texto.toLowerCase()
  const achado = projetos.find((p) => p.nome === texto) ?? projetos.find((p) => p.nome.toLowerCase() === minusculo)
  if (achado && ehPasta(achado.caminho)) return achado.caminho
  if (!/[\\/]/.test(texto) && !texto.startsWith('.')) {
    const caminho = join(resolve(dir), texto)
    if (ehPasta(caminho)) return caminho
  }
  throw naoEncontrado(texto)
}

function lerProjetos(raiz: string): Projeto[] {
  let nomes: string[]
  try {
    nomes = readdirSync(raiz)
  } catch {
    return []
  }
  return nomes
    .filter((nome) => !nome.startsWith('.') && ehPasta(join(raiz, nome)))
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0))
    .map((nome) => ({ nome, caminho: join(raiz, nome) }))
}

// Diz se o caminho existe e é uma pasta (segue links simbólicos).
export function ehPasta(caminho: string): boolean {
  try {
    return statSync(caminho).isDirectory()
  } catch {
    return false
  }
}

function naoEncontrado(entrada: string): ErroEscritorio {
  return new ErroEscritorio(400, `Projeto não encontrado: ${entrada}`)
}
