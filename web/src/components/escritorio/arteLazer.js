import { P3, animar, chao, cub, faceX, faceY } from './iso.js'
import { ALTURA_PAREDE, ESPESSURA_PAREDE, LAZER_LARGURA, LAZER_PROFUNDIDADE, PORTA } from './arteEscritorio.js'
import { aparenciaDoAgente, bonecoDeCostas, bonecoDeLado, bonecoEmPe } from './pessoas.js'
import { caixa } from './profundidade.js'

// A área de lazer é um cômodo próprio: a TV fica na parede da esquerda (x = 0) e o fundo (y = 0) é a mureta com a porta.
// Junto do escritório, ela fica na frente da metade esquerda dele (x igual ao do escritório, y logo depois da mureta).
export const LAZER = { largura: LAZER_LARGURA, profundidade: LAZER_PROFUNDIDADE, porta: PORTA }
const TV = { y1: 24, y2: 68 }

const PAREDE_ESQ = '#2a2a30'
const PAREDE_FUNDO = '#303036'
const RODAPE = '#1b1b1f'

// Vagas por ordem da lista de agentes: a i-ésima pessoa sempre vai para a vaga i (as primeiras alternam TV e videogame).
// A partir da 9ª, ficam em pé na copa, com um café.
const VAGAS_SENTADAS = [
  { peca: 'sofa', assento: 0, atividade: 'tv' },
  { peca: 'pufeA', atividade: 'jogo' },
  { peca: 'pufeB', atividade: 'jogo' },
  { peca: 'sofa', assento: 2, atividade: 'tv' },
  { peca: 'poltrona', atividade: 'tv' },
  { peca: 'sofa', assento: 1, atividade: 'tv' },
  { peca: 'almofada', atividade: 'jogo' },
  { peca: 'fliperama', atividade: 'jogo' },
]
const POSICOES_COPA = [[21, 110], [44, 118], [23, 134], [68, 126], [46, 140], [90, 134]]
export const VAGAS_NO_LAZER = VAGAS_SENTADAS.length

// Pessoas sentadas: costas em xb, meio do corpo em yc, assento na altura zs, joelhos em joelho.
const SOFA = { x: 98, y: 18, assentos: 3, larguraAssento: 18.6 }
const ASSENTOS_SOFA = Array.from({ length: SOFA.assentos }, (_, k) => ({
  xb: SOFA.x + 12, yc: SOFA.y + 4 + SOFA.larguraAssento * (k + 0.5), zs: 9, joelho: SOFA.x - 1,
}))
const SENTADOS = {
  pufeA: { xb: 46, yc: 34, zs: 6.1, joelho: 33.5, controle: true },
  pufeB: { xb: 51, yc: 62, zs: 6.1, joelho: 38.5, controle: true },
  almofada: { xb: 31, yc: 89, zs: 3.8, joelho: 19.5, controle: true },
  poltrona: { xb: 108, yc: 107, zs: 9.5, joelho: 94.5, controle: false },
}
const FLIPERAMA = { x: 132, jogador: [134.6, 18.5] }
const MESINHA = { x: 66, y: 28 }
const PLANTA_DO_CANTO = [LAZER_LARGURA - 14, LAZER_PROFUNDIDADE - 14]

// Retângulos [x1, y1, x2, y2] do chão por onde ninguém passa: móveis, as pernas de quem senta neles e quem joga no fliperama.
export const OBSTACULOS_DO_LAZER = [
  [0.5, 3.5, 10, 13],
  [0, TV.y1 - 4, 9.5, TV.y2 + 4],
  ...['pufeA', 'pufeB'].map((peca) => {
    const { xb, yc, joelho } = SENTADOS[peca]
    return [joelho - 1.6, yc - 8.2, xb + 6, yc + 8.2]
  }),
  [SENTADOS.almofada.joelho - 1.6, SENTADOS.almofada.yc - 7.6, SENTADOS.almofada.xb + 4, SENTADOS.almofada.yc + 7.6],
  [SENTADOS.poltrona.joelho - 1.6, SENTADOS.poltrona.yc - 12, SENTADOS.poltrona.xb + 6, SENTADOS.poltrona.yc + 12],
  [MESINHA.x, MESINHA.y, MESINHA.x + 19, MESINHA.y + 28],
  [SOFA.x - 2.6, SOFA.y, SOFA.x + 18, SOFA.y + 8 + SOFA.assentos * SOFA.larguraAssento],
  [FLIPERAMA.jogador[0] - 2.7, 0.5, FLIPERAMA.x + 15, FLIPERAMA.jogador[1] + 7.3],
  [-0.5, 107.5, 15, 149.5],
  [PLANTA_DO_CANTO[0] - 0.5, PLANTA_DO_CANTO[1] - 0.5, PLANTA_DO_CANTO[0] + 9, PLANTA_DO_CANTO[1] + 9],
]

