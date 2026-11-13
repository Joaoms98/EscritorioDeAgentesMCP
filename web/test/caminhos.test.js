import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COLUNAS, ESPESSURA_PAREDE, LAZER_LARGURA, LAZER_PROFUNDIDADE, PORTA, dimensoesDoEscritorio, obstaculosDoEscritorio } from '../src/components/escritorio/arteEscritorio.js'
import { OBSTACULOS_DO_LAZER, VAGAS_NO_LAZER } from '../src/components/escritorio/arteLazer.js'
import {
  TEMPO_DE_SENTAR, VELOCIDADE, estadoDaCaminhada, gradeDasSalas, inicioDoLazer, planejarCaminhada, postoDoAgente, rotaPeloChao,
} from '../src/components/escritorio/caminhos.js'

// Meio corpo de quem anda: o centro dele nunca chega mais perto que isto de um móvel ou de uma parede.
const CORPO = 2.5
const naMesa = (fileiras, i, estado = 'trabalhando') => postoDoAgente(fileiras, i, { estado })
const noLazer = (fileiras, i) => postoDoAgente(fileiras, i, { estado: 'livre' })

const moveisPorFileiras = new Map()

// O ponto cabe no chão (escritório, vão da porta ou lazer) e não encosta em nenhum móvel, fora o do próprio lugar de quem
// anda (proprio: o ponto de chegada ou de partida; quem joga fliperama, por exemplo, fica dentro da área do fliperama).
// Retorna o motivo, ou null.
function problemaEm(fileiras, [x, y], proprios = []) {
  const { largura, profundidade } = dimensoesDoEscritorio(fileiras)
  const dy = profundidade + ESPESSURA_PAREDE
  const dentro = (x1, y1, x2, y2) => x >= x1 + CORPO && x <= x2 - CORPO && y >= y1 + CORPO && y <= y2 - CORPO
  if (!dentro(0, 0, largura, profundidade + CORPO) && !dentro(PORTA.x1, profundidade - CORPO, PORTA.x2, dy + CORPO) && !dentro(0, dy - CORPO, LAZER_LARGURA, dy + LAZER_PROFUNDIDADE)) {
    return 'fora do chão'
  }
  if (!moveisPorFileiras.has(fileiras)) {
    moveisPorFileiras.set(fileiras, obstaculosDoEscritorio(fileiras).concat(OBSTACULOS_DO_LAZER.map(([x1, y1, x2, y2]) => [x1, y1 + dy, x2, y2 + dy])))
  }
  const cobre = ([x1, y1, x2, y2], [px, py], folga) => px > x1 - folga && px < x2 + folga && py > y1 - folga && py < y2 + folga
  const movel = moveisPorFileiras.get(fileiras).find((m) => cobre(m, [x, y], CORPO) && !proprios.some((p) => cobre(m, p, 0)))
  return movel ? `em cima do móvel ${movel.map((n) => n.toFixed(1)).join(',')}` : null
}

// Pontos a cada unidade ao longo do trecho do meio (o que o A* traçou).
function pontosDoMeio(caminhada) {
  const pontos = []
  for (const s of caminhada.segmentos.filter((segmento) => segmento.perna === 'meio')) {
    for (let d = 0; d <= s.comprimento; d += 1) {
      const t = d / s.comprimento
      pontos.push([s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t])
    }
  }
  return pontos
}

