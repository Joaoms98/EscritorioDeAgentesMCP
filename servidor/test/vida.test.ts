import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { abrirBanco } from '../src/banco.ts'
import type { Banco } from '../src/banco.ts'
import { criarVida } from '../src/vida.ts'
import type {
  Agente,
  Config,
  Decisao,
  Deliberador,
  EstadoVida,
  EventoTempoReal,
  Execucao,
  Fala,
  Rodada,
  UsoConta,
} from '../src/tipos.ts'

const AGENTES: Agente[] = ['ana', 'bruno', 'carla', 'davi'].map((id) => ({
  id,
  nome: id,
  apelido: id[0]!.toUpperCase() + id.slice(1),
  descricao: `O agente ${id}.`,
  modelo: null,
  cor: '#60a5fa',
  ferramentas: null,
  memoria: null,
  arquivo: null,
  generalista: false,
  origem: null,
}))

function criarConfig(ajustes: Partial<Config> = {}): Config {
  return {
    porta: 0,
    host: '127.0.0.1',
    dirDados: '/tmp/vida-teste',
    dirProjetos: '/tmp/vida-teste/projetos',
    dirAgentes: '/tmp/vida-teste/agentes',
    dirAgentesProjeto: '/tmp/vida-teste/agentes-projeto',
    dirWeb: '/tmp/vida-teste/web',
    maxSimultaneas: 4,
    conectoresClaudeAi: false,
    usarApiKey: false,
    simulado: true,
    modeloGeneralista: null,
    token: 'chave-de-teste-vida-0123456789',
    versao: '0.1.0',
    dirVida: '/tmp/vida-teste/vida',
    modeloVida: 'haiku',
    intervaloVidaMs: 25_000,
    maxNoLote: 4,
    tetoCustoUsdDoDia: 1,
    tetoHorasVida: 4,
    vidaNoBoot: null,
    ...ajustes,
  }
}

// Um deliberador de mentira: a gente diz exatamente o que ele vai querer, e ele conta quantas vezes foi chamado.
function criarDeliberadorFalso(nome: Deliberador['nome'] = 'barato') {
  const chamadas: Rodada[] = []
  let proximas: Decisao[] = []
  let erro: string | null = null
  return {
    chamadas,
    querer(decisoes: Decisao[]) {
      proximas = decisoes
    },
    falhar(mensagem: string | null) {
      erro = mensagem
    },
    deliberador: {
      nome,
      async decidir(rodada: Rodada) {
        chamadas.push(rodada)
        const decisoes = proximas.filter((decisao) => rodada.situacao.lote.some((item) => item.agenteId === decisao.agenteId))
        proximas = []
        return { decisoes, custoUsd: 0.0002, tokensEntrada: 100, tokensSaida: 20, erro }
      },
      encerrar() {},
    } satisfies Deliberador,
  }
}

type Ambiente = ReturnType<typeof montar>