// Geometria de cada vaga (independe de quem ocupa). Retorna { tipo, atividade, ... }.
export function vagaDoLazer(indice) {
  if (indice < VAGAS_SENTADAS.length) {
    const vaga = VAGAS_SENTADAS[indice]
    if (vaga.peca === 'sofa') return { ...vaga, tipo: 'lado', ...ASSENTOS_SOFA[vaga.assento], controle: false }
    if (vaga.peca === 'fliperama') return { ...vaga, tipo: 'costas', X: FLIPERAMA.jogador[0], Y: FLIPERAMA.jogador[1] }
    return { ...vaga, tipo: 'lado', ...SENTADOS[vaga.peca] }
  }
  const j = indice - VAGAS_SENTADAS.length
  if (j < POSICOES_COPA.length) return { peca: 'copa', atividade: 'cafe', tipo: 'empe', X: POSICOES_COPA[j][0], Y: POSICOES_COPA[j][1] }
  // Depois da copa cheia: uma fileira na frente, ao lado da poltrona, e então colunas subindo à direita, sempre dentro do chão.
  const extra = j - POSICOES_COPA.length
  if (extra < 3) return { peca: 'copa', atividade: 'cafe', tipo: 'empe', X: 112 + extra * 22, Y: 128 }
  const k = extra - 3
  return { peca: 'copa', atividade: 'cafe', tipo: 'empe', X: 134 + (k % 3) * 22, Y: 106 - (Math.floor(k / 3) % 4) * 22 }
}

const pt = (par) => par.split(',').map(Number)

// Pontos de referência da vaga em unidades do palco: topo da cabeça, chão na frente, caixa do corpo e destaque.
export function ancorasDaVaga(o, indice) {
  const v = vagaDoLazer(indice)
  let caixa
  let topo
  let base
  let area
  if (v.tipo === 'lado') {
    const alto = v.zs + 25.5
    caixa = [v.joelho - 1.8, v.xb + 1.4, v.yc - 7.4, v.yc + 7.4, alto]
    topo = [v.xb - 2.6, v.yc, alto + 1]
    base = [v.joelho + 2, v.yc + 6, 0]
    area = [v.joelho - (v.peca === 'sofa' ? 8 : 6), v.yc - 11, v.xb + (v.peca === 'sofa' ? 13 : 9), v.yc + 11]
  } else {
    const dy = v.tipo === 'costas' ? -3.4 : 0
    caixa = [v.X - 2.8, v.X + 11.8, v.Y + dy, v.Y + 7.6, 44]
    topo = [v.X + 4.2, v.Y + 3.4, 45]
    base = [v.X + 4.5, v.Y + 9, 0]
    area = [v.X - 7, v.Y - 6 + dy, v.X + 16, v.Y + 13]
  }
  const [x1, x2, y1, y2, alto] = caixa
  const cantos = []
  for (const x of [x1, x2]) for (const y of [y1, y2]) for (const z of [0, alto]) cantos.push(pt(P3(o, x, y, z)))
  const xs = cantos.map(([x]) => x)
  const ys = cantos.map(([, y]) => y)
  const [ax1, ay1, ax2, ay2] = area
  return {
    atividade: v.atividade,
    topo: pt(P3(o, ...topo)),
    base: pt(P3(o, ...base)),
    corpo: { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) },
    destaque: {
      pontos: [P3(o, ax1, ay1, 0.3), P3(o, ax2, ay1, 0.3), P3(o, ax2, ay2, 0.3), P3(o, ax1, ay2, 0.3)].join(' '),
      cor: 'rgba(96,165,250,.16)',
      contorno: '#60a5fa',
      espessura: '1.4',
    },
  }
}