describe('rotaPeloChao', () => {
  it('liga toda mesa (sentado ou em pé) a toda vaga do lazer, só pelo chão livre e em linhas retas', () => {
    for (const fileiras of [2, 3]) {
      for (let i = 0; i < fileiras * COLUNAS; i++) {
        for (const estado of ['trabalhando', 'aguardando']) {
          for (let v = 0; v < VAGAS_NO_LAZER + 3; v++) {
            const de = naMesa(fileiras, i, estado)
            const para = noLazer(fileiras, v)
            const c = planejarCaminhada(fileiras, { posto: de }, para, 0)
            const onde = `fileiras=${fileiras} mesa=${i} ${estado} -> vaga ${v}`
            for (const p of pontosDoMeio(c)) {
              const problema = problemaEm(fileiras, p, [de.acesso, para.acesso])
              assert.equal(problema, null, `${onde}: ${problema} em ${p.map((n) => n.toFixed(1))}`)
            }
            const meio = c.segmentos.filter((s) => s.perna === 'meio')
            for (const s of meio.slice(1, -1)) {
              assert.ok(Math.abs(s.a[0] - s.b[0]) < 1e-6 || Math.abs(s.a[1] - s.b[1]) < 1e-6, `${onde}: trecho torto ${JSON.stringify(s)}`)
            }
          }
        }
      }
    }
  })

  it('para ir da sala ao lazer passa pela porta da mureta', () => {
    const fileiras = 2
    const { profundidade } = dimensoesDoEscritorio(fileiras)
    for (let i = 0; i < 8; i++) {
      const c = planejarCaminhada(fileiras, { posto: naMesa(fileiras, i) }, noLazer(fileiras, i), 0)
      const cruzando = c.segmentos.find((s) => (s.a[1] - profundidade) * (s.b[1] - profundidade) <= 0 && s.a[1] !== s.b[1])
      assert.ok(cruzando, `mesa ${i}: não atravessa a mureta`)
      const x = cruzando.a[0] + ((cruzando.b[0] - cruzando.a[0]) * (profundidade - cruzando.a[1])) / (cruzando.b[1] - cruzando.a[1])
      assert.ok(x > PORTA.x1 + 3 && x < PORTA.x2 - 3, `mesa ${i}: atravessa a mureta fora da porta, em x=${x.toFixed(1)}`)
    }
  })

  it('quando partida e chegada caem na mesma célula, vai direto', () => {
    const grade = gradeDasSalas(2)
    assert.deepEqual(rotaPeloChao(grade, [100, 81], [100.5, 81.5]), [[100, 81], [100.5, 81.5]])
  })
})

describe('postoDoAgente', () => {
  it('quem trabalha senta na mesa, quem espera fica em pé ao lado e quem está livre vai para a vaga dele no lazer', () => {
    assert.equal(naMesa(2, 3).chave, 'mesa:3:sentado')
    assert.equal(naMesa(2, 3, 'aguardando').chave, 'mesa:3:empe')
    assert.equal(naMesa(2, 3, 'concluiu').chave, 'mesa:3:empe')
    assert.equal(noLazer(2, 5).chave, 'lazer:5')
    assert.equal(postoDoAgente(2, 5, { estado: 'desconhecido' }).chave, 'lazer:5')
  })

  it('as vagas do lazer ficam depois da mureta, no mesmo referencial do escritório', () => {
    for (const fileiras of [2, 3]) {
      for (let v = 0; v < VAGAS_NO_LAZER; v++) assert.ok(noLazer(fileiras, v).acesso[1] > inicioDoLazer(fileiras))
    }
  })
})