function montar(ajustes: { config?: Partial<Config>; comOficina?: boolean } = {}) {
  const banco = abrirBanco(':memory:')
  const falso = criarDeliberadorFalso()
  const eventos: EventoTempoReal[] = []
  const falas: Fala[] = []
  const comHumano = new Set<string>()
  const naReuniao = new Set<string>()
  const oficinas: Array<{ agenteId: string; execucao: Execucao; encerrada: boolean }> = []
  let relogio = Date.parse('2026-10-31T12:00:00.000Z')
  let sorteado = 0.5

  const vida = criarVida({
    config: criarConfig(ajustes.config),
    banco,
    deliberador: falso.deliberador,
    agentes: () => AGENTES,
    personalidadeDe: (agente) => ({
      agenteId: agente.id,
      nome: agente.apelido,
      temperamento: 'tranquilo',
      tracos: { energia: 0.5, sociabilidade: 0.5, curiosidade: 0.5, foco: 0.5 },
      favoritos: [],
      evita: [],
      voz: 'Fala pouco.',
      arquivo: null,
      resumo: `${agente.apelido}: tranquilo.`,
    }),
    ocupadoComOHumano: (agenteId) => comHumano.has(agenteId),
    naReuniao: (agenteId) => naReuniao.has(agenteId),
    algumaOrdemDoHumano: () => comHumano.size > 0,
    emitir: (evento) => {
      eventos.push(evento)
      if (evento.tipo === 'fala') falas.push(evento.dados)
    },
    aoMudarAgente: () => {},
    criarExecucaoDaVida: ajustes.comOficina
      ? (contexto) => {
          const registro = { agenteId: contexto.agente.id, execucao: null as unknown as Execucao, encerrada: false }
          registro.execucao = {
            iniciar() {},
            async parar() {},
            encerrar() {
              registro.encerrada = true
            },
          }
          oficinas.push(registro)
          return registro.execucao
        }
      : undefined,
    agora: () => relogio,
    sorteio: () => sorteado,
  })

  return {
    banco,
    vida,
    falso,
    eventos,
    falas,
    comHumano,
    naReuniao,
    oficinas,
    avancar(ms: number) {
      relogio += ms
    },
    bater(vezes = 1) {
      for (let i = 0; i < vezes; i++) vida.bater()
    },
    // O tique chama o deliberador sem esperar (ele é assíncrono): isto deixa a promessa terminar.
    async bateESpera(vezes = 1) {
      for (let i = 0; i < vezes; i++) {
        vida.bater()
        await new Promise((resolve) => setImmediate(resolve))
        await new Promise((resolve) => setImmediate(resolve))
      }
    },
    sortear(valor: number) {
      sorteado = valor
    },
    linha(agenteId: string) {
      return banco.obterVidaAgente(agenteId)
    },
    estadoDe(agenteId: string): EstadoVida | null {
      return banco.obterVidaAgente(agenteId)?.estado ?? null
    },
    fechar() {
      void vida.encerrar()
      banco.fechar()
    },
  }
}

const usar = (agenteId: string, objetoId: string, vagaId: string | null = null, extra: Partial<Decisao> = {}): Decisao => ({
  agenteId,
  verbo: 'usar',
  objetoId,
  vagaId,
  comId: null,
  assunto: null,
  duracaoMs: 120_000,
  motivo: `Quero ${objetoId}`,
  falas: [],
  tarefa: null,
  ...extra,
})

describe('ligar e desligar a vida', () => {
  let ambiente: Ambiente
  beforeEach(() => {
    ambiente?.fechar()
    ambiente = montar()
  })

  it('ligada, todo agente sem ordem do humano entra no escritório como ocioso', () => {
    const estado = ambiente.vida.ligar(true)
    assert.equal(estado.ligada, true)
    assert.equal(estado.vivos, AGENTES.length)
    for (const agente of AGENTES) assert.equal(ambiente.estadoDe(agente.id), 'ocioso')
  })

  it('quem está com ordem do humano não entra na vida', () => {
    ambiente.comHumano.add('bruno')
    ambiente.vida.ligar(true)
    assert.equal(ambiente.estadoDe('bruno'), null)
    assert.equal(ambiente.vida.estado().vivos, AGENTES.length - 1)
  })

  it('desligada, não sobra linha, vaga presa, fala por dizer nem vontade em aberto', async () => {
    ambiente.vida.ligar(true)
    ambiente.falso.querer([usar('ana', 'fliperama'), usar('bruno', 'copa', null, { verbo: 'conversar', comId: 'carla', falas: [{ agenteId: 'ana', texto: 'oi', emMs: 500 }] })])
    await ambiente.bateESpera()
    ambiente.vida.ligar(false)
    assert.equal(ambiente.vida.estado().ligada, false)
    assert.equal(ambiente.banco.listarVidaAgentes().length, 0)
    assert.equal(ambiente.banco.vagasOcupadas().size, 0)
    assert.equal(ambiente.banco.falasADizer('2030-01-01T00:00:00.000Z').length, 0)
    assert.equal(ambiente.banco.listarVontades().filter((vontade) => !vontade.terminadaEm).length, 0)
  })

  it('desligar duas vezes não quebra nada', () => {
    ambiente.vida.ligar(true)
    ambiente.vida.ligar(false)
    assert.equal(ambiente.vida.ligar(false).ligada, false)
  })
})

