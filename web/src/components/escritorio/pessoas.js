import { chao, cub, faceX, faceY } from './iso.js'

export const ESCALA_BONECO = 1.3

const PELES = ['#e0b48a', '#f1c6a0', '#c68a5e', '#8d5a3b']
const CABELOS = ['#3f2a1d', '#0a0a0a', '#7a4a26', '#a16207', '#d4d4d8']
const CALCAS = ['#1e3a5f', '#334155', '#4a0d73', '#44403c']
const CAMISAS = ['#60a5fa', '#a78bfa', '#ec4899', '#2dd4bf', '#e4e4e7', '#94a3b8', '#c8914d']
export const CINZA = { pele: '#a1a1aa', cabelo: '#52525b', camisa: '#71717a', calca: '#3f3f46', sapato: '#27272a', lente: '#71717a' }
const OLHO = '#111111'
const BOCA = '#9a3412'

function hash32(texto) {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// Aparência estável do agente (pele, cabelo, roupa) a partir do id; a camisa é a cor do agente. Retorna as cores.
export function aparenciaDoAgente(agente) {
  const h = hash32(String(agente.id))
  const camisa = /^#[0-9a-f]{6}$/i.test(agente.cor ?? '') ? agente.cor : CAMISAS[(h >>> 7) % CAMISAS.length]
  return {
    pele: PELES[h % 4],
    cabelo: CABELOS[(h >>> 3) % 5],
    camisa,
    calca: CALCAS[(h >>> 11) % 4],
    sapato: '#0a0a0a',
    lente: '#bfdbfe',
    oculos: ((h >>> 14) & 3) === 0,
    penteado: (h >>> 17) % 3,
  }
}

// Em pé, de frente para quem olha (+Y). caneca = segura um café na mão direita. Retorna os polígonos.
export function bonecoEmPe(o, X, Y, a, { caneca = false } = {}) {
  const k = ESCALA_BONECO
  const bloco = (dx, dy, z, w, d, h, cor) => cub(o, X + dx * k, Y + dy * k, z * k, w * k, d * k, h * k, cor)
  const face = (x1, x2, z1, z2, cor) => faceY(o, X + x1 * k, X + x2 * k, Y + 5.7 * k, z1 * k, z2 * k, cor)
  const nuca = [25, 21, 21][a.penteado]
  const mecha = [27, 22.5, 23.5][a.penteado]
  const topo = [1.6, 1.6, 3.2][a.penteado]
  return [].concat(
    bloco(0.2, 2.6, 0, 2.6, 3, 1.4, a.sapato), bloco(4, 2.6, 0, 2.6, 3, 1.4, a.sapato),
    bloco(0.2, 1.1, 1.4, 2.6, 2.6, 11, a.calca), bloco(4, 1.1, 1.4, 2.6, 2.6, 11, a.calca),
    bloco(-2.1, 0.9, 13.5, 1.8, 3, 9.5, a.camisa), bloco(-2.1, 0.9, 11.8, 1.8, 3, 1.7, a.pele),
    bloco(-0.3, 0.6, 12.4, 7.4, 3.6, 11, a.camisa),
    bloco(7.1, 0.9, 13.5, 1.8, 3, 9.5, a.camisa), bloco(7.1, 0.9, 11.8, 1.8, 3, 1.7, a.pele),
    caneca ? [].concat(bloco(6.9, 3.6, 11.6, 2.3, 2.3, 2.8, '#e4e4e7'), bloco(7.3, 4, 14.4, 1.5, 1.5, 0.1, '#7c2d12')) : [],
    bloco(2.2, 1.6, 23.4, 2, 2, 1, a.pele),
    bloco(0, 0, nuca, 6.4, 1.2, 30.2 + topo - nuca, a.cabelo),
    bloco(0.4, 0.6, 24.4, 5.6, 5, 5.8, a.pele),
    bloco(6, 0.2, mecha, 0.8, 3.2, 30.8 - mecha, a.cabelo),
    bloco(0, 0.2, 30.2, 6.4, 5.6, topo, a.cabelo),
    [face(0.4, 6, 28.9, 30.2, a.cabelo),
     face(1.4, 2.6, 26.8, 28, OLHO), face(3.8, 5, 26.8, 28, OLHO),
     face(2.4, 4, 25.3, 25.8, BOCA)],
    a.oculos
      ? [face(1.0, 2.8, 26.5, 28.1, OLHO), face(3.6, 5.4, 26.5, 28.1, OLHO), face(1.3, 2.5, 26.8, 27.8, a.lente),
         face(3.9, 5.1, 26.8, 27.8, a.lente), face(2.8, 3.6, 27.2, 27.6, OLHO)]
      : [],
  )
}

// Em pé de costas para quem olha (virado para -Y), com as mãos para a frente (no fliperama). Retorna os polígonos.
export function bonecoDeCostas(o, X, Y, a) {
  const k = ESCALA_BONECO
  const bloco = (dx, dy, z, w, d, h, cor) => cub(o, X + dx * k, Y + dy * k, z * k, w * k, d * k, h * k, cor)
  const nuca = [25, 21, 21][a.penteado]
  const mecha = [26, 22.5, 23.5][a.penteado]
  const topo = [1.6, 1.6, 3.2][a.penteado]
  return [].concat(
    bloco(0.2, 0.4, 0, 2.6, 3, 1.4, a.sapato), bloco(4, 0.4, 0, 2.6, 3, 1.4, a.sapato),
    bloco(0.2, 1.1, 1.4, 2.6, 2.6, 11, a.calca), bloco(4, 1.1, 1.4, 2.6, 2.6, 11, a.calca),
    bloco(-2.1, 0.9, 16.5, 1.8, 3, 6.5, a.camisa), bloco(-2.1, -1.6, 15.2, 1.8, 3.4, 1.9, a.camisa), bloco(-2.1, -2.6, 15.2, 1.8, 1.2, 1.9, a.pele),
    bloco(-0.3, 0.6, 12.4, 7.4, 3.6, 11, a.camisa),
    bloco(7.1, 0.9, 16.5, 1.8, 3, 6.5, a.camisa), bloco(7.1, -1.6, 15.2, 1.8, 3.4, 1.9, a.camisa), bloco(7.1, -2.6, 15.2, 1.8, 1.2, 1.9, a.pele),
    bloco(2.2, 1.6, 23.4, 2, 2, 1, a.pele),
    bloco(0.4, 0.2, 24.4, 5.6, 5, 5.8, a.pele),
    bloco(0, 0, 30.2, 6.4, 5.6, topo, a.cabelo),
    bloco(6, 0.2, mecha, 0.8, 5.4, 30.8 - mecha, a.cabelo),
    bloco(0, 4.6, nuca, 6.4, 1.2, 30.2 + topo - nuca, a.cabelo),
  )
}

// Sentado na mesa, de costas, digitando. Retorna os polígonos.
export function bonecoSentado(o, X0, Y0, a) {
  const digitar = (atraso) => (p) => ({ ...p, animacao: 'esc-digitar .45s steps(2, jump-none) infinite', atraso })
  const nuca = [29, 26.5, 26.5][a.penteado]
  const topo = [2.1, 2.1, 3.6][a.penteado]
  return [].concat(
    cub(o, X0 + 23, Y0 + 13.5, 15.6, 2.3, 8, 2.6, a.camisa), cub(o, X0 + 34.7, Y0 + 13.5, 15.6, 2.3, 8, 2.6, a.camisa),
    cub(o, X0 + 24.2, Y0 + 10.2, 16.3, 2.8, 3.3, 1.6, a.pele).map(digitar('0s')),
    cub(o, X0 + 33, Y0 + 10.2, 16.3, 2.8, 3.3, 1.6, a.pele).map(digitar('.22s')),
    cub(o, X0 + 22.9, Y0 + 21.5, 17.5, 2.3, 3.9, 7, a.camisa),
    cub(o, X0 + 25.2, Y0 + 21.5, 10.2, 9.6, 4.7, 14.3, a.camisa),
    cub(o, X0 + 34.8, Y0 + 21.5, 17.5, 2.3, 3.9, 7, a.camisa),
    cub(o, X0 + 28.7, Y0 + 22.5, 24.5, 2.6, 2.6, 1.3, a.pele),
    cub(o, X0 + 26.4, Y0 + 20.6, 25.8, 7.3, 6.5, 7.5, a.pele),
    cub(o, X0 + 25.8, Y0 + 20.3, 33.3, 8.3, 7.3, topo, a.cabelo),
    cub(o, X0 + 25.8, Y0 + 27.1, nuca, 8.3, 1.6, 33.3 + topo - nuca, a.cabelo),
  )
}

const TRONCO = { fundo: 4.7, largura: 9.6, altura: 14.3 }
const CONTROLE = '#d4d4d8'
const LUZ_CONTROLE = '#60a5fa'

// Sentado de lado, olhando para -X (a TV), visto de perfil pelo lado direito.
// xb = costas (encostadas no sofá ou no pufe), yc = meio do corpo, zs = altura do assento,
// joelho = x da frente dos joelhos, controle = segura o controle do videogame. Retorna os polígonos.
export function bonecoDeLado(o, xb, yc, zs, a, { joelho, controle = false } = {}) {
  const { fundo, largura, altura } = TRONCO
  const xt = xb - fundo
  const zc = zs + altura
  const zcab = zc + 1.3
  const topo = [2.1, 2.1, 3.6][a.penteado]
  const nuca = [zcab + 1, zcab - 4.4, zcab - 4.4][a.penteado]
  const zTopo = zcab + 7.5
  const yE = yc - largura / 2 - 2.34
  const yD = yc + largura / 2
  const xj = joelho ?? xb - 13
  const perna = (yl) => [].concat(
    cub(o, xj - 1.6, yl - 0.25, 0, 3.9, 3.9, 1.8, a.sapato),
    zs > 1.8 ? cub(o, xj, yl, 1.8, 3.4, 3.4, zs - 1.8, a.calca) : [],
    cub(o, xj, yl, zs, xb - 2 - xj, 3.4, 3.4, a.calca),
  )
  const braco = (ya) => controle
    ? [].concat(
        cub(o, xb - 4.3, ya, zs + 6.4, 3.9, 2.34, 7.4, a.camisa),
        cub(o, xb - 10, ya, zs + 6, 5.9, 2.34, 2.4, a.camisa),
      )
    : [].concat(
        cub(o, xb - 4.1, ya, zs + 5.4, 3.9, 2.34, 8.2, a.camisa),
        cub(o, xb - 9.6, ya, zs + 3.4, 5.6, 2.34, 2.4, a.camisa),
        cub(o, xb - 11.3, ya, zs + 3.4, 1.8, 2.34, 2.1, a.pele),
      )
  const mao = (ym) => cub(o, xb - 12.9, ym, zs + 6.1, 3.2, 2.1, 2.6, a.pele)
  const face = (x1, x2, z1, z2, cor) => faceY(o, x1, x2, yc + 3.7, z1, z2, cor)
  const xr = xb - 5.9
  return [].concat(
    braco(yE),
    controle ? mao(yc - 5.2) : [],
    perna(yc - 4.17),
    perna(yc + 0.77),
    controle
      ? [].concat(
          cub(o, xb - 12.6, yc - 3.4, zs + 6.5, 3.2, 6.8, 1.7, CONTROLE),
          [chao(o, xb - 11.7, yc - 0.9, xb - 10.5, yc + 0.9, LUZ_CONTROLE, zs + 8.25)],
          mao(yc + 3.1),
        )
      : [],
    cub(o, xt, yc - largura / 2, zs, fundo, largura, altura, a.camisa),
    braco(yD),
    cub(o, xb - 3.65, yc - 1.3, zc, 2.6, 2.6, 1.3, a.pele),
    cub(o, xb - 0.4, yc - 4.15, nuca, 1.6, 8.3, zTopo - nuca, a.cabelo),
    cub(o, xr, yc - 3.65, zcab, 6.5, 7.3, 7.5, a.pele),
    cub(o, xr - 0.3, yc - 4.15, zTopo, 7.3, 8.3, topo, a.cabelo),
    cub(o, xb - 2.7, yc + 3.65, a.penteado === 0 ? zcab + 3.6 : nuca, 3.1, 0.5, zTopo - (a.penteado === 0 ? zcab + 3.6 : nuca), a.cabelo),
    [face(xr, xb - 2.7, zcab + 6, zTopo, a.cabelo),
     face(xr + 0.7, xr + 1.9, zcab + 3.6, zcab + 5, OLHO),
     face(xr, xr + 0.9, zcab + 1.6, zcab + 2.1, BOCA)],
    a.oculos
      ? [face(xr, xr + 2.5, zcab + 3.3, zcab + 5.3, OLHO), face(xr + 0.4, xr + 2.1, zcab + 3.6, zcab + 5, a.lente),
         face(xr + 2.5, xb - 2.7, zcab + 4.6, zcab + 5, OLHO)]
      : [],
  )
}

const GIROS = {
  '+y': (u, v) => [u, v],
  '-y': (u, v) => [-u, -v],
  '+x': (u, v) => [v, -u],
  '-x': (u, v) => [-v, u],
}
const RECUO_TRONCO = 0.4
const PLANO_DO_ROSTO = 3.3
const PASSADA = 1.4
const BALANCO = 1.2
const SUBIDA = 0.5
// Cabeça vista de frente (igual à do bonecoEmPe) e de costas (igual à do bonecoDeCostas): [u1, u2, v1, v2] de cada bloco.
const CABECAS = {
  frente: {
    pescoco: [-1.2, 0.8, -0.8, 1.2], cabeca: [-3, 2.6, -1.2, 3.2], nuca: [-2.4, -1.2], topo: [-3.4, 3, -1.2, 3.4],
    mechas: [[-3.4, -3, -1.2, 1], [2.6, 3.4, -1.2, 1]], alturaMecha: [27, 22.5, 23.5],
  },
  costas: {
    pescoco: [-0.8, 1.2, -1.2, 0.8], cabeca: [-2.6, 3, -2.2, 2.2], nuca: [-3.4, -2.2], topo: [-3, 3.4, -2.2, 2.4],
    mechas: [[-3.4, -2.6, -2.2, 2.2], [3, 3.4, -2.2, 2.2]], alturaMecha: [26, 22.5, 23.5],
  },
}

// Perna esquerda na frente (+1), juntas (0) ou direita na frente (-1); entre um passo e outro o corpo sobe um pouco.
const PASSOS = { parado: 0, 0: 1, 1: 0, 2: -1, 3: 0 }
const subida = (quadro) => (quadro === 1 || quadro === 3 ? SUBIDA : 0)

// Pescoço, crânio e cabelo no referencial da pessoa, `dz` mais baixos (0 para quem anda, o tanto que o tronco desceu
// para quem senta): é a mesma cabeça nos dois, então levantar e sentar não muda o rosto. Chama
// `pedaco(u1, u2, v1, v2, z1, z2, cor)` para cada bloco, de baixo para cima. nucaLonga = desenha o cabelo que cai
// abaixo da nuca (quem está sentado não leva: dali para baixo o encosto da cadeira cobriria).
function cabecaEmBlocos(a, c, dz, pedaco, nucaLonga = true) {
  const nuca = [25, 21, 21][a.penteado]
  const mecha = Math.max(c.alturaMecha[a.penteado], 23.4)
  const topo = 30.2 + [1.6, 1.6, 3.2][a.penteado]
  pedaco(...c.pescoco, 23.4 + dz, 24.4 + dz, a.pele)
  pedaco(...c.cabeca, 24.4 + dz, 30.2 + dz, a.pele)
  if (nucaLonga && nuca < 23.4) pedaco(-3.4, 3.4, c.nuca[0], -1.8, nuca + dz, 23.4 + dz, a.cabelo)
  pedaco(-3.4, 3.4, ...c.nuca, Math.max(nuca, 23.4) + dz, topo + dz, a.cabelo)
  for (const m of c.mechas) pedaco(...m, mecha + dz, 30.2 + dz, a.cabelo)
  pedaco(...c.topo, 30.2 + dz, topo + dz, a.cabelo)
}

// Corpo de quem anda em blocos, no referencial da pessoa: u = lado (+u é a esquerda dela), v = frente, z = altura,
// com o meio do tronco em (0, 0). Mesmas medidas do bonecoEmPe, sem dois blocos se cruzarem.
// Retorna [{ u1, u2, v1, v2, z1, z2, partes: [{ z1, z2, cor }] }].
function blocosAndando(a, quadro, costas) {
  const passo = PASSOS[quadro]
  const alto = subida(quadro)
  const c = costas ? CABECAS.costas : CABECAS.frente
  const blocos = []
  const bloco = (u1, u2, v1, v2, z1, z2, ...partes) => blocos.push({ u1, u2, v1, v2, z1, z2, partes })
  const corpo = (u1, u2, v1, v2, z1, z2, cor) => bloco(u1, u2, v1, v2, z1 + alto, z2 + alto, { z1: z1 + alto, z2: z2 + alto, cor })
  for (const lado of [-1, 1]) {
    const pe = passo * lado * PASSADA
    const mao = -passo * lado * BALANCO
    const [p1, p2] = lado < 0 ? [-3.2, -0.6] : [0.6, 3.2]
    const [b1, b2] = lado < 0 ? [-5.5, -3.7] : [3.7, 5.5]
    bloco(p1, p2, -1.3 + pe, 3.2 + pe, 0, 1.4, { z1: 0, z2: 1.4, cor: a.sapato })
    bloco(p1, p2, -1.3 + pe, 1.3 + pe, 1.4, 7, { z1: 1.4, z2: 7, cor: a.calca })
    bloco(p1, p2, -1.3 + pe * 0.35, 1.3 + pe * 0.35, 7, 12.4 + alto, { z1: 7, z2: 12.4 + alto, cor: a.calca })
    // A mão vem depois da manga, como no bonecoEmPe: o topo dela aparece por cima do punho.
    bloco(b1, b2, -1.5 + mao, 1.5 + mao, 11.8 + alto, 18.5 + alto,
      { z1: 13.5 + alto, z2: 18.5 + alto, cor: a.camisa }, { z1: 11.8 + alto, z2: 13.5 + alto, cor: a.pele })
    corpo(b1, b2, -1.5 + mao * 0.35, 1.5 + mao * 0.35, 18.5, 23, a.camisa)
  }
  corpo(-3.7, 3.7, -1.8, 1.8, 12.4, 23.4, a.camisa)
  cabecaEmBlocos(a, c, 0, corpo)
  return blocos
}

// Altura da cintura de quem está em pé: é daí que o tronco desce até o assento quando a pessoa senta.
const CINTURA = 12.4
// Joelho de quem senta: a coxa sai da frente do tronco e vai até aqui (em unidades do boneco).
const JOELHO = 10

// Corpo de quem está sentado numa cadeira, nas mesmas unidades e no mesmo referencial do blocosAndando.
// Do tronco para cima é o boneco em pé inteirinho, só descido até o assento; as pernas dobram para a frente e os
// antebraços descansam ao lado das coxas. assento = altura do assento em unidades do boneco.
// Retorna [{ u1, u2, v1, v2, z1, z2, partes: [{ z1, z2, cor }] }].
function blocosSentado(a, assento, costas) {
  const c = costas ? CABECAS.costas : CABECAS.frente
  const desce = CINTURA - assento
  const blocos = []
  const bloco = (u1, u2, v1, v2, z1, z2, cor) => blocos.push({ u1, u2, v1, v2, z1, z2, partes: [{ z1, z2, cor }] })
  const alto = (u1, u2, v1, v2, z1, z2, cor) => bloco(u1, u2, v1, v2, z1 - desce, z2 - desce, cor)
  for (const lado of [-1, 1]) {
    const [p1, p2] = lado < 0 ? [-3.2, -0.6] : [0.6, 3.2]
    const [b1, b2] = lado < 0 ? [-5.5, -3.7] : [3.7, 5.5]
    bloco(p1, p2, JOELHO - 1.8, JOELHO + 1.2, 0, 1.4, a.sapato)
    bloco(p1, p2, JOELHO - 2.6, JOELHO, 1.4, assento, a.calca)
    bloco(p1, p2, 1.8, JOELHO, assento, assento + 2.6, a.calca)
    alto(b1, b2, -1.5, 1.5, 17.1, 23, a.camisa)
    bloco(b1, b2, 1.5, 5.5, assento + 2.6, assento + 4.7, a.camisa)
    bloco(b1, b2, 5.5, 7.3, assento + 2.6, assento + 4.7, a.pele)
  }
  alto(-3.7, 3.7, -1.8, 1.8, 12.4, 23.4, a.camisa)
  cabecaEmBlocos(a, c, -desce, bloco, false)
  return blocos
}

const atras = (a, b) => a.x2 <= b.x1 + 0.01 || a.y2 <= b.y1 + 0.01 || a.z2 <= b.z1 + 0.01

function seCobrem(a, b) {
  const tela = (c) => [(c.x1 - c.y2) * 0.866, (c.x2 - c.y1) * 0.866, (c.x1 + c.y1) * 0.5 - c.z2, (c.x2 + c.y2) * 0.5 - c.z1]
  const [ax1, ax2, ay1, ay2] = tela(a)
  const [bx1, bx2, by1, by2] = tela(b)
  return Math.min(ax2, bx2) - Math.max(ax1, bx1) > 0.01 && Math.min(ay2, by2) - Math.max(ay1, by1) > 0.01
}

// Ordem de pintura de caixas que não se cruzam: quem está atrás (separado por x, y ou z) vem antes; empate mantém a ordem dada.
export function ordenarCaixas(caixas) {
  const antes = caixas.map(() => [])
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) {
      if (!seCobrem(caixas[i], caixas[j])) continue
      const ij = atras(caixas[i], caixas[j])
      const ji = atras(caixas[j], caixas[i])
      if (ij && !ji) antes[j].push(i)
      if (ji && !ij) antes[i].push(j)
    }
  }
  const feitos = caixas.map(() => false)
  const ordem = []
  while (ordem.length < caixas.length) {
    let proximo = feitos.findIndex((feito, i) => !feito && antes[i].every((j) => feitos[j]))
    if (proximo < 0) proximo = feitos.indexOf(false)
    feitos[proximo] = true
    ordem.push(caixas[proximo])
  }
  return ordem
}

