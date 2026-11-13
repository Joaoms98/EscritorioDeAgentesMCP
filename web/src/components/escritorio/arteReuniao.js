import { ALTURA_DIVISORIA, ALTURA_PAREDE, ESPESSURA_PAREDE, PORTA_REUNIAO, REUNIAO_LARGURA, REUNIAO_PROFUNDIDADE, REUNIAO_X } from './arteEscritorio.js'
import { planta } from './arteLazer.js'
import { P3, animar, chao, cub, faceX, faceY } from './iso.js'
import { ESCALA_BONECO, aparenciaDoAgente, bonecoSentadoEm } from './pessoas.js'
import { caixa } from './profundidade.js'

// A sala de reunião é o cômodo da frente da metade direita do escritório, ao lado da área de lazer: mesa grande com
// oito cadeiras, tela de apresentação, flipchart e o armário do café. O fundo (y = 0) é a mureta do escritório, com a
// porta dela, e a esquerda (x = 0) é a mureta que separa a sala do lazer.
// Ninguém vem para cá por conta própria: quem senta é quem o humano convocou para a reunião.
export const REUNIAO = {
  largura: REUNIAO_LARGURA,
  profundidade: REUNIAO_PROFUNDIDADE,
  // Vão da porta no referencial da sala.
  porta: { x1: PORTA_REUNIAO.x1 - REUNIAO_X, x2: PORTA_REUNIAO.x2 - REUNIAO_X },
}

const PAREDE_ESQ = '#2a2a30'
const PAREDE_FUNDO = '#303036'
const RODAPE = '#1b1b1f'
const CARPETE = 14

const MESA = { x: 44, y: 52, largura: 92, profundidade: 44, altura: 15 }
// Cadeira: lado do assento, altura dele e espessura do encosto.
const CADEIRA = { lado: 13, assento: 7, costas: 2.4 }
// As oito cadeiras em volta da mesa, já na ordem do pintor (de trás para a frente): três de costas para o fundo,
// a da ponta esquerda, a da ponta direita e três na frente. lado = onde fica o encosto;
// acesso = de que lado a pessoa chega e sai (sempre por um vão de corredor, nunca por cima da mesa).
export const CADEIRAS_DA_REUNIAO = [
  [52, 39, '-y', '+x'], [84, 39, '-y', '+x'], [116, 39, '-y', '+x'],
  [31, 67, '-x', '-x'],
  [136, 67, '+x', '+x'],
  [52, 96, '+y', '+x'], [84, 96, '+y', '+x'], [116, 96, '+y', '+x'],
]
// Ordem em que a convocação enche as cadeiras: primeiro as três do fundo (de frente para quem olha), depois as três da
// frente e, por fim, a da ponta direita. A vaga `reuniao:N` é a N-ésima desta lista.
export const CADEIRAS_DA_CONVOCACAO = [0, 1, 2, 5, 6, 7, 4]
// A cadeira da cabeceira esquerda, de frente para a tela, é a do humano: nenhum agente senta nela. Ela fica entalada
// entre a tela e a mesa (sobra um corredor de uma célula de grade), então também não dá para chegar nela andando.
export const CADEIRA_DO_HUMANO = 3
export const VAGAS_NA_REUNIAO = CADEIRAS_DA_CONVOCACAO.length

const TELA = { x: 4, y: 48, largura: 44, base: 20, altura: 26 }
const ARMARIO = { x: 98, y: 3, largura: 52, profundidade: 11, altura: 14 }
const FLIPCHART = { x: 155, y: 18 }
const PLANTA = [160, 4]

// Vetor unitário de cada lado da cadeira, para afastá-la da mesa e achar o lado por onde a pessoa entra.
const LADOS = { '-y': [0, -1], '+y': [0, 1], '-x': [-1, 0], '+x': [1, 0] }
// Para onde a pessoa olha: para o lado oposto ao do encosto, ou seja, para a mesa.
const OLHAR = { '-y': '+y', '+y': '-y', '-x': '+x', '+x': '-x' }
// Quanto a cadeira (e quem está nela) se afasta da mesa: com ela encostada ninguém passaria para sentar.
const RECUO = 6
// Quanto a pessoa anda para o lado, do ponto em que ela chega até o meio do assento.
const ACESSO = 16
// Meio do tronco de quem senta, do meio do assento para o lado do encosto: metade do assento menos metade da
// profundidade do tronco (1,8 do boneco, vezes a escala dele). As costas ficam encostadas no encosto.
const TRONCO_NO_ASSENTO = CADEIRA.lado / 2 - 1.8 * ESCALA_BONECO
// Quanto o corpo de quem senta ocupa do chão em volta do meio do tronco: para os lados, para trás (o cabelo) e para a
// frente (os pés); e a altura dele.
const CORPO_SENTADO = { lado: 7.2, atras: 3.2, frente: 14.6, alto: 34.7 }
// Altura do assento: o pedestal mais a almofada.
const ALTURA_DO_ASSENTO = CADEIRA.assento + 2.4

