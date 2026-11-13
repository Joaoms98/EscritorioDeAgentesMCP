import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ESPESSURA_PAREDE, LAZER_LARGURA, LAZER_PROFUNDIDADE, PORTA, PORTA_REUNIAO, REUNIAO_LARGURA, REUNIAO_PROFUNDIDADE,
  REUNIAO_X, dimensoesDoEscritorio, divisoria, montarMesa, obstaculosDoEscritorio,
} from '../src/components/escritorio/arteEscritorio.js'
import { OBSTACULOS_DO_LAZER, VAGAS_NO_LAZER, montarLazer } from '../src/components/escritorio/arteLazer.js'
import {
  CADEIRAS_DA_CONVOCACAO, CADEIRAS_DA_REUNIAO, CADEIRA_DO_HUMANO, OBSTACULOS_DA_REUNIAO, REUNIAO, VAGAS_NA_REUNIAO,
  montarReuniao, salaDeReuniao, vagaDaReuniao,
} from '../src/components/escritorio/arteReuniao.js'
import { inicioDoLazer, planejarCaminhada, postoDoAgente, postoPorChave } from '../src/components/escritorio/caminhos.js'
import { chaveDoLugar, lugarDoAgente, medirPalco, planejarCena, vagaDaConvocacao, zonaDoAgente } from '../src/components/escritorio/disposicao.js'
import { aparenciaDoAgente, bonecoSentadoEm, caixaDoBonecoSentado, caixasDoBonecoSentado } from '../src/components/escritorio/pessoas.js'
import { caixaNaTela, deslocarCaixa, relacao } from '../src/components/escritorio/profundidade.js'

const O = [400, 40]
const FILEIRAS = 2
const { largura: LARGURA, profundidade: PROFUNDIDADE } = dimensoesDoEscritorio(FILEIRAS)
const camadas = (modo = 'junto') => montarReuniao(O, modo).camadas
const moveis = (modo = 'junto') => camadas(modo).filter((c) => c.chave !== 'mureta-reuniao')

describe('lugar da sala de reunião', () => {
  it('fica ao lado do lazer, na mesma faixa da frente, e vai até a ponta direita do escritório', () => {
    assert.equal(REUNIAO_X, LAZER_LARGURA + ESPESSURA_PAREDE)
    assert.equal(REUNIAO_X + REUNIAO_LARGURA, LARGURA)
    assert.equal(REUNIAO_PROFUNDIDADE, LAZER_PROFUNDIDADE)
    assert.deepEqual({ largura: REUNIAO.largura, profundidade: REUNIAO.profundidade }, { largura: REUNIAO_LARGURA, profundidade: REUNIAO_PROFUNDIDADE })
  })

  it('a porta dela cai num corredor entre as colunas de mesas, dentro da sala e longe da porta do lazer', () => {
    assert.ok(PORTA_REUNIAO.x1 >= REUNIAO_X && PORTA_REUNIAO.x2 <= LARGURA, 'a porta não está na frente da sala')
    assert.ok(PORTA_REUNIAO.x1 > PORTA.x2, 'as duas portas se encostam')
    for (const [x1, , x2] of obstaculosDoEscritorio(FILEIRAS)) {
      assert.ok(x2 <= PORTA_REUNIAO.x1 || x1 >= PORTA_REUNIAO.x2, `móvel de ${x1} a ${x2} tampa a porta da reunião`)
    }
    assert.equal(REUNIAO.porta.x1, PORTA_REUNIAO.x1 - REUNIAO_X)
    assert.equal(REUNIAO.porta.x2, PORTA_REUNIAO.x2 - REUNIAO_X)
  })

  it('a mureta da frente fecha o escritório inteiro, com vão só nas duas portas', () => {
    const vaos = divisoria(O, FILEIRAS)
      .filter((p) => p.chave.startsWith('mureta'))
      .map((p) => p.caixa)
      .sort((a, b) => a.x1 - b.x1)
    assert.equal(vaos[0].x1, 0)
    assert.equal(vaos[vaos.length - 1].x2, LARGURA)
    const buracos = []
    for (let k = 1; k < vaos.length; k++) buracos.push([vaos[k - 1].x2, vaos[k].x1])
    assert.deepEqual(buracos, [[PORTA.x1, PORTA.x2], [PORTA_REUNIAO.x1, PORTA_REUNIAO.x2]])
  })
})