// Põe os blocos do referencial da pessoa no mundo: gira para `direcao`, aplica a escala do boneco, desloca para (X, Y)
// e devolve na ordem de pintura. recuo = quanto o meio do tronco fica atrás (-Y) de (X, Y), em qualquer direção.
// Retorna [{ x1, x2, y1, y2, z1, z2, partes: [{ z1, z2, cor }] }].
function caixasNoMundo(blocos, X, Y, direcao, recuo) {
  const k = ESCALA_BONECO
  const girar = GIROS[direcao]
  return ordenarCaixas(blocos.map((b) => {
    const [xa, ya] = girar(b.u1, b.v1)
    const [xb, yb] = girar(b.u2, b.v2)
    return {
      x1: X + Math.min(xa, xb) * k, x2: X + Math.max(xa, xb) * k,
      y1: Y + (Math.min(ya, yb) - recuo) * k, y2: Y + (Math.max(ya, yb) - recuo) * k,
      z1: b.z1 * k, z2: b.z2 * k,
      partes: b.partes.map((p) => ({ z1: p.z1 * k, z2: p.z2 * k, cor: p.cor })),
    }
  }))
}

const poligonosDoCorpo = (o, caixas) =>
  caixas.flatMap((c) => c.partes.flatMap((p) => cub(o, c.x1, c.y1, p.z1, c.x2 - c.x1, c.y2 - c.y1, p.z2 - p.z1, p.cor)))