// Retângulo do chão que a cadeira ocupa na posição (px, py), com o encosto. Retorna [x1, y1, x2, y2].
function retanguloDaCadeira(px, py, lado) {
  const e = CADEIRA.costas
  const [dx, dy] = LADOS[lado]
  return [
    px + Math.min(0, dx * e), py + Math.min(0, dy * e),
    px + CADEIRA.lado + Math.max(0, dx * e), py + CADEIRA.lado + Math.max(0, dy * e),
  ]
}

const uniao = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
const uniaoDasCaixas = (a, b) => caixa(Math.min(a.x1, b.x1), Math.min(a.y1, b.y1), Math.min(a.z1, b.z1), Math.max(a.x2, b.x2), Math.max(a.y2, b.y2), Math.max(a.z2, b.z2))

// Geometria da cadeira `cadeira` (independe de quem senta nela): onde ela fica quando alguém a usa (afastada da mesa),
// o meio do assento, o meio do tronco de quem senta, para onde essa pessoa olha e por onde ela entra e sai.
// Retorna { cadeira, lado, direcao, assento, encostada, afastada, meio, tronco, acesso }.
function geometriaDaCadeira(cadeira) {
  const [x, y, lado, acessoPor] = CADEIRAS_DA_REUNIAO[cadeira]
  const [dx, dy] = LADOS[lado]
  const afastada = [x + dx * RECUO, y + dy * RECUO]
  const meio = [afastada[0] + CADEIRA.lado / 2, afastada[1] + CADEIRA.lado / 2]
  const [ax, ay] = LADOS[acessoPor]
  return {
    cadeira,
    lado,
    direcao: OLHAR[lado],
    assento: ALTURA_DO_ASSENTO,
    encostada: [x, y],
    afastada,
    meio,
    tronco: [meio[0] + dx * TRONCO_NO_ASSENTO, meio[1] + dy * TRONCO_NO_ASSENTO],
    acesso: [meio[0] + ax * ACESSO, meio[1] + ay * ACESSO],
  }
}

// Geometria da vaga `indice` da reunião (reuniao:0 é a primeira cadeira da convocação), ou null quando esse número de
// vaga não existe. Retorna o mesmo que geometriaDaCadeira, mais a vaga.
export function vagaDaReuniao(indice) {
  const cadeira = CADEIRAS_DA_CONVOCACAO[indice]
  return cadeira === undefined ? null : { ...geometriaDaCadeira(cadeira), vaga: indice }
}

// Retângulo do chão que o corpo de quem senta ocupa. Retorna [x1, y1, x2, y2].
function retanguloDoSentado({ tronco: [x, y], direcao }) {
  const { lado, atras, frente } = CORPO_SENTADO
  const [dx, dy] = LADOS[direcao]
  if (dx) return [x - (dx > 0 ? atras : frente), y - lado, x + (dx > 0 ? frente : atras), y + lado]
  return [x - lado, y - (dy > 0 ? atras : frente), x + lado, y + (dy > 0 ? frente : atras)]
}

// Retângulos [x1, y1, x2, y2] do chão da sala por onde ninguém passa: os móveis e cada cadeira no vão inteiro em que
// ela se mexe (da posição encostada na mesa até a afastada). São as mesmas caixas que montarReuniao desenha.
export const OBSTACULOS_DA_REUNIAO = [
  [ARMARIO.x - 0.5, ARMARIO.y - 0.5, ARMARIO.x + ARMARIO.largura + 0.5, ARMARIO.y + ARMARIO.profundidade + 0.5],
  [PLANTA[0] - 0.5, PLANTA[1] - 0.5, PLANTA[0] + 9, PLANTA[1] + 9],
  [FLIPCHART.x, FLIPCHART.y, FLIPCHART.x + 15, FLIPCHART.y + 11.6],
  [TELA.x, TELA.y, TELA.x + 13, TELA.y + TELA.largura],
  [MESA.x, MESA.y, MESA.x + MESA.largura, MESA.y + MESA.profundidade],
  ...CADEIRAS_DA_REUNIAO.map(([x, y, lado], i) => {
    const { afastada } = geometriaDaCadeira(i)
    return uniao(retanguloDaCadeira(x, y, lado), retanguloDaCadeira(afastada[0], afastada[1], lado))
  }),
]