// Telas que nenhum rótulo deve tampar (TV e fliperama), em unidades do cômodo: [x, y, z] de dois cantos opostos.
export const TELAS_DO_LAZER = [
  [[1.7, TV.y1, 23], [1.7, TV.y2, 46]],
  [[FLIPERAMA.x + 1.5, 12, 22], [FLIPERAMA.x + 13.5, 12, 40]],
]

function piso(o, largura, profundidade) {
  const tabuas = [].concat(cub(o, 0, 0, -5, largura, profundidade, 5, '#1d1a19'))
  const cores = ['#2a2624', '#282422', '#2c2826']
  for (let j = 0, y = 0; y < profundidade; j += 1, y += 8) {
    const y2 = Math.min(profundidade, y + 8)
    const desloc = [0, 22, 11][j % 3]
    for (let x = -desloc; x < largura; x += 44) {
      const xa = Math.max(0, x)
      const xb = Math.min(largura, x + 44)
      tabuas.push(chao(o, xa, y, xb, y2, cores[(j + Math.round(x / 44) + 3) % 3]))
    }
  }
  return tabuas.concat(
    chao(o, 16, 14, 122, 104, '#343856'),
    chao(o, 19, 17, 119, 101, '#2a2d48'),
    chao(o, 25, 23, 113, 95, '#303454'),
    chao(o, 27, 25, 111, 93, '#2a2d48'),
  )
}

function janela(o, xa) {
  const xb = xa + 28
  const meio = (xa + xb) / 2
  return [].concat(
    [faceY(o, xa, xb, 0.3, 26, 56, '#1e293b'), faceY(o, xa + 1.6, xb - 1.6, 0.4, 27.6, 54.4, '#7aa7e0'),
     faceY(o, xa + 3, xa + 8, 0.5, 29, 53, '#9cc2f0'),
     faceY(o, meio - 0.7, meio + 0.7, 0.5, 27.6, 54.4, '#1e293b'), faceY(o, xa + 1.6, xb - 1.6, 0.5, 40.3, 41.7, '#1e293b')],
    cub(o, xa - 1, 0, 25, xb - xa + 2, 2.5, 1.2, '#3f3f46'),
  )
}

// Paredes. 'junto' = colada no escritório: a parede da esquerda é a do escritório que continua (desenhada por ele)
// e o fundo é a mureta; 'separado' = cômodo inteiro, com a porta desenhada na parede do fundo.
function paredes(o, largura, profundidade, modo) {
  const quadro = [faceX(o, 0.3, 86, 104, 26, 44, '#3f3f46'), faceX(o, 0.4, 87.2, 102.8, 27.2, 42.8, '#26262c'),
    faceX(o, 0.5, 89.5, 100.5, 32, 36.5, '#8b7fd1'), faceX(o, 0.6, 90.5, 92.5, 33.6, 34.9, '#26262c'), faceX(o, 0.6, 97.4, 98.8, 33.2, 35.3, '#26262c')]
  if (modo === 'junto') return quadro
  const { x1, x2 } = LAZER.porta
  return [].concat(
    cub(o, -ESPESSURA_PAREDE, -ESPESSURA_PAREDE, 0, ESPESSURA_PAREDE, profundidade + ESPESSURA_PAREDE, ALTURA_PAREDE, PAREDE_ESQ),
    cub(o, 0, -ESPESSURA_PAREDE, 0, largura, ESPESSURA_PAREDE, ALTURA_PAREDE, PAREDE_FUNDO),
    [faceY(o, 0, largura, 0.2, 0, 3, RODAPE), faceX(o, 0.2, 0, profundidade, 0, 3, RODAPE)],
    [faceY(o, x1 - 1.8, x2 + 1.8, 0.25, 0, 48.4, '#3f3f46'), faceY(o, x1, x2, 0.3, 0, 46.6, '#111113'),
     faceY(o, x1 + 1.5, x2 - 1.5, 0.35, 0, 2.5, '#26262b')],
    janela(o, 22),
    janela(o, 70),
    quadro,
  )
}

