import { ESTADOS_AGENTE } from '../../constants/estados.js'
import { COLUNAS, ESPESSURA_PAREDE, REUNIAO_X, ancorasDaMesa, dimensoesDoEscritorio, divisoria, fileirasPara, salaDoEscritorio } from './arteEscritorio.js'
import { TELAS_DO_LAZER, ancorasDaVaga, salaDoLazer } from './arteLazer.js'
import { TELAS_DA_REUNIAO, VAGAS_NA_REUNIAO, ancorasDaReuniao, salaDeReuniao } from './arteReuniao.js'
import { deslocar } from './iso.js'

export const OPCOES_PALCO = {
  escalaMaxima: 2.2,
  // Teto da cena junta. Subiu de 640 com a sala de reunião: a faixa da frente deixou a cena mais funda e, no teto
  // antigo, as mesas e os bonecos encolheriam demais.
  alturaMaxima: 700,
  // Abaixo disto as três salas juntas ficariam pequenas demais: empilha (escritório em cima, as salas da frente embaixo).
  limiarJunto: 0.84,
  alturaMaximaSala: 560,
  // No empilhado as salas da frente podem ser um pouco maiores que o escritório, mas não muito (as pessoas têm de
  // parecer do mesmo tamanho).
  fatorFrente: 1.5,
  escalaMinima: 0.55,
}

// Distâncias dos rótulos até as âncoras, em px de tela (fora da escala), as mesmas que CenaEscritorio desenha.
export const ROTULOS = { balao: 24, marcador: 32, cracha: 2, projeto: 28, ladoX: 21, ladoCracha: 24, ladoProjeto: 38 }
const ALTURA_CRACHA = 24
const ALTURA_PROJETO = 14
const FOLGA_X = 4
const FOLGA_Y = 10
const MARGEM_TOPO = 12
const MARGEM_BASE = 8
const VAO_EMPILHADO = 34

// A cadeira da reunião em que o agente foi convocado a sentar (0 a 6), ou null quando ele não está em reunião.
// A convocação manda mais que tudo: ela funciona com o modo Vida ligado ou desligado.
export function vagaDaConvocacao(agente) {
  const achou = /^reuniao:(\d+)$/.exec(agente?.reuniao?.vagaId ?? '')
  const i = achou ? Number(achou[1]) : -1
  return i >= 0 && i < VAGAS_NA_REUNIAO ? i : null
}

// A chave de lugar que vale para o agente: a cadeira da reunião, senão a vaga que a vida deu. Retorna a chave ou null.
export const chaveDoLugar = (agente) =>
  (vagaDaConvocacao(agente) !== null ? agente.reuniao.vagaId : agente?.vida?.vagaId ?? null)

export const zonaDoAgente = (agente) => {
  if (vagaDaConvocacao(agente) !== null) return 'reuniao'
  return agente.estado === 'livre' || !ESTADOS_AGENTE[agente.estado] ? 'lazer' : 'mesa'
}

// Onde o agente está no escritório. A reunião vem primeiro; depois, com o modo Vida ligado, quem manda é o servidor,
// que diz a vaga ('mesa:3:sentado', 'lazer:7'); sem ele vale a regra de sempre: a mesa é a da posição dele na lista e
// o lazer é a vaga dessa posição. Retorna { zona, mesa, pose, vaga }, onde vaga é a do lazer ou a da reunião.
export function lugarDoAgente(agente, indice, fileiras = Infinity) {
  const convocado = vagaDaConvocacao(agente)
  if (convocado !== null) return { zona: 'reuniao', mesa: null, pose: null, vaga: convocado }
  const chave = agente?.vida?.vagaId
  if (typeof chave === 'string') {
    const naMesa = /^mesa:(\d+):(sentado|empe)$/.exec(chave)
    if (naMesa && Number(naMesa[1]) < fileiras * COLUNAS) return { zona: 'mesa', mesa: Number(naMesa[1]), pose: naMesa[2], vaga: null }
    const noLazer = /^lazer:(\d+)$/.exec(chave)
    if (noLazer) return { zona: 'lazer', mesa: null, pose: null, vaga: Number(noLazer[1]) }
  }
  if (zonaDoAgente(agente) === 'lazer') return { zona: 'lazer', mesa: null, pose: null, vaga: indice }
  return { zona: 'mesa', mesa: indice, pose: agente.estado === 'trabalhando' ? 'sentado' : 'empe', vaga: null }
}

