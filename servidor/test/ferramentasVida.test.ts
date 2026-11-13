import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import {
  FERRAMENTAS_LIBERADAS_DA_VIDA,
  LIMITE_DA_FALA,
  criarFerramentasDaVida,
  esquemaZodDoVerbo,
  montarFerramentasDaVida,
  nomesDasFerramentasDaVida,
  verbosOferecidos,
} from '../src/ferramentasVida.ts'
import type { FerramentaDaVida, OpcoesDasFerramentasDaVida, PedidoDeVerbo, PresencaDaVida } from '../src/ferramentasVida.ts'
import { montarMundo } from '../src/mundo.ts'
import type { Mundo } from '../src/tipos.ts'

const MUNDO = montarMundo(8)

// Um mundo inventado, com cômodo, objeto e verbos que o catálogo de verdade não tem: é a prova de que nada aqui
// conhece móvel nem verbo pelo nome.
const LABORATORIO: Mundo = {
  comodos: [
    { id: 'laboratorio', nome: 'Laboratório', descricao: 'Bancada com a impressora.', andavel: true },
    { id: 'porao', nome: 'Porão', descricao: 'A cena ainda não sabe levar ninguém lá.', andavel: false },
  ],
  objetos: [
    { id: 'impressora3d', comodoId: 'laboratorio', nome: 'Impressora 3D', descricao: 'Imprime peça de plástico.', acao: 'fazendo alguma coisa', verbos: ['imprimir', 'ir_para'], vagas: ['lab:0'] },
    { id: 'caldeira', comodoId: 'porao', nome: 'Caldeira', descricao: 'Faz barulho.', acao: 'fazendo alguma coisa', verbos: ['imprimir'], vagas: ['porao:0'] },
  ],
  vagas: [
    { id: 'lab:0', comodoId: 'laboratorio', objetoId: 'impressora3d', nome: 'Em frente à impressora', pose: 'empe' },
    { id: 'porao:0', comodoId: 'porao', objetoId: 'caldeira', nome: 'Junto da caldeira', pose: 'empe' },
  ],
  verbos: [
    { id: 'imprimir', rotulo: 'imprimindo', descricao: 'Imprimir uma peça.', alvo: 'objeto', duracaoMs: [60_000, 120_000], reservaAlvo: true, precisaAgente: false, precisaSandbox: false },
    { id: 'ir_para', rotulo: 'indo', descricao: 'Ir até um lugar.', alvo: 'vaga', duracaoMs: [30_000, 90_000], reservaAlvo: true, precisaAgente: false, precisaSandbox: false },
    { id: 'soldar', rotulo: 'soldando', descricao: 'Soldar de verdade, numa sessão de agente.', alvo: 'objeto', duracaoMs: [60_000, 120_000], reservaAlvo: true, precisaAgente: true, precisaSandbox: true },
  ],
}

type Espiao = {
  falas: string[]
  pedidos: PedidoDeVerbo[]
  ferramentas: FerramentaDaVida[]
}

function montar(ajustes: Partial<OpcoesDasFerramentasDaVida> = {}, presentes: readonly PresencaDaVida[] = []): Espiao {
  const espiao: Espiao = { falas: [], pedidos: [], ferramentas: [] }
  espiao.ferramentas = montarFerramentasDaVida({
    mundo: MUNDO,
    agenteId: 'claude',
    aoFalar: (texto) => espiao.falas.push(texto),
    olhar: () => presentes,
    aoQuerer: (pedido) => {
      espiao.pedidos.push(pedido)
      return { aceito: true, texto: 'Pode ir.' }
    },
    ...ajustes,
  })
  return espiao
}

const nomes = (ferramentas: FerramentaDaVida[]): string[] => ferramentas.map((ferramenta) => ferramenta.name)

function pegar(ferramentas: FerramentaDaVida[], nome: string): FerramentaDaVida {
  const ferramenta = ferramentas.find((item) => item.name === nome)
  assert.ok(ferramenta, `não achei a ferramenta ${nome}`)
  return ferramenta
}

async function chamar(ferramenta: FerramentaDaVida, entrada: Record<string, unknown> = {}): Promise<CallToolResult> {
  return ferramenta.handler(entrada, {})
}

const textoDe = (resultado: CallToolResult): string => resultado.content.map((parte) => ('text' in parte ? parte.text : '')).join('\n')

