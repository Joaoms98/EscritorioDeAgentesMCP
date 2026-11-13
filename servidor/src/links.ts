import { createRequire } from 'node:module'
import { networkInterfaces } from 'node:os'
import type { Config } from './tipos.ts'

type GeradorQr = { generate(texto: string, opcoes: { small: boolean }, pronto: (qr: string) => void): void }

type CodigoQr = {
  addData(texto: string): void
  make(): void
  getModuleCount(): number
  isDark(linha: number, coluna: number): boolean
}

type Interfaces = ReturnType<typeof networkInterfaces>

export type LinksDoBanner = {
  local: string
  naRede: string[]
  comandoMcp: string
}

// QR como caminho de SVG em módulos (sem a margem): um retângulo por trecho escuro de cada linha.
export type DesenhoQr = {
  tamanho: number
  caminho: string
}

// O qrcode-terminal desenha o QR do banner e traz o gerador que ele usa, de onde a tela tira a matriz para o SVG.
const exigir = createRequire(import.meta.url)
const qrcode = exigir('qrcode-terminal') as GeradorQr
const GeradorDeMatriz = exigir('qrcode-terminal/vendor/QRCode') as new (versao: number, nivel: number) => CodigoQr
const NIVEIS_DE_CORRECAO = exigir('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel') as { L: number; M: number }

// Hosts em que o escritório só atende este computador, e os que também atendem a rede ('0.0.0.0' e '::' = todas).
const SO_ESTE_COMPUTADOR = new Set(['127.0.0.1', '::1', 'localhost'])
const LOCAIS = new Set([...SO_ESTE_COMPUTADOR, '0.0.0.0', '::'])
const INTERFACES_FISICAS = /^(wl|en|eth)/
// Pontes de contêineres e de máquinas virtuais: o celular não chega por elas.
const INTERFACES_VIRTUAIS = /^(docker|br-|veth|lxcbr|virbr|cni|flannel|podman)/

function ipv4Privado(endereco: string): boolean {
  const [a = -1, b = -1] = endereco.split('.').map(Number)
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function naUrl(host: string): string {
  return host.includes(':') ? `[${host}]` : host
}

function lerUrlWeb(texto: string | null): URL | null {
  if (!texto?.trim()) return null
  try {
    const url = new URL(texto.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

// IPs por onde o celular alcança o escritório: Wi-Fi e Ethernet com IP privado primeiro, as outras redes (VPNs) depois. Retorna os IPs.
export function ipsDaRede(host: string, interfaces: Interfaces = networkInterfaces()): string[] {
  if (host !== '0.0.0.0' && host !== '::') return LOCAIS.has(host) ? [] : [host]
  const candidatos: Array<{ ip: string; ordem: number }> = []
  for (const [nome, enderecos] of Object.entries(interfaces)) {
    if (INTERFACES_VIRTUAIS.test(nome)) continue
    for (const rede of enderecos ?? []) {
      if (rede.family !== 'IPv4' || rede.internal) continue
      const ordem = INTERFACES_FISICAS.test(nome) ? (ipv4Privado(rede.address) ? 0 : 1) : 2
      candidatos.push({ ip: rede.address, ordem })
    }
  }
  return candidatos.sort((a, b) => a.ordem - b.ordem).map((candidato) => candidato.ip)
}

// Links do banner: a interface (a do Vite, no npm run dev) com a chave em ?t= e o comando do MCP. Retorna os links.
export function linksDoBanner(
  config: Pick<Config, 'host' | 'token'>,
  porta: number,
  urlWeb: string | null = null,
  interfaces: Interfaces = networkInterfaces(),
): LinksDoBanner {
  const servidor = `http://${LOCAIS.has(config.host) ? 'localhost' : naUrl(config.host)}:${porta}`
  const web = lerUrlWeb(urlWeb)
  const chave = `/?t=${encodeURIComponent(config.token)}`
  const protocolo = web?.protocol ?? 'http:'
  const portaWeb = web ? web.port : String(porta)
  return {
    local: `${web?.origin ?? servidor}${chave}`,
    naRede: ipsDaRede(config.host, interfaces).map((ip) => `${protocolo}//${naUrl(ip)}${portaWeb ? `:${portaWeb}` : ''}${chave}`),
    comandoMcp: `claude mcp add --scope user --transport http escritorio ${servidor}/mcp --header "Authorization: Bearer ${config.token}"`,
  }
}

// Rede local do primeiro IP do celular, no formato do firewall (ex.: 192.168.0.0/24), para liberar a porta só para ela.
// Retorna o CIDR, ou null quando o escritório não aceita conexões de fora ou o IP não é IPv4 de uma interface daqui.
export function redeDoCelular(host: string, interfaces: Interfaces = networkInterfaces()): string | null {
  const [ip] = ipsDaRede(host, interfaces)
  if (!ip) return null
  for (const enderecos of Object.values(interfaces)) {
    for (const rede of enderecos ?? []) {
      if (rede.family !== 'IPv4' || rede.address !== ip) continue
      const mascara = rede.netmask.split('.').map(Number)
      const bits = mascara.reduce((total, octeto) => total + octeto.toString(2).replaceAll('0', '').length, 0)
      const inicio = ip.split('.').map((octeto, i) => Number(octeto) & (mascara[i] ?? 0))
      return `${inicio.join('.')}/${bits}`
    }
  }
  return null
}

// Por que não há link para o celular: 'so-local' (o escritório só aceita este computador) ou 'sem-rede'
// (ele aceita a rede, mas o computador não está em nenhuma agora). Retorna o motivo.
export function motivoSemCelular(host: string): 'so-local' | 'sem-rede' {
  return SO_ESTE_COMPUTADOR.has(host) ? 'so-local' : 'sem-rede'
}

// QR do texto para o terminal: meio bloco por módulo, claro sobre o fundo escuro, com recuo em cada linha. Retorna o texto.
export function qrNoTerminal(texto: string, recuo = '  '): string {
  let desenho = ''
  qrcode.generate(texto, { small: true }, (qr) => {
    desenho = qr
  })
  return desenho.replace(/^/gm, recuo)
}

// QR do texto para a tela (correção M, aguenta um reflexo na tela do computador). Retorna { tamanho, caminho }.
export function qrEmSvg(texto: string): DesenhoQr {
  const codigo = new GeradorDeMatriz(-1, NIVEIS_DE_CORRECAO.M)
  codigo.addData(texto)
  codigo.make()
  const tamanho = codigo.getModuleCount()
  let caminho = ''
  for (let linha = 0; linha < tamanho; linha++) {
    let coluna = 0
    while (coluna < tamanho) {
      if (!codigo.isDark(linha, coluna)) {
        coluna += 1
        continue
      }
      let fim = coluna
      while (fim < tamanho && codigo.isDark(linha, fim)) fim += 1
      caminho += `M${coluna} ${linha}h${fim - coluna}v1h-${fim - coluna}z`
      coluna = fim
    }
  }
  return { tamanho, caminho }
}

// Linhas com os links (deste computador e do celular) e o QR do primeiro link do celular, como no banner.
export function textoDosLinks(links: Pick<LinksDoBanner, 'local' | 'naRede'>): string {
  const linhas = [
    `  Neste computador:  ${links.local}`,
    ...links.naRede.map((url, i) => `  ${i === 0 ? 'No celular:       ' : '                  '} ${url}`),
  ]
  if (links.naRede[0]) linhas.push('', '  Aponte a câmera do celular (na mesma rede Wi-Fi):', qrNoTerminal(links.naRede[0]))
  return linhas.join('\n')
}
