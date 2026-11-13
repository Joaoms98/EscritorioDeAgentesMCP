import {
  COLUNAS, ESPESSURA_PAREDE, LAZER_LARGURA, LAZER_PROFUNDIDADE, PORTA, PORTA_REUNIAO, REUNIAO_LARGURA,
  REUNIAO_PROFUNDIDADE, REUNIAO_X, dimensoesDoEscritorio, obstaculosDoEscritorio, origemDaMesa,
} from './arteEscritorio.js'
import { OBSTACULOS_DO_LAZER, vagaDoLazer } from './arteLazer.js'
import { OBSTACULOS_DA_REUNIAO, vagaDaReuniao } from './arteReuniao.js'
import { zonaDoAgente } from './disposicao.js'

// Quem anda vai a VELOCIDADE unidades do mundo por segundo e muda o quadro do passo a cada PASSO unidades (4 quadros por ciclo).
export const VELOCIDADE = 55
export const PASSO = 9.5
// Tempo de levantar de um assento ou de sentar nele: a pose sentada some (ou aparece) aos poucos.
export const TEMPO_DE_SENTAR = 240
// Meio dos pés de bonecoEmPe e bonecoDeCostas em relação ao (X, Y) com que são desenhados.
export const PES = [4.42, 3.64]
// O corpo passa a RAIO de paredes e móveis; a grade tem células de CELULA unidades; cada curva custa CUSTO_CURVA a mais
// e, a menos de FOLGA_BOA células de um obstáculo, cada passo pesa um pouco mais (a pessoa prefere o meio do corredor).
// PRESSA > 1 troca um pouco do caminho ótimo por uma busca bem mais rápida (a diferença não aparece na tela).
// Quem está parado em pé (na copa, ao lado da mesa) não é parede, mas custa CUSTO_PESSOA a mais por célula: os outros contornam.
const RAIO = 4
const CELULA = 4
const CUSTO_CURVA = 10
const FOLGA_BOA = 6
const PRESSA = 1.4
const CUSTO_PESSOA = 30
const VIZINHOS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]

// Onde a faixa da frente (lazer e sala de reunião) começa no referencial do escritório, logo depois da mureta.
// As três salas são um chão só, ligado pelas duas portas da mureta.
export const inicioDoLazer = (fileiras) => dimensoesDoEscritorio(fileiras).profundidade + ESPESSURA_PAREDE

const grades = new Map()

