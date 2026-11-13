import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { criarEscritorio } from '../src/escritorio.ts'
import { criarExecucaoSimulada } from '../src/simulado.ts'
import type {
  Agente,
  Config,
  Escritorio,
  FimExecucao,
  GanchosExecucao,
  Ordem,
  PedidoHumano,
  RespostaPendencia,
} from '../src/tipos.ts'

const PERGUNTA = 'Qual abordagem você prefere?'

const proximoCiclo = (): Promise<void> => new Promise((resolver) => setImmediate(resolver))

function criarConfig(base: string, ajustes: Partial<Config> = {}): Config {
  return {
    porta: 0,
    host: '127.0.0.1',
    dirDados: join(base, 'dados'),
    dirProjetos: join(base, 'projetos'),
    dirAgentes: join(base, 'sem-agentes'),
    dirAgentesProjeto: join(base, 'agentes-projeto'),
    dirWeb: join(base, 'web'),
    maxSimultaneas: 4,
    conectoresClaudeAi: false,
    usarApiKey: false,
    simulado: true,
    modeloGeneralista: null,
    token: 'chave-de-teste-bem-comprida',
    versao: '0.0.0-teste',
    dirVida: '/tmp/vida',
    modeloVida: 'haiku',
    intervaloVidaMs: 25_000,
    maxNoLote: 4,
    tetoCustoUsdDoDia: 1,
    tetoHorasVida: 4,
    vidaNoBoot: false,
    ...ajustes,
  }
}

function montar(t: TestContext, ajustes: Partial<Config> = {}): Escritorio {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const base = mkdtempSync(join(tmpdir(), 'escritorio-simulado-'))
  mkdirSync(join(base, 'projetos', 'loja'), { recursive: true })
  const escritorio = criarEscritorio({
    config: criarConfig(base, ajustes),
    criarExecucao: criarExecucaoSimulada,
    caminhoBanco: ':memory:',
  })
  t.after(async () => {
    await escritorio.encerrar()
    rmSync(base, { recursive: true, force: true })
  })
  return escritorio
}

async function avancar(t: TestContext, ms: number): Promise<void> {
  for (let passado = 0; passado < ms; passado += 100) {
    t.mock.timers.tick(100)
    await proximoCiclo()
  }
}

async function avancarAte(t: TestContext, condicao: () => boolean, limiteMs = 40_000): Promise<void> {
  for (let passado = 0; !condicao(); passado += 100) {
    if (passado > limiteMs) throw new Error('não aconteceu dentro do tempo simulado')
    t.mock.timers.tick(100)
    await proximoCiclo()
  }
}

function detalhe(escritorio: Escritorio, id: string) {
  const encontrado = escritorio.detalheOrdem(id)
  assert.ok(encontrado)
  return encontrado
}

function criar(escritorio: Escritorio, instrucao: string, modo?: Ordem['modo']): Ordem {
  return escritorio.criarOrdem({ agenteId: 'claude', projeto: 'loja', instrucao, modo })
}

test('ordem simulada de ponta a ponta com uma pergunta respondida', async (t) => {
  const escritorio = montar(t)
  await escritorio.iniciar()
  const ordem = criar(escritorio, 'Faça uma pergunta antes de mudar o checkout')
  assert.equal(ordem.status, 'trabalhando')

  await avancarAte(t, () => escritorio.pendenciasAbertas().length > 0)
  const [pendencia] = escritorio.pendenciasAbertas()
  assert.ok(pendencia)
  assert.equal(pendencia.tipo, 'pergunta')
  assert.equal(pendencia.ferramenta, 'AskUserQuestion')
  assert.equal(pendencia.titulo, 'Tem uma pergunta para você')
  assert.deepEqual(pendencia.entrada, {
    questions: [
      {
        question: PERGUNTA,
        header: 'Abordagem',
        multiSelect: false,
        options: [
          { label: 'Rápida', description: 'Resolve o essencial agora' },
          { label: 'Completa', description: 'Cobre todos os casos, demora mais' },
        ],
      },
    ],
  })
  const durante = detalhe(escritorio, ordem.id)
  assert.equal(durante.ordem.status, 'aguardando')
  assert.ok(durante.ordem.sessaoId)
  assert.equal(durante.ordem.modelo, 'opus')
  assert.equal(durante.eventos[0]?.texto, 'Sessão iniciada (modelo opus)')
  assert.equal(escritorio.estado().agentes[0]?.estado, 'aguardando')

  await avancar(t, 10_000)
  assert.equal(detalhe(escritorio, ordem.id).eventos.length, durante.eventos.length)

  escritorio.responderPendencia(pendencia.id, { decisao: 'responder', respostas: { [PERGUNTA]: 'Rápida' } })
  await avancarAte(t, () => detalhe(escritorio, ordem.id).ordem.status === 'concluida')

  const final = detalhe(escritorio, ordem.id)
  assert.match(final.ordem.resultado ?? '', /Você escolheu a abordagem \*\*Rápida\*\*/)
  assert.match(final.ordem.resultado ?? '', /\*\*loja\*\*/)
  assert.equal(final.ordem.aguardaResposta, false)
  assert.ok(final.ordem.todos && final.ordem.todos.length >= 3 && final.ordem.todos.length <= 4)
  assert.ok(final.ordem.todos.every((todo) => todo.status === 'feito'))
  assert.ok((final.ordem.custoUsd ?? 0) >= 0.01 && (final.ordem.custoUsd ?? 1) <= 0.3)
  assert.ok((final.ordem.turnos ?? 0) >= 3 && (final.ordem.turnos ?? 99) <= 12)
  assert.ok((final.ordem.tokensEntrada ?? 0) > 0 && (final.ordem.tokensSaida ?? 0) > 0)
  assert.equal(typeof final.ordem.duracaoMs, 'number')
  const tipos = new Set(final.eventos.map((evento) => evento.tipo))
  for (const tipo of ['sistema', 'ferramenta', 'texto', 'pendencia', 'resposta', 'resultado'] as const) {
    assert.ok(tipos.has(tipo), `faltou evento ${tipo}`)
  }
  assert.ok(final.eventos.filter((evento) => evento.tipo === 'ferramenta').length >= 8)
  assert.equal(final.pendencias[0]?.status, 'respondida')
  assert.equal(escritorio.estado().agentes[0]?.estado, 'concluiu')
})