// Largura máxima do crachá em px (o do lazer tem o ícone da atividade a mais).
export function larguraMaximaDoCracha(escala, icone = false) {
  return (escala < 1.1 ? 136 : 168) + (icone ? 18 : 0)
}

function larguraDoNome(texto) {
  let total = 0
  for (const letra of String(texto ?? '')) {
    if ('iIjl|!.,:;\' '.includes(letra)) total += 3
    else if ('ft'.includes(letra)) total += 4
    else if (letra === 'r') total += 4.5
    else if ('mw'.includes(letra)) total += 9.6
    else if ('MW'.includes(letra)) total += 10.5
    else if (letra >= '0' && letra <= '9') total += 6.6
    else if (letra !== letra.toLowerCase()) total += 7.5
    else total += 6.6
  }
  return total * 1.05
}

// Largura prevista do crachá. O chip de tempo entra no pior caso de 3 caracteres ("59m", "23h"), ou "agora" no 1º minuto,
// para a posição não mudar a cada minuto. Retorna px.
export function larguraDoCracha(apelido, escala, { urgente = false, icone = false, chip = '59m' } = {}) {
  const prefixo = urgente ? 20 : icone ? 18 : 0
  const fim = chip ? 22 + larguraDoNome(chip) * 0.87 : 10
  return Math.min(larguraMaximaDoCracha(escala, icone), 10 + prefixo + larguraDoNome(apelido) + fim)
}

export function larguraDoProjeto(nome) {
  return Math.min(140, 14 + larguraDoNome(nome) * 0.86)
}

const medidas = new Map()

function caixaDosPoligonos(poligonos) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of poligonos) {
    for (const par of p.pontos.split(' ')) {
      const [x, y] = par.split(',').map(Number)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY }
}

// As salas da frente, na ordem em que aparecem (da esquerda para a direita) quando a cena é empilhada.
export const SALAS_DA_FRENTE = ['lazer', 'reuniao']

// Canto (0, 0) do lazer quando ele fica colado no escritório: logo depois da mureta da frente, na metade esquerda.
export function origemDoLazerJunto(origem, fileiras) {
  const { profundidade } = dimensoesDoEscritorio(fileiras)
  return deslocar(origem, 0, profundidade + ESPESSURA_PAREDE)
}

// Canto (0, 0) da sala de reunião colada no escritório: ao lado do lazer, depois da mureta que separa as duas.
export function origemDaReuniaoJunto(origem, fileiras) {
  const { profundidade } = dimensoesDoEscritorio(fileiras)
  return deslocar(origem, REUNIAO_X, profundidade + ESPESSURA_PAREDE)
}

// Polígonos fixos de cada palco: 'junto' (as três salas), 'escritorio', 'lazer' ou 'reuniao'. Retorna a lista.
export function arteFixa(palco, fileiras, origem) {
  if (palco === 'lazer') return salaDoLazer(origem, 'separado')
  if (palco === 'reuniao') return salaDeReuniao(origem, 'separado')
  if (palco === 'escritorio') return salaDoEscritorio(origem, fileiras)
  return salaDoEscritorio(origem, fileiras, true)
    .concat(salaDoLazer(origemDoLazerJunto(origem, fileiras), 'junto'))
    .concat(salaDeReuniao(origemDaReuniaoJunto(origem, fileiras), 'junto'))
}