// Os quatro cantos do tampo da mesa, em unidades do cômodo, na ordem em que fecham o polígono: é a área em que o
// humano clica para abrir a reunião.
export const TAMPO_DA_REUNIAO = [
  [MESA.x, MESA.y], [MESA.x + MESA.largura, MESA.y],
  [MESA.x + MESA.largura, MESA.y + MESA.profundidade], [MESA.x, MESA.y + MESA.profundidade],
].map(([x, y]) => [x, y, MESA.altura + 1.6])

// Telas que nenhum rótulo deve tampar (a de apresentação), em unidades do cômodo: [x, y, z] de dois cantos opostos.
export const TELAS_DA_REUNIAO = [
  [[TELA.x + 3, TELA.y + 2, TELA.base + 1.6], [TELA.x + 3, TELA.y + TELA.largura - 2, TELA.base + TELA.altura - 1.6]],
]

const pt = (par) => par.split(',').map(Number)

// Pontos de referência da vaga da reunião em unidades do palco: topo da cabeça de quem senta, chão na frente dela,
// caixa do corpo na tela e o destaque do chão. Retorna { topo, base, corpo, destaque }.
export function ancorasDaReuniao(o, indice) {
  const vaga = vagaDaReuniao(indice)
  const [x1, y1, x2, y2] = retanguloDoSentado(vaga)
  const alto = CORPO_SENTADO.alto
  const cantos = []
  for (const x of [x1, x2]) for (const y of [y1, y2]) for (const z of [0, alto]) cantos.push(pt(P3(o, x, y, z)))
  const xs = cantos.map(([x]) => x)
  const ys = cantos.map(([, y]) => y)
  const [tx, ty] = vaga.tronco
  // O destaque é o vão da cadeira: o chão em que a pessoa e a cadeira dela estão.
  const [dx1, dy1, dx2, dy2] = uniao(retanguloDoSentado(vaga), retanguloDaCadeira(vaga.afastada[0], vaga.afastada[1], vaga.lado))
  return {
    topo: pt(P3(o, tx, ty, alto + 1)),
    base: pt(P3(o, tx, ty, 0)),
    corpo: { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) },
    destaque: {
      pontos: [P3(o, dx1, dy1, 0.3), P3(o, dx2, dy1, 0.3), P3(o, dx2, dy2, 0.3), P3(o, dx1, dy2, 0.3)].join(' '),
      cor: 'rgba(96,165,250,.16)',
      contorno: '#60a5fa',
      espessura: '1.4',
    },
  }
}

// Carpete de placas, com o tapete da mesa no meio. Retorna os polígonos.
function piso(o, largura, profundidade) {
  const placas = [].concat(cub(o, 0, 0, -5, largura, profundidade, 5, '#1b1b20'))
  for (let x = 0; x < largura; x += CARPETE) {
    for (let y = 0; y < profundidade; y += CARPETE) {
      const x2 = Math.min(largura, x + CARPETE)
      const y2 = Math.min(profundidade, y + CARPETE)
      const par = (Math.floor(x / CARPETE) + Math.floor(y / CARPETE)) % 2 === 0
      placas.push(chao(o, x, y, x2, y2, par ? '#26262e' : '#23232b'))
    }
  }
  return placas.concat(
    chao(o, MESA.x - 18, MESA.y - 20, MESA.x + MESA.largura + 18, MESA.y + MESA.profundidade + 20, '#303446'),
    chao(o, MESA.x - 15, MESA.y - 17, MESA.x + MESA.largura + 15, MESA.y + MESA.profundidade + 17, '#282b3b'),
  )
}