test('parar no meio limpa os timers e termina uma vez só como parada', async (t) => {
  const escritorio = montar(t)
  await escritorio.iniciar()
  const ordem = criar(escritorio, 'Ajuste o rodapé')
  await avancar(t, 4500)
  assert.ok(detalhe(escritorio, ordem.id).eventos.some((evento) => evento.tipo === 'ferramenta'))
  const status: string[] = []
  escritorio.assinar((evento) => {
    if (evento.tipo === 'ordem' && evento.dados.id === ordem.id) status.push(evento.dados.status)
  })

  const parada = await escritorio.pararOrdem(ordem.id)
  assert.equal(parada.status, 'parada')
  assert.ok(parada.vistaEm)
  const quantos = detalhe(escritorio, ordem.id).eventos.length
  await avancar(t, 30_000)
  assert.equal(detalhe(escritorio, ordem.id).eventos.length, quantos)
  assert.deepEqual(status, ['parada'])
  assert.equal(escritorio.estado().agentes[0]?.estado, 'livre')
})

test('parar enquanto espera a resposta cancela a pergunta', async (t) => {
  const escritorio = montar(t)
  await escritorio.iniciar()
  const ordem = criar(escritorio, 'Pergunte qual caminho seguir')
  await avancarAte(t, () => escritorio.pendenciasAbertas().length > 0)
  const parada = await escritorio.pararOrdem(ordem.id)
  assert.equal(parada.status, 'parada')
  assert.equal(detalhe(escritorio, ordem.id).pendencias[0]?.status, 'cancelada')
  const quantos = detalhe(escritorio, ordem.id).eventos.length
  await avancar(t, 30_000)
  assert.equal(detalhe(escritorio, ordem.id).eventos.length, quantos)
})

test('"pergunta no final" termina com pergunta e o agente fica aguardando', async (t) => {
  const escritorio = montar(t)
  await escritorio.iniciar()
  const ordem = criar(escritorio, 'Arrume o cadastro e faça a pergunta no final')
  await avancarAte(t, () => detalhe(escritorio, ordem.id).ordem.status === 'concluida')
  const final = detalhe(escritorio, ordem.id)
  assert.equal(final.pendencias.length, 0)
  assert.ok(final.ordem.resultado?.endsWith('Quer que eu já abra o PR?'))
  assert.equal(final.ordem.aguardaResposta, true)
  assert.equal(escritorio.estado().agentes[0]?.estado, 'aguardando')
})

test('o generalista simulado usa o modelo configurado para ele', async (t) => {
  const escritorio = montar(t, { modeloGeneralista: 'sonnet' })
  await escritorio.iniciar()
  assert.equal(escritorio.estado().agentes[0]?.modelo, 'sonnet')
  const ordem = criar(escritorio, 'Ajuste o cabeçalho')
  await avancarAte(t, () => detalhe(escritorio, ordem.id).ordem.modelo !== null)
  const durante = detalhe(escritorio, ordem.id)
  assert.equal(durante.ordem.modelo, 'sonnet')
  assert.equal(durante.eventos[0]?.texto, 'Sessão iniciada (modelo sonnet)')
})