describe('o caminho de uma vontade', () => {
  let ambiente: Ambiente
  beforeEach(() => {
    ambiente?.fechar()
    ambiente = montar()
    ambiente.vida.ligar(true)
    ambiente.avancar(10_000)
  })

  it('ocioso vira escolhendo, depois indo, depois ocupado, e volta a ocioso só pelo relógio', async () => {
    ambiente.falso.querer([usar('ana', 'fliperama', 'lazer:7')])
    await ambiente.bateESpera()
    assert.equal(ambiente.estadoDe('ana'), 'indo')
    assert.equal(ambiente.linha('ana')?.vagaId, 'lazer:7')
    const indo = ambiente.vida.doAgente('ana')
    assert.equal(indo?.verbo, 'usar')
    assert.equal(indo?.rotulo, 'indo para fliperama')

    ambiente.avancar(10_000)
    ambiente.bater()
    assert.equal(ambiente.estadoDe('ana'), 'ocupado')
    // Chegando, o texto deixa de ser o caminho e passa a ser o que ele faz ali: isso sai do catálogo.
    assert.equal(ambiente.vida.doAgente('ana')?.rotulo, 'jogando fliperama')

    ambiente.avancar(10 * 60_000)
    ambiente.bater()
    assert.equal(ambiente.estadoDe('ana'), 'ocioso')
    assert.equal(ambiente.banco.vagasOcupadas().size, 0)
  })

  it('a vaga que a vida reserva é sempre uma do catálogo, e nunca duas pessoas na mesma', async () => {
    ambiente.falso.querer([usar('ana', 'fliperama', 'lazer:7'), usar('bruno', 'fliperama', 'lazer:7')])
    await ambiente.bateESpera()
    const ocupadas = ambiente.banco.vagasOcupadas()
    assert.equal(ocupadas.get('lazer:7') !== undefined, true)
    const lugares = [ambiente.linha('ana')?.vagaId, ambiente.linha('bruno')?.vagaId].filter((vaga) => vaga !== null)
    assert.equal(new Set(lugares).size, lugares.length, 'dois agentes na mesma vaga')
  })

  it('quem perde a vaga desce para outra do mesmo objeto, sem chamar o modelo de novo', async () => {
    ambiente.falso.querer([usar('ana', 'tv', 'lazer:0'), usar('bruno', 'tv', 'lazer:0')])
    await ambiente.bateESpera()
    assert.equal(ambiente.falso.chamadas.length, 1)
    const vagas = [ambiente.linha('ana')?.vagaId, ambiente.linha('bruno')?.vagaId]
    assert.ok(vagas.includes('lazer:0'))
    assert.equal(new Set(vagas).size, 2, 'o perdedor devia ter achado outro lugar na TV')
  })

  it('vontade impossível é recusada, fica registrada e o agente espera um pouco antes de tentar de novo', async () => {
    ambiente.falso.querer([usar('ana', 'elefante')])
    await ambiente.bateESpera()
    assert.equal(ambiente.estadoDe('ana'), 'ocioso')
    const vontade = ambiente.banco.listarVontades({ agenteId: 'ana', limite: 1 })[0]
    assert.equal(vontade?.aceita, false)
    assert.ok(vontade?.recusa)
    assert.ok(Date.parse(ambiente.linha('ana')!.decidirDepoisDe!) > Date.parse(ambiente.linha('ana')!.desde))
  })

  it('o deliberador falhando não deixa ninguém preso em escolhendo', async () => {
    ambiente.falso.falhar('sem resposta')
    await ambiente.bateESpera()
    for (const agente of AGENTES) assert.notEqual(ambiente.estadoDe(agente.id), 'escolhendo')
    ambiente.falso.falhar(null)
  })
})