// Paredes do cômodo inteiro (só no palco separado): a porta fica no fundo e os painéis de vidro ao lado dela.
function paredes(o, largura, profundidade) {
  const { x1, x2 } = REUNIAO.porta
  const vidro = (xa, xb) => [
    faceY(o, xa, xb, 0.25, 12, 48, '#3f3f46'),
    faceY(o, xa + 1.6, xb - 1.6, 0.3, 13.6, 46.4, '#28384d'),
    faceY(o, xa + 3, xa + 9, 0.35, 15, 44, '#3a516b'),
  ]
  return [].concat(
    cub(o, -ESPESSURA_PAREDE, -ESPESSURA_PAREDE, 0, ESPESSURA_PAREDE, profundidade + ESPESSURA_PAREDE, ALTURA_PAREDE, PAREDE_ESQ),
    cub(o, 0, -ESPESSURA_PAREDE, 0, largura, ESPESSURA_PAREDE, ALTURA_PAREDE, PAREDE_FUNDO),
    [faceY(o, 0, largura, 0.2, 0, 3, RODAPE), faceX(o, 0.2, 0, profundidade, 0, 3, RODAPE)],
    [faceY(o, x1 - 1.8, x2 + 1.8, 0.25, 0, 48.4, '#3f3f46'), faceY(o, x1, x2, 0.3, 0, 46.6, '#111113'),
     faceY(o, x1 + 1.5, x2 - 1.5, 0.35, 0, 2.5, '#26262b')],
    vidro(8, 46),
    vidro(104, 142),
  )
}

// Mureta entre a sala de reunião e a área de lazer (a mesma da frente do escritório, virada de lado): baixa de
// propósito, para não tampar o lazer, que fica atrás dela. Retorna a peça.
function mureta(o, profundidade) {
  const h = ALTURA_DIVISORIA
  const E = ESPESSURA_PAREDE
  return {
    chave: 'mureta-reuniao',
    poligonos: [].concat(
      cub(o, -E, 0, -5, E, profundidade, h + 5, PAREDE_ESQ),
      cub(o, -E - 0.5, 0, h, E + 1, profundidade, 1.2, '#3f3f46'),
    ),
    caixa: caixa(-E - 0.5, 0, -5, 0.5, profundidade, h + 1.2),
  }
}

// Cadeira de reunião em duas metades: a base (pedestal e assento) e o encosto, cada uma com a caixa dela. Quem senta
// é desenhado entre as duas, então o encosto fica na frente da pessoa quando é ele que está virado para quem olha.
// lado = onde fica o encosto ('-y', '+y', '-x' ou '+x'). Retorna { base, costas, caixaBase, caixaCostas }.
function cadeira(o, x, y, lado, cor = '#4b5162') {
  const L = CADEIRA.lado
  const z = CADEIRA.assento
  const e = CADEIRA.costas
  const base = [].concat(
    cub(o, x + 4, y + 4, 0, 5, 5, 0.9, '#18181b'),
    cub(o, x + 5.4, y + 5.4, 0.9, 2.2, 2.2, z - 0.9, '#27272a'),
    cub(o, x + 0.5, y + 0.5, z, L - 1, L - 1, 2.4, cor),
  )
  const costasCor = '#3e4252'
  const costas = {
    '-y': cub(o, x + 0.5, y - e, z + 2.4, L - 1, e, 13, costasCor),
    '+y': cub(o, x + 0.5, y + L, z + 2.4, L - 1, e, 13, costasCor),
    '-x': cub(o, x - e, y + 0.5, z + 2.4, e, L - 1, 13, costasCor),
    '+x': cub(o, x + L, y + 0.5, z + 2.4, e, L - 1, 13, costasCor),
  }[lado]
  return {
    base,
    costas,
    caixaBase: caixa(x, y, 0, x + L, y + L, z + 2.4),
    // A caixa do encosto acompanha o bloco dele, lado a lado.
    caixaCostas: {
      '-y': caixa(x + 0.5, y - e, z + 2.4, x + L - 0.5, y, z + 15.4),
      '+y': caixa(x + 0.5, y + L, z + 2.4, x + L - 0.5, y + L + e, z + 15.4),
      '-x': caixa(x - e, y + 0.5, z + 2.4, x, y + L - 0.5, z + 15.4),
      '+x': caixa(x + L, y + 0.5, z + 2.4, x + L + e, y + L - 0.5, z + 15.4),
    }[lado],
  }
}

