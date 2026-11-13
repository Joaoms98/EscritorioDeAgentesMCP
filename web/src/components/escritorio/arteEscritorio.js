import { ESTADOS_AGENTE } from '../../constants/estados.js'
import { P3, cub, faceX, faceY } from './iso.js'
import { CINZA, ESCALA_BONECO, aparenciaDoAgente, bonecoEmPe, bonecoSentado } from './pessoas.js'
import { caixa } from './profundidade.js'

export const COLUNAS = 4
export const MESAS_MINIMAS = 8
const ESPACO_X = 92
const ESPACO_Y = 80
const MARGEM_X = 18
const MARGEM_FUNDO = 26
export const ALTURA_PAREDE = 70
export const ESPESSURA_PAREDE = 5
const LADRILHO = 16
const LUZ_APAGADA = '#27272a'
export const ALTURA_DIVISORIA = 11
// Largura do escritório: não depende das fileiras, e é ela que a faixa da frente divide entre as duas salas.
export const LARGURA_DO_ESCRITORIO = MARGEM_X + COLUNAS * ESPACO_X - 4
// A área de lazer fica na frente da metade esquerda do escritório, continuando a parede do quadro branco.
export const LAZER_LARGURA = 196
export const LAZER_PROFUNDIDADE = 150
// A sala de reunião ocupa o resto da faixa da frente, ao lado do lazer, separada dele por uma mureta.
export const REUNIAO_X = LAZER_LARGURA + ESPESSURA_PAREDE
export const REUNIAO_LARGURA = LARGURA_DO_ESCRITORIO - REUNIAO_X
export const REUNIAO_PROFUNDIDADE = LAZER_PROFUNDIDADE
// Vãos das portas na mureta da frente: a do lazer (corredor entre a 2ª e a 3ª coluna de mesas) e a da reunião (entre a 3ª e a 4ª).
export const PORTA = { x1: 156, x2: 192 }
export const PORTA_REUNIAO = { x1: 256, x2: 292 }

export const fileirasPara = (qtd) => Math.max(MESAS_MINIMAS / COLUNAS, Math.ceil(qtd / COLUNAS))

// Tamanho do chão do escritório para a quantidade de fileiras. Retorna { largura, profundidade } em unidades do mundo.
export function dimensoesDoEscritorio(fileiras) {
  return { largura: LARGURA_DO_ESCRITORIO, profundidade: MARGEM_FUNDO + fileiras * ESPACO_Y - 10 }
}

export function origemDaMesa(i) {
  return [MARGEM_X + (i % COLUNAS) * ESPACO_X, MARGEM_FUNDO + Math.floor(i / COLUNAS) * ESPACO_Y]
}