describe('móveis da sala de reunião', () => {
  it('tudo (mesa, cadeiras, tela, armário, flipchart e planta) fica dentro do chão da sala', () => {
    for (const { chave, caixa } of moveis()) {
      assert.ok(caixa.x1 >= 0 && caixa.x2 <= REUNIAO_LARGURA, `${chave} sai da sala em x: ${caixa.x1} a ${caixa.x2}`)
      assert.ok(caixa.y1 >= 0 && caixa.y2 <= REUNIAO_PROFUNDIDADE, `${chave} sai da sala em y: ${caixa.y1} a ${caixa.y2}`)
    }
  })

  it('a mureta do lado só ocupa a divisa com o lazer, sem invadir nenhuma das duas salas', () => {
    // O capeamento de cima passa 0,5 de cada lado, como na mureta da frente do escritório.
    const { caixa } = camadas().find((c) => c.chave === 'mureta-reuniao')
    assert.ok(caixa.x1 + REUNIAO_X >= LAZER_LARGURA - 0.5, 'a mureta entra na área de lazer')
    assert.ok(caixa.x2 <= 0.5, 'a mureta entra na sala de reunião')
    assert.deepEqual([caixa.y1, caixa.y2], [0, REUNIAO_PROFUNDIDADE])
  })

  it('são oito cadeiras em volta da mesa: encostadas nela, sem se encostarem entre si', () => {
    const mesa = camadas().find((c) => c.chave === 'mesa-reuniao').caixa
    const cadeiras = camadas().filter((c) => c.chave.startsWith('cadeira-reuniao-'))
    assert.equal(cadeiras.length, 8)
    assert.equal(CADEIRAS_DA_REUNIAO.length, 8)
    for (const { chave, caixa: c } of cadeiras) {
      const noEixoX = c.y1 >= mesa.y1 && c.y2 <= mesa.y2
      const noEixoY = c.x1 >= mesa.x1 && c.x2 <= mesa.x2
      const lados = [[c.x2 === mesa.x1, noEixoX], [c.x1 === mesa.x2, noEixoX], [c.y2 === mesa.y1, noEixoY], [c.y1 === mesa.y2, noEixoY]]
        .filter(([colada]) => colada)
      assert.equal(lados.length, 1, `${chave} não está encostada em exatamente um lado da mesa`)
      assert.ok(lados[0][1], `${chave} encosta na mesa, mas para fora do lado dela`)
    }
    for (const [i, a] of cadeiras.entries()) {
      for (const b of cadeiras.slice(i + 1)) {
        const encosta = a.caixa.x1 < b.caixa.x2 && b.caixa.x1 < a.caixa.x2 && a.caixa.y1 < b.caixa.y2 && b.caixa.y1 < a.caixa.y2
        assert.ok(!encosta, `${a.chave} e ${b.chave} estão uma dentro da outra`)
      }
    }
  })

  it('as camadas saem na ordem do pintor: nenhuma peça da frente é desenhada antes de uma de trás', () => {
    for (const modo of ['junto', 'separado']) {
      const lista = camadas(modo)
      for (const [i, a] of lista.entries()) {
        for (const b of lista.slice(i + 1)) {
          assert.notEqual(relacao(a.caixa, b.caixa), 1, `${modo}: ${a.chave} fica na frente de ${b.chave} mas é desenhada antes`)
        }
      }
    }
  })

  it('no palco junto, a sala inteira é desenhada depois do lazer e do escritório', () => {
    const comecoDaFrente = inicioDoLazer(FILEIRAS)
    const daFrente = (pecas, dx) => pecas.map((p) => ({ ...p, caixa: deslocarCaixa(p.caixa, dx, comecoDaFrente) }))
    const pecas = [].concat(
      Array.from({ length: 8 }, (_, i) => montarMesa(O, i, null).pecas).flat(),
      divisoria(O, FILEIRAS),
      daFrente(montarLazer(O, new Map()).camadas, 0),
      daFrente(camadas(), REUNIAO_X),
    ).map((p) => ({ ...p, tela: caixaNaTela(O, p.caixa) }))
    const divide = (a, b) => a.tela.x1 < b.tela.x2 && b.tela.x1 < a.tela.x2 && a.tela.y1 < b.tela.y2 && b.tela.y1 < a.tela.y2
    const daReuniao = (p) => p.chave.includes('reuniao') || p.chave === 'flipchart'
    for (const [i, a] of pecas.entries()) {
      for (const b of pecas.slice(i + 1)) {
        if (!daReuniao(a) && !daReuniao(b)) continue
        if (!divide(a, b)) continue
        assert.notEqual(relacao(a.caixa, b.caixa), 1, `${a.chave} fica na frente de ${b.chave} mas é desenhada antes`)
      }
    }
  })
})