describe('planejarCaminhada', () => {
  it('quem levanta da cadeira sai de lado (desenhado junto da cadeira) e quem vai sentar entra pelo mesmo trecho', () => {
    const ida = planejarCaminhada(2, { posto: naMesa(2, 1) }, noLazer(2, 1), 0)
    assert.equal(ida.segmentos[0].perna, 'saida')
    assert.equal(ida.segmentos[0].vaga, 'mesa-1')
    assert.equal(ida.segmentos[0].direcao, '-x')
    assert.equal(ida.atraso, TEMPO_DE_SENTAR)
    const volta = planejarCaminhada(2, { posto: noLazer(2, 1) }, naMesa(2, 1), 0)
    const ultimo = volta.segmentos[volta.segmentos.length - 1]
    assert.equal(ultimo.perna, 'entrada')
    assert.equal(ultimo.vaga, 'mesa-1')
    assert.equal(ultimo.direcao, '+x')
    assert.equal(volta.fim - volta.chegada, TEMPO_DE_SENTAR)
  })

  it('quem fica em pé (mesa, copa ou fliperama) chega sem pausa para sentar', () => {
    const c = planejarCaminhada(2, { posto: naMesa(2, 2, 'aguardando') }, noLazer(2, 7), 0)
    assert.equal(c.atraso, 0)
    assert.equal(c.fim, c.chegada)
    assert.ok(Math.abs(c.chegada - (c.total / VELOCIDADE) * 1000) < 1e-6)
  })

  it('a caminhada é contínua: cada trecho começa onde o anterior terminou', () => {
    const c = planejarCaminhada(3, { posto: naMesa(3, 11) }, noLazer(3, 6), 0)
    for (let k = 1; k < c.segmentos.length; k++) assert.deepEqual(c.segmentos[k].a, c.segmentos[k - 1].b)
    assert.ok(Math.abs(c.segmentos.reduce((soma, s) => soma + s.comprimento, 0) - c.total) < 1e-6)
  })

  it('quem muda de ideia no meio do caminho volta de onde está', () => {
    const ida = planejarCaminhada(2, { posto: noLazer(2, 2) }, naMesa(2, 2), 0)
    const agora = ida.inicio + ida.atraso + ((ida.total / 2) / VELOCIDADE) * 1000
    const onde = estadoDaCaminhada(ida, agora).ponto
    const volta = planejarCaminhada(2, { caminhada: ida }, noLazer(2, 2), agora)
    assert.deepEqual(volta.segmentos[0].a, onde)
    assert.equal(volta.atraso, 0)
    assert.equal(volta.de, null)
    assert.ok(volta.total < ida.total)
  })

  it('quem estava entrando na cadeira e muda de ideia sai pelo mesmo trecho, ainda desenhado junto da cadeira', () => {
    const ida = planejarCaminhada(2, { posto: noLazer(2, 0) }, naMesa(2, 0), 0)
    const entrada = ida.segmentos.find((s) => s.perna === 'entrada')
    const agora = ida.inicio + ida.atraso + ((entrada.inicio + entrada.comprimento / 2) / VELOCIDADE) * 1000
    const volta = planejarCaminhada(2, { caminhada: ida }, noLazer(2, 0), agora)
    assert.equal(volta.segmentos[0].perna, 'saida')
    assert.equal(volta.segmentos[0].vaga, 'mesa-0')
    assert.equal(volta.segmentos[0].direcao, '-x')
    assert.deepEqual(volta.segmentos[0].b, entrada.a)
  })
})

describe('estadoDaCaminhada', () => {
  it('levanta, anda (trocando o quadro do passo), chega, senta e acaba', () => {
    const c = planejarCaminhada(2, { posto: naMesa(2, 3) }, noLazer(2, 3), 1000)
    const levantando = estadoDaCaminhada(c, 1000 + TEMPO_DE_SENTAR / 2)
    assert.equal(levantando.fase, 'levantando')
    assert.equal(levantando.quadro, 'parado')
    assert.equal(levantando.vaga, 'mesa-3')
    assert.ok(levantando.progresso > 0.4 && levantando.progresso < 0.6)
    const quadros = new Set()
    for (let t = c.inicio + c.atraso + 1; t < c.chegada; t += 50) {
      const e = estadoDaCaminhada(c, t)
      assert.equal(e.fase, 'andando')
      quadros.add(e.quadro)
    }
    assert.deepEqual([...quadros].sort(), [0, 1, 2, 3])
    const sentando = estadoDaCaminhada(c, c.chegada + 10)
    assert.equal(sentando.fase, 'sentando')
    assert.equal(sentando.direcao, '-x')
    assert.deepEqual(sentando.ponto, noLazer(2, 3).acesso)
    assert.equal(estadoDaCaminhada(c, c.fim + 1).fase, 'fim')
  })
})