// Vaso com a plantinha, reaproveitado pelas outras salas. Retorna os polígonos.
export function planta(o, x, y, vaso = '#9a3412') {
  return [].concat(
    cub(o, x, y, 0, 9, 9, 9, vaso), cub(o, x + 1, y + 1, 9, 7, 7, 0.6, '#3f2a1d'),
    cub(o, x + 2, y + 2, 9.6, 5, 5, 9, '#16a34a'), cub(o, x - 0.5, y + 3, 13.5, 4.5, 3.6, 6.5, '#22c55e'),
    cub(o, x + 4.5, y - 0.5, 14.5, 3.6, 4.5, 7.5, '#22c55e'), cub(o, x + 3, y + 3, 18, 3.6, 3.6, 5.5, '#4ade80'),
  )
}

// Conteúdo da tela da TV: jogo (com um herói por jogador), programa ou desligada.
function telaDaTV(o, modo, jogadores) {
  const X = 1.68
  const ya = TV.y1 + 1.6
  const yb = TV.y2 - 1.6
  const za = 23.6
  const zb = 45.4
  const f = (y1, y2, z1, z2, cor) => faceX(o, X, y1, y2, z1, z2, cor)
  if (modo === 'desligada') {
    return [f(ya, yb, za, zb, '#0c0c0e'), f(ya + 26, ya + 31, za + 8, zb - 1.2, '#141418'), f(ya + 32.5, ya + 34.5, za + 11, zb - 1.2, '#141418')]
  }
  if (modo === 'jogo') {
    const herois = [['#f4f4f5', '#d9785f', 25], ['#a7d8bd', '#4f8f6e', 31], ['#d6ccfb', '#8b7fd1', 19]].slice(0, Math.max(1, jogadores))
    return [].concat(
      [f(ya, yb, za, zb, '#1b2a4a'),
       f(ya, ya + 15, za + 3, za + 9, '#24375c'), f(ya + 12, ya + 30, za + 3, za + 11.5, '#21335a'), f(ya + 28, yb, za + 3, za + 8, '#24375c'),
       f(ya, yb, za, za + 3.2, '#355e4f'), f(ya, yb, za + 3.2, za + 4, '#4f8a6a'),
       f(ya + 5, ya + 14, za + 10.5, za + 11.8, '#7a5c40')],
      animar([f(ya + 8.6, ya + 10.2, za + 13.4, za + 15.4, '#e3c16f')], 'esc-moeda 1.1s steps(2, jump-none) infinite'),
      animar([f(yb - 7, yb - 4.4, za + 4, za + 6.4, '#b5546a')], 'esc-ronda 2.6s ease-in-out infinite'),
      herois.flatMap(([corpo, bone, y], i) => animar(
        [f(ya + y, ya + y + 2.6, za + 4, za + 8, corpo), f(ya + y, ya + y + 2.6, za + 7.2, za + 8.2, bone)],
        'esc-pulo .9s ease-in-out infinite', `${(i * 0.3).toFixed(1)}s`,
      )),
      [f(yb - 10, yb - 2, zb - 2.6, zb - 1.6, '#7dd3fc'), f(ya + 1.5, ya + 3, zb - 2.8, zb - 1.4, '#d9785f'), f(ya + 3.8, ya + 5.3, zb - 2.8, zb - 1.4, '#d9785f')],
    )
  }
  return [].concat(
    [f(ya, yb, za, zb, '#2a4466'),
     f(ya + 7, ya + 11.5, zb - 8.5, zb - 4, '#e8d9a8'),
     f(ya, ya + 23, za + 5, za + 14.5, '#35506a'), f(ya + 17, yb, za + 5, za + 11, '#2f4a5f'),
     f(ya, yb, za, za + 5.2, '#24506b')],
    animar([f(ya + 6, ya + 16, za + 2.6, za + 3.1, '#7fb6d1'), f(ya + 25, ya + 35, za + 1.3, za + 1.8, '#7fb6d1')], 'esc-brilho 2.8s ease-in-out infinite'),
    animar([f(ya + 22, ya + 23.8, zb - 6.6, zb - 5.9, '#16233a')], 'esc-ronda 3.4s ease-in-out infinite'),
    [f(yb - 21, yb - 2, za + 0.8, za + 3.6, '#0f172a'), f(yb - 19.5, yb - 10, za + 1.7, za + 2.7, '#e2e8f0')],
    animar([{ ...f(ya, yb, za, zb, '#ffffff'), opacidade: 0.05 }], 'esc-cintilar 3.6s ease-in-out infinite'),
  )
}