// Tamanho do palco em unidades (só depende da grade, nunca do estado dos agentes). Retorna { largura, altura, origem }.
export function medirPalco(palco, fileiras) {
  const chave = `${palco}:${fileiras}`
  if (medidas.has(chave)) return medidas.get(chave)
  const o = [0, 0]
  const comMureta = palco === 'junto' || palco === 'escritorio'
  const poligonos = arteFixa(palco, fileiras, o).concat(comMureta ? divisoria(o, fileiras).flatMap((p) => p.poligonos) : [])
  const { minX, minY, maxX, maxY } = caixaDosPoligonos(poligonos)
  const medida = {
    largura: Math.ceil(maxX - minX + FOLGA_X * 2),
    altura: Math.ceil(maxY - minY + FOLGA_Y * 2),
    origem: [FOLGA_X - minX, FOLGA_Y - minY],
  }
  medidas.set(chave, medida)
  return medida
}

const cruzam = (a, b) => Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > 0.5 && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > 0.5
const areaComum = (a, b) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1))
const caixa = (x, y, w, h) => ({ x1: x, y1: y, x2: x + w, y2: y + h })

function palcosDoModo(modo, fileiras, largura) {
  const o = OPCOES_PALCO
  if (modo === 'junto') {
    const m = medirPalco('junto', fileiras)
    const escala = Math.min(o.escalaMaxima, largura / m.largura, (o.alturaMaxima - MARGEM_TOPO - MARGEM_BASE) / m.altura)
    const w = m.largura * escala
    const palco = { chave: 'junto', ...m, escala, x: Math.max(0, (largura - w) / 2), y: MARGEM_TOPO }
    return { palcos: [palco], larguraInterna: Math.max(largura, Math.ceil(w)), altura: Math.round(MARGEM_TOPO + m.altura * escala + MARGEM_BASE), escala }
  }
  const m1 = medirPalco('escritorio', fileiras)
  let s1 = Math.min(o.escalaMaxima, largura / m1.largura, o.alturaMaximaSala / m1.altura)
  if (s1 < o.escalaMinima) s1 = o.escalaMinima
  const larguraInterna = Math.max(largura, Math.ceil(m1.largura * s1 - 0.01))
  const palcos = [{ chave: 'escritorio', ...m1, escala: s1, x: (larguraInterna - m1.largura * s1) / 2, y: MARGEM_TOPO }]
  let y = MARGEM_TOPO + m1.altura * s1 + VAO_EMPILHADO
  for (const chave of SALAS_DA_FRENTE) {
    const m = medirPalco(chave, fileiras)
    const escala = Math.min(s1 * o.fatorFrente, larguraInterna / m.largura, o.alturaMaximaSala / m.altura)
    palcos.push({ chave, ...m, escala, x: (larguraInterna - m.largura * escala) / 2, y, legenda: { y: y - VAO_EMPILHADO + 6 } })
    y += m.altura * escala + VAO_EMPILHADO
  }
  return {
    palcos,
    larguraInterna,
    altura: Math.round(y - VAO_EMPILHADO + MARGEM_BASE),
    escala: s1,
  }
}

// O chip de tempo ainda diz "agora" (menos de 1 min no estado)?
export function chipAgora(agente, agora) {
  const inicio = agente.desde ? Date.parse(agente.desde) : NaN
  return !Number.isNaN(inicio) && agora - inicio < 60000
}

const naTela = (palco, [x, y]) => ({ x: palco.x + x * palco.escala, y: palco.y + y * palco.escala })

// Palco em que a sala é desenhada: no modo junto é o único, no empilhado é o palco próprio dela.
export const palcoDaSala = (palcos, chave) => palcos.find((p) => p.chave === chave) ?? palcos[0]