// Grade do chão das três salas no referencial do escritório: livre = dá para pisar com folga; folga = células até o obstáculo
// mais perto; passo = custo de pisar em cada célula. Guarda também as memórias da busca, reaproveitadas a cada caminho.
export function gradeDasSalas(fileiras) {
  if (grades.has(fileiras)) return grades.get(fileiras)
  const { largura, profundidade } = dimensoesDoEscritorio(fileiras)
  const dy = inicioDoLazer(fileiras)
  const colunas = Math.ceil(Math.max(largura, LAZER_LARGURA, REUNIAO_X + REUNIAO_LARGURA) / CELULA)
  const linhas = Math.ceil((dy + Math.max(LAZER_PROFUNDIDADE, REUNIAO_PROFUNDIDADE)) / CELULA)
  const livre = new Uint8Array(colunas * linhas)
  // Marca as células cujo centro cai dentro do retângulo.
  const pintar = (x1, y1, x2, y2, valor) => {
    const i1 = Math.max(0, Math.ceil(x1 / CELULA - 0.5))
    const i2 = Math.min(colunas - 1, Math.floor(x2 / CELULA - 0.5))
    const j1 = Math.max(0, Math.ceil(y1 / CELULA - 0.5))
    const j2 = Math.min(linhas - 1, Math.floor(y2 / CELULA - 0.5))
    for (let j = j1; j <= j2; j++) livre.fill(valor, j * colunas + i1, j * colunas + i2 + 1)
  }
  pintar(RAIO, RAIO, largura - RAIO, profundidade - RAIO, 1)
  pintar(PORTA.x1 + RAIO, profundidade - RAIO, PORTA.x2 - RAIO, dy + RAIO, 1)
  pintar(PORTA_REUNIAO.x1 + RAIO, profundidade - RAIO, PORTA_REUNIAO.x2 - RAIO, dy + RAIO, 1)
  pintar(RAIO, dy + RAIO, LAZER_LARGURA - RAIO, dy + LAZER_PROFUNDIDADE - RAIO, 1)
  // A mureta entre o lazer e a reunião fica no vão que nenhuma das duas regiões pinta: as salas se ligam só pela frente.
  pintar(REUNIAO_X + RAIO, dy + RAIO, REUNIAO_X + REUNIAO_LARGURA - RAIO, dy + REUNIAO_PROFUNDIDADE - RAIO, 1)
  for (const [x1, y1, x2, y2] of obstaculosDoEscritorio(fileiras)) pintar(x1 - RAIO, y1 - RAIO, x2 + RAIO, y2 + RAIO, 0)
  for (const [x1, y1, x2, y2] of OBSTACULOS_DO_LAZER) pintar(x1 - RAIO, y1 + dy - RAIO, x2 + RAIO, y2 + dy + RAIO, 0)
  for (const [x1, y1, x2, y2] of OBSTACULOS_DA_REUNIAO) {
    pintar(x1 + REUNIAO_X - RAIO, y1 + dy - RAIO, x2 + REUNIAO_X + RAIO, y2 + dy + RAIO, 0)
  }

  const folga = new Uint8Array(colunas * linhas).fill(255)
  const fila = new Int32Array(colunas * linhas)
  let inicio = 0
  let fim = 0
  for (let k = 0; k < livre.length; k++) {
    if (!livre[k]) {
      folga[k] = 0
      fila[fim++] = k
    }
  }
  while (inicio < fim) {
    const k = fila[inicio++]
    const i = k % colunas
    const j = (k - i) / colunas
    for (const [di, dj] of VIZINHOS) {
      const ni = i + di
      const nj = j + dj
      if (ni < 0 || nj < 0 || ni >= colunas || nj >= linhas) continue
      const n = nj * colunas + ni
      if (folga[n] !== 255) continue
      folga[n] = folga[k] + 1
      fila[fim++] = n
    }
  }
  const passo = new Float32Array(colunas * linhas)
  for (let k = 0; k < passo.length; k++) passo[k] = CELULA * (1 + Math.max(0, FOLGA_BOA - folga[k]) * 0.3)
  const estados = colunas * linhas * 4
  const grade = {
    fileiras, celula: CELULA, colunas, linhas, livre, folga, passo,
    extra: new Float32Array(colunas * linhas), custo: new Float64Array(estados), veio: new Int32Array(estados),
  }
  grades.set(fileiras, grade)
  return grade
}

const centro = (grade, k) => [((k % grade.colunas) + 0.5) * CELULA, (Math.floor(k / grade.colunas) + 0.5) * CELULA]

// Índices das células cujo centro cai dentro do retângulo [x1, y1, x2, y2]. Retorna a lista.
function celulasDentro(grade, [x1, y1, x2, y2]) {
  const { colunas, linhas } = grade
  const lista = []
  const i1 = Math.max(0, Math.ceil(x1 / CELULA - 0.5))
  const i2 = Math.min(colunas - 1, Math.floor(x2 / CELULA - 0.5))
  const j1 = Math.max(0, Math.ceil(y1 / CELULA - 0.5))
  const j2 = Math.min(linhas - 1, Math.floor(y2 / CELULA - 0.5))
  for (let j = j1; j <= j2; j++) for (let i = i1; i <= i2; i++) lista.push(j * colunas + i)
  return lista
}

// Célula livre mais perto do ponto (a própria, se der). Retorna o índice da célula.
function celulaLivre(grade, [x, y]) {
  const { colunas, linhas, livre } = grade
  const i0 = Math.min(colunas - 1, Math.max(0, Math.floor(x / CELULA)))
  const j0 = Math.min(linhas - 1, Math.max(0, Math.floor(y / CELULA)))
  if (livre[j0 * colunas + i0]) return j0 * colunas + i0
  let melhor = -1
  let menor = Infinity
  for (let r = 1; r <= 40 && melhor < 0; r++) {
    for (let j = j0 - r; j <= j0 + r; j++) {
      for (let i = i0 - r; i <= i0 + r; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || i < 0 || j < 0 || i >= colunas || j >= linhas) continue
        const d = (i - i0) ** 2 + (j - j0) ** 2
        if (livre[j * colunas + i] && d < menor) {
          menor = d
          melhor = j * colunas + i
        }
      }
    }
  }
  return melhor >= 0 ? melhor : j0 * colunas + i0
}