test('"erro" na instrução termina com o erro simulado', async (t) => {
  const escritorio = montar(t)
  await escritorio.iniciar()
  const ordem = criar(escritorio, 'Simule um erro nos testes')
  await avancarAte(t, () => detalhe(escritorio, ordem.id).ordem.status !== 'trabalhando')
  const final = detalhe(escritorio, ordem.id).ordem
  assert.equal(final.status, 'erro')
  assert.equal(final.erro, 'Falha simulada: o comando npm test saiu com código 1.')
  assert.equal(escritorio.estado().agentes[0]?.estado, 'erro')
})

test('modo plano pede aprovação e "comando" pede permissão; negar segue em frente', async (t) => {
  const escritorio = montar(t)
  await escritorio.iniciar()
  const ordem = criar(escritorio, 'Rode o comando de instalação', 'plan')

  await avancarAte(t, () => escritorio.pendenciasAbertas().length > 0)
  const plano = escritorio.pendenciasAbertas()[0]
  assert.equal(plano?.tipo, 'plano')
  assert.match(String(plano?.entrada.plan), /^## Plano\n/)
  escritorio.responderPendencia(plano?.id ?? '', { decisao: 'aprovar' })
  assert.equal(detalhe(escritorio, ordem.id).ordem.modo, 'default')

  await avancarAte(t, () => escritorio.pendenciasAbertas().length > 0)
  const permissao = escritorio.pendenciasAbertas()[0]
  assert.equal(permissao?.tipo, 'permissao')
  assert.equal(permissao?.ferramenta, 'Bash')
  assert.equal(permissao?.titulo, 'Quer executar um comando')
  assert.equal(permissao?.permiteSempre, true)
  assert.deepEqual(permissao?.entrada, { command: 'npm install --save-dev vitest', description: 'Instalar o vitest' })
  escritorio.responderPendencia(permissao?.id ?? '', { decisao: 'negar' })

  await avancarAte(t, () => detalhe(escritorio, ordem.id).ordem.status === 'concluida')
  const final = detalhe(escritorio, ordem.id)
  assert.match(final.ordem.resultado ?? '', /Você aprovou o plano\./)
  assert.match(final.ordem.resultado ?? '', /negou a instalação do vitest/)
  assert.ok(final.eventos.some((evento) => evento.tipo === 'texto' && evento.texto === 'Tudo bem, não instalei o vitest.'))
})

test('execução simulada direta: determinística, retoma sessão e avisa o fim uma vez', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 29, 12) })
  const agente: Agente = {
    id: 'claude',
    nome: 'Claude',
    apelido: 'Claude',
    descricao: '',
    modelo: 'haiku',
    cor: '#d97757',
    ferramentas: null,
    memoria: null,
    arquivo: null,
    generalista: true,
    origem: null,
  }
  const ordem: Ordem = {
    id: 'ordem-fixa',
    agenteId: 'claude',
    projeto: '/tmp/loja',
    instrucao: 'Ajuste a busca',
    modo: 'default',
    status: 'trabalhando',
    sessaoId: null,
    continuaDe: null,
    modelo: null,
    atividade: null,
    recado: null,
    todos: null,
    resultado: null,
    erro: null,
    aguardaResposta: false,
    custoUsd: null,
    turnos: null,
    duracaoMs: null,
    tokensEntrada: null,
    tokensSaida: null,
    criadaEm: new Date().toISOString(),
    iniciadaEm: null,
    finalizadaEm: null,
    vistaEm: null,
  }
  const rodar = (ajustes: { retomarSessao?: string | null; instrucao?: string; modo?: Ordem['modo']; resposta?: RespostaPendencia | null } = {}) => {
    const linha: string[] = []
    const fins: FimExecucao[] = []
    const pedidos: PedidoHumano[] = []
    const inicio = Date.now()
    const ganchos: GanchosExecucao = {
      aoIniciarSessao: (info) => {
        linha.push(`${Date.now() - inicio} sessao ${info.sessaoId} ${info.modelo}`)
      },
      aoAtividade: (texto) => {
        linha.push(`${Date.now() - inicio} ${texto}`)
      },
      aoEvento: () => {},
      aoTodos: () => {},
      aoUsoConta: () => {},
      pedirAoHumano: async (pedido) => {
        pedidos.push(pedido)
        return ajustes.resposta ?? null
      },
      aoTerminar: (fim) => {
        fins.push(fim)
      },
    }
    const execucao = criarExecucaoSimulada({
      ordem: { ...ordem, instrucao: ajustes.instrucao ?? ordem.instrucao, modo: ajustes.modo ?? ordem.modo },
      agente,
      retomarSessao: ajustes.retomarSessao ?? null,
      ganchos,
      config: criarConfig('/tmp/nao-usada'),
    })
    return { execucao, linha, fins, pedidos }
  }

  const primeira = rodar({ retomarSessao: 'sessao-antiga' })
  primeira.execucao.iniciar()
  primeira.execucao.iniciar()
  await avancarAte(t, () => primeira.fins.length > 0)
  const segunda = rodar({ retomarSessao: 'sessao-antiga' })
  segunda.execucao.iniciar()
  await avancarAte(t, () => segunda.fins.length > 0)
  assert.deepEqual(segunda.linha, primeira.linha)
  assert.equal(primeira.linha[0], '400 sessao sessao-antiga haiku')
  assert.equal(primeira.fins.length, 1)
  assert.equal(primeira.fins[0]?.status, 'concluida')
  assert.equal(primeira.fins[0]?.duracaoMs, Number(primeira.linha.at(-1)?.split(' ')[0]) + 1000)
  await primeira.execucao.parar()
  assert.equal(primeira.fins.length, 1)

  const parada = rodar()
  parada.execucao.iniciar()
  await avancar(t, 3000)
  await parada.execucao.parar()
  await parada.execucao.parar()
  await avancar(t, 30_000)
  assert.deepEqual(parada.fins.map((fim) => fim.status), ['parada'])

  const encerrada = rodar()
  encerrada.execucao.iniciar()
  await avancar(t, 3000)
  const passos = encerrada.linha.length
  encerrada.execucao.encerrar()
  await encerrada.execucao.parar()
  await avancar(t, 30_000)
  assert.equal(encerrada.linha.length, passos)
  assert.deepEqual(encerrada.fins, [])

  const cancelada = rodar({ instrucao: 'Pergunte antes', resposta: null })
  cancelada.execucao.iniciar()
  await avancarAte(t, () => cancelada.fins.length > 0)
  assert.equal(cancelada.pedidos[0]?.tipo, 'pergunta')
  assert.deepEqual(cancelada.fins.map((fim) => fim.status), ['parada'])

  // No automático o comando roda sem pedir; no plano, "liberar tudo" também dispensa o pedido do comando.
  const tiposPedidos = async (ajustes: Parameters<typeof rodar>[0]) => {
    const execucao = rodar(ajustes)
    execucao.execucao.iniciar()
    await avancarAte(t, () => execucao.fins.length > 0)
    assert.deepEqual(execucao.fins.map((fim) => fim.status), ['concluida'])
    return execucao.pedidos.map((pedido) => pedido.tipo)
  }
  assert.deepEqual(await tiposPedidos({ instrucao: 'Rode o comando de testes', resposta: { decisao: 'permitir' } }), ['permissao'])
  assert.deepEqual(await tiposPedidos({ instrucao: 'Rode o comando de testes', modo: 'bypassPermissions' }), [])
  assert.deepEqual(await tiposPedidos({ instrucao: 'Rode o comando de testes', modo: 'plan', resposta: { decisao: 'aprovar_editando' } }), ['plano'])
})