// Peças da cadeira `cadeiraId` com (ou sem) quem senta nela, na ordem do pintor. ocupante = { agente, classe, desliza }
// ou null; afastada = cadeira puxada mesmo sem ninguém (alguém está entrando nela ou saindo dela).
// Retorna [{ chave, poligonos, caixa, assento?, pessoa?, classe?, desliza? }].
function cadeiraComQuemSenta(o, cadeiraId, ocupante, afastada) {
  const g = geometriaDaCadeira(cadeiraId)
  const puxada = Boolean(ocupante) || afastada
  const [x, y] = puxada ? g.afastada : g.encostada
  const humana = cadeiraId === CADEIRA_DO_HUMANO
  const { base, costas, caixaBase, caixaCostas } = cadeira(o, x, y, g.lado, humana ? '#6b5748' : undefined)
  // Vazia, a cadeira é uma peça só: é assim que ela entra na ordem do pintor do cômodo inteiro.
  if (!ocupante) {
    const peca = { chave: `cadeira-reuniao-${cadeiraId}`, caixa: uniaoDasCaixas(caixaBase, caixaCostas) }
    const atras = g.lado === '-y' || g.lado === '-x'
    return [{ ...peca, poligonos: atras ? costas.concat(base) : base.concat(costas) }]
  }
  const { agente, classe, desliza } = ocupante
  const pessoa = {
    chave: `pessoa-${agente.id}-reuniao-${cadeiraId}${classe ? `-${classe}` : ''}`,
    ...pessoaDaCadeira(o, g, agente),
    pessoa: { id: agente.id },
    classe,
    desliza,
  }
  const pecaBase = { chave: `cadeira-reuniao-${cadeiraId}-base`, poligonos: base, caixa: caixaBase, assento: true }
  const pecaCostas = { chave: `cadeira-reuniao-${cadeiraId}-costas`, poligonos: costas, caixa: caixaCostas }
  return g.lado === '-y' || g.lado === '-x' ? [pecaCostas, pecaBase, pessoa] : [pecaBase, pessoa, pecaCostas]
}

// Polígonos e caixa (no cômodo) de quem está sentado na cadeira. Retorna { poligonos, caixa }.
function pessoaDaCadeira(o, g, agente) {
  const [x1, y1, x2, y2] = retanguloDoSentado(g)
  return {
    poligonos: bonecoSentadoEm(o, g.tronco[0], g.tronco[1], aparenciaDoAgente(agente), g.direcao, g.assento),
    caixa: caixa(x1, y1, 0, x2, y2, CORPO_SENTADO.alto),
  }
}

// Mesa de reunião: dois pés em bloco, o tampo e o que está em cima dele (papéis, jarra de água, telefone de
// conferência, um notebook aberto e uma caneca), de trás para a frente. Retorna os polígonos.
function mesaDeReuniao(o) {
  const { x, y, largura: w, profundidade: d, altura: h } = MESA
  const z = h + 1.6
  const papel = (px, py) => [
    chao(o, px, py, px + 11, py + 8, '#d4d4d8', z + 0.05),
    chao(o, px + 1.5, py + 1.5, px + 8.5, py + 2.2, '#71717a', z + 0.1),
    chao(o, px + 1.5, py + 3.6, px + 7, py + 4.3, '#71717a', z + 0.1),
    cub(o, px + 1.5, py + 6, z + 0.05, 7, 0.8, 0.5, '#b5546a'),
  ]
  const notebook = (px, py) => [].concat(
    cub(o, px, py, z + 0.8, 12, 1.6, 7.6, '#27272a'),
    [faceY(o, px + 0.8, px + 11.2, py + 1.65, z + 1.6, z + 7.8, '#1e3a5f')],
    animar([faceY(o, px + 2, px + 7.5, py + 1.7, z + 5.2, z + 6.1, '#60a5fa')], 'esc-tela 2.8s ease-in-out infinite'),
    cub(o, px, py + 1.8, z, 12, 8, 0.8, '#3f3f46'),
    [chao(o, px + 1.2, py + 3.6, px + 10.8, py + 8.4, '#52525b', z + 0.85)],
  )
  return [].concat(
    cub(o, x + 9, y + 9, 0, 11, d - 18, h - 1, '#3f3f46'),
    cub(o, x + w - 20, y + 9, 0, 11, d - 18, h - 1, '#3f3f46'),
    cub(o, x + 20, y + d / 2 - 3, 5, w - 40, 6, 5, '#52525b'),
    cub(o, x, y, h, w, d, 1.6, '#5b4738'),
    papel(53, 55),
    cub(o, 70, 57, z, 5.5, 5.5, 9, '#7aa7e0'), cub(o, 70.5, 57.5, z + 9, 4.5, 4.5, 0.9, '#a1a1aa'),
    cub(o, 78, 57, z, 2.6, 2.6, 3.4, '#cbd5e1'), cub(o, 78, 60.6, z, 2.6, 2.6, 3.4, '#cbd5e1'),
    papel(117, 55),
    cub(o, 86, 70, z, 8, 6, 1.6, '#27272a'),
    animar(cub(o, 89, 72, z + 1.6, 1.4, 1.4, 0.35, '#34d399'), 'esc-luz 2.6s ease-in-out infinite'),
    notebook(56, 82),
    cub(o, 104, 84, z, 3.4, 3.4, 4, '#b5546a'), cub(o, 104.4, 84.4, z + 4, 2.6, 2.6, 0.4, '#8a3f50'),
  )
}