// Fila de prioridade (heap binário) de estados do A*, em vetores tipados que crescem quando enchem.
function criarFila() {
  let prioridades = new Float64Array(1024)
  let estados = new Int32Array(1024)
  let tamanho = 0
  return {
    get tamanho() {
      return tamanho
    },
    por(estado, prioridade) {
      if (tamanho === estados.length) {
        const p = new Float64Array(tamanho * 2)
        const e = new Int32Array(tamanho * 2)
        p.set(prioridades)
        e.set(estados)
        prioridades = p
        estados = e
      }
      let i = tamanho++
      while (i > 0) {
        const pai = (i - 1) >> 1
        if (prioridades[pai] <= prioridade) break
        prioridades[i] = prioridades[pai]
        estados[i] = estados[pai]
        i = pai
      }
      prioridades[i] = prioridade
      estados[i] = estado
    },
    // Tira o estado de menor prioridade; a prioridade dele fica em `ultima`.
    tirar() {
      const estado = estados[0]
      this.ultima = prioridades[0]
      const p = prioridades[--tamanho]
      const e = estados[tamanho]
      let i = 0
      for (;;) {
        let filho = 2 * i + 1
        if (filho >= tamanho) break
        if (filho + 1 < tamanho && prioridades[filho + 1] < prioridades[filho]) filho += 1
        if (prioridades[filho] >= p) break
        prioridades[i] = prioridades[filho]
        estados[i] = estados[filho]
        i = filho
      }
      prioridades[i] = p
      estados[i] = e
      return estado
    },
    ultima: 0,
  }
}

// Caminho pelo chão de `de` até `para` (pontos no referencial das duas salas), só em linhas retas na direção de x ou de y,
// pelo meio dos corredores, com poucas curvas e contornando quem está parado em pé (ocupados = retângulos [x1, y1, x2, y2]).
// Retorna os pontos: o de partida, as curvas e o de chegada.
export function rotaPeloChao(grade, de, para, ocupados = []) {
  const inicio = celulaLivre(grade, de)
  const alvo = celulaLivre(grade, para)
  if (inicio === alvo) return [de, para]
  const marcadas = ocupados.flatMap(([x1, y1, x2, y2]) => celulasDentro(grade, [x1 - RAIO, y1 - RAIO, x2 + RAIO, y2 + RAIO]))
  for (const k of marcadas) grade.extra[k] = CUSTO_PESSOA
  try {
    return buscar(grade, inicio, alvo, de, para)
  } finally {
    for (const k of marcadas) grade.extra[k] = 0
  }
}

function buscar(grade, inicio, alvo, de, para) {
  const { colunas, livre, passo, extra, custo, veio } = grade
  custo.fill(Infinity)
  veio.fill(-1)
  const ai = alvo % colunas
  const aj = (alvo - ai) / colunas
  const estimativa = (k) => (Math.abs((k % colunas) - ai) + Math.abs(((k / colunas) | 0) - aj)) * CELULA * PRESSA
  const fila = criarFila()
  for (let d = 0; d < 4; d++) {
    custo[inicio * 4 + d] = 0
    fila.por(inicio * 4 + d, estimativa(inicio))
  }
  // As células da borda nunca são livres (paredes com folga), então o vizinho de uma célula livre sempre existe.
  const vizinho = [1, -1, colunas, -colunas]
  let achou = -1
  while (fila.tamanho) {
    const estado = fila.tirar()
    const k = estado >> 2
    if (fila.ultima > custo[estado] + estimativa(k) + 1e-6) continue
    if (k === alvo) {
      achou = estado
      break
    }
    const d = estado & 3
    for (let nd = 0; nd < 4; nd++) {
      const n = k + vizinho[nd]
      if (!livre[n]) continue
      const novo = custo[estado] + passo[n] + extra[n] + (nd === d ? 0 : nd === (d ^ 1) ? 2 * CUSTO_CURVA : CUSTO_CURVA)
      const proximo = n * 4 + nd
      if (novo < custo[proximo]) {
        custo[proximo] = novo
        veio[proximo] = estado
        fila.por(proximo, novo + estimativa(n))
      }
    }
  }
  if (achou < 0) return [de, para]
  const celulas = []
  for (let e = achou; e >= 0; e = veio[e]) celulas.push(e >> 2)
  celulas.reverse()
  const pontos = [de]
  for (let m = 1; m < celulas.length - 1; m++) {
    if (celulas[m] - celulas[m - 1] !== celulas[m + 1] - celulas[m]) pontos.push(centro(grade, celulas[m]))
  }
  pontos.push(para)
  return pontos
}