describe('conversa', () => {
  let ambiente: Ambiente
  beforeEach(() => {
    ambiente?.fechar()
    ambiente = montar()
    ambiente.vida.ligar(true)
    ambiente.avancar(10_000)
  })

  it('os dois vão conversar e as falas saem na hora marcada, uma de cada vez', async () => {
    ambiente.falso.querer([
      usar('ana', 'copa', null, {
        verbo: 'conversar',
        comId: 'bruno',
        assunto: 'o café',
        falas: [
          { agenteId: 'ana', texto: 'esse café é novo?', emMs: 500 },
          { agenteId: 'bruno', texto: 'é, trouxeram hoje', emMs: 4000 },
        ],
      }),
    ])
    await ambiente.bateESpera()
    assert.equal(ambiente.linha('ana')?.comId, 'bruno')
    assert.equal(ambiente.linha('bruno')?.comId, 'ana')
    assert.equal(ambiente.falas.length, 0, 'nenhuma fala antes da hora')

    ambiente.avancar(15_000)
    ambiente.bater()
    assert.equal(ambiente.estadoDe('ana'), 'conversando')
    assert.deepEqual(ambiente.falas.map((fala) => fala.agenteId), ['ana', 'bruno'])
    assert.equal(ambiente.falas[0]?.texto, 'esse café é novo?')
  })

  it('conversa com quem já saiu de ocioso é recusada e ninguém fica preso', async () => {
    ambiente.falso.querer([usar('ana', 'fliperama', 'lazer:7')])
    await ambiente.bateESpera()
    ambiente.avancar(60_000)
    ambiente.falso.querer([usar('bruno', 'copa', null, { verbo: 'conversar', comId: 'ana' })])
    await ambiente.bateESpera()
    assert.notEqual(ambiente.estadoDe('bruno'), 'conversando')
    assert.notEqual(ambiente.estadoDe('bruno'), 'escolhendo')
  })
})

describe('o humano manda', () => {
  let ambiente: Ambiente
  beforeEach(() => {
    ambiente?.fechar()
    ambiente = montar({ comOficina: true })
    ambiente.vida.ligar(true)
    ambiente.avancar(10_000)
  })

  it('ordem do humano no meio do caminho larga a vaga e tira o agente da vida', async () => {
    ambiente.falso.querer([usar('ana', 'fliperama', 'lazer:7')])
    await ambiente.bateESpera()
    assert.equal(ambiente.estadoDe('ana'), 'indo')

    ambiente.comHumano.add('ana')
    ambiente.vida.cederAoHumano('ana')
    assert.equal(ambiente.estadoDe('ana'), 'cedendo')
    assert.equal(ambiente.banco.vagasOcupadas().has('lazer:7'), false)
    const vontade = ambiente.banco.listarVontades({ agenteId: 'ana', limite: 1 })[0]
    assert.equal(vontade?.recusa, 'ordem_do_humano')

    ambiente.avancar(2000)
    ambiente.bater()
    assert.equal(ambiente.estadoDe('ana'), 'fora')
  })

  it('ordem no meio de uma conversa solta o outro também e apaga as falas que faltavam', async () => {
    ambiente.falso.querer([
      usar('ana', 'copa', null, {
        verbo: 'conversar',
        comId: 'bruno',
        falas: [{ agenteId: 'ana', texto: 'oi', emMs: 60_000 }],
      }),
    ])
    await ambiente.bateESpera()
    ambiente.vida.cederAoHumano('ana')
    assert.equal(ambiente.estadoDe('bruno'), 'ocioso')
    ambiente.avancar(120_000)
    ambiente.bater()
    assert.equal(ambiente.falas.length, 0, 'a fala da conversa abortada não podia sair')
  })

  it('convocado para a reunião, o agente sai da vida como sairia por uma ordem, e volta ao ser dispensado', async () => {
    ambiente.falso.querer([usar('ana', 'fliperama', 'lazer:7')])
    await ambiente.bateESpera()
    assert.equal(ambiente.estadoDe('ana'), 'indo')

    // É o escritório que chama cederAoHumano ao sentar o agente na mesa; daí em diante ele não é mais recrutado.
    ambiente.naReuniao.add('ana')
    ambiente.vida.cederAoHumano('ana')
    assert.equal(ambiente.banco.vagasOcupadas().has('lazer:7'), false)
    ambiente.avancar(2000)
    ambiente.bater()
    assert.equal(ambiente.estadoDe('ana'), 'fora')
    ambiente.avancar(60_000)
    await ambiente.bateESpera()
    assert.equal(ambiente.estadoDe('ana'), 'fora', 'quem está na reunião não pode voltar a decidir sozinho')

    ambiente.naReuniao.delete('ana')
    ambiente.vida.ordemAcabou('ana')
    ambiente.bater()
    assert.equal(ambiente.estadoDe('ana'), 'ocioso')
  })

  it('quando o agente termina a ordem do humano, ele volta para a vida', async () => {
    ambiente.comHumano.add('ana')
    ambiente.bater()
    assert.ok(['cedendo', 'fora'].includes(ambiente.estadoDe('ana') ?? ''))
    ambiente.avancar(2000)
    ambiente.bater()
    ambiente.comHumano.delete('ana')
    ambiente.vida.ordemAcabou('ana')
    ambiente.bater()
    assert.equal(ambiente.estadoDe('ana'), 'ocioso')
  })
})