describe('pessoas paradas no caminho', () => {
  const fileiras = 2
  const dy = inicioDoLazer(fileiras)
  // Caixa de quem joga fliperama (pés em 139; 22 do lazer), no referencial das duas salas.
  const jogador = [131.9, 15.1 + dy, 146.2, 25.8 + dy]
  const cruza = (c, [x1, y1, x2, y2], folga) => pontosDoMeio(c).some(([x, y]) => x > x1 - folga && x < x2 + folga && y > y1 - folga && y < y2 + folga)

  it('quem sai do sofá ou do pufe até a porta contorna quem está jogando fliperama', () => {
    for (const v of [0, 1, 3, 5]) {
      for (const i of [0, 3, 6]) {
        assert.ok(!cruza(planejarCaminhada(fileiras, { posto: noLazer(fileiras, v) }, naMesa(fileiras, i), 0), jogador, 2.5), `vaga ${v} -> mesa ${i}`)
        assert.ok(!cruza(planejarCaminhada(fileiras, { posto: naMesa(fileiras, i) }, noLazer(fileiras, v), 0), jogador, 2.5), `mesa ${i} -> vaga ${v}`)
      }
    }
  })

  it('quem está em pé na copa é contornado por quem vai para outra vaga da copa, se der', () => {
    const fileirasCheias = 4
    const ocupado = noLazer(fileirasCheias, 11)
    const c = planejarCaminhada(fileirasCheias, { posto: naMesa(fileirasCheias, 0) }, noLazer(fileirasCheias, 10), 0, [ocupado.pegada])
    assert.ok(!cruza(c, ocupado.pegada, 1), 'passa por dentro de quem está na vaga 11')
  })

  it('toda vaga do lazer (até 40 agentes) fica dentro do chão do lazer', () => {
    for (const fileirasDoTeste of [2, 10]) {
      const comeco = inicioDoLazer(fileirasDoTeste)
      for (let v = 0; v < 40; v++) {
        const [x, y] = noLazer(fileirasDoTeste, v).acesso
        assert.ok(x > 4 && x < 196 - 4 && y > comeco + 4 && y < comeco + 150 - 4, `vaga ${v} em ${x.toFixed(1)}, ${(y - comeco).toFixed(1)}`)
      }
    }
  })
})

describe('mudar de ideia levantando ou sentando', () => {
  it('quem muda de destino enquanto levanta termina de levantar no mesmo tempo, e quem volta para o lugar nem sai', () => {
    const ida = planejarCaminhada(2, { posto: noLazer(2, 3) }, naMesa(2, 3), 1000)
    const agora = ida.inicio + TEMPO_DE_SENTAR / 2
    const outra = planejarCaminhada(2, { caminhada: ida }, naMesa(2, 3, 'aguardando'), agora)
    assert.equal(outra.inicio, ida.inicio)
    assert.equal(outra.atraso, TEMPO_DE_SENTAR)
    assert.equal(outra.de.chave, noLazer(2, 3).chave)
    assert.equal(estadoDaCaminhada(outra, agora).fase, 'levantando')
    assert.equal(planejarCaminhada(2, { caminhada: ida }, noLazer(2, 3), agora), null)
  })

  it('quem muda de destino enquanto senta levanta de novo de onde estava sentando', () => {
    const ida = planejarCaminhada(2, { posto: naMesa(2, 1, 'aguardando') }, noLazer(2, 1), 0)
    const agora = ida.chegada + TEMPO_DE_SENTAR / 2
    assert.equal(estadoDaCaminhada(ida, agora).fase, 'sentando')
    const volta = planejarCaminhada(2, { caminhada: ida }, naMesa(2, 1), agora)
    assert.equal(volta.de.chave, noLazer(2, 1).chave)
    assert.equal(volta.atraso, TEMPO_DE_SENTAR)
    assert.equal(estadoDaCaminhada(volta, agora + 10).fase, 'levantando')
  })

  it('a caminhada lembra a mesa de onde saiu, mesmo replanejada no meio', () => {
    const ida = planejarCaminhada(2, { posto: naMesa(2, 4) }, naMesa(2, 4, 'aguardando'), 0)
    assert.equal(ida.mesaDeOrigem, 4)
    const meio = ida.inicio + ida.atraso + ((ida.total / 2) / VELOCIDADE) * 1000
    assert.equal(planejarCaminhada(2, { caminhada: ida }, naMesa(2, 4), meio).mesaDeOrigem, 4)
    assert.equal(planejarCaminhada(2, { posto: noLazer(2, 4) }, naMesa(2, 4), 0).mesaDeOrigem, undefined)
  })
})
