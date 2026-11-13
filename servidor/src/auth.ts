import { createHash, timingSafeEqual } from 'node:crypto'

export const NOME_COOKIE = 'escritorio_chave'
const VALIDADE_COOKIE_S = 34_560_000

// Compara a chave recebida com a do escritório em tempo constante. Retorna true se conferem.
export function chaveConfere(recebida: string | null | undefined, esperada: string): boolean {
  if (typeof recebida !== 'string' || !recebida || !esperada) return false
  const a = createHash('sha256').update(recebida).digest()
  const b = createHash('sha256').update(esperada).digest()
  return timingSafeEqual(a, b)
}

// Chave do cabeçalho `Authorization: Bearer <chave>`. Retorna null se não houver.
export function chaveDoBearer(cabecalho: string | null | undefined): string | null {
  const achado = /^Bearer\s+(\S+)\s*$/i.exec(cabecalho ?? '')
  return achado?.[1] ?? null
}

// Chave do cookie `escritorio_chave`. Retorna null se não houver.
export function chaveDoCookie(cabecalho: string | null | undefined): string | null {
  for (const parte of (cabecalho ?? '').split(';')) {
    const igual = parte.indexOf('=')
    if (igual < 0 || parte.slice(0, igual).trim() !== NOME_COOKIE) continue
    const valor = parte.slice(igual + 1).trim()
    try {
      return decodeURIComponent(valor)
    } catch {
      return valor
    }
  }
  return null
}

// Diz se a requisição traz a chave certa (Bearer, ou o cookie quando aceitaCookie).
export function requisicaoAutorizada(cabecalhos: Headers, chave: string, aceitaCookie = true): boolean {
  if (chaveConfere(chaveDoBearer(cabecalhos.get('authorization')), chave)) return true
  return aceitaCookie && chaveConfere(chaveDoCookie(cabecalhos.get('cookie')), chave)
}

// Valor do Set-Cookie que guarda a chave no navegador.
export function cookieDeEntrada(chave: string): string {
  return `${NOME_COOKIE}=${encodeURIComponent(chave)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${VALIDADE_COOKIE_S}`
}

// Valor do Set-Cookie que apaga a chave do navegador.
export function cookieDeSaida(): string {
  return `${NOME_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
}