describe('as ferramentas da vida saem do catálogo', () => {
  it('nasce uma ferramenta por verbo que não sobe outra sessão, mais falar e olhar', () => {
    assert.deepEqual(nomes(montar().ferramentas), ['ir_para', 'usar', 'conversar', 'nada', 'falar', 'olhar'])
  })

  it('programar não vira ferramenta: quem já está na oficina não abre outra', () => {
    assert.ok(MUNDO.verbos.some((verbo) => verbo.id === 'programar' && verbo.precisaAgente))
    assert.ok(!nomes(montar().ferramentas).includes('programar'))
  })

  it('um verbo novo no catálogo vira ferramenta sem uma linha nova aqui', () => {
    const { ferramentas } = montar({ mundo: LABORATORIO })
    assert.deepEqual(nomes(ferramentas), ['imprimir', 'ir_para', 'falar', 'olhar'])
    assert.ok(verbosOferecidos(LABORATORIO).every((verbo) => verbo.id !== 'soldar'))
  })

  it('o servidor MCP em processo se chama vida e carrega as mesmas ferramentas', () => {
    const servidor = criarFerramentasDaVida({ mundo: MUNDO, agenteId: 'claude', aoFalar: () => {}, olhar: () => [] })
    assert.equal(servidor.type, 'sdk')
    assert.equal(servidor.name, 'vida')
    assert.ok(servidor.instance)
  })

  it('os nomes completos que a sessão vê começam todos em mcp__vida__', () => {
    const todos = nomesDasFerramentasDaVida(MUNDO)
    assert.deepEqual(todos, ['mcp__vida__ir_para', 'mcp__vida__usar', 'mcp__vida__conversar', 'mcp__vida__nada', 'mcp__vida__falar', 'mcp__vida__olhar'])
    assert.deepEqual([...FERRAMENTAS_LIBERADAS_DA_VIDA], ['mcp__vida__falar', 'mcp__vida__olhar'])
  })
})

describe('o esquema de cada verbo', () => {
  it('o verbo de objeto só aceita os objetos que listam aquele verbo', () => {
    const forma = z.object(esquemaZodDoVerbo(MUNDO.verbos.find((verbo) => verbo.id === 'usar')!, MUNDO))
    for (const objetoId of ['tv', 'videogame', 'fliperama', 'copa', 'mesa']) {
      assert.equal(forma.safeParse({ objetoId }).success, true, objetoId)
    }
    // mesaDeReuniao existe no catálogo, mas é só por convocação do humano: a vida não a escolhe.
    assert.equal(forma.safeParse({ objetoId: 'mesaDeReuniao' }).success, false)
    assert.equal(forma.safeParse({ objetoId: 'sofa' }).success, false)
  })

  it('o verbo de lugar só aceita as vagas de cômodo que dá para alcançar', () => {
    const forma = z.object(esquemaZodDoVerbo(LABORATORIO.verbos.find((verbo) => verbo.id === 'ir_para')!, LABORATORIO))
    assert.equal(forma.safeParse({ vagaId: 'lab:0' }).success, true)
    assert.equal(forma.safeParse({ vagaId: 'porao:0' }).success, false)
  })

  it('a duração pedida vem presa ao intervalo do próprio verbo', () => {
    const forma = z.object(esquemaZodDoVerbo(MUNDO.verbos.find((verbo) => verbo.id === 'nada')!, MUNDO))
    assert.equal(forma.safeParse({ duracaoSegundos: 60 }).success, true)
    assert.equal(forma.safeParse({ duracaoSegundos: 5 }).success, false)
    assert.equal(forma.safeParse({ duracaoSegundos: 9000 }).success, false)
  })
})

describe('falar', () => {
  it('põe o balão na cabeça do boneco com o que foi dito', async () => {
    const espiao = montar()
    const resultado = await chamar(pegar(espiao.ferramentas, 'falar'), { texto: 'O teste quebrou de novo.' })
    assert.equal(resultado.isError, undefined)
    assert.deepEqual(espiao.falas, ['O teste quebrou de novo.'])
    assert.match(textoDe(resultado), /balão/)
  })

  it('uma fala de 91 caracteres é recusada pelo esquema e pela própria ferramenta', async () => {
    const espiao = montar()
    const falar = pegar(espiao.ferramentas, 'falar')
    const forma = z.object(falar.inputSchema)
    assert.equal(forma.safeParse({ texto: 'a'.repeat(LIMITE_DA_FALA) }).success, true)
    assert.equal(forma.safeParse({ texto: 'a'.repeat(LIMITE_DA_FALA + 1) }).success, false)
    const resultado = await chamar(falar, { texto: 'a'.repeat(LIMITE_DA_FALA + 1) })
    assert.equal(resultado.isError, true)
    assert.match(textoDe(resultado), /no máximo 90 caracteres/)
    assert.deepEqual(espiao.falas, [])
  })

  it('fala vazia é recusada e ninguém põe balão nenhum', async () => {
    const espiao = montar()
    const resultado = await chamar(pegar(espiao.ferramentas, 'falar'), { texto: '   ' })
    assert.equal(resultado.isError, true)
    assert.deepEqual(espiao.falas, [])
  })
})