function pecaTV(o, modo, jogadores) {
  const ligada = modo !== 'desligada'
  const controlesLivres = Math.max(0, 3 - jogadores)
  const { y1, y2 } = TV
  const brilho = ligada
    ? animar([{ pontos: [P3(o, 2, y1, 0.2), P3(o, 74, y1 - 14, 0.2), P3(o, 74, y2 + 16, 0.2), P3(o, 2, y2, 0.2)].join(' '), cor: '#93c5fd', opacidade: 0.07 }], 'esc-brilho 3s ease-in-out infinite')
    : []
  return [].concat(
    brilho,
    cub(o, 0, y1, 22, 1.6, y2 - y1, 25, '#0e0e10'),
    telaDaTV(o, modo, jogadores),
    [faceX(o, 1.7, (y1 + y2) / 2 - 1, (y1 + y2) / 2 + 1, 22.6, 23.2, ligada ? '#e4e4e7' : '#b91c1c')],
    cub(o, 0, y1 + 8, 17.5, 2.6, y2 - y1 - 16, 2.4, '#18181b'),
    cub(o, 0, y1 - 4, 0, 9.5, y2 - y1 + 8, 10, '#3a302a'),
    [faceX(o, 9.55, y1 - 2, y1 + 20, 1.5, 8.5, '#433830'), faceX(o, 9.55, y1 + 24, y2 + 2, 1.5, 8.5, '#433830'),
     faceX(o, 9.6, y1 + 15, y1 + 19, 6.5, 7.3, '#a1a1aa'), faceX(o, 9.6, y1 + 25, y1 + 29, 6.5, 7.3, '#a1a1aa')],
    cub(o, 1.5, y1 + 1, 10, 6.5, 11, 2.4, '#e4e4e7'), [faceX(o, 8.05, y1 + 2, y1 + 6, 10.7, 11.3, ligada ? '#60a5fa' : '#3f3f46')],
    Array.from({ length: controlesLivres }, (_, i) => [].concat(
      cub(o, 2.5, y1 + 17 + i * 7.5, 10, 4.2, 6, 1.4, '#3f3f46'),
      [chao(o, 3.8, y1 + 19.6 + i * 7.5, 5, y1 + 20.8 + i * 7.5, '#52525b', 11.45)],
    )).flat(),
  )
}

function pufe(o, xb, yc, cor) {
  return {
    antes: [].concat(cub(o, xb - 10.5, yc - 8.2, 0, 16.5, 16.4, 4.6, cor), cub(o, xb - 9.5, yc - 7.2, 4.6, 12, 14.4, 1.5, cor)),
    depois: [].concat(cub(o, xb - 1.2, yc - 7.8, 4.6, 6.6, 15.6, 8.4, cor), cub(o, xb - 0.4, yc - 6.8, 13, 5, 13.6, 1.3, cor)),
  }
}

function almofada(o, xb, yc, cor) {
  return {
    antes: [].concat(cub(o, xb - 9.5, yc - 7.6, 0, 13.5, 15.2, 3.8, cor)),
    depois: [].concat(cub(o, xb - 0.8, yc - 6.4, 3.8, 4.6, 12.8, 8, '#4b5563'), cub(o, xb - 0.2, yc - 5.6, 11.8, 3.6, 11.2, 1, '#4b5563')),
  }
}