// recuo = quanto a cadeira está empurrada para baixo da mesa (-5,5 quando ninguém usa).
function mesa(o, X0, Y0, estado, recuo) {
  const desligada = !estado || estado === 'interrompida'
  const luz = desligada ? LUZ_APAGADA : ESTADOS_AGENTE[estado].cor
  const piscar = estado === 'trabalhando' || estado === 'aguardando' ? { animacao: 'esc-luz 1.4s ease-in-out infinite', atraso: '0s' } : null
  const barra = (i) => (estado === 'trabalhando' ? { animacao: 'esc-tela 1.3s ease-in-out infinite', atraso: `${(i * 0.25).toFixed(2)}s` } : null)
  const tela = desligada
    ? [faceY(o, X0 + 23, X0 + 37, Y0 + 6.35, 19.6, 28.6, '#0b0b0c'), faceY(o, X0 + 31, X0 + 33.5, Y0 + 6.4, 21, 27.5, '#17171a')]
    : [faceY(o, X0 + 23, X0 + 37, Y0 + 6.35, 19.6, 28.6, estado === 'erro' ? '#450a0a' : '#1e3a5f'),
       { ...faceY(o, X0 + 24.5, X0 + 27, Y0 + 6.4, 20.6, 23.6, '#60a5fa'), ...barra(0) },
       { ...faceY(o, X0 + 28, X0 + 30.5, Y0 + 6.4, 20.6, 26, estado === 'erro' ? '#f87171' : '#34d399'), ...barra(1) },
       { ...faceY(o, X0 + 31.5, X0 + 34, Y0 + 6.4, 20.6, 24.6, '#fbbf24'), ...barra(2) },
       faceY(o, X0 + 24.5, X0 + 35.5, Y0 + 6.4, 27, 27.8, '#f4f4f5')]
  return {
    mesa: [].concat(
      cub(o, X0 + 14, Y0, 0, 34, 16, 14, '#3f3f46'),
      [faceY(o, X0 + 17, X0 + 29, Y0 + 16.1, 4, 11, '#52525b'), faceY(o, X0 + 21.5, X0 + 24.5, Y0 + 16.2, 7.6, 8.4, '#a1a1aa')],
      cub(o, X0 + 13, Y0 - 1.5, 14, 36, 19, 1.6, '#71717a'),
      cub(o, X0 + 15, Y0 + 1, 15.6, 7, 5.5, 1.2, '#e4e4e7'), cub(o, X0 + 15.5, Y0 + 1.5, 16.8, 6, 4.5, 0.8, '#f4f4f5'),
      cub(o, X0 + 28.5, Y0 + 3.5, 15.6, 3, 2, 3.5, '#27272a'), cub(o, X0 + 26.5, Y0 + 2.5, 15.6, 7, 4, 0.6, '#27272a'),
      cub(o, X0 + 22, Y0 + 4.5, 18.6, 16, 1.8, 11, '#18181b'),
      tela,
      cub(o, X0 + 23, Y0 + 9.5, 15.6, 14, 4.5, 0.7, '#18181b'),
      cub(o, X0 + 40, Y0 + 9.5, 15.6, 3.2, 3.2, 3.8, '#f4f4f5'), cub(o, X0 + 40.6, Y0 + 10.1, 19.4, 2, 2, 0.2, '#7c2d12'),
      cub(o, X0 + 44, Y0 + 1.5, 15.6, 3, 3, 1.2, '#27272a'),
      cub(o, X0 + 44.6, Y0 + 2.1, 16.8, 1.8, 1.8, 3.2, luz).map((p) => (piscar ? { ...p, ...piscar } : p)),
    ),
    assento: [].concat(
      cub(o, X0 + 25, Y0 + 20 + recuo, 0, 10, 10, 1, '#18181b'), cub(o, X0 + 29, Y0 + 24 + recuo, 1, 2, 2, 7, '#27272a'),
      cub(o, X0 + 23.5, Y0 + 18.5 + recuo, 8, 13, 12, 2.2, '#3f3f46'),
    ),
    encosto: cub(o, X0 + 23.5, Y0 + 28.5 + recuo, 8, 13, 2.4, 13, '#27272a'),
  }
}

function piso(o, largura, profundidade) {
  const ladrilhos = [].concat(cub(o, 0, 0, -5, largura, profundidade, 5, '#1c1c20'))
  for (let x = 0; x < largura; x += LADRILHO) {
    for (let y = 0; y < profundidade; y += LADRILHO) {
      const x2 = Math.min(largura, x + LADRILHO)
      const y2 = Math.min(profundidade, y + LADRILHO)
      const par = (Math.floor(x / LADRILHO) + Math.floor(y / LADRILHO)) % 2 === 0
      ladrilhos.push({ pontos: [P3(o, x, y, 0), P3(o, x2, y, 0), P3(o, x2, y2, 0), P3(o, x, y2, 0)].join(' '), cor: par ? '#232327' : '#202024' })
    }
  }
  return ladrilhos
}