// Onde cada agente fica: na mesa (sentado trabalhando ou em pé ao lado) ou na vaga dele no lazer, no referencial das duas salas.
// acesso = onde a caminhada começa e termina; entrada = trecho a mais até o lugar final (para dentro da cadeira, desenhado
// junto dela); direcao = para onde olha parado; sentar = a troca de pose é aos poucos; desliza = do lugar sentado até onde
// a pessoa fica em pé, em unidades do mundo; pegada = o chão que a pessoa em pé ocupa ali (os outros contornam), ou null.
export function postoDoAgente(fileiras, indice, agente, chave = null) {
  const doServidor = chave ? postoPorChave(fileiras, chave) : null
  if (doServidor) return doServidor
  if (zonaDoAgente(agente) === 'lazer') return postoDoLazer(fileiras, indice)
  return postoDaMesa(indice, agente.estado === 'trabalhando' ? 'sentado' : 'empe')
}

// O posto de uma chave de lugar vinda do servidor ('mesa:3:sentado', 'lazer:7'). Retorna o posto, ou null quando a
// chave não existe neste escritório (cômodo que a cena ainda não desenha, ou mesa além das que há).
export function postoPorChave(fileiras, chave) {
  if (typeof chave !== 'string') return null
  const mesa = /^mesa:(\d+):(sentado|empe)$/.exec(chave)
  if (mesa) {
    const i = Number(mesa[1])
    return i < fileiras * COLUNAS ? postoDaMesa(i, mesa[2]) : null
  }
  const lazer = /^lazer:(\d+)$/.exec(chave)
  if (lazer) {
    const i = Number(lazer[1])
    return i >= 0 ? postoDoLazer(fileiras, i) : null
  }
  const reuniao = /^reuniao:(\d+)$/.exec(chave)
  if (reuniao) return postoDaReuniao(fileiras, Number(reuniao[1]))
  return null
}

function postoDaMesa(i, pose) {
  const [X0, Y0] = origemDaMesa(i)
  const base = { chave: `mesa:${i}:${pose}`, mesa: i, pose }
  if (pose === 'sentado') {
    return { ...base, acesso: [X0 + 14, Y0 + 25], entrada: [[X0 + 30, Y0 + 25]], vaga: `mesa-${i}`, direcao: '-y', sentar: true, desliza: [0, 1], pegada: null }
  }
  return {
    ...base, acesso: [X0 + PES[0], Y0 + 10 + PES[1]], entrada: [], vaga: null, direcao: '+y', sentar: false, desliza: [0, 0],
    pegada: [X0 - 2.7, Y0 + 10, X0 + 11.6, Y0 + 17.3],
  }
}

function postoDoLazer(fileiras, i) {
  const dy = inicioDoLazer(fileiras)
  const v = vagaDoLazer(i)
  const base = { chave: `lazer:${i}`, vagaDoLazer: i, entrada: [], vaga: null }
  if (v.tipo === 'lado') {
    const x = v.joelho - 7
    return { ...base, acesso: [x, v.yc + dy], direcao: '-x', sentar: true, desliza: [x - (v.xb - 2.35), 0], pegada: null }
  }
  // Quem joga fliperama já está nos obstáculos fixos; na copa, é a pegada de quem está em pé com o café.
  const pegada = v.tipo === 'empe' ? [v.X - 2.7, v.Y + dy, v.X + 11.6, v.Y + 7.3 + dy] : null
  return { ...base, acesso: [v.X + PES[0], v.Y + PES[1] + dy], direcao: v.tipo === 'costas' ? '-y' : '+y', sentar: false, desliza: [0, 0], pegada }
}