test('aprovar o plano sem liberar tudo continua pedindo o comando', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.UTC(2026, 9, 29, 12) })
  const pedidos: PedidoHumano[] = []
  const fins: FimExecucao[] = []
  const execucao = criarExecucaoSimulada({
    ordem: {
      id: 'ordem-plano',
      agenteId: 'claude',
      projeto: '/tmp/loja',
      instrucao: 'Rode o comando de testes',
      modo: 'plan',
      status: 'trabalhando',
      sessaoId: null,
      continuaDe: null,
      modelo: null,
      atividade: null,
      recado: null,
      todos: null,
      resultado: null,
      erro: null,
      aguardaResposta: false,
      custoUsd: null,
      turnos: null,
      duracaoMs: null,
      tokensEntrada: null,
      tokensSaida: null,
      criadaEm: new Date().toISOString(),
      iniciadaEm: null,
      finalizadaEm: null,
      vistaEm: null,
    },
    agente: { id: 'claude', nome: 'Claude', apelido: 'Claude', descricao: '', modelo: 'haiku', cor: '#d97757', ferramentas: null, memoria: null, arquivo: null, generalista: true, origem: null },
    retomarSessao: null,
    ganchos: {
      aoIniciarSessao: () => {},
      aoAtividade: () => {},
      aoEvento: () => {},
      aoTodos: () => {},
      aoUsoConta: () => {},
      pedirAoHumano: async (pedido) => {
        pedidos.push(pedido)
        return pedido.tipo === 'plano' ? { decisao: 'aprovar' } : { decisao: 'permitir' }
      },
      aoTerminar: (fim) => {
        fins.push(fim)
      },
    },
    config: criarConfig('/tmp/nao-usada'),
  })
  execucao.iniciar()
  await avancarAte(t, () => fins.length > 0)
  assert.deepEqual(pedidos.map((pedido) => pedido.tipo), ['plano', 'permissao'])
  assert.deepEqual(fins.map((fim) => fim.status), ['concluida'])
})