// Rosto na frente da cabeça (franja, olhos, boca e os óculos), só quando a pessoa está virada para quem olha
// ('+y' ou '+x'). dz = quanto a cabeça está mais alta ou mais baixa que a de quem está em pé. Retorna os polígonos.
function rosto(o, X, Y, a, direcao, recuo, dz) {
  const k = ESCALA_BONECO
  const face = direcao === '+y'
    ? (u1, u2, z1, z2, cor) => faceY(o, X + u1 * k, X + u2 * k, Y + (PLANO_DO_ROSTO - recuo) * k, (z1 + dz) * k, (z2 + dz) * k, cor)
    : (u1, u2, z1, z2, cor) => faceX(o, X + PLANO_DO_ROSTO * k, Y + (-u2 - recuo) * k, Y + (-u1 - recuo) * k, (z1 + dz) * k, (z2 + dz) * k, cor)
  return [].concat(
    [face(-3, 2.6, 28.9, 30.2, a.cabelo),
     face(-2, -0.8, 26.8, 28, OLHO), face(0.4, 1.6, 26.8, 28, OLHO),
     face(-1, 0.6, 25.3, 25.8, BOCA)],
    a.oculos
      ? [face(-2.4, -0.6, 26.5, 28.1, OLHO), face(0.2, 2, 26.5, 28.1, OLHO), face(-2.1, -0.9, 26.8, 27.8, a.lente),
         face(0.5, 1.7, 26.8, 27.8, a.lente), face(-0.6, 0.2, 27.2, 27.6, OLHO)]
      : [],
  )
}