// Cadeira `i` da reunião: a pessoa chega ao lado dela, desliza para dentro do assento e fica olhando para a mesa,
// com a cadeira afastada enquanto ela entra ou sai. Retorna o posto, ou null quando essa vaga não existe.
function postoDaReuniao(fileiras, i) {
  const v = vagaDaReuniao(i)
  if (!v) return null
  const dy = inicioDoLazer(fileiras)
  const acesso = [v.acesso[0] + REUNIAO_X, v.acesso[1] + dy]
  const tronco = [v.tronco[0] + REUNIAO_X, v.tronco[1] + dy]
  return {
    chave: `reuniao:${i}`,
    vagaDaReuniao: i,
    cadeiraDaReuniao: v.cadeira,
    acesso,
    entrada: [tronco],
    vaga: `cadeira-reuniao-${v.cadeira}`,
    direcao: v.direcao,
    sentar: true,
    desliza: [acesso[0] - tronco[0], acesso[1] - tronco[1]],
    pegada: null,
  }
}

const direcaoDe = ([x1, y1], [x2, y2]) => {
  const dx = x2 - x1
  const dy = y2 - y1
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? '+x' : '-x'
  return dy >= 0 ? '+y' : '-y'
}

// Junta trechos de pontos (cada um com a vaga em que é desenhado e a perna: saída, meio ou entrada) em segmentos com
// comprimento e distância desde o começo. Retorna { segmentos, total }.
function segmentar(trechos) {
  const segmentos = []
  let total = 0
  for (const { pontos, vaga, perna } of trechos) {
    for (let k = 1; k < pontos.length; k++) {
      const a = pontos[k - 1]
      const b = pontos[k]
      const comprimento = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (comprimento < 0.05) continue
      segmentos.push({ a, b, inicio: total, comprimento, direcao: direcaoDe(a, b), vaga, perna })
      total += comprimento
    }
  }
  return { segmentos, total }
}

function pontoEm(segmentos, distancia) {
  for (const s of segmentos) {
    if (distancia <= s.inicio + s.comprimento) {
      const t = Math.max(0, (distancia - s.inicio) / s.comprimento)
      return { ponto: [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t], segmento: s }
    }
  }
  const ultimo = segmentos[segmentos.length - 1]
  return { ponto: ultimo.b, segmento: ultimo }
}

const distanciaAndada = (c, agora) => Math.max(0, ((agora - c.inicio - c.atraso) * VELOCIDADE) / 1000)