// Âncoras de cada agente em px do contêiner (mesa, lazer ou sala de reunião, conforme o lugar dele).
function geometriaDosAgentes(agentes, modo, palcos, fileiras) {
  const palcoMesa = palcos[0]
  const palcoLazer = palcoDaSala(palcos, 'lazer')
  const palcoReuniao = palcoDaSala(palcos, 'reuniao')
  const origemLazer = modo === 'junto' ? origemDoLazerJunto(palcoLazer.origem, fileiras) : palcoLazer.origem
  const origemReuniao = modo === 'junto' ? origemDaReuniaoJunto(palcoReuniao.origem, fileiras) : palcoReuniao.origem
  // Vale para quem senta (no lazer ou na reunião): a área clicável é o corpo inteiro, só um pouco menor que a caixa
  // dele, para não invadir o vizinho.
  const sentado = (agente, i, lugar, p, ancoras) => {
    const corpo = {
      x1: p.x + ancoras.corpo.x1 * p.escala, x2: p.x + ancoras.corpo.x2 * p.escala,
      y1: p.y + ancoras.corpo.y1 * p.escala, y2: p.y + ancoras.corpo.y2 * p.escala,
    }
    return {
      agente, indice: i, lugar, zona: lugar.zona, palco: p.chave, escala: p.escala, atividade: ancoras.atividade,
      topo: naTela(p, ancoras.topo), base: naTela(p, ancoras.base), corpo,
      area: { x: corpo.x1 + 2, y: corpo.y1 + 2, w: corpo.x2 - corpo.x1 - 4, h: corpo.y2 - corpo.y1 - 4 },
    }
  }
  return agentes.map((agente, i) => {
    const lugar = lugarDoAgente(agente, i, fileiras)
    const zona = lugar.zona
    if (zona === 'mesa') {
      const p = palcoMesa
      const m = ancorasDaMesa(p.origem, lugar.mesa)
      const emPe = naTela(p, m.emPe)
      const sentado = naTela(p, m.sentado)
      const cracha = naTela(p, m.cracha)
      const trabalhando = lugar.pose === 'sentado'
      const bolha = trabalhando ? sentado : emPe
      const piso = trabalhando ? naTela(p, m.pisoSentado) : cracha
      const s = p.escala
      return {
        agente, indice: i, lugar, zona, palco: p.chave, escala: s, emPe, sentado, cracha, bolha,
        marcador: agente.estado === 'aguardando',
        area: { x: bolha.x - 15, y: bolha.y, w: 30, h: Math.max(20, piso.y - bolha.y) },
        corpo: trabalhando
          ? { x1: sentado.x - 9.5 * s, x2: sentado.x + 9.5 * s, y1: sentado.y + 3 * s, y2: sentado.y + 28 * s }
          : { x1: emPe.x - 9 * s, x2: emPe.x + 9.5 * s, y1: emPe.y + 4 * s, y2: cracha.y },
      }
    }
    if (zona === 'reuniao') {
      return sentado(agente, i, lugar, palcoReuniao, { ...ancorasDaReuniao(origemReuniao, lugar.vaga), atividade: 'reuniao' })
    }
    return sentado(agente, i, lugar, palcoLazer, ancorasDaVaga(origemLazer, lugar.vaga))
  })
}

// Telas da TV, do fliperama e da sala de reunião em px: rótulo nenhum deve tampar (custa bem mais que tampar um corpo).
function obstaculosFixos(modo, palcos, fileiras) {
  const daSala = (chave, telas, origemJunta) => {
    const palco = palcoDaSala(palcos, chave)
    const o = modo === 'junto' ? origemJunta(palco.origem, fileiras) : palco.origem
    const canto = (x, y, z) => naTela(palco, [o[0] + (x - y) * 0.866, o[1] + (x + y) * 0.5 - z])
    return telas.map(([[xa, ya, za], [xb, yb, zb]]) => {
      const pontos = [canto(xa, ya, za), canto(xb, yb, za), canto(xa, ya, zb), canto(xb, yb, zb)]
      const xs = pontos.map((p) => p.x)
      const ys = pontos.map((p) => p.y)
      return { peso: 12, x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) }
    })
  }
  return daSala('lazer', TELAS_DO_LAZER, origemDoLazerJunto).concat(daSala('reuniao', TELAS_DA_REUNIAO, origemDaReuniaoJunto))
}