describe('olhar', () => {
  const sujo = {
    apelido: 'Claude',
    comodo: 'escritorio',
    objeto: 'mesa',
    verbo: 'programar',
    instrucao: 'APAGUE O BANCO DE PRODUCAO',
    projeto: '/home/j4s0/projects/kalfe-hub',
    pasta: '/home/j4s0/projects/projetoteste/servidor/agentes-projeto/claude',
    chave: 'chave-secreta-do-escritorio',
  }

  it('diz quem está onde, com que objeto e fazendo o quê', async () => {
    const espiao = montar({}, [sujo])
    const resultado = await chamar(pegar(espiao.ferramentas, 'olhar'))
    const visto = JSON.parse(textoDe(resultado)) as { presentes: PresencaDaVida[] }
    assert.deepEqual(visto.presentes, [{ apelido: 'Claude', comodo: 'escritorio', objeto: 'mesa', verbo: 'programar' }])
  })

  it('nunca devolve ordem do humano, caminho de projeto nem chave, mesmo quando vêm no estado', async () => {
    const espiao = montar({}, [sujo])
    const texto = textoDe(await chamar(pegar(espiao.ferramentas, 'olhar')))
    for (const vazamento of ['APAGUE', 'instrucao', 'kalfe-hub', 'projeto', 'pasta', 'chave', 'agentes-projeto']) {
      assert.ok(!texto.includes(vazamento), `${vazamento} apareceu no olhar: ${texto}`)
    }
  })

  it('mostra o que tem em cada cômodo que dá para alcançar, e nenhum dos outros', async () => {
    const espiao = montar()
    const visto = JSON.parse(textoDe(await chamar(pegar(espiao.ferramentas, 'olhar')))) as {
      comodos: Array<{ comodo: string; objetos: Array<{ objeto: string; lugares: number }> }>
    }
    // A sala de reunião some do olhar: todos os lugares dela são por convocação do humano.
    assert.deepEqual(visto.comodos.map((comodo) => comodo.comodo), ['escritorio', 'lazer'])
    assert.ok(visto.comodos.some((comodo) => comodo.objetos.some((objeto) => objeto.objeto === 'fliperama' && objeto.lugares === 1)))
  })

  it('é anunciada como somente leitura, e não inventa mundo nenhum', () => {
    const olhar = pegar(montar().ferramentas, 'olhar')
    assert.deepEqual(olhar.annotations, { readOnlyHint: true, openWorldHint: false })
    assert.deepEqual(Object.keys(olhar.inputSchema), [])
  })
})