describe('a oficina', () => {
  let ambiente: Ambiente
  beforeEach(() => {
    ambiente?.fechar()
    ambiente = montar({ comOficina: true })
    ambiente.vida.ligar(true)
    ambiente.avancar(10_000)
  })

  it('programar sobe uma sessão só quando o agente chega na mesa, e a pasta é a dele', async () => {
    ambiente.falso.querer([usar('ana', 'mesa', 'mesa:0:sentado', { verbo: 'programar', tarefa: 'fazer um jogo da velha', duracaoMs: 300_000 })])
    await ambiente.bateESpera()
    assert.equal(ambiente.oficinas.length, 0, 'ainda está andando até a mesa')
    ambiente.avancar(15_000)
    ambiente.bater()
    assert.equal(ambiente.estadoDe('ana'), 'oficinando')
    assert.equal(ambiente.oficinas.length, 1)
    assert.equal(ambiente.vida.doAgente('ana')?.pasta?.endsWith('/ana'), true)
  })

  it('com ordem do humano rodando, ninguém programa por vontade própria', async () => {
    ambiente.comHumano.add('davi')
    ambiente.falso.querer([usar('ana', 'mesa', 'mesa:0:sentado', { verbo: 'programar', tarefa: 'algo' })])
    await ambiente.bateESpera()
    ambiente.avancar(15_000)
    ambiente.bater()
    assert.notEqual(ambiente.estadoDe('ana'), 'oficinando')
    assert.equal(ambiente.oficinas.length, 0)
  })

  it('desligar a vida encerra a sessão da oficina', async () => {
    ambiente.falso.querer([usar('ana', 'mesa', 'mesa:0:sentado', { verbo: 'programar', tarefa: 'algo' })])
    await ambiente.bateESpera()
    ambiente.avancar(15_000)
    ambiente.bater()
    assert.equal(ambiente.oficinas.length, 1)
    ambiente.vida.ligar(false)
    assert.equal(ambiente.oficinas[0]?.encerrada, true)
  })
})

describe('restart e tempo parado', () => {
  it('reconciliar não deixa ninguém preso em escolhendo nem oficinando', () => {
    const ambiente = montar()
    ambiente.vida.ligar(true)
    for (const [agenteId, estado] of [['ana', 'escolhendo'], ['bruno', 'oficinando'], ['carla', 'cedendo'], ['davi', 'indo']] as const) {
      ambiente.banco.atualizarVidaAgente(agenteId, { estado })
    }
    ambiente.vida.reconciliar()
    for (const agenteId of ['ana', 'bruno']) assert.equal(ambiente.estadoDe(agenteId), 'ocioso')
    assert.ok(['fora', 'ocioso'].includes(ambiente.estadoDe('carla') ?? ''))
    ambiente.fechar()
  })

  it('o escritório que ficou três horas parado volta todo mundo para ocioso, sem correr atrás do tempo', async () => {
    const ambiente = montar()
    ambiente.vida.ligar(true)
    ambiente.avancar(10_000)
    ambiente.falso.querer([usar('ana', 'fliperama', 'lazer:7'), usar('bruno', 'copa')])
    await ambiente.bateESpera()
    ambiente.avancar(3 * 3_600_000)
    ambiente.bater()
    for (const agente of AGENTES) {
      assert.ok(['ocioso', 'escolhendo'].includes(ambiente.estadoDe(agente.id) ?? ''), `${agente.id} ficou em ${ambiente.estadoDe(agente.id)}`)
    }
    assert.equal(ambiente.banco.vagasOcupadas().size, 0)
    ambiente.fechar()
  })
})