// Lugares possíveis do crachá de quem está na mesa (do mais natural ao último recurso), cada um com o seu custo.
function candidatosDaMesa(g, larguraCracha, larguraProjeto) {
  const { emPe, cracha } = g
  const lista = []
  const add = (modo, custo, rotulo, projeto) => {
    lista.push({ modo, custo, cracha: { ...rotulo, largura: larguraCracha }, projeto: larguraProjeto ? { ...projeto, largura: larguraProjeto } : null })
    // Sem a linha do projeto só se não houver outro jeito (ela continua no painel e no aria-label).
    if (larguraProjeto) lista.push({ modo, custo: custo + 40, cracha: { ...rotulo, largura: larguraCracha }, projeto: null })
  }
  for (const [dx, custo] of [[0, 0], [-22, 7], [22, 7], [-44, 16], [44, 16], [-66, 26], [66, 26]]) {
    for (const [dy, extra] of [[0, 0], [14, 10], [28, 22]]) {
      add('pes', custo + extra,
        { x: cracha.x + dx, y: cracha.y + ROTULOS.cracha + dy, centralizado: true },
        { x: cracha.x + dx, y: cracha.y + ROTULOS.projeto + dy, centralizado: true })
    }
  }
  add('lado', 12, { x: emPe.x + ROTULOS.ladoX, y: emPe.y - ROTULOS.ladoCracha }, { x: emPe.x + ROTULOS.ladoX + 2, y: emPe.y - ROTULOS.ladoProjeto })
  add('esquerda', 18,
    { x: emPe.x - ROTULOS.ladoX - larguraCracha, y: emPe.y - ROTULOS.ladoCracha },
    { x: emPe.x - ROTULOS.ladoX - larguraProjeto, y: emPe.y - ROTULOS.ladoProjeto })
  // Acima do balão (ou do "!"), com o projeto logo acima do crachá.
  const topo = g.bolha.y - (g.marcador ? ROTULOS.marcador + 8 : ROTULOS.balao + 4) - ALTURA_CRACHA
  add('acima', 20, { x: g.bolha.x, y: topo, centralizado: true }, { x: g.bolha.x, y: topo - ALTURA_PROJETO - 1, centralizado: true })
  return lista
}

// Ordem de preferência do crachá em cada vaga do lazer (o sofá tem três pessoas lado a lado: uma vai à direita, outra embaixo...).
const PREFERENCIAS_LAZER = [
  ['direita', 'acima', 'abaixo', 'esquerda'],
  ['acima', 'esquerda', 'direita', 'abaixo'],
  ['esquerda', 'abaixo', 'acima', 'direita'],
  ['abaixo', 'esquerda', 'direita', 'acima'],
  ['abaixo', 'direita', 'esquerda', 'acima'],
  ['direita', 'abaixo', 'acima', 'esquerda'],
  ['esquerda', 'abaixo', 'acima', 'direita'],
  ['acima', 'direita', 'esquerda', 'abaixo'],
]

// O mesmo para as cadeiras da reunião, na ordem da convocação: as três do fundo puxam o crachá para cima e para os
// lados (a mesa fica logo embaixo delas), as três da frente para baixo, e a da ponta direita para a direita.
const PREFERENCIAS_REUNIAO = [
  ['acima', 'esquerda', 'direita', 'abaixo'],
  ['acima', 'direita', 'esquerda', 'abaixo'],
  ['direita', 'acima', 'esquerda', 'abaixo'],
  ['esquerda', 'abaixo', 'acima', 'direita'],
  ['abaixo', 'esquerda', 'direita', 'acima'],
  ['abaixo', 'direita', 'esquerda', 'acima'],
  ['direita', 'acima', 'abaixo', 'esquerda'],
]

