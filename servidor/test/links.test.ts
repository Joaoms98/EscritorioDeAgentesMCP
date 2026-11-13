import assert from 'node:assert/strict'
import type { NetworkInterfaceInfo } from 'node:os'
import { describe, it } from 'node:test'
import { motivoSemCelular, qrEmSvg, qrNoTerminal, redeDoCelular, textoDosLinks } from '../src/links.ts'

function rede(address: string, netmask = '255.255.255.0', dados: Partial<NetworkInterfaceInfo> = {}): NetworkInterfaceInfo {
  return { address, netmask, family: 'IPv4', mac: '00:00:00:00:00:00', internal: false, cidr: null, ...dados } as NetworkInterfaceInfo
}

const interfaces = {
  'lo': [rede('127.0.0.1', '255.0.0.0', { internal: true })],
  'docker0': [rede('172.17.0.1', '255.255.0.0')],
  'wlp2s0': [rede('192.168.0.15'), { ...rede('fe80::1', 'ffff:ffff:ffff:ffff::'), family: 'IPv6' } as NetworkInterfaceInfo],
  'enp3s0': [rede('10.20.37.5', '255.255.240.0')],
}

// Módulos escuros do desenho, para conferir os quadrados de canto do QR.
function escuros({ tamanho, caminho }: { tamanho: number; caminho: string }): boolean[][] {
  const matriz = Array.from({ length: tamanho }, () => Array<boolean>(tamanho).fill(false))
  for (const [, coluna, linha, largura] of caminho.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let k = 0; k < Number(largura); k++) matriz[Number(linha)]![Number(coluna) + k] = true
  }
  return matriz
}

describe('redeDoCelular', () => {
  it('é a rede do primeiro IP do celular (Wi-Fi), no formato do firewall', () => {
    assert.equal(redeDoCelular('0.0.0.0', interfaces), '192.168.0.0/24')
  })

  it('com um host fixo, é a rede dele, com a máscara que ele tiver', () => {
    assert.equal(redeDoCelular('10.20.37.5', interfaces), '10.20.32.0/20')
  })

  it('só este computador, ou um IP que não é daqui: nada a liberar', () => {
    assert.equal(redeDoCelular('127.0.0.1', interfaces), null)
    assert.equal(redeDoCelular('203.0.113.9', interfaces), null)
    assert.equal(redeDoCelular('0.0.0.0', { lo: interfaces.lo }), null)
  })
})

describe('QR do celular', () => {
  const link = 'http://192.168.0.15:41793/?t=Zm9v%2BYmFy%2FYmF6%3Dchave-de-teste'

  it('o desenho da tela é um quadrado de versão válida, com os três quadrados de canto', () => {
    const desenho = qrEmSvg(link)
    assert.ok(desenho.tamanho >= 21 && (desenho.tamanho - 17) % 4 === 0)
    const m = escuros(desenho)
    const n = desenho.tamanho
    for (const [linha, coluna] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
      for (let k = 0; k < 7; k++) {
        assert.ok(m[linha]![coluna + k] && m[linha + 6]![coluna + k], `borda do quadrado de canto em ${linha},${coluna}`)
        assert.ok(m[linha + k]![coluna] && m[linha + k]![coluna + 6])
      }
      assert.ok(!m[linha + 1]![coluna + 1] && m[linha + 3]![coluna + 3], 'anel claro e miolo escuro')
    }
    assert.deepEqual(qrEmSvg(link), desenho)
  })

  it('o do terminal tem o recuo em todas as linhas', () => {
    const linhas = qrNoTerminal(link).split('\n').filter((linha) => linha.trim())
    assert.ok(linhas.length > 10)
    for (const linha of linhas) assert.ok(linha.startsWith('  '))
  })

  it('o texto dos links põe o QR só quando há link para o celular', () => {
    const com = textoDosLinks({ local: 'http://localhost:41793/?t=x', naRede: [link, 'http://10.0.0.5:41793/?t=x'] })
    assert.match(com, /Neste computador: {2}http:\/\/localhost:41793\/\?t=x/)
    assert.match(com, new RegExp(`No celular: +${link.replace(/[.?/]/g, '\\$&')}`))
    assert.ok(com.includes('Aponte a câmera do celular'))
    const sem = textoDosLinks({ local: 'http://localhost:41793/?t=x', naRede: [] })
    assert.ok(!sem.includes('Aponte a câmera') && !sem.includes('No celular'))
  })
})

describe('motivoSemCelular', () => {
  it('só este computador (127.0.0.1, ::1, localhost) é diferente de estar sem rede', () => {
    for (const host of ['127.0.0.1', '::1', 'localhost']) assert.equal(motivoSemCelular(host), 'so-local')
    for (const host of ['0.0.0.0', '::', '192.168.0.15']) assert.equal(motivoSemCelular(host), 'sem-rede')
  })
})