function paredes(o, largura, profundidade, extraEsquerda) {
  const janelas = Array.from({ length: COLUNAS }, (_, c) => {
    const xa = MARGEM_X + c * ESPACO_X + 20
    const xb = xa + 28
    const meio = (xa + xb) / 2
    return [].concat(
      [faceY(o, xa, xb, 0.3, 26, 56, '#1e293b'), faceY(o, xa + 1.6, xb - 1.6, 0.4, 27.6, 54.4, '#7aa7e0'),
       faceY(o, xa + 3, xa + 8, 0.5, 29, 53, '#9cc2f0'),
       faceY(o, meio - 0.7, meio + 0.7, 0.5, 27.6, 54.4, '#1e293b'), faceY(o, xa + 1.6, xb - 1.6, 0.5, 40.3, 41.7, '#1e293b')],
      cub(o, xa - 1, 0, 25, xb - xa + 2, 2.5, 1.2, '#3f3f46'),
    )
  })
  const fimQuadro = Math.min(profundidade - 30, 74)
  const postIts = ['#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#60a5fa']
    .map((cor, i) => ({ cor, y: 18 + (i % 3) * 16, z: i < 3 ? 35 : 26 }))
    .filter(({ y }) => y + 9 <= fimQuadro - 2)
    .map(({ cor, y, z }) => faceX(o, 0.5, y, y + 9, z, z + 7, cor))
  const centroRelogio = [fimQuadro + 16, 42]
  const relogio = profundidade - 12 > centroRelogio[0]
    ? [{
        pontos: Array.from({ length: 16 }, (_, k) => {
          const a = (k * Math.PI) / 8
          return P3(o, 0.4, centroRelogio[0] + Math.cos(a) * 6, centroRelogio[1] + Math.sin(a) * 6)
        }).join(' '),
        cor: '#f4f4f5',
      },
      faceX(o, 0.5, centroRelogio[0] - 0.4, centroRelogio[0] + 0.4, centroRelogio[1], centroRelogio[1] + 4.5, '#18181b'),
      faceX(o, 0.5, centroRelogio[0], centroRelogio[0] + 3.5, centroRelogio[1] - 0.4, centroRelogio[1] + 0.4, '#18181b')]
    : []
  return [].concat(
    cub(o, -ESPESSURA_PAREDE, -ESPESSURA_PAREDE, 0, ESPESSURA_PAREDE, profundidade + extraEsquerda + ESPESSURA_PAREDE, ALTURA_PAREDE, '#2a2a30'),
    cub(o, 0, -ESPESSURA_PAREDE, 0, largura, ESPESSURA_PAREDE, ALTURA_PAREDE, '#303036'),
    [faceY(o, 0, largura, 0.2, 0, 3, '#1b1b1f'), faceX(o, 0.2, 0, profundidade + extraEsquerda, 0, 3, '#1b1b1f')],
    ...janelas,
    [faceX(o, 0.3, 12.8, fimQuadro + 1.2, 18.8, 49.2, '#94a3b8'), faceX(o, 0.4, 14, fimQuadro, 20, 48, '#e2e8f0'),
     faceX(o, 0.5, 16, fimQuadro - 2, 44, 46.5, '#60a5fa'), ...postIts],
    cub(o, 0, 14, 18.5, 2.2, fimQuadro - 14, 1, '#94a3b8'),
    relogio,
  )
}

function moveisDoCanto(o, largura) {
  return [].concat(
    cub(o, 5, 5, 0, 10, 10, 10, '#9a3412'), cub(o, 6, 6, 10, 8, 8, 0.6, '#3f2a1d'),
    cub(o, 7, 7, 10.6, 6, 6, 10, '#16a34a'), cub(o, 4.5, 8, 15, 5, 4, 7, '#22c55e'),
    cub(o, 9.5, 4.5, 16, 4, 5, 8, '#22c55e'), cub(o, 8, 8, 20, 4, 4, 6, '#4ade80'),
    cub(o, largura - 17, 5, 0, 9, 9, 24, '#e4e4e7'), [faceY(o, largura - 14, largura - 11, 14.1, 16, 18, '#60a5fa')],
    cub(o, largura - 15.5, 6.5, 24, 6, 6, 10, '#93c5fd'), cub(o, largura - 14, 8, 34, 3, 3, 1, '#2563eb'),
  )
}