function poltrona(o, xb, yc, cor) {
  const x = xb - 13
  return {
    antes: [].concat(
      cub(o, x + 1.5, yc - 10, 0, 17, 20, 2.6, '#1f1f23'),
      cub(o, x, yc - 12, 2.6, 19, 4, 11.4, cor),
      cub(o, x, yc - 8, 2.6, 13.5, 16, 6.9, cor),
    ),
    depois: [].concat(
      cub(o, xb, yc - 8, 9.5, 6, 16, 13.5, cor),
      cub(o, x, yc + 8, 2.6, 19, 4, 11.4, cor),
    ),
  }
}

function mesinha(o) {
  const { x, y } = MESINHA
  return [].concat(
    cub(o, x + 1.5, y + 1.5, 0, 2, 2, 6, '#27272a'), cub(o, x + 15.5, y + 1.5, 0, 2, 2, 6, '#27272a'),
    cub(o, x + 1.5, y + 25.5, 0, 2, 2, 6, '#27272a'), cub(o, x + 15.5, y + 25.5, 0, 2, 2, 6, '#27272a'),
    cub(o, x, y, 6, 19, 28, 1.6, '#57473a'),
    cub(o, x + 5.5, y + 5.5, 7.6, 7, 7, 2.6, '#d6d3d1'), cub(o, x + 6.3, y + 6.3, 10.2, 5.4, 5.4, 0.6, '#f5e6b8'),
    cub(o, x + 10.5, y + 17.5, 7.6, 2.2, 2.2, 3.4, '#b5546a'), cub(o, x + 6, y + 20.5, 7.6, 2.2, 2.2, 3.4, '#4f8f6e'),
  )
}

function fliperama(o) {
  const x = FLIPERAMA.x
  return [].concat(
    cub(o, x, 0.5, 0, 15, 12, 41, '#29293b'),
    [faceX(o, x + 15.05, 1.5, 11.5, 3, 37, '#34344c'), faceX(o, x + 15.1, 3, 10, 26, 33, '#4c3f73')],
    [faceY(o, x + 1.5, x + 13.5, 12.05, 22, 34, '#111827')],
    animar([faceY(o, x + 2.6, x + 12.4, 12.1, 23, 33, '#1f3354')], 'esc-cintilar 2.2s ease-in-out infinite'),
    animar([faceY(o, x + 4.5, x + 6.5, 12.15, 25, 27, '#e3c16f'), faceY(o, x + 8.5, x + 10.5, 12.15, 28, 30, '#d9785f')], 'esc-moeda 1.3s steps(2, jump-none) infinite'),
    [faceY(o, x + 1, x + 14, 12.05, 35.5, 39.5, '#6d5fb0'), faceY(o, x + 3, x + 12, 12.1, 36.7, 38.3, '#c4b5fd')],
    cub(o, x + 0.5, 12, 17, 14, 5.5, 3.2, '#1f1f2e'),
    [chao(o, x + 3, 13.5, x + 4.6, 15.1, '#d9785f', 20.25), chao(o, x + 7, 13.5, x + 8.6, 15.1, '#7dd3fc', 20.25), chao(o, x + 10, 14.5, x + 11.6, 16.1, '#e3c16f', 20.25)],
    cub(o, x + 1, 12, 0, 13, 4, 16.5, '#26263a'),
  )
}