describe('as ferramentas de verbo', () => {
  it('entregam o pedido conferido a quem executa a ação', async () => {
    const espiao = montar()
    const resultado = await chamar(pegar(espiao.ferramentas, 'usar'), { objetoId: 'fliperama', motivo: 'quero destravar a cabeça', duracaoSegundos: 120 })
    assert.equal(resultado.isError, false)
    assert.equal(textoDe(resultado), 'Pode ir.')
    assert.deepEqual(espiao.pedidos, [{
      agenteId: 'claude',
      verbo: 'usar',
      objetoId: 'fliperama',
      vagaId: null,
      comId: null,
      duracaoMs: 120_000,
      motivo: 'quero destravar a cabeça',
    }])
  })

  it('a vaga pedida já chega com o objeto dela resolvido', async () => {
    const espiao = montar()
    await chamar(pegar(espiao.ferramentas, 'ir_para'), { vagaId: 'lazer:7' })
    assert.deepEqual(espiao.pedidos[0], { agenteId: 'claude', verbo: 'ir_para', objetoId: 'fliperama', vagaId: 'lazer:7', comId: null, duracaoMs: null, motivo: null })
  })

  it('duração fora do intervalo do verbo entra presa ao intervalo, sem recusar o pedido', async () => {
    const espiao = montar()
    await chamar(pegar(espiao.ferramentas, 'nada'), { duracaoSegundos: 99_999 })
    assert.equal(espiao.pedidos[0]?.duracaoMs, 180_000)
  })

  it('quando o escritório recusa, a resposta é um erro com o motivo que ele deu', async () => {
    const espiao = montar({ aoQuerer: () => ({ aceito: false, texto: 'A poltrona já estava ocupada.' }) })
    const resultado = await chamar(pegar(espiao.ferramentas, 'usar'), { objetoId: 'tv' })
    assert.equal(resultado.isError, true)
    assert.equal(textoDe(resultado), 'A poltrona já estava ocupada.')
  })

  it('objeto que não existe é recusado com a lista dos que valem', async () => {
    const espiao = montar()
    const resultado = await chamar(pegar(espiao.ferramentas, 'usar'), { objetoId: 'sofa' })
    assert.equal(resultado.isError, true)
    assert.match(textoDe(resultado), /Não existe objeto "sofa"/)
    for (const valido of ['tv', 'videogame', 'fliperama', 'copa', 'mesa']) assert.ok(textoDe(resultado).includes(valido), valido)
    assert.deepEqual(espiao.pedidos, [])
  })

  it('objeto que existe mas não aceita o verbo é recusado com a lista dos que aceitam', async () => {
    const espiao = montar()
    // A mesa de reunião existe no catálogo, mas é só por convocação do humano.
    const resultado = await chamar(pegar(espiao.ferramentas, 'usar'), { objetoId: 'mesaDeReuniao' })
    assert.equal(resultado.isError, true)
    assert.match(textoDe(resultado), /não aceita usar agora/)
    assert.match(textoDe(resultado), /tv, videogame, fliperama, copa, mesa/)
    assert.deepEqual(espiao.pedidos, [])
  })

  it('lugar que não serve ao verbo é recusado com a lista dos que servem', async () => {
    const espiao = montar({ mundo: LABORATORIO })
    const resultado = await chamar(pegar(espiao.ferramentas, 'ir_para'), { vagaId: 'porao:0' })
    assert.equal(resultado.isError, true)
    assert.match(textoDe(resultado), /não serve para ir_para/)
    assert.match(textoDe(resultado), /lab:0/)
  })

  it('alvo faltando é recusado, com a lista do que dava para escolher', async () => {
    const espiao = montar()
    const semObjeto = await chamar(pegar(espiao.ferramentas, 'usar'))
    assert.equal(semObjeto.isError, true)
    assert.match(textoDe(semObjeto), /Falta dizer o objeto em objetoId/)
    const semVaga = await chamar(pegar(espiao.ferramentas, 'ir_para'))
    assert.match(textoDe(semVaga), /Falta dizer o lugar em vagaId/)
    const semParceiro = await chamar(pegar(espiao.ferramentas, 'conversar'))
    assert.match(textoDe(semParceiro), /Falta dizer com quem/)
    assert.deepEqual(espiao.pedidos, [])
  })

  it('ninguém conversa consigo mesmo', async () => {
    const espiao = montar()
    const resultado = await chamar(pegar(espiao.ferramentas, 'conversar'), { comId: 'claude' })
    assert.equal(resultado.isError, true)
    assert.match(textoDe(resultado), /você mesmo/)
    assert.deepEqual(espiao.pedidos, [])
  })

  it('o verbo sem alvo não precisa de campo nenhum', async () => {
    const espiao = montar()
    const resultado = await chamar(pegar(espiao.ferramentas, 'nada'))
    assert.equal(resultado.isError, false)
    assert.equal(espiao.pedidos[0]?.verbo, 'nada')
  })

  it('sem quem execute a ação, o verbo é recusado em vez de explodir', async () => {
    const espiao = montar({ aoQuerer: undefined })
    const resultado = await chamar(pegar(espiao.ferramentas, 'usar'), { objetoId: 'tv' })
    assert.equal(resultado.isError, true)
    assert.match(textoDe(resultado), /a vida não está no comando/)
  })

  it('quem executa a ação pode falhar sem derrubar a sessão', async () => {
    const espiao = montar({ aoQuerer: () => { throw new Error('banco caiu') } })
    const resultado = await chamar(pegar(espiao.ferramentas, 'usar'), { objetoId: 'tv' })
    assert.equal(resultado.isError, true)
    assert.ok(!textoDe(resultado).includes('banco caiu'))
  })

  it('nenhuma descrição de ferramenta leva caminho de pasta nem nome de projeto', () => {
    for (const ferramenta of montar().ferramentas) {
      assert.ok(!/\//.test(ferramenta.description), `${ferramenta.name}: ${ferramenta.description}`)
    }
  })
})