// Caixas do boneco andando em unidades do mundo, já na ordem de pintura (de trás para a frente); cada uma pinta as suas partes na ordem.
// O meio do tronco fica 0,52 atrás (-Y) de (X, Y) em qualquer direção, como no bonecoEmPe e no bonecoDeCostas.
// Retorna [{ x1, x2, y1, y2, z1, z2, partes: [{ z1, z2, cor }] }].
export function caixasDoBonecoAndando(X, Y, a, direcao, quadro) {
  const blocos = blocosAndando(a, quadro, direcao === '-x' || direcao === '-y')
  return caixasNoMundo(blocos, X, Y, direcao, RECUO_TRONCO)
}

// Pessoa andando (ou parada em pé), virada para `direcao`. (X, Y) = ponto do chão no meio dos pés, em unidades do mundo.
// direcao: '+x' | '-x' | '+y' | '-y'. quadro: 0..3 (ciclo de passos) ou 'parado'. Retorna os polígonos (mesmo formato dos outros bonecos).
export function bonecoAndando(o, X, Y, a, direcao, quadro) {
  const corpo = poligonosDoCorpo(o, caixasDoBonecoAndando(X, Y, a, direcao, quadro))
  if (direcao !== '+y' && direcao !== '+x') return corpo
  return corpo.concat(rosto(o, X, Y, a, direcao, RECUO_TRONCO, subida(quadro)))
}