describe('a sala de reunião na cena', () => {
  it('o palco dela mede o cômodo inteiro e cabe na faixa da frente da cena junta', () => {
    const sala = medirPalco('reuniao', FILEIRAS)
    assert.ok(sala.largura > 0 && sala.altura > 0)
    const junto = medirPalco('junto', FILEIRAS)
    const chaoDaSala = salaDeReuniao([0, 0], 'junto')
    assert.ok(chaoDaSala.length > 0)
    assert.ok(junto.altura > medirPalco('escritorio', FILEIRAS).altura, 'o palco junto não cresceu com a faixa da frente')
  })

  it('na tela larga as três salas ficam num palco só; na estreita, uma em cima da outra, cada uma com a legenda', () => {
    const agentes = [{ id: 'a', apelido: 'Ana', estado: 'trabalhando' }, { id: 'b', apelido: 'Bia', estado: 'livre' }]
    const larga = planejarCena(agentes, 1400)
    assert.equal(larga.modo, 'junto')
    assert.deepEqual(larga.palcos.map((p) => p.chave), ['junto'])
    const estreita = planejarCena(agentes, 420)
    assert.equal(estreita.modo, 'empilhado')
    assert.deepEqual(estreita.palcos.map((p) => p.chave), ['escritorio', 'lazer', 'reuniao'])
    const [escritorio, lazer, reuniao] = estreita.palcos
    assert.equal(escritorio.legenda, undefined)
    assert.ok(lazer.legenda.y > escritorio.y + escritorio.altura * escritorio.escala - 40)
    assert.ok(reuniao.y > lazer.y, 'a sala de reunião não ficou abaixo do lazer')
    assert.ok(estreita.altura > reuniao.y + reuniao.altura * reuniao.escala - 1, 'a cena não cabe a sala de reunião')
  })

  it('ninguém entra na sala: quem vai da mesa para o lazer só passa pela porta do lazer', () => {
    const comeco = inicioDoLazer(FILEIRAS)
    for (let i = 0; i < 8; i++) {
      for (const v of [0, 3, 7, VAGAS_NO_LAZER + 1]) {
        const c = planejarCaminhada(FILEIRAS, { posto: postoDoAgente(FILEIRAS, i, { estado: 'trabalhando' }) }, postoDoAgente(FILEIRAS, v, { estado: 'livre' }), 0)
        for (const s of c.segmentos) {
          for (const [x, y] of [s.a, s.b]) {
            assert.ok(y <= comeco || x <= LAZER_LARGURA, `mesa ${i} -> vaga ${v}: passa pela sala de reunião em ${x.toFixed(1)}, ${y.toFixed(1)}`)
          }
        }
      }
    }
  })
})