// Tela de apresentação num pedestal, encostada na mureta do lazer e virada para a mesa, com um slide de barras.
function telaDeApresentacao(o) {
  const { x, y, largura: w, base: z, altura: h } = TELA
  const meio = y + w / 2
  const face = (y1, y2, z1, z2, cor) => faceX(o, x + 3.1, y1, y2, z1, z2, cor)
  return [].concat(
    animar([{ pontos: [P3(o, x + 3, y, 0.2), P3(o, x + 42, y - 8, 0.2), P3(o, x + 42, y + w + 8, 0.2), P3(o, x + 3, y + w, 0.2)].join(' '), cor: '#93c5fd', opacidade: 0.06 }],
      'esc-brilho 3.6s ease-in-out infinite'),
    cub(o, x, meio - 9, 0, 9, 18, 2, '#27272a'),
    cub(o, x + 2.5, meio - 2.5, 2, 4, 5, z - 2, '#3f3f46'),
    cub(o, x, y, z, 3, w, h, '#0e0e10'),
    [faceX(o, x + 3.05, y + 2, y + w - 2, z + 1.6, z + h - 1.6, '#16233a')],
    [face(y + 5, y + 25, z + 19.5, z + 21.2, '#e4e4e7'), face(y + 5, y + 17, z + 16, z + 17.2, '#71717a'),
     face(y + 5, y + 39, z + 4.4, z + 5, '#52525b'),
     face(y + 7, y + 11, z + 5, z + 11, '#60a5fa'), face(y + 14, y + 18, z + 5, z + 14.5, '#34d399'),
     face(y + 21, y + 25, z + 5, z + 9, '#fbbf24')],
    animar([{ ...face(y + 2, y + w - 2, z + 1.6, z + h - 1.6, '#ffffff'), opacidade: 0.05 }], 'esc-brilho 4.2s ease-in-out infinite'),
    [faceX(o, x + 3.1, meio - 1, meio + 1, z + 0.5, z + 1.2, '#e4e4e7')],
  )
}

// Armário do café encostado no fundo, ao lado da porta: garrafa térmica, duas xícaras e os cadernos.
function armario(o) {
  const { x, y, largura: w, profundidade: d, altura: h } = ARMARIO
  return [].concat(
    cub(o, x, y, 0, w, d, h, '#3f3f46'),
    [faceY(o, x + 3, x + w / 2 - 2, y + d + 0.05, 2, h - 2, '#46464f'), faceY(o, x + w / 2 + 2, x + w - 3, y + d + 0.05, 2, h - 2, '#46464f'),
     faceY(o, x + w / 2 - 6, x + w / 2 - 3.5, y + d + 0.1, h / 2 - 0.6, h / 2 + 0.6, '#a1a1aa'),
     faceY(o, x + w / 2 + 3.5, x + w / 2 + 6, y + d + 0.1, h / 2 - 0.6, h / 2 + 0.6, '#a1a1aa')],
    cub(o, x - 0.5, y - 0.5, h, w + 1, d + 1, 1.2, '#a1a1aa'),
    cub(o, x + 6, y + 3, h + 1.2, 5.5, 5.5, 11, '#27272a'), cub(o, x + 7, y + 4, h + 12.2, 3.5, 3.5, 0.8, '#52525b'),
    cub(o, x + 16, y + 4, h + 1.2, 3, 3, 3.2, '#e4e4e7'), cub(o, x + 21, y + 4, h + 1.2, 3, 3, 3.2, '#e4e4e7'),
    cub(o, x + 32, y + 3, h + 1.2, 11, 6, 1.4, '#b5546a'), cub(o, x + 33, y + 4, h + 2.6, 9, 4, 1.2, '#4f8f6e'),
  )
}