// Caminhada até o posto `para`, saindo do posto `de.posto` (parado nele) ou de onde está agora quem já anda
// (`de.caminhada`), contornando quem está parado em pé (ocupados). Quem está entrando numa cadeira volta pelo mesmo
// trecho; quem está saindo termina de sair. Quem muda de ideia enquanto levanta termina de levantar (ou, se voltou para
// o mesmo lugar, nem sai: retorna null); quem muda enquanto senta levanta de novo dali.
// Retorna { de, para, mesaDeOrigem, segmentos, total, inicio, atraso, chegada, fim, direcaoInicial, partida } ou null.
export function planejarCaminhada(fileiras, de, para, agora, ocupados = []) {
  if (de.caminhada) {
    const anterior = de.caminhada
    const fase = estadoDaCaminhada(anterior, agora).fase
    if (fase === 'levantando' && anterior.de) {
      return para.chave === anterior.de.chave ? null : planejarCaminhada(fileiras, { posto: anterior.de }, para, anterior.inicio, ocupados)
    }
    if (fase === 'sentando' || fase === 'fim') return planejarCaminhada(fileiras, { posto: anterior.para }, para, agora, ocupados)
  }
  const grade = gradeDasSalas(fileiras)
  const trechos = []
  let partida
  let direcaoInicial
  if (de.caminhada) {
    const anterior = de.caminhada
    const estado = estadoDaCaminhada(anterior, agora)
    direcaoInicial = estado.direcao
    const { ponto, segmento } = anterior.segmentos.length ? pontoEm(anterior.segmentos, distanciaAndada(anterior, agora)) : { ponto: anterior.para.acesso, segmento: null }
    if (segmento?.perna === 'saida') {
      const resto = anterior.segmentos.filter((s) => s.perna === 'saida' && s.inicio >= segmento.inicio)
      trechos.push({ pontos: [ponto, ...resto.map((s) => s.b)], vaga: segmento.vaga, perna: 'saida' })
      partida = resto[resto.length - 1].b
    } else if (segmento?.perna === 'entrada') {
      const feitos = anterior.segmentos.filter((s) => s.perna === 'entrada' && s.inicio <= segmento.inicio).reverse()
      trechos.push({ pontos: [ponto, ...feitos.map((s) => s.a)], vaga: segmento.vaga, perna: 'saida' })
      partida = feitos[feitos.length - 1].a
    } else {
      partida = ponto
    }
  } else {
    const origem = de.posto
    direcaoInicial = origem.direcao
    if (origem.entrada.length) {
      trechos.push({ pontos: [...origem.entrada].reverse().concat([origem.acesso]), vaga: origem.vaga, perna: 'saida' })
    }
    partida = origem.acesso
  }
  trechos.push({ pontos: rotaPeloChao(grade, partida, para.acesso, ocupados), vaga: null, perna: 'meio' })
  if (para.entrada.length) trechos.push({ pontos: [para.acesso, ...para.entrada], vaga: para.vaga, perna: 'entrada' })
  const { segmentos, total } = segmentar(trechos)
  const atraso = !de.caminhada && de.posto.sentar ? TEMPO_DE_SENTAR : 0
  const chegada = agora + atraso + (total / VELOCIDADE) * 1000
  return {
    de: de.caminhada ? null : de.posto,
    para,
    // Mesa de onde a caminhada começou (mesmo depois de replanejar): trocar de pose na própria mesa não apaga a mesa.
    mesaDeOrigem: de.caminhada ? de.caminhada.mesaDeOrigem : de.posto.mesa,
    segmentos,
    total,
    inicio: agora,
    atraso,
    chegada,
    fim: chegada + (para.sentar ? TEMPO_DE_SENTAR : 0),
    direcaoInicial,
    partida: segmentos.length ? segmentos[0].a : para.acesso,
  }
}

// Onde está quem anda no instante `agora`. fase: 'levantando' (parado onde estava, a pose sentada sumindo), 'andando',
// 'sentando' (parado no lugar novo, a pose sentada aparecendo) ou 'fim'. progresso vai de 0 a 1 dentro de levantando/sentando.
// Retorna { fase, ponto, direcao, quadro ('parado' ou 0..3), vaga, progresso }.
export function estadoDaCaminhada(c, agora) {
  const primeiro = c.segmentos[0]
  const ultimo = c.segmentos[c.segmentos.length - 1]
  const final = ultimo ? ultimo.b : c.partida
  if (agora < c.inicio + c.atraso) {
    return { fase: 'levantando', ponto: c.partida, direcao: c.direcaoInicial, quadro: 'parado', vaga: primeiro?.vaga ?? null, progresso: (agora - c.inicio) / c.atraso }
  }
  const distancia = distanciaAndada(c, agora)
  if (distancia >= c.total) {
    const fase = agora < c.fim ? 'sentando' : 'fim'
    const progresso = c.fim > c.chegada ? Math.min(1, (agora - c.chegada) / (c.fim - c.chegada)) : 1
    return { fase, ponto: final, direcao: c.para.direcao, quadro: 'parado', vaga: ultimo?.vaga ?? null, progresso }
  }
  const { ponto, segmento } = pontoEm(c.segmentos, distancia)
  return { fase: 'andando', ponto, direcao: segmento.direcao, quadro: Math.floor(distancia / PASSO) % 4, vaga: segmento.vaga, progresso: distancia / c.total }
}