// Copa encostada na parede da esquerda, na frente: balcão com café e a geladeira de bebidas de porta de vidro.
function copa(o) {
  const y = 108
  return [].concat(
    cub(o, 0, y, 0, 13, 24, 15, '#3f3f46'),
    [faceX(o, 13.05, y + 2, y + 11, 2, 12.5, '#46464f'), faceX(o, 13.05, y + 13, y + 22, 2, 12.5, '#46464f')],
    cub(o, -0.5, y - 0.5, 15, 14, 25, 1.4, '#a1a1aa'),
    cub(o, 2, y + 2, 16.4, 7.5, 7.5, 10.5, '#18181b'), [faceX(o, 9.55, y + 3.5, y + 7.5, 19, 23.5, '#27272a'), faceX(o, 9.6, y + 4.8, y + 6.2, 24.5, 25.4, '#f87171')],
    cub(o, 4, y + 12, 16.4, 3, 3, 3.4, '#f4f4f5'),
    cub(o, 2.5, y + 16, 16.4, 8, 7, 2.6, '#57473a'), cub(o, 4, y + 17.5, 19, 2.6, 2.6, 2.4, '#d9785f'), cub(o, 4.8, y + 20.2, 19, 2.6, 2.6, 2.2, '#a3b86c'),
    cub(o, 0, y + 26, 0, 15, 15.5, 37, '#3f3f46'),
    [faceX(o, 15.05, y + 27.5, y + 40.5, 3, 35.5, '#0f172a')],
    [0, 1, 2, 3].flatMap((linha) => [
      faceX(o, 15.1, y + 28, y + 40, 8 + linha * 7.5, 8.6 + linha * 7.5, '#52525b'),
      ...['#b5546a', '#4f8f6e', '#7dd3fc', '#e3c16f'].map((cor, i) => faceX(o, 15.12, y + 28.8 + i * 2.8, y + 30.6 + i * 2.8, 8.6 + linha * 7.5, 12 + linha * 7.5, cor)),
    ]),
    [faceX(o, 15.15, y + 40.6, y + 41.4, 14, 26, '#a1a1aa')],
  )
}

// Monta o cômodo vazio (chão, tapete, paredes). Retorna os polígonos.
export function salaDoLazer(o, modo) {
  const { largura, profundidade } = LAZER
  return [].concat(piso(o, largura, profundidade), paredes(o, largura, profundidade, modo), planta(o, 1, 4))
}

// Polígonos e caixa (no mundo) da pessoa na vaga. Retorna { poligonos, caixa }.
function pessoaDaVaga(o, indice, agente) {
  const v = vagaDoLazer(indice)
  const a = aparenciaDoAgente(agente)
  if (v.tipo === 'lado') {
    return {
      poligonos: bonecoDeLado(o, v.xb, v.yc, v.zs, a, { joelho: v.joelho, controle: v.controle }),
      caixa: caixa(v.joelho - 1.6, v.yc - 7.2, 0, v.xb + 1.2, v.yc + 7.2, v.zs + 25.5),
    }
  }
  if (v.tipo === 'costas') return { poligonos: bonecoDeCostas(o, v.X, v.Y, a), caixa: caixa(v.X - 2.7, v.Y - 3.4, 0, v.X + 11.6, v.Y + 7.3, 45) }
  return { poligonos: bonecoEmPe(o, v.X, v.Y, a, { caneca: true }), caixa: caixa(v.X - 2.7, v.Y, 0, v.X + 11.6, v.Y + 7.3, 45) }
}