// Caixas do boneco sentado em unidades do mundo, na ordem de pintura. (X, Y) = ponto do chão embaixo do meio do tronco
// e assento = altura do assento da cadeira, as duas em unidades do mundo.
// Retorna [{ x1, x2, y1, y2, z1, z2, partes: [{ z1, z2, cor }] }].
export function caixasDoBonecoSentado(X, Y, a, direcao, assento) {
  const blocos = blocosSentado(a, assento / ESCALA_BONECO, direcao === '-x' || direcao === '-y')
  return caixasNoMundo(blocos, X, Y, direcao, 0)
}

// Caixa inteira que o boneco sentado ocupa (corpo, braços e pés), para a ordem do pintor da cena.
// Retorna { x1, y1, z1, x2, y2, z2 } em unidades do mundo.
export function caixaDoBonecoSentado(X, Y, a, direcao, assento) {
  const caixas = caixasDoBonecoSentado(X, Y, a, direcao, assento)
  return {
    x1: Math.min(...caixas.map((c) => c.x1)), y1: Math.min(...caixas.map((c) => c.y1)), z1: 0,
    x2: Math.max(...caixas.map((c) => c.x2)), y2: Math.max(...caixas.map((c) => c.y2)),
    z2: Math.max(...caixas.map((c) => c.z2)),
  }
}

// Pessoa sentada numa cadeira, virada para `direcao`: a mesma de quem anda, com as pernas dobradas e o tronco na
// altura do assento. (X, Y) = ponto do chão embaixo do meio do tronco; assento = altura do assento.
// Retorna os polígonos (mesmo formato dos outros bonecos).
export function bonecoSentadoEm(o, X, Y, a, direcao, assento) {
  const corpo = poligonosDoCorpo(o, caixasDoBonecoSentado(X, Y, a, direcao, assento))
  if (direcao !== '+y' && direcao !== '+x') return corpo
  return corpo.concat(rosto(o, X, Y, a, direcao, 0, assento / ESCALA_BONECO - CINTURA))
}