describe('a convocação: caminho, cadeira e pose', () => {
  it('as sete vagas da convocação são cadeiras distintas, e a cabeceira do humano não é vaga nenhuma', () => {
    assert.equal(VAGAS_NA_REUNIAO, CADEIRAS_DA_CONVOCACAO.length)
    assert.equal(new Set(CADEIRAS_DA_CONVOCACAO).size, VAGAS_NA_REUNIAO, 'duas vagas na mesma cadeira')
    assert.ok(!CADEIRAS_DA_CONVOCACAO.includes(CADEIRA_DO_HUMANO), 'a cadeira do humano virou vaga de agente')
    assert.equal(CADEIRAS_DA_CONVOCACAO.length + 1, CADEIRAS_DA_REUNIAO.length)
    for (let i = 0; i < VAGAS_NA_REUNIAO; i++) {
      const v = vagaDaReuniao(i)
      assert.equal(v.vaga, i)
      // Afastada da mesa, olhando para ela, com o tronco entre o encosto e o meio do assento.
      assert.equal(v.direcao, { '-y': '+y', '+y': '-y', '-x': '+x', '+x': '-x' }[v.lado])
      assert.ok(Math.hypot(v.tronco[0] - v.meio[0], v.tronco[1] - v.meio[1]) > 3)
      assert.ok(Math.hypot(v.acesso[0] - v.meio[0], v.acesso[1] - v.meio[1]) > 10, 'o acesso ficou em cima do assento')
    }
    assert.equal(vagaDaReuniao(VAGAS_NA_REUNIAO), null)
    assert.equal(postoPorChave(FILEIRAS, `reuniao:${VAGAS_NA_REUNIAO}`), null)
  })

  it('de toda mesa e de toda vaga do lazer dá para chegar a toda cadeira, pela porta da reunião e sem pisar em móvel', () => {
    const dy = inicioDoLazer(FILEIRAS)
    const moveis = obstaculosDoEscritorio(FILEIRAS)
      .concat(OBSTACULOS_DO_LAZER.map(([x1, y1, x2, y2]) => [x1, y1 + dy, x2, y2 + dy]))
      .concat(OBSTACULOS_DA_REUNIAO.map(([x1, y1, x2, y2]) => [x1 + REUNIAO_X, y1 + dy, x2 + REUNIAO_X, y2 + dy]))
    const cobre = ([x1, y1, x2, y2], [x, y], folga) => x > x1 - folga && x < x2 + folga && y > y1 - folga && y < y2 + folga

    for (let v = 0; v < VAGAS_NA_REUNIAO; v++) {
      const cadeira = postoPorChave(FILEIRAS, `reuniao:${v}`)
      assert.ok(cadeira, `reuniao:${v} não tem posto`)
      const origens = [
        ...Array.from({ length: 8 }, (_, i) => postoDoAgente(FILEIRAS, i, { estado: 'trabalhando' })),
        postoDoAgente(FILEIRAS, 0, { estado: 'livre' }),
        postoDoAgente(FILEIRAS, 7, { estado: 'livre' }),
        postoDoAgente(FILEIRAS, VAGAS_NO_LAZER + 1, { estado: 'livre' }),
      ]
      for (const de of origens) {
        for (const [nome, ida] of [['ida', [de, cadeira]], ['volta', [cadeira, de]]]) {
          const c = planejarCaminhada(FILEIRAS, { posto: ida[0] }, ida[1], 0)
          const onde = `${de.chave} <-> reuniao:${v} (${nome})`
          const meio = c.segmentos.filter((s) => s.perna === 'meio')
          assert.ok(meio.length > 0, `${onde}: caminho vazio`)
          // A mureta da frente só é atravessada pelos dois vãos de porta (quem vem do lazer passa pelos dois).
          const cruzamentos = meio.filter((s) => (s.a[1] - PROFUNDIDADE) * (s.b[1] - PROFUNDIDADE) <= 0 && s.a[1] !== s.b[1])
          assert.ok(cruzamentos.length > 0, `${onde}: não atravessa a mureta`)
          for (const s of cruzamentos) {
            const x = s.a[0] + ((s.b[0] - s.a[0]) * (PROFUNDIDADE - s.a[1])) / (s.b[1] - s.a[1])
            const naPorta = (porta) => x > porta.x1 + 3 && x < porta.x2 - 3
            assert.ok(naPorta(PORTA) || naPorta(PORTA_REUNIAO), `${onde}: atravessa a mureta fora das portas, em x=${x.toFixed(1)}`)
          }
          // E a última passagem é sempre pela porta da reunião (é para lá que ele está indo, ou de lá que ele vem).
          const ultima = nome === 'ida' ? cruzamentos[cruzamentos.length - 1] : cruzamentos[0]
          const xUltima = ultima.a[0] + ((ultima.b[0] - ultima.a[0]) * (PROFUNDIDADE - ultima.a[1])) / (ultima.b[1] - ultima.a[1])
          assert.ok(xUltima > PORTA_REUNIAO.x1 && xUltima < PORTA_REUNIAO.x2, `${onde}: entrou ou saiu da reunião por outra porta (x=${xUltima.toFixed(1)})`)
          for (const s of meio) {
            for (let d = 0; d <= s.comprimento; d += 2) {
              const t = d / s.comprimento
              const ponto = [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]
              const movel = moveis.find((m) => cobre(m, ponto, 2.5) && !cobre(m, de.acesso, 0) && !cobre(m, cadeira.acesso, 0))
              assert.equal(movel, undefined, `${onde}: passa por cima do móvel ${movel?.map((n) => n.toFixed(1))}`)
            }
          }
          // Só o miolo do caminho é reto: as pontas ligam o traçado ao ponto exato de onde se sai e aonde se chega.
          for (const s of meio.slice(1, -1)) {
            assert.ok(Math.abs(s.a[0] - s.b[0]) < 1e-6 || Math.abs(s.a[1] - s.b[1]) < 1e-6, `${onde}: trecho torto`)
          }
        }
      }
    }
  })

  it('a cadeira se afasta da mesa enquanto alguém entra nela ou sai dela', () => {
    for (let v = 0; v < VAGAS_NA_REUNIAO; v++) {
      const cadeira = postoPorChave(FILEIRAS, `reuniao:${v}`)
      const mesa = postoDoAgente(FILEIRAS, 0, { estado: 'trabalhando' })
      assert.equal(cadeira.vaga, `cadeira-reuniao-${CADEIRAS_DA_CONVOCACAO[v]}`)
      assert.equal(cadeira.sentar, true)
      for (const [de, para] of [[mesa, cadeira], [cadeira, mesa]]) {
        const c = planejarCaminhada(FILEIRAS, { posto: de }, para, 0)
        const pernas = c.segmentos.filter((s) => s.vaga === cadeira.vaga)
        assert.ok(pernas.length > 0, `reuniao:${v}: a cadeira não é afastada em nenhum trecho`)
        assert.ok(pernas.every((s) => s.perna === (de === cadeira ? 'saida' : 'entrada')))
      }
      // Quem está sentado não é obstáculo no chão: a cadeira já é.
      assert.equal(cadeira.pegada, null)
      // O deslize da animação vai de onde a pessoa estava em pé até o lugar dela sentada.
      const [dx, dy] = cadeira.desliza
      assert.ok(Math.hypot(dx, dy) > 10 && Math.hypot(dx, dy) < 25, `reuniao:${v}: deslize de ${Math.hypot(dx, dy).toFixed(1)}`)
    }
  })

  it('o boneco sentado monta nas quatro direções sem um bloco atravessar o outro nem sair da ordem do pintor', () => {
    const base = aparenciaDoAgente({ id: 'teste' })
    const aparencias = [0, 1, 2].flatMap((penteado) => [false, true].map((oculos) => ({ ...base, penteado, oculos })))
    const cruzam = (a, b) => Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1) > 0.01
      && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > 0.01
      && Math.min(a.z2, b.z2) - Math.max(a.z1, b.z1) > 0.01
    const atras = (a, b) => a.x2 <= b.x1 + 0.01 || a.y2 <= b.y1 + 0.01 || a.z2 <= b.z1 + 0.01
    const naTela = (c) => {
      const xs = []
      const ys = []
      for (const x of [c.x1, c.x2]) for (const y of [c.y1, c.y2]) for (const z of [c.z1, c.z2]) {
        xs.push((x - y) * 0.866)
        ys.push((x + y) * 0.5 - z)
      }
      return { x1: Math.min(...xs), x2: Math.max(...xs), y1: Math.min(...ys), y2: Math.max(...ys) }
    }
    const seCobrem = (a, b) => {
      const [p, q] = [naTela(a), naTela(b)]
      return Math.min(p.x2, q.x2) - Math.max(p.x1, q.x1) > 0.01 && Math.min(p.y2, q.y2) - Math.max(p.y1, q.y1) > 0.01
    }
    for (const a of aparencias) {
      for (const direcao of ['+y', '-y', '+x', '-x']) {
        const nome = `${direcao} penteado ${a.penteado}${a.oculos ? ' com óculos' : ''}`
        const caixas = caixasDoBonecoSentado(0, 0, a, direcao, 9.4)
        for (let i = 0; i < caixas.length; i++) {
          for (let j = i + 1; j < caixas.length; j++) {
            assert.ok(!cruzam(caixas[i], caixas[j]), `${nome}: blocos ${i} e ${j} se cruzam`)
            if (!seCobrem(caixas[i], caixas[j])) continue
            assert.ok(!(atras(caixas[j], caixas[i]) && !atras(caixas[i], caixas[j])), `${nome}: bloco ${j} está atrás do ${i} mas vem depois`)
          }
        }
        const poligonos = bonecoSentadoEm([100, 100], 10, 20, a, direcao, 9.4)
        assert.ok(poligonos.length > 30, nome)
        for (const p of poligonos) assert.match(p.pontos, /^(-?\d+(\.\d)?,-?\d+(\.\d)? ){3}-?\d+(\.\d)?,-?\d+(\.\d)?$/, nome)
        // Sentado é mais baixo que em pé, mas a cabeça fica acima do encosto da cadeira (22,4 do chão).
        const caixa = caixaDoBonecoSentado(0, 0, a, direcao, 9.4)
        assert.ok(caixa.z2 > 30 && caixa.z2 < 40, `${nome}: altura estranha ${caixa.z2}`)
      }
    }
    // O rosto só aparece de frente para quem olha, como no boneco que anda.
    const comOculos = { ...base, oculos: true }
    const lentes = (direcao) => bonecoSentadoEm([0, 0], 0, 0, comOculos, direcao, 9.4).filter((p) => p.cor === comOculos.lente).length
    assert.deepEqual(['+y', '+x', '-y', '-x'].map(lentes), [2, 2, 0, 0])
  })

  it('com gente na mesa, cada cadeira vira duas peças com a pessoa no meio, na ordem do pintor', () => {
    const ocupantes = new Map(CADEIRAS_DA_CONVOCACAO.map((cadeira, i) => [cadeira, { agente: { id: `a${i}`, cor: '#60a5fa' } }]))
    for (const modo of ['junto', 'separado']) {
      const lista = montarReuniao(O, modo, ocupantes).camadas
      const pessoas = lista.filter((c) => c.pessoa)
      assert.equal(pessoas.length, VAGAS_NA_REUNIAO)
      // A cadeira vazia do humano continua inteira numa peça só.
      assert.ok(lista.some((c) => c.chave === `cadeira-reuniao-${CADEIRA_DO_HUMANO}`))
      for (const cadeira of CADEIRAS_DA_CONVOCACAO) {
        const base = lista.findIndex((c) => c.chave === `cadeira-reuniao-${cadeira}-base`)
        const costas = lista.findIndex((c) => c.chave === `cadeira-reuniao-${cadeira}-costas`)
        const pessoa = lista.findIndex((c) => c.chave?.endsWith(`-reuniao-${cadeira}`))
        assert.ok(base >= 0 && costas >= 0 && pessoa >= 0, `cadeira ${cadeira} sem as três peças`)
        assert.ok(pessoa > base, `${modo}: a pessoa da cadeira ${cadeira} foi desenhada antes do assento`)
        assert.ok(costas < base || costas > pessoa, `${modo}: o encosto da cadeira ${cadeira} ficou entre o assento e a pessoa`)
      }
      for (const [i, a] of lista.entries()) {
        for (const b of lista.slice(i + 1)) {
          assert.notEqual(relacao(a.caixa, b.caixa), 1, `${modo}: ${a.chave} fica na frente de ${b.chave} mas é desenhada antes`)
        }
      }
      for (const { chave, caixa: c } of lista.filter((peca) => peca.chave !== 'mureta-reuniao')) {
        assert.ok(c.x1 >= 0 && c.x2 <= REUNIAO_LARGURA, `${modo}: ${chave} sai da sala em x: ${c.x1} a ${c.x2}`)
        assert.ok(c.y1 >= 0 && c.y2 <= REUNIAO_PROFUNDIDADE, `${modo}: ${chave} sai da sala em y: ${c.y1} a ${c.y2}`)
      }
    }
  })

  it('com sete sentados, os crachás cabem sem colidir e a legenda conta quem está na reunião', () => {
    const agentes = CADEIRAS_DA_CONVOCACAO.map((_, i) => ({
      id: `agente-${i}`,
      apelido: ['Ana', 'Bruno', 'Carla', 'Davi', 'Elis', 'Fabio', 'Gabi'][i],
      estado: 'livre',
      reuniao: { vagaId: `reuniao:${i}` },
    }))
    for (const largura of [1400, 420]) {
      const cena = planejarCena(agentes, largura)
      assert.equal(cena.colisoes, 0, `largura ${largura}: ${cena.colisoes} crachás colidindo`)
      assert.ok(cena.agentes.every((g) => g.zona === 'reuniao'), `largura ${largura}: alguém não foi para a reunião`)
      for (const g of cena.agentes) {
        assert.equal(g.atividade, 'reuniao')
        assert.ok(g.rotulo.cracha.x >= 0 && g.rotulo.cracha.y >= 0, `${g.agente.apelido}: crachá fora da cena`)
      }
      assert.equal(new Set(cena.agentes.map((g) => g.lugar.vaga)).size, VAGAS_NA_REUNIAO)
    }
  })

  it('a convocação manda mais que a vida e que a posição na lista', () => {
    const convocado = { id: 'a', apelido: 'Ana', estado: 'trabalhando', vida: { vagaId: 'lazer:3' }, reuniao: { vagaId: 'reuniao:4' } }
    assert.equal(zonaDoAgente(convocado), 'reuniao')
    assert.equal(vagaDaConvocacao(convocado), 4)
    assert.equal(chaveDoLugar(convocado), 'reuniao:4')
    assert.deepEqual(lugarDoAgente(convocado, 0, FILEIRAS), { zona: 'reuniao', mesa: null, pose: null, vaga: 4 })
    assert.equal(postoDoAgente(FILEIRAS, 0, convocado, chaveDoLugar(convocado)).chave, 'reuniao:4')
    // Cadeira que esta cena não tem cai na regra de sempre, sem quebrar.
    const perdido = { ...convocado, reuniao: { vagaId: `reuniao:${VAGAS_NA_REUNIAO}` } }
    assert.equal(vagaDaConvocacao(perdido), null)
    assert.equal(chaveDoLugar(perdido), 'lazer:3')
    assert.equal(zonaDoAgente({ id: 'b', estado: 'livre' }), 'lazer')
  })
})
