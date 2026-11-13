import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import type { ChildProcessByStdio } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, watch, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import type { NetworkInterfaceInfo } from 'node:os'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { DatabaseSync } from 'node:sqlite'
import { after, describe, it } from 'node:test'
import { setTimeout as esperar } from 'node:timers/promises'
import { ehOProgramaPrincipal } from '../src/index.ts'
import { ipsDaRede, linksDoBanner } from '../src/links.ts'
import type { DetalheOrdem, Ordem } from '../src/tipos.ts'

const CHAVE = 'Zm9v+YmFy/YmF6=chave-de-teste-index'
const INDEX = join(import.meta.dirname, '..', 'src', 'index.ts')

function rede(address: string, dados: Partial<NetworkInterfaceInfo> = {}): NetworkInterfaceInfo {
  return { address, netmask: '255.255.255.0', family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: `${address}/24`, ...dados } as NetworkInterfaceInfo
}

const interfaces = {
  'lo': [rede('127.0.0.1', { internal: true })],
  'docker0': [rede('172.17.0.1')],
  'br-3f2a': [rede('172.18.0.1')],
  'veth12ab': [rede('169.254.10.1')],
  'virbr0': [rede('192.168.122.1')],
  'tailscale0': [rede('100.101.102.103')],
  'eth1': [rede('203.0.113.7')],
  'wlp2s0': [rede('192.168.0.15'), { ...rede('fe80::1'), family: 'IPv6' } as NetworkInterfaceInfo],
  'enp3s0': [rede('10.0.0.5')],
}

describe('banner', () => {
  it('a chave vai codificada nos links (o "+" não vira espaço) e o MCP vale para todos os projetos', () => {
    const links = linksDoBanner({ host: '0.0.0.0', token: CHAVE }, 41793, null, interfaces)
    assert.equal(links.local, `http://localhost:41793/?t=${encodeURIComponent(CHAVE)}`)
    assert.equal(new URL(links.local).searchParams.get('t'), CHAVE)
    assert.equal(new URL(links.naRede[0]!).searchParams.get('t'), CHAVE)
    assert.equal(links.comandoMcp, `claude mcp add --scope user --transport http escritorio http://localhost:41793/mcp --header "Authorization: Bearer ${CHAVE}"`)
  })

  it('na rede: Wi-Fi e Ethernet com IP privado primeiro, depois as outras; pontes de contêiner e VM ficam de fora', () => {
    assert.deepEqual(ipsDaRede('0.0.0.0', interfaces), ['192.168.0.15', '10.0.0.5', '203.0.113.7', '100.101.102.103'])
    assert.deepEqual(ipsDaRede('::', interfaces), ['192.168.0.15', '10.0.0.5', '203.0.113.7', '100.101.102.103'])
    assert.deepEqual(ipsDaRede('127.0.0.1', interfaces), [])
    assert.deepEqual(ipsDaRede('localhost', interfaces), [])
    assert.deepEqual(ipsDaRede('192.168.0.15', interfaces), ['192.168.0.15'])
    const links = linksDoBanner({ host: '0.0.0.0', token: 'chave-simples-0123456789' }, 41793, null, interfaces)
    assert.deepEqual(links.naRede, [
      'http://192.168.0.15:41793/?t=chave-simples-0123456789',
      'http://10.0.0.5:41793/?t=chave-simples-0123456789',
      'http://203.0.113.7:41793/?t=chave-simples-0123456789',
      'http://100.101.102.103:41793/?t=chave-simples-0123456789',
    ])
  })

  it('no npm run dev os links e o QR vão para o Vite; o MCP continua na porta do servidor', () => {
    const links = linksDoBanner({ host: '0.0.0.0', token: 'chave-simples-0123456789' }, 41793, 'http://localhost:5173', interfaces)
    assert.equal(links.local, 'http://localhost:5173/?t=chave-simples-0123456789')
    assert.equal(links.naRede[0], 'http://192.168.0.15:5173/?t=chave-simples-0123456789')
    assert.ok(links.comandoMcp.includes(' http://localhost:41793/mcp '))
    for (const invalida of ['', '   ', 'nada', 'ftp://localhost:21']) {
      assert.equal(linksDoBanner({ host: '0.0.0.0', token: 'chave-simples-0123456789' }, 41793, invalida, interfaces).local, 'http://localhost:41793/?t=chave-simples-0123456789')
    }
  })

  it('host específico: o link usa o host (IPv6 entre colchetes)', () => {
    const ipv4 = linksDoBanner({ host: '192.168.0.15', token: 'chave-simples-0123456789' }, 41793, null, interfaces)
    assert.equal(ipv4.local, 'http://192.168.0.15:41793/?t=chave-simples-0123456789')
    assert.deepEqual(ipv4.naRede, ['http://192.168.0.15:41793/?t=chave-simples-0123456789'])
    const ipv6 = linksDoBanner({ host: 'fd00::7', token: 'chave-simples-0123456789' }, 41793, null, interfaces)
    assert.equal(ipv6.local, 'http://[fd00::7]:41793/?t=chave-simples-0123456789')
    assert.equal(ipv6.naRede[0], 'http://[fd00::7]:41793/?t=chave-simples-0123456789')
  })
})