// Lugares possíveis do crachá de quem está sentado (no lazer ou na reunião), do mais natural ao último recurso.
function candidatosDeQuemSenta(g, larguraCracha, preferencias) {
  const { topo, base, corpo } = g
  const meio = (corpo.y1 + corpo.y2) / 2 - ALTURA_CRACHA / 2 - 4
  const posicao = {
    acima: (d) => ({ x: topo.x + d, y: topo.y - 8 - ALTURA_CRACHA, centralizado: true }),
    abaixo: (d) => ({ x: base.x + d, y: Math.max(base.y, corpo.y2 - 6) + 4, centralizado: true }),
    direita: (d) => ({ x: corpo.x2 + 4, y: meio + d }),
    esquerda: (d) => ({ x: corpo.x1 - 4 - larguraCracha, y: meio + d }),
  }
  const ordem = preferencias[g.lugar?.vaga ?? g.indice] ?? ['abaixo', 'direita', 'esquerda', 'acima']
  const lista = []
  ordem.forEach((modo, i) => {
    const desvios = modo === 'acima' || modo === 'abaixo' ? [0, -22, 22, -44, 44] : [0, -14, 14, -28, 28]
    desvios.forEach((d, j) => lista.push({ modo, custo: i * 8 + j * 3, cracha: { ...posicao[modo](d), largura: larguraCracha }, projeto: null }))
  })
  return lista
}

function encaixar(rotulo, largura, altura, limiteX, limiteY) {
  if (!rotulo) return null
  const meia = largura / 2
  const x = rotulo.centralizado
    ? Math.min(Math.max(rotulo.x, meia + 2), limiteX - meia - 2)
    : Math.min(Math.max(rotulo.x, 2), limiteX - largura - 2)
  const y = Math.min(Math.max(rotulo.y, 2), limiteY - altura - 2)
  const x1 = rotulo.centralizado ? x - meia : x
  return { ...rotulo, x, y, caixa: caixa(x1, y, largura, altura) }
}