// Chão, paredes do fundo e móveis fixos do escritório. comLazer = a parede da esquerda continua pela área de lazer.
// Retorna os polígonos.
export function salaDoEscritorio(o, fileiras, comLazer = false) {
  const { largura, profundidade } = dimensoesDoEscritorio(fileiras)
  const extra = comLazer ? ESPESSURA_PAREDE + LAZER_PROFUNDIDADE : 0
  return [].concat(piso(o, largura, profundidade), paredes(o, largura, profundidade, extra), moveisDoCanto(o, largura))
}

// Móveis por onde ninguém passa, em retângulos [x1, y1, x2, y2] do chão (a cadeira cobre as duas posições dela).
export function obstaculosDoEscritorio(fileiras) {
  const { largura } = dimensoesDoEscritorio(fileiras)
  const lista = [[4.5, 4.5, 15, 15], [largura - 17, 5, largura - 8, 14]]
  for (let i = 0; i < fileiras * COLUNAS; i++) {
    const [X0, Y0] = origemDaMesa(i)
    lista.push([X0 + 13, Y0 - 1.5, X0 + 49, Y0 + 17.5], [X0 + 23.5, Y0 + 13, X0 + 36.5, Y0 + 31])
  }
  return lista
}

// Mureta na frente do escritório (a divisa com as duas salas da frente), com o vão das duas portas: a da área de
// lazer e a da sala de reunião. Retorna as peças { chave, poligonos, caixa }, da esquerda para a direita (que aqui é
// de trás para a frente na tela).
export function divisoria(o, fileiras) {
  const { largura, profundidade: Y } = dimensoesDoEscritorio(fileiras)
  const h = ALTURA_DIVISORIA
  const E = ESPESSURA_PAREDE
  const trecho = (chave, x1, x2) => ({
    chave,
    poligonos: [].concat(cub(o, x1, Y, -5, x2 - x1, E, h + 5, '#2a2a30'), cub(o, x1, Y - 0.5, h, x2 - x1, E + 1, 1.2, '#3f3f46')),
    caixa: caixa(x1, Y - 0.5, -5, x2, Y + E + 0.5, h + 1.2),
  })
  const batente = (chave, x) => ({ chave, poligonos: cub(o, x, Y - 0.5, -5, 2.5, E + 1, h + 13, '#3f3f46'), caixa: caixa(x, Y - 0.5, -5, x + 2.5, Y + E + 0.5, h + 8) })
  const soleira = (chave, porta) => ({
    chave,
    poligonos: cub(o, porta.x1, Y, -5, porta.x2 - porta.x1, E, 5.4, '#3a3a42'),
    caixa: caixa(porta.x1, Y, -5, porta.x2, Y + E, 0.4),
  })
  const pecas = []
  let x = 0
  for (const [porta, nomes] of [
    [PORTA, ['mureta-esquerda', 'batente-esquerdo', 'soleira', 'batente-direito']],
    [PORTA_REUNIAO, ['mureta-meio', 'batente-reuniao-esquerdo', 'soleira-reuniao', 'batente-reuniao-direito']],
  ]) {
    pecas.push(trecho(nomes[0], x, porta.x1), batente(nomes[1], porta.x1 - 2.5), soleira(nomes[2], porta), batente(nomes[3], porta.x2))
    x = porta.x2
  }
  pecas.push(trecho('mureta-direita', x, largura))
  return pecas
}

const pt = (par) => par.split(',').map(Number)
export const ancoraEmPe = (o, X0, Y0) => pt(P3(o, X0 + 4, Y0 + 13.5, 34 * ESCALA_BONECO + 3))
export const ancoraSentado = (o, X0, Y0) => pt(P3(o, X0 + 30, Y0 + 24, 38.4))
export const ancoraCracha = (o, X0, Y0) => pt(P3(o, X0 + 4.5, Y0 + 19.5, 0))