// Móveis e pessoas do lazer, de trás para a frente. ocupantes = Map(vaga -> { agente, classe, desliza }); classe e desliza
// animam quem está levantando ou sentando. Retorna { camadas: [{ chave, poligonos, caixa, pessoa?, classe?, desliza? }], modoTV },
// com as caixas em unidades do cômodo; pessoa = { id } marca o grupo de um agente.
export function montarLazer(o, ocupantes) {
  const camadas = []
  const movel = (chave, poligonos, caixaDoMovel) => camadas.push({ chave, poligonos, caixa: caixaDoMovel })
  const sentar = (vaga) => {
    const ocupante = ocupantes.get(vaga)
    if (!ocupante) return
    const { agente, classe, desliza } = ocupante
    camadas.push({
      chave: `pessoa-${agente.id}-lazer-${vaga}${classe ? `-${classe}` : ''}`,
      ...pessoaDaVaga(o, vaga, agente),
      pessoa: { id: agente.id },
      classe,
      desliza,
    })
  }
  const ocupadas = [...ocupantes.keys()]
  const jogadores = ocupadas.filter((v) => v < VAGAS_SENTADAS.length && VAGAS_SENTADAS[v].atividade === 'jogo' && VAGAS_SENTADAS[v].peca !== 'fliperama').length
  const espectadores = ocupadas.filter((v) => v < VAGAS_SENTADAS.length && VAGAS_SENTADAS[v].atividade === 'tv').length
  const modoTV = jogadores > 0 ? 'jogo' : espectadores > 0 ? 'programa' : 'desligada'
  const vagaDa = (peca, assento) => VAGAS_SENTADAS.findIndex((v) => v.peca === peca && (assento === undefined || v.assento === assento))

  movel(`tv-${modoTV}-${jogadores}`, pecaTV(o, modoTV, jogadores), caixa(0, TV.y1 - 4, 0, 9.5, TV.y2 + 4, 47))
  for (const [peca, cor] of [['pufeA', '#5a4a6e'], ['pufeB', '#3f5f5a']]) {
    const { xb, yc } = SENTADOS[peca]
    const partes = pufe(o, xb, yc, cor)
    movel(`${peca}-a`, partes.antes, caixa(xb - 10.5, yc - 8.2, 0, xb + 6, yc + 8.2, 6.1))
    sentar(vagaDa(peca))
    movel(`${peca}-d`, partes.depois, caixa(xb - 1.2, yc - 7.8, 4.6, xb + 5.4, yc + 7.8, 14.3))
  }
  {
    const { xb, yc } = SENTADOS.almofada
    const partes = almofada(o, xb, yc, '#6b5a3e')
    movel('almofada-a', partes.antes, caixa(xb - 9.5, yc - 7.6, 0, xb + 4, yc + 7.6, 3.8))
    sentar(vagaDa('almofada'))
    movel('almofada-d', partes.depois, caixa(xb - 0.8, yc - 6.4, 3.8, xb + 3.8, yc + 6.4, 12.8))
  }
  movel('mesinha', mesinha(o), caixa(MESINHA.x, MESINHA.y, 0, MESINHA.x + 19, MESINHA.y + 28, 11))
  {
    const cor = '#3d4f66'
    const { x, y, assentos, larguraAssento } = SOFA
    const fim = y + 4 + assentos * larguraAssento
    movel('sofa-a', [].concat(cub(o, x + 1.5, y + 1, 0, 16.5, assentos * larguraAssento + 6, 2.6, '#1f1f23'), cub(o, x, y, 2.6, 18, 4, 11.4, cor)),
      caixa(x, y, 0, x + 18, y + 7 + assentos * larguraAssento, 14))
    for (let k = 0; k < assentos; k++) {
      const ys = y + 4 + k * larguraAssento
      movel(`sofa-assento-${k}`, cub(o, x, ys + 0.3, 2.6, 12.5, larguraAssento - 0.6, 6.4, cor), caixa(x, ys + 0.3, 2.6, x + 12.5, ys + larguraAssento - 0.3, 9))
      sentar(vagaDa('sofa', k))
      movel(`sofa-encosto-${k}`, cub(o, x + 12, ys, 9, 6, larguraAssento, 12, cor), caixa(x + 12, ys, 9, x + 18, ys + larguraAssento, 21))
    }
    movel('sofa-d', cub(o, x, fim, 2.6, 18, 4, 11.4, cor), caixa(x, fim, 2.6, x + 18, fim + 4, 14))
  }
  {
    const { xb, yc } = SENTADOS.poltrona
    const partes = poltrona(o, xb, yc, '#7a5440')
    movel('poltrona-a', partes.antes, caixa(xb - 13, yc - 12, 0, xb + 6, yc + 10, 14))
    sentar(vagaDa('poltrona'))
    movel('poltrona-d', partes.depois, caixa(xb - 13, yc - 8, 2.6, xb + 6, yc + 12, 23))
  }
  movel('fliperama', fliperama(o), caixa(FLIPERAMA.x, 0.5, 0, FLIPERAMA.x + 15, 17.5, 41))
  sentar(vagaDa('fliperama'))
  movel('copa', copa(o), caixa(-0.5, 107.5, 0, 15, 149.5, 37))
  const naCopa = ocupadas.filter((v) => v >= VAGAS_SENTADAS.length).sort((a, b) => {
    const va = vagaDoLazer(a)
    const vb = vagaDoLazer(b)
    return va.X + va.Y - (vb.X + vb.Y)
  })
  naCopa.forEach(sentar)
  const [xp, yp] = PLANTA_DO_CANTO
  movel('planta-canto', planta(o, xp, yp, '#57534e'), caixa(xp - 0.5, yp - 0.5, 0, xp + 9, yp + 9, 24))
  return { camadas, modoTV }
}