// Flipchart no canto do fundo, com o bloco de papel virado para a mesa.
function flipchart(o) {
  const { x, y } = FLIPCHART
  return [].concat(
    cub(o, x + 6, y + 1, 0, 2.2, 2.2, 28, '#52525b'),
    cub(o, x + 0.5, y + 9, 0, 2.2, 2.2, 26, '#3f3f46'),
    cub(o, x + 12.3, y + 9, 0, 2.2, 2.2, 26, '#3f3f46'),
    cub(o, x, y + 9, 26, 15, 2.6, 2, '#3f3f46'),
    [chao(o, x, y + 9.4, x + 15, y + 11.6, '#f4f4f5', 28),
     faceY(o, x, x + 15, y + 11.6, 8, 28, '#e8e8ea'),
     faceY(o, x + 2, x + 12.5, y + 11.7, 23.5, 24.6, '#52525b'), faceY(o, x + 2, x + 9.5, y + 11.7, 20.5, 21.5, '#71717a'),
     faceY(o, x + 2, x + 7.5, y + 11.7, 17.5, 18.5, '#71717a'), faceY(o, x + 2.5, x + 5.5, y + 11.7, 12.5, 14, '#4f8f6e')],
  )
}

// Monta o cômodo vazio (carpete e, no palco separado, as paredes). Retorna os polígonos.
export function salaDeReuniao(o, modo) {
  const { largura, profundidade } = REUNIAO
  const carpete = piso(o, largura, profundidade)
  return modo === 'junto' ? carpete : carpete.concat(paredes(o, largura, profundidade))
}

// Móveis da sala e quem está sentado nela, de trás para a frente. No palco junto, a primeira peça é a mureta que
// separa a sala do lazer (no separado ela é a parede da esquerda, desenhada pelo cômodo).
// ocupantes = Map(cadeira -> { agente, classe, desliza }); afastadas = Set de cadeiras puxadas sem ninguém (alguém
// está entrando nelas ou saindo delas). classe e desliza animam quem levanta ou senta.
// Retorna { camadas: [{ chave, poligonos, caixa, assento?, pessoa?, classe?, desliza? }] }, com as caixas em
// unidades do cômodo; pessoa = { id } marca o grupo de um agente.
export function montarReuniao(o, modo, ocupantes = new Map(), afastadas = new Set()) {
  const camadas = []
  const movel = (chave, poligonos, caixaDoMovel) => camadas.push({ chave, poligonos, caixa: caixaDoMovel })
  const sentar = (i) => camadas.push(...cadeiraComQuemSenta(o, i, ocupantes.get(i) ?? null, afastadas.has(i)))
  if (modo === 'junto') camadas.push(mureta(o, REUNIAO.profundidade))
  const { x: ax, y: ay, largura: aw, profundidade: ad, altura: ah } = ARMARIO
  movel('armario-reuniao', armario(o), caixa(ax - 0.5, ay - 0.5, 0, ax + aw + 0.5, ay + ad + 0.5, ah + 13.4))
  movel('planta-reuniao', planta(o, PLANTA[0], PLANTA[1], '#57534e'), caixa(PLANTA[0] - 0.5, PLANTA[1] - 0.5, 0, PLANTA[0] + 9, PLANTA[1] + 9, 24))
  movel('flipchart', flipchart(o), caixa(FLIPCHART.x, FLIPCHART.y, 0, FLIPCHART.x + 15, FLIPCHART.y + 11.6, 30))
  movel('tela-reuniao', telaDeApresentacao(o), caixa(TELA.x, TELA.y, 0, TELA.x + 13, TELA.y + TELA.largura, TELA.base + TELA.altura))
  // As quatro primeiras cadeiras (as três do fundo e a da cabeceira esquerda) ficam atrás da mesa; as outras, na frente.
  for (let i = 0; i < 4; i++) sentar(i)
  movel('mesa-reuniao', mesaDeReuniao(o), caixa(MESA.x, MESA.y, 0, MESA.x + MESA.largura, MESA.y + MESA.profundidade, MESA.altura + 11))
  for (let i = 4; i < CADEIRAS_DA_REUNIAO.length; i++) sentar(i)
  return { camadas }
}