describe('partida', () => {
  const pastas: string[] = []

  after(() => {
    for (const pasta of pastas) rmSync(pasta, { recursive: true, force: true })
  })

  it('só sobe o servidor quando o index.ts é o programa; antes do Node 24.2, pelo script da linha de comando', () => {
    assert.equal(ehOProgramaPrincipal(true, '/outro/programa.ts'), true)
    assert.equal(ehOProgramaPrincipal(false, INDEX), false)
    assert.equal(ehOProgramaPrincipal(undefined, INDEX), true)
    const pasta = mkdtempSync(join(tmpdir(), 'escritorio-atalho-'))
    pastas.push(pasta)
    const atalho = join(pasta, 'index.ts')
    symlinkSync(INDEX, atalho)
    assert.equal(ehOProgramaPrincipal(undefined, atalho), true)
    assert.equal(ehOProgramaPrincipal(undefined, join(import.meta.dirname, 'index.test.ts')), false)
    assert.equal(ehOProgramaPrincipal(undefined, join(pasta, 'nao-existe.ts')), false)
    assert.equal(ehOProgramaPrincipal(undefined, undefined), false)
  })
})

type Processo = {
  filho: ChildProcessByStdio<null, Readable, Readable>
  saida: () => string
  fim: Promise<number | null>
}