// Posiciona crachás e linhas de projeto sem sobrepor outros rótulos, balões ou "!":
// guloso (urgentes primeiro) e depois algumas passadas em que cada um procura um lugar melhor com os outros parados.
function disporRotulos(geometrias, fixos, limiteX, limiteY) {
  const baloes = []
  for (const g of geometrias) {
    if (g.zona !== 'mesa') continue
    const { x, y } = g.bolha
    if (g.marcador) baloes.push(caixa(x - 16, y - ROTULOS.marcador - 6, 32, 32))
    else baloes.push(caixa(x - 19, y - ROTULOS.balao - 1, 38, 22))
  }
  const macios = geometrias.map((g) => ({ dono: g.agente.id, peso: 1, ...g.corpo })).concat(fixos)
  const prioridade = (g) => (g.zona === 'mesa' ? (ESTADOS_AGENTE[g.agente.estado]?.urgente ? 0 : 1) : 2)
  const itens = [...geometrias]
    .sort((a, b) => prioridade(a) - prioridade(b) || a.indice - b.indice)
    .map((g) => {
      const urgente = Boolean(ESTADOS_AGENTE[g.agente.estado]?.urgente)
      const larguraCracha = larguraDoCracha(g.agente.apelido, g.escala, { urgente, icone: g.zona !== 'mesa', chip: g.recente ? 'agora' : '59m' })
      const nomeProjeto = g.zona === 'mesa' ? g.agente.ordemAtual?.projetoNome : null
      const larguraProjeto = nomeProjeto ? larguraDoProjeto(nomeProjeto) : 0
      const candidatos = g.zona === 'mesa'
        ? candidatosDaMesa(g, larguraCracha, larguraProjeto)
        : candidatosDeQuemSenta(g, larguraCracha, g.zona === 'reuniao' ? PREFERENCIAS_REUNIAO : PREFERENCIAS_LAZER)
      return { g, id: g.agente.id, larguraCracha, larguraProjeto, candidatos }
    })
  const colocados = new Map()
  const avaliar = (item, candidato) => {
    const cracha = encaixar(candidato.cracha, item.larguraCracha, ALTURA_CRACHA, limiteX, limiteY)
    const projeto = encaixar(candidato.projeto, item.larguraProjeto, ALTURA_PROJETO, limiteX, limiteY)
    const caixas = [cracha.caixa, projeto?.caixa].filter(Boolean)
    let duro = 0
    let macio = 0
    for (const c of caixas) {
      for (const b of baloes) if (cruzam(c, b)) duro += 1
      for (const [id, outras] of colocados) if (id !== item.id) for (const o of outras) if (cruzam(c, o)) duro += 1
      for (const m of macios) if (m.dono !== item.id) macio += areaComum(c, m) * m.peso
    }
    const desvio = Math.abs(cracha.x - candidato.cracha.x) + Math.abs(cracha.y - candidato.cracha.y)
    return { modo: candidato.modo, candidato, cracha, projeto, caixas, duro, custo: duro * 100000 + macio / 40 + candidato.custo + desvio * 0.5 }
  }
  const escolher = (item) => {
    let melhor = null
    for (const c of item.candidatos) {
      const r = avaliar(item, c)
      if (!melhor || r.custo < melhor.custo) melhor = r
    }
    return melhor
  }
  const escolhas = new Map()
  for (const item of itens) {
    const r = escolher(item)
    escolhas.set(item.id, r)
    colocados.set(item.id, r.caixas)
  }
  for (let passada = 0; passada < 4; passada++) {
    let mudou = false
    for (const item of itens) {
      colocados.delete(item.id)
      const atual = avaliar(item, escolhas.get(item.id).candidato)
      const r = escolher(item)
      const fica = r.custo < atual.custo - 0.01 ? r : atual
      if (fica === r) mudou = true
      escolhas.set(item.id, fica)
      colocados.set(item.id, fica.caixas)
    }
    if (!mudou) break
  }
  let colisoes = 0
  for (const item of itens) {
    const { caixas } = escolhas.get(item.id)
    for (const c of caixas) {
      for (const b of baloes) if (cruzam(c, b)) colisoes += 1
      for (const [id, outras] of colocados) if (id !== item.id) for (const o of outras) if (cruzam(c, o)) colisoes += 0.5
    }
  }
  return { rotulos: escolhas, colisoes: Math.round(colisoes) }
}

// Planeja a cena para a largura do contêiner: 'junto' (as três salas num palco) quando cabe com boa escala, senão
// 'empilhado' (um palco por sala). Retorna { modo, fileiras, palcos, larguraInterna, altura, rola, agentes: [...] }.
export function planejarCena(agentes, largura, agora = Date.now()) {
  const fileiras = fileirasPara(agentes.length)
  const disponivel = Math.max(1, largura)
  const tentar = (modo) => {
    const base = palcosDoModo(modo, fileiras, disponivel)
    const geometrias = geometriaDosAgentes(agentes, modo, base.palcos, fileiras).map((g) => ({ ...g, recente: chipAgora(g.agente, agora) }))
    const fixos = obstaculosFixos(modo, base.palcos, fileiras)
    const { rotulos, colisoes } = disporRotulos(geometrias, fixos, base.larguraInterna, base.altura)
    return {
      modo, fileiras, ...base, rola: base.larguraInterna > disponivel + 1, colisoes,
      agentes: geometrias.map((g) => ({ ...g, rotulo: rotulos.get(g.agente.id) })),
    }
  }
  const mJunto = medirPalco('junto', fileiras)
  const escalaJunto = Math.min(OPCOES_PALCO.escalaMaxima, disponivel / mJunto.largura, OPCOES_PALCO.alturaMaxima / mJunto.altura)
  const empilhado = () => tentar('empilhado')
  if (escalaJunto < OPCOES_PALCO.limiarJunto) return empilhado()
  const junto = tentar('junto')
  if (junto.colisoes === 0) return junto
  const outro = empilhado()
  return outro.colisoes < junto.colisoes ? outro : junto
}