function destaque(o, X0, Y0) {
  return {
    pontos: [P3(o, X0 - 8, Y0 - 6, 0.3), P3(o, X0 + 54, Y0 - 6, 0.3), P3(o, X0 + 54, Y0 + 36, 0.3), P3(o, X0 - 8, Y0 + 36, 0.3)].join(' '),
    cor: 'rgba(96,165,250,.16)',
    contorno: '#60a5fa',
    espessura: '1.4',
  }
}

// Âncoras de rótulo de cada mesa (independem de quem está nela), em unidades do palco.
export function ancorasDaMesa(o, i) {
  const [X0, Y0] = origemDaMesa(i)
  return {
    fileira: Math.floor(i / COLUNAS),
    emPe: ancoraEmPe(o, X0, Y0),
    sentado: ancoraSentado(o, X0, Y0),
    cracha: ancoraCracha(o, X0, Y0),
    pisoSentado: pt(P3(o, X0 + 30, Y0 + 24, 0)),
  }
}

// Mesa i com quem está nela (sentado trabalhando ou em pé ao lado) ou vazia (monitor e luz apagados, cadeira encostada).
// ocupante = { agente, pose: 'sentado' | 'empe' | null, classe, desliza } ou null; classe e desliza animam quem levanta ou
// senta; pose null = o dono está andando perto da própria mesa (ela fica acesa, sem ninguém desenhado nela).
// afastada = cadeira puxada mesmo sem ninguém (alguém está entrando nela ou saindo dela).
// Retorna { pecas: [{ chave, poligonos, caixa, assento?, pessoa?, classe?, desliza? }], destaque }, de trás para a frente.
export function montarMesa(o, i, ocupante, afastada = false) {
  const [X0, Y0] = origemDaMesa(i)
  const agente = ocupante?.agente
  const estado = agente ? (ESTADOS_AGENTE[agente.estado] ? agente.estado : 'livre') : null
  const r = ocupante || afastada ? 0 : -5.5
  const partes = mesa(o, X0, Y0, estado, r)
  const pecaMesa = { chave: `mesa-${i}`, poligonos: partes.mesa, caixa: caixa(X0 + 13, Y0 - 1.5, 0, X0 + 49, Y0 + 17.5, 30) }
  const pecaAssento = { chave: `assento-${i}`, poligonos: partes.assento, caixa: caixa(X0 + 23.5, Y0 + 18.5 + r, 0, X0 + 36.5, Y0 + 30.5 + r, 10.2), assento: true }
  const pecaEncosto = { chave: `encosto-${i}`, poligonos: partes.encosto, caixa: caixa(X0 + 23.5, Y0 + 28.5 + r, 8, X0 + 36.5, Y0 + 30.9 + r, 21) }
  const base = { destaque: destaque(o, X0, Y0) }
  if (!ocupante?.pose) return { ...base, pecas: [pecaMesa, pecaAssento, pecaEncosto] }
  const aparencia = aparenciaDoAgente(agente)
  const a = estado === 'interrompida' ? { ...aparencia, ...CINZA } : aparencia
  const pessoa = (poligonos, caixaDaPessoa) => ({
    chave: `pessoa-${agente.id}-mesa-${i}-${ocupante.pose}${ocupante.classe ? `-${ocupante.classe}` : ''}`,
    poligonos,
    caixa: caixaDaPessoa,
    pessoa: { id: agente.id },
    classe: ocupante.classe,
    desliza: ocupante.desliza,
  })
  if (ocupante.pose === 'sentado') {
    const sentado = pessoa(bonecoSentado(o, X0, Y0, a), caixa(X0 + 22.9, Y0 + 10.2, 0, X0 + 37.1, Y0 + 28.1, 37))
    return { ...base, pecas: [pecaMesa, pecaAssento, sentado, pecaEncosto] }
  }
  const emPe = pessoa(bonecoEmPe(o, X0, Y0 + 10, a), caixa(X0 - 2.7, Y0 + 10, 0, X0 + 11.6, Y0 + 17.3, 45))
  return { ...base, pecas: [emPe, pecaMesa, pecaAssento, pecaEncosto] }
}