function subir(env: NodeJS.ProcessEnv): Processo {
  const filho = spawn(process.execPath, [INDEX], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let saida = ''
  filho.stdout.on('data', (pedaco: Buffer) => {
    saida += pedaco.toString()
  })
  filho.stderr.on('data', (pedaco: Buffer) => {
    saida += pedaco.toString()
  })
  const fim = new Promise<number | null>((resolve) => filho.on('exit', (codigo) => resolve(codigo)))
  return { filho, saida: () => saida, fim }
}

// Código de saída do processo; se ele não sair a tempo (um segundo servidor que subiu), mata e devolve null.
async function codigoDeSaida(processo: Processo, ms = 20_000): Promise<number | null> {
  const relogio = setTimeout(() => processo.filho.kill('SIGKILL'), ms)
  try {
    return await processo.fim
  } finally {
    clearTimeout(relogio)
  }
}

async function ate(condicao: () => boolean, ms = 20_000): Promise<void> {
  const limite = Date.now() + ms
  while (!condicao()) {
    if (Date.now() > limite) throw new Error('condição não aconteceu a tempo')
    await esperar(20)
  }
}

describe('um servidor por pasta de dados', () => {
  const pastas: string[] = []

  after(() => {
    for (const pasta of pastas) rmSync(pasta, { recursive: true, force: true })
  })

  function preparar(): { pasta: string; dados: string; env: NodeJS.ProcessEnv } {
    const pasta = mkdtempSync(join(tmpdir(), 'escritorio-index-'))
    pastas.push(pasta)
    const dados = join(pasta, 'dados')
    mkdirSync(dados, { mode: 0o700 })
    mkdirSync(join(pasta, 'projetos', 'loja'), { recursive: true })
    mkdirSync(join(pasta, 'agentes'))
    const env: NodeJS.ProcessEnv = {}
    for (const [nome, valor] of Object.entries(process.env)) {
      if (!nome.startsWith('ESCRITORIO_') && !nome.startsWith('NODE_TEST')) env[nome] = valor
    }
    Object.assign(env, {
      ESCRITORIO_SIMULADO: '1',
      ESCRITORIO_HOST: '127.0.0.1',
      ESCRITORIO_PORTA: '0',
      ESCRITORIO_DADOS: dados,
      ESCRITORIO_PROJETOS: join(pasta, 'projetos'),
      ESCRITORIO_AGENTES: join(pasta, 'agentes'),
      ESCRITORIO_TOKEN: CHAVE,
    })
    return { pasta, dados, env }
  }

  it('com a pasta travada por um processo vivo, sai dizendo o PID e nem abre o banco', async () => {
    const { dados, env } = preparar()
    writeFileSync(join(dados, 'servidor.trava'), `${process.pid}\n`)
    const segundo = subir(env)
    assert.equal(await codigoDeSaida(segundo, 10_000), 1)
    assert.ok(segundo.saida().includes(`Não foi possível iniciar o Escritório de Agentes: Outro servidor do escritório (PID ${process.pid})`), segundo.saida())
    assert.equal(existsSync(join(dados, 'escritorio.db')), false)
    assert.equal(readFileSync(join(dados, 'servidor.trava'), 'utf8'), `${process.pid}\n`)
  })

  it('o segundo servidor é recusado sem mexer nas ordens do primeiro; ao desligar, a trava sai', async () => {
    const { dados, env } = preparar()
    const primeiro = subir(env)
    try {
      await ate(() => primeiro.saida().includes('está no ar') || primeiro.filho.exitCode !== null)
      const porta = /Neste computador: {2}http:\/\/localhost:(\d+)\/\?t=/.exec(primeiro.saida())?.[1]
      assert.ok(porta, primeiro.saida())
      assert.ok(primeiro.saida().includes(`?t=${encodeURIComponent(CHAVE)}`))
      assert.equal(readFileSync(join(dados, 'servidor.trava'), 'utf8'), `${primeiro.filho.pid}\n`)
      const base = `http://127.0.0.1:${porta}`
      const cabecalhos = { 'authorization': `Bearer ${CHAVE}`, 'content-type': 'application/json' }
      const resposta = await fetch(`${base}/api/ordens`, { method: 'POST', headers: cabecalhos, body: JSON.stringify({ agenteId: 'claude', projeto: 'loja', instrucao: 'Arrume os testes' }) })
      assert.equal(resposta.status, 201)
      const ordem = (await resposta.json()) as Ordem
      assert.equal(ordem.status, 'trabalhando')

      const segundo = subir(env)
      assert.equal(await codigoDeSaida(segundo, 10_000), 1)
      assert.ok(segundo.saida().includes(`Outro servidor do escritório (PID ${primeiro.filho.pid})`), segundo.saida())

      const detalhe = (await (await fetch(`${base}/api/ordens/${ordem.id}`, { headers: cabecalhos })).json()) as DetalheOrdem
      assert.equal(detalhe.ordem.status, 'trabalhando')
      assert.ok(!detalhe.eventos.some((evento) => evento.texto.includes('servidor foi')))
    } finally {
      primeiro.filho.kill('SIGTERM')
      assert.equal(await codigoDeSaida(primeiro), 0)
    }
    assert.equal(existsSync(join(dados, 'servidor.trava')), false)
  })

  it('um sinal no instante em que a trava nasce também a solta', async () => {
    const { dados, env } = preparar()
    // O inotify avisa assim que o arquivo é criado, antes de o servidor seguir com a partida. O primeiro aviso
    // do processo chega tarde demais, então um arquivo de aquecimento passa antes.
    let servidor: Processo | null = null
    let aquecido = () => {}
    const vigia = watch(dados, (_tipo, nome) => {
      if (nome === 'aquecimento') aquecido()
      if (nome === 'servidor.trava') servidor?.filho.kill('SIGTERM')
    })
    try {
      await new Promise<void>((resolve) => {
        aquecido = resolve
        writeFileSync(join(dados, 'aquecimento'), '')
      })
      servidor = subir(env)
      // Sai pelo ouvinte (código 0 ou 1), não morto pelo sinal (null), que deixaria a trava.
      assert.notEqual(await codigoDeSaida(servidor), null, servidor.saida())
    } finally {
      vigia.close()
    }
    assert.equal(existsSync(join(dados, 'servidor.trava')), false)
  })

  it('com a porta ocupada, sai antes de mexer no banco: a ordem na fila não começa', async () => {
    const { dados, env } = preparar()
    const primeiro = subir(env)
    let naFila = ''
    try {
      await ate(() => primeiro.saida().includes('está no ar') || primeiro.filho.exitCode !== null)
      const porta = /Neste computador: {2}http:\/\/localhost:(\d+)\//.exec(primeiro.saida())?.[1]
      assert.ok(porta, primeiro.saida())
      const cabecalhos = { 'authorization': `Bearer ${CHAVE}`, 'content-type': 'application/json' }
      for (const instrucao of ['Primeira', 'Segunda']) {
        const resposta = await fetch(`http://127.0.0.1:${porta}/api/ordens`, { method: 'POST', headers: cabecalhos, body: JSON.stringify({ agenteId: 'claude', projeto: 'loja', instrucao }) })
        const ordem = (await resposta.json()) as Ordem
        if (ordem.status === 'na_fila') naFila = ordem.id
      }
      assert.ok(naFila)
    } finally {
      primeiro.filho.kill('SIGTERM')
      assert.equal(await codigoDeSaida(primeiro), 0)
    }

    const ocupante = createServer()
    await new Promise<void>((resolve) => ocupante.listen(0, '127.0.0.1', resolve))
    try {
      const segundo = subir({ ...env, ESCRITORIO_PORTA: String((ocupante.address() as AddressInfo).port) })
      assert.equal(await codigoDeSaida(segundo, 10_000), 1)
      assert.ok(segundo.saida().includes('já está em uso'), segundo.saida())
    } finally {
      ocupante.close()
    }
    assert.equal(existsSync(join(dados, 'servidor.trava')), false)
    const banco = new DatabaseSync(join(dados, 'escritorio.db'), { readOnly: true })
    try {
      const linha = banco.prepare('SELECT status FROM ordens WHERE id = ?').get(naFila) as { status: string } | undefined
      assert.equal(linha?.status, 'na_fila')
    } finally {
      banco.close()
    }
  })
})