describe('tetos e o tamanho do gasto', () => {
  it('na banda economia o lote cai para um e ninguém programa', async () => {
    const ambiente = montar({ comOficina: true })
    ambiente.vida.ligar(true)
    ambiente.avancar(10_000)
    ambiente.vida.aoUsoConta({ status: 'allowed_warning', cincoHoras: 0.85, seteDias: 0.4, reiniciaEm: null, atualizadoEm: null } satisfies UsoConta)
    assert.equal(ambiente.vida.estado().banda, 'economia')
    await ambiente.bateESpera()
    const rodada = ambiente.falso.chamadas.at(-1)
    assert.equal(rodada?.situacao.lote.length, 1)
    assert.ok(!rodada?.situacao.lote[0]?.verbosPermitidos.includes('programar'))
    ambiente.fechar()
  })

  it('a conta no limite suspende o pensamento, mas não derruba a vida', async () => {
    const ambiente = montar()
    ambiente.vida.ligar(true)
    ambiente.vida.aoUsoConta({ status: 'rejected', cincoHoras: 0.99, seteDias: 0.5, reiniciaEm: null, atualizadoEm: null })
    const estado = ambiente.vida.estado()
    assert.equal(estado.banda, 'suspensa')
    assert.equal(estado.ligada, true)
    assert.ok(estado.explicacao)
    ambiente.fechar()
  })

  it('a banda só volta ao normal quando a conta folga de verdade', () => {
    const ambiente = montar()
    ambiente.vida.ligar(true)
    ambiente.vida.aoUsoConta({ status: null, cincoHoras: 0.9, seteDias: 0, reiniciaEm: null, atualizadoEm: null })
    assert.equal(ambiente.vida.estado().banda, 'economia')
    ambiente.vida.aoUsoConta({ status: null, cincoHoras: 0.75, seteDias: 0, reiniciaEm: null, atualizadoEm: null })
    assert.equal(ambiente.vida.estado().banda, 'economia', 'não pode piscar entre as bandas')
    ambiente.vida.aoUsoConta({ status: null, cincoHoras: 0.5, seteDias: 0, reiniciaEm: null, atualizadoEm: null })
    assert.equal(ambiente.vida.estado().banda, 'normal')
    ambiente.fechar()
  })

  it('a vida esquecida ligada se desliga sozinha depois do limite de horas', () => {
    const ambiente = montar({ config: { tetoHorasVida: 2 } })
    ambiente.vida.ligar(true)
    ambiente.avancar(3 * 3_600_000)
    ambiente.bater()
    const estado = ambiente.vida.estado()
    assert.equal(estado.ligada, false)
    assert.equal(estado.motivoPausa, 'teto_horas')
    ambiente.fechar()
  })

  it('o gasto do dia aparece e o teto pausa as rodadas', async () => {
    const ambiente = montar({ config: { tetoCustoUsdDoDia: 0.0001 } })
    ambiente.vida.ligar(true)
    ambiente.avancar(10_000)
    ambiente.falso.querer([usar('ana', 'copa')])
    await ambiente.bateESpera()
    const estado = ambiente.vida.estado()
    assert.ok(estado.custoUsdDoDia > 0)
    assert.equal(estado.motivoPausa, 'teto_custo')
    ambiente.fechar()
  })
})

describe('forçar uma vontade (sem gastar token)', () => {
  it('põe o agente a caminho do lugar pedido', () => {
    const ambiente = montar()
    ambiente.vida.ligar(true)
    const vontade = ambiente.vida.forcar({ agenteId: 'carla', verbo: 'usar', objetoId: 'fliperama' })
    assert.equal(vontade.verbo, 'usar')
    assert.equal(ambiente.estadoDe('carla'), 'indo')
    assert.equal(ambiente.linha('carla')?.vagaId, 'lazer:7')
    assert.equal(ambiente.falso.chamadas.length, 0, 'forçar não pode chamar o modelo')
    ambiente.fechar()
  })
})
