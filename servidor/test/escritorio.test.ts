import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test, type TestContext } from 'node:test'
import { abrirBanco } from '../src/banco.ts'
import { criarEscritorio, terminaComPergunta } from '../src/escritorio.ts'
import {
  ErroEscritorio,
  type AgenteComEstado,
  type Config,
  type ContextoExecucao,
  type Escritorio,
  type EventoTempoReal,
  type Execucao,
  type FabricaExecucao,
  type FimExecucao,
  type NovaOrdem,
  type PedidoHumano,
  type Pendencia,
  type Todo,
} from '../src/tipos.ts'

type ExecucaoFalsa = Execucao & {
  contexto: ContextoExecucao
  iniciada: boolean
  paradas: number
  encerrada: boolean
  terminar(dados?: Partial<FimExecucao>): void
}

type Fabrica = {
  fabrica: FabricaExecucao
  execucoes: ExecucaoFalsa[]
  daOrdem(id: string): ExecucaoFalsa
}

type Ambiente = {
  escritorio: Escritorio
  fabrica: Fabrica
  eventos: EventoTempoReal[]
  config: Config
}

const PEDIDO_PERMISSAO: PedidoHumano = {
  tipo: 'permissao',
  ferramenta: 'Bash',
  titulo: 'Quer executar um comando',
  descricao: 'Rodar os testes',
  entrada: { command: 'npm test' },
  permiteSempre: false,
  caminhoBloqueado: null,
}

const PEDIDO_PERGUNTA: PedidoHumano = {
  tipo: 'pergunta',
  ferramenta: 'AskUserQuestion',
  titulo: 'Tem uma pergunta para você',
  descricao: null,
  entrada: {
    questions: [
      {
        question: 'Qual abordagem?',
        header: 'Abordagem',
        multiSelect: false,
        options: [{ label: 'Rápida', description: 'agora' }, { label: 'Completa', description: 'depois' }],
      },
    ],
  },
  permiteSempre: false,
  caminhoBloqueado: null,
}

const PEDIDO_PLANO: PedidoHumano = {
  tipo: 'plano',
  ferramenta: 'ExitPlanMode',
  titulo: 'Terminou o plano e quer sua aprovação',
  descricao: null,
  entrada: { plan: '## Plano\n1. Fazer.' },
  permiteSempre: false,
  caminhoBloqueado: null,
}

function fimDe(dados: Partial<FimExecucao> = {}): FimExecucao {
  return {
    status: 'concluida',
    resultado: 'Pronto.',
    erro: null,
    custoUsd: 0.05,
    turnos: 3,
    duracaoMs: 1200,
    tokensEntrada: 1000,
    tokensSaida: 200,
    ...dados,
  }
}

function criarFabrica(opcoes: { pararTermina?: boolean; falharAoCriar?: boolean; falharAoIniciar?: boolean } = {}): Fabrica {
  const execucoes: ExecucaoFalsa[] = []
  const fabrica: FabricaExecucao = (contexto) => {
    if (opcoes.falharAoCriar) throw new Error('não deu para abrir o processo')
    const execucao: ExecucaoFalsa = {
      contexto,
      iniciada: false,
      paradas: 0,
      encerrada: false,
      iniciar() {
        if (opcoes.falharAoIniciar) throw new Error('o processo morreu ao nascer')
        execucao.iniciada = true
      },
      async parar() {
        execucao.paradas++
        if (opcoes.pararTermina !== false) contexto.ganchos.aoTerminar(fimDe({ status: 'parada', resultado: null }))
      },
      encerrar() {
        execucao.encerrada = true
      },
      terminar(dados = {}) {
        contexto.ganchos.aoTerminar(fimDe(dados))
      },
    }
    execucoes.push(execucao)
    return execucao
  }
  return {
    fabrica,
    execucoes,
    daOrdem(id) {
      const execucao = execucoes.find((item) => item.contexto.ordem.id === id)
      assert.ok(execucao, `nenhuma execução para a ordem ${id}`)
      return execucao
    },
  }
}

function cenario(t: TestContext) {
  const tarefas: Array<() => unknown> = []
  t.after(async () => {
    for (const tarefa of tarefas.reverse()) await tarefa()
  })
  const base = mkdtempSync(join(tmpdir(), 'escritorio-teste-'))
  tarefas.push(() => rmSync(base, { recursive: true, force: true }))
  mkdirSync(join(base, 'projetos', 'alfa'), { recursive: true })
  mkdirSync(join(base, 'projetos', 'beta'), { recursive: true })
  mkdirSync(join(base, 'agentes'))
  mkdirSync(join(base, 'dados'))
  writeFileSync(join(base, 'agentes', 'revisora.md'), '---\nname: Revisora\ndescription: Revisa código.\ncolor: green\n---\nCorpo.\n')
  writeFileSync(join(base, 'agentes', 'testador.md'), '---\nname: testador\ndescription: Escreve testes.\ncolor: blue\n---\nCorpo.\n')

  function abrir(ajustes: {
    maxSimultaneas?: number
    caminhoBanco?: string
    fabrica?: Fabrica
    dirAgentes?: string
    dirAgentesProjeto?: string
    modeloGeneralista?: string
  } = {}): Ambiente {
    const config: Config = {
      porta: 0,
      host: '127.0.0.1',
      dirDados: join(base, 'dados'),
      dirProjetos: join(base, 'projetos'),
      dirAgentes: ajustes.dirAgentes ?? join(base, 'agentes'),
      dirAgentesProjeto: ajustes.dirAgentesProjeto ?? join(base, 'agentes-projeto'),
      dirWeb: join(base, 'web'),
      maxSimultaneas: ajustes.maxSimultaneas ?? 4,
      conectoresClaudeAi: false,
      usarApiKey: false,
      simulado: true,
      modeloGeneralista: ajustes.modeloGeneralista ?? null,
      token: 'chave-de-teste-bem-comprida',
      versao: '0.0.0-teste',
      dirVida: join(base, 'vida'),
      modeloVida: 'haiku',
      intervaloVidaMs: 25_000,
      maxNoLote: 4,
      tetoCustoUsdDoDia: 1,
      tetoHorasVida: 4,
      vidaNoBoot: false,
    }
    const fabrica = ajustes.fabrica ?? criarFabrica()
    const escritorio = criarEscritorio({ config, criarExecucao: fabrica.fabrica, caminhoBanco: ajustes.caminhoBanco ?? ':memory:' })
    const eventos: EventoTempoReal[] = []
    escritorio.assinar((evento) => {
      eventos.push(evento)
    })
    tarefas.push(() => escritorio.encerrar())
    return { escritorio, fabrica, eventos, config }
  }

  return { base, abrir }
}

function falha(status: number, mensagem: RegExp) {
  return (erro: unknown): boolean => {
    assert.ok(erro instanceof ErroEscritorio, `esperava ErroEscritorio e veio ${String(erro)}`)
    assert.equal(erro.status, status)
    assert.match(erro.message, mensagem)
    return true
  }
}

function agenteDe(escritorio: Escritorio, id: string): AgenteComEstado {
  const agente = escritorio.estado().agentes.find((item) => item.id === id)
  assert.ok(agente, `agente ${id} não está no estado`)
  return agente
}

function abertaUnica(escritorio: Escritorio): Pendencia {
  const abertas = escritorio.pendenciasAbertas()
  assert.equal(abertas.length, 1)
  const [pendencia] = abertas
  assert.ok(pendencia)
  return pendencia
}

function ordem(escritorio: Escritorio, nova: Partial<NovaOrdem> = {}) {
  return escritorio.criarOrdem({ agenteId: 'revisora', projeto: 'alfa', instrucao: 'Faça o trabalho', ...nova })
}

function detalhe(escritorio: Escritorio, id: string) {
  const encontrado = escritorio.detalheOrdem(id)
  assert.ok(encontrado, `ordem ${id} não encontrada`)
  return encontrado
}

async function esperar(condicao: () => boolean, ms = 4000): Promise<void> {
  const limite = Date.now() + ms
  while (!condicao()) {
    if (Date.now() > limite) throw new Error('a condição não aconteceu a tempo')
    await new Promise((resolver) => setTimeout(resolver, 25))
  }
}

const proximoCiclo = (): Promise<void> => new Promise((resolver) => setImmediate(resolver))

test('terminaComPergunta olha a última linha não vazia sem marcação', () => {
  assert.equal(terminaComPergunta('Feito.\n\nQuer que eu já abra o PR?'), true)
  assert.equal(terminaComPergunta('Feito.\n**Posso seguir?**   \n\n'), true)
  assert.equal(terminaComPergunta('Pode ser `isso?`'), true)
  assert.equal(terminaComPergunta('_Quer mais?_\r\n'), true)
  assert.equal(terminaComPergunta('Será? Sim.\nTudo certo.'), false)
  assert.equal(terminaComPergunta('```\nfoo?\n```'), false)
  assert.equal(terminaComPergunta('Quer que eu siga? 🙂'), false)
  assert.equal(terminaComPergunta(''), false)
})

test('cria a ordem e começa na hora quando o agente está livre', async (t) => {
  const { escritorio, fabrica, eventos, config } = cenario(t).abrir()
  await escritorio.iniciar()
  eventos.length = 0
  const criada = ordem(escritorio, { instrucao: '  Revise o módulo de pagamentos  ' })

  assert.equal(criada.status, 'trabalhando')
  assert.equal(criada.instrucao, 'Revise o módulo de pagamentos')
  assert.equal(criada.modo, 'default')
  assert.equal(criada.projeto, join(config.dirProjetos, 'alfa'))
  assert.equal(criada.continuaDe, null)
  assert.ok(criada.iniciadaEm)
  const execucao = fabrica.daOrdem(criada.id)
  assert.equal(execucao.iniciada, true)
  assert.equal(execucao.contexto.agente.nome, 'Revisora')
  assert.equal(execucao.contexto.retomarSessao, null)
  assert.equal(execucao.contexto.config, config)
  assert.deepEqual(eventos.map((evento) => evento.tipo), ['ordem', 'ordem', 'agente'])

  const revisora = agenteDe(escritorio, 'revisora')
  assert.equal(revisora.estado, 'trabalhando')
  assert.equal(revisora.desde, criada.iniciadaEm)
  assert.equal(revisora.ordemAtual?.id, criada.id)
  assert.equal(revisora.ordemAtual?.projetoNome, 'alfa')
  assert.equal(revisora.fila, 0)
  assert.equal(revisora.pendencias, 0)
})

test('antes do iniciar a ordem espera na fila e o iniciar começa as que ficaram', async (t) => {
  const { escritorio, fabrica, eventos } = cenario(t).abrir()
  const criada = ordem(escritorio, { agenteId: 'claude', projeto: 'beta' })
  assert.equal(criada.status, 'na_fila')
  assert.equal(fabrica.execucoes.length, 0)
  await escritorio.iniciar()
  assert.equal(fabrica.execucoes.length, 1)
  assert.equal(detalhe(escritorio, criada.id).ordem.status, 'trabalhando')
  const estado = eventos.find((evento) => evento.tipo === 'estado')
  assert.ok(estado?.tipo === 'estado')
  assert.deepEqual(estado.dados.agentes.map((agente) => agente.id), ['claude', 'revisora', 'testador'])
  assert.deepEqual(estado.dados.projetos.map((projeto) => projeto.nome), ['alfa', 'beta'])
})

test('valida a nova ordem', async (t) => {
  const { base, abrir } = cenario(t)
  const { escritorio } = abrir()
  await escritorio.iniciar()

  assert.throws(() => ordem(escritorio, { agenteId: 'ninguem' }), falha(404, /^Agente não encontrado: ninguem$/))
  assert.throws(() => ordem(escritorio, { agenteId: '' }), falha(400, /agente/))
  assert.throws(() => ordem(escritorio, { projeto: 'nao-existe' }), falha(400, /^Projeto não encontrado: nao-existe$/))
  assert.throws(() => ordem(escritorio, { instrucao: '   ' }), falha(400, /instrução/))
  assert.throws(() => ordem(escritorio, { instrucao: 'x'.repeat(20_001) }), falha(400, /20\.000 caracteres/))
  assert.throws(() => ordem(escritorio, { modo: 'auto' as never }), falha(400, /Modo de permissão inválido/))
  assert.throws(() => ordem(escritorio, { continuaDe: 'nao-existe' }), falha(404, /Ordem não encontrada/))
  const doTestador = ordem(escritorio, { agenteId: 'testador' })
  assert.throws(() => ordem(escritorio, { continuaDe: doTestador.id }), falha(400, /mesmo agente/))
  assert.throws(() => escritorio.criarOrdem(null as never), falha(400, /inválido/))

  const noLimite = ordem(escritorio, { instrucao: 'x'.repeat(20_000), modo: 'plan' })
  assert.equal(noLimite.instrucao.length, 20_000)
  assert.equal(noLimite.modo, 'plan')
  const peloNome = ordem(escritorio, { agenteId: 'REVISORA', projeto: join(base, 'projetos', 'beta') })
  assert.equal(peloNome.agenteId, 'revisora')
  assert.equal(peloNome.projeto, join(base, 'projetos', 'beta'))
  assert.equal(peloNome.status, 'na_fila')
})

test('permissão vai e volta pelo painel', async (t) => {
  const { escritorio, fabrica, eventos } = cenario(t).abrir()
  await escritorio.iniciar()
  const criada = ordem(escritorio)
  const { ganchos } = fabrica.daOrdem(criada.id).contexto
  eventos.length = 0
  const promessa = ganchos.pedirAoHumano(PEDIDO_PERMISSAO, new AbortController().signal)

  const pendencia = abertaUnica(escritorio)
  assert.equal(pendencia.ordemId, criada.id)
  assert.equal(pendencia.agenteId, 'revisora')
  assert.equal(pendencia.tipo, 'permissao')
  assert.equal(pendencia.ferramenta, 'Bash')
  assert.equal(pendencia.descricao, 'Rodar os testes')
  assert.equal(pendencia.status, 'aberta')
  assert.deepEqual(pendencia.entrada, { command: 'npm test' })
  assert.equal(detalhe(escritorio, criada.id).ordem.status, 'aguardando')
  const revisora = agenteDe(escritorio, 'revisora')
  assert.equal(revisora.estado, 'aguardando')
  assert.equal(revisora.desde, pendencia.criadaEm)
  assert.equal(revisora.pendencias, 1)
  assert.ok(eventos.some((evento) => evento.tipo === 'pendencia' && evento.dados.id === pendencia.id))
  assert.ok(eventos.some((evento) => evento.tipo === 'evento' && evento.dados.tipo === 'pendencia'
    && evento.dados.texto === 'Quer executar um comando'))
  assert.ok(eventos.some((evento) => evento.tipo === 'agente' && evento.dados.estado === 'aguardando'))

  assert.throws(() => escritorio.responderPendencia(pendencia.id, { decisao: 'permitir_sempre' }), falha(400, /sessão toda/))
  assert.throws(() => escritorio.responderPendencia(pendencia.id, { decisao: 'aprovar' }), falha(400, /Decisão inválida/))
  assert.throws(() => escritorio.responderPendencia(pendencia.id, null as never), falha(400, /decisão/))
  assert.throws(() => escritorio.responderPendencia('nao-existe', { decisao: 'permitir' }), falha(404, /Pendência não encontrada/))

  const respondida = escritorio.responderPendencia(pendencia.id, {
    decisao: 'negar',
    mensagem: '  agora não  ',
    respostas: { ignorada: 'sim' },
  })
  assert.equal(respondida.status, 'respondida')
  assert.deepEqual(respondida.resposta, { decisao: 'negar', mensagem: 'agora não' })
  assert.ok(respondida.respondidaEm)
  assert.deepEqual(await promessa, { decisao: 'negar', mensagem: 'agora não' })
  assert.throws(() => escritorio.responderPendencia(pendencia.id, { decisao: 'permitir' }), falha(409, /já foi respondida/))

  assert.equal(detalhe(escritorio, criada.id).ordem.status, 'trabalhando')
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'trabalhando')
  const resposta = detalhe(escritorio, criada.id).eventos.find((evento) => evento.tipo === 'resposta')
  assert.equal(resposta?.texto, 'Você negou: agora não')
  assert.deepEqual(resposta?.detalhe, { pendenciaId: pendencia.id, decisao: 'negar', mensagem: 'agora não' })

  const sempre = ganchos.pedirAoHumano({ ...PEDIDO_PERMISSAO, permiteSempre: true }, new AbortController().signal)
  escritorio.responderPendencia(abertaUnica(escritorio).id, { decisao: 'permitir_sempre' })
  assert.deepEqual(await sempre, { decisao: 'permitir_sempre' })
})

test('pergunta e plano chegam à execução com a resposta certa', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const criada = ordem(escritorio, { modo: 'plan' })
  const { ganchos } = fabrica.daOrdem(criada.id).contexto
  const sinal = new AbortController().signal

  const pergunta = ganchos.pedirAoHumano(PEDIDO_PERGUNTA, sinal)
  const p1 = abertaUnica(escritorio)
  assert.deepEqual(p1.entrada, PEDIDO_PERGUNTA.entrada)
  assert.throws(() => escritorio.responderPendencia(p1.id, { decisao: 'responder' }), falha(400, /pelo menos uma/))
  assert.throws(
    () => escritorio.responderPendencia(p1.id, { decisao: 'responder', respostas: { 'Qual abordagem?': '  ' } }),
    falha(400, /pelo menos uma/),
  )
  assert.throws(() => escritorio.responderPendencia(p1.id, { decisao: 'permitir' }), falha(400, /Decisão inválida/))
  escritorio.responderPendencia(p1.id, {
    decisao: 'responder',
    respostas: { 'Qual abordagem?': ' Rápida ', 'Sem resposta?': '' },
    mensagem: '   ',
  })
  assert.deepEqual(await pergunta, { decisao: 'responder', respostas: { 'Qual abordagem?': 'Rápida' } })

  const recusa = ganchos.pedirAoHumano(PEDIDO_PERGUNTA, sinal)
  escritorio.responderPendencia(abertaUnica(escritorio).id, { decisao: 'recusar' })
  assert.deepEqual(await recusa, { decisao: 'recusar' })

  const plano = ganchos.pedirAoHumano(PEDIDO_PLANO, sinal)
  const p3 = abertaUnica(escritorio)
  assert.equal(p3.tipo, 'plano')
  assert.deepEqual(p3.entrada, { plan: '## Plano\n1. Fazer.' })
  assert.throws(() => escritorio.responderPendencia(p3.id, { decisao: 'negar' }), falha(400, /Decisão inválida/))
  escritorio.responderPendencia(p3.id, { decisao: 'ajustar', mensagem: 'Mais curto' })
  assert.deepEqual(await plano, { decisao: 'ajustar', mensagem: 'Mais curto' })

  const aprovacao = ganchos.pedirAoHumano(PEDIDO_PLANO, sinal)
  escritorio.responderPendencia(abertaUnica(escritorio).id, { decisao: 'aprovar_editando' })
  assert.deepEqual(await aprovacao, { decisao: 'aprovar_editando' })

  const textos = detalhe(escritorio, criada.id).eventos.filter((evento) => evento.tipo === 'resposta').map((evento) => evento.texto)
  assert.deepEqual(textos, [
    'Você respondeu: Rápida',
    'Você preferiu não responder.',
    'Você pediu ajustes no plano: Mais curto',
    'Você aprovou o plano e liberou tudo (edições e comandos).',
  ])
})

test('com duas pendências só volta a trabalhar quando as duas fecham', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const criada = ordem(escritorio)
  const { ganchos } = fabrica.daOrdem(criada.id).contexto
  const sinal = new AbortController().signal
  const primeira = ganchos.pedirAoHumano(PEDIDO_PERMISSAO, sinal)
  const segunda = ganchos.pedirAoHumano(PEDIDO_PERGUNTA, sinal)
  const [p1, p2] = escritorio.pendenciasAbertas()
  assert.ok(p1 && p2)
  assert.equal(agenteDe(escritorio, 'revisora').desde, p1.criadaEm)
  assert.equal(agenteDe(escritorio, 'revisora').pendencias, 2)

  escritorio.responderPendencia(p1.id, { decisao: 'permitir' })
  assert.deepEqual(await primeira, { decisao: 'permitir' })
  assert.equal(detalhe(escritorio, criada.id).ordem.status, 'aguardando')
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'aguardando')

  escritorio.responderPendencia(p2.id, { decisao: 'responder', respostas: { 'Qual abordagem?': 'Completa' } })
  assert.deepEqual(await segunda, { decisao: 'responder', respostas: { 'Qual abordagem?': 'Completa' } })
  assert.equal(detalhe(escritorio, criada.id).ordem.status, 'trabalhando')
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'trabalhando')
})

test('sinal abortado cancela a pendência e devolve null', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const criada = ordem(escritorio)
  const { ganchos } = fabrica.daOrdem(criada.id).contexto
  const controle = new AbortController()
  const promessa = ganchos.pedirAoHumano(PEDIDO_PERMISSAO, controle.signal)
  const pendencia = abertaUnica(escritorio)

  controle.abort()
  assert.equal(await promessa, null)
  assert.equal(detalhe(escritorio, criada.id).pendencias[0]?.status, 'cancelada')
  assert.equal(detalhe(escritorio, criada.id).ordem.status, 'trabalhando')
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'trabalhando')
  assert.throws(() => escritorio.responderPendencia(pendencia.id, { decisao: 'permitir' }), falha(409, /cancelada/))

  assert.equal(await ganchos.pedirAoHumano(PEDIDO_PERMISSAO, AbortSignal.abort()), null)
  assert.equal(await ganchos.pedirAoHumano({ ...PEDIDO_PERMISSAO, tipo: 'outro' as never }, controle.signal), null)
  assert.equal(escritorio.pendenciasAbertas().length, 0)
})

test('o fim da ordem cancela pendências e grava resultado, métricas e vista', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const criada = ordem(escritorio)
  const execucao = fabrica.daOrdem(criada.id)
  const { ganchos } = execucao.contexto
  ganchos.aoIniciarSessao({ sessaoId: 'sessao-xyz', modelo: 'opus' })
  ganchos.aoAtividade('  Lendo package.json  ')
  ganchos.aoTodos([
    { conteudo: 'Ler', status: 'feito' },
    { conteudo: 'Testar', status: 'andamento', ativo: 'Testando' },
    { conteudo: ' ', status: 'feito' },
    { conteudo: 'Estranho', status: 'outro' as Todo['status'] },
  ])
  const revisoraTrabalhando = agenteDe(escritorio, 'revisora')
  assert.equal(revisoraTrabalhando.ordemAtual?.atividade, 'Lendo package.json')
  assert.equal(revisoraTrabalhando.ordemAtual?.todosFeitos, 1)
  assert.equal(revisoraTrabalhando.ordemAtual?.todosTotal, 3)
  assert.deepEqual(detalhe(escritorio, criada.id).ordem.todos, [
    { conteudo: 'Ler', status: 'feito' },
    { conteudo: 'Testar', status: 'andamento', ativo: 'Testando' },
    { conteudo: 'Estranho', status: 'pendente' },
  ])

  const promessa = ganchos.pedirAoHumano(PEDIDO_PERMISSAO, new AbortController().signal)
  execucao.terminar({ resultado: '  Tudo certo.\n\nMudei 3 arquivos.  ' })
  assert.equal(await promessa, null)

  const final = detalhe(escritorio, criada.id)
  assert.equal(final.ordem.status, 'concluida')
  assert.equal(final.ordem.resultado, 'Tudo certo.\n\nMudei 3 arquivos.')
  assert.equal(final.ordem.sessaoId, 'sessao-xyz')
  assert.equal(final.ordem.modelo, 'opus')
  assert.equal(final.ordem.atividade, null)
  assert.equal(final.ordem.aguardaResposta, false)
  assert.equal(final.ordem.custoUsd, 0.05)
  assert.equal(final.ordem.turnos, 3)
  assert.equal(final.ordem.duracaoMs, 1200)
  assert.equal(final.ordem.tokensEntrada, 1000)
  assert.equal(final.ordem.tokensSaida, 200)
  assert.equal(final.ordem.vistaEm, null)
  assert.ok(final.ordem.finalizadaEm)
  assert.equal(final.pendencias[0]?.status, 'cancelada')
  assert.deepEqual(final.eventos.at(-1)?.tipo, 'resultado')
  assert.equal(final.eventos.at(-1)?.texto, 'Tudo certo.\n\nMudei 3 arquivos.')

  const concluiu = agenteDe(escritorio, 'revisora')
  assert.equal(concluiu.estado, 'concluiu')
  assert.equal(concluiu.desde, final.ordem.finalizadaEm)
  assert.equal(concluiu.ordemAtual, null)
  assert.equal(concluiu.ultimaOrdem?.id, criada.id)

  ganchos.aoAtividade('depois do fim')
  ganchos.aoEvento('texto', 'tarde demais')
  execucao.terminar({ status: 'erro', erro: 'de novo' })
  const depois = detalhe(escritorio, criada.id)
  assert.equal(depois.ordem.status, 'concluida')
  assert.equal(depois.ordem.atividade, null)
  assert.equal(depois.eventos.length, final.eventos.length)

  escritorio.marcarVista(criada.id)
  const vista = detalhe(escritorio, criada.id).ordem.vistaEm
  assert.ok(vista)
  const livre = agenteDe(escritorio, 'revisora')
  assert.equal(livre.estado, 'livre')
  assert.equal(livre.desde, final.ordem.finalizadaEm)
  escritorio.marcarVista(criada.id)
  assert.equal(detalhe(escritorio, criada.id).ordem.vistaEm, vista)
  assert.throws(() => escritorio.marcarVista('nao-existe'), falha(404, /Ordem não encontrada/))
})

test('limita textos, detalhes e resultado, e o erro deixa o agente em erro', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const criada = ordem(escritorio)
  const execucao = fabrica.daOrdem(criada.id)
  const { ganchos } = execucao.contexto
  ganchos.aoEvento('texto', 'x'.repeat(9000))
  ganchos.aoEvento('ferramenta', 'Escrevendo a.ts', { nome: 'Write', entrada: { file_path: 'a.ts', content: 'y'.repeat(50_000) } })
  ganchos.aoEvento('desconhecido' as never, 'oi')
  ganchos.aoEvento('status', 'lista grande', { lista: Array.from({ length: 5000 }, (_, i) => i) })
  ganchos.aoEvento('sistema', 'sem detalhe', 10n)

  const eventos = detalhe(escritorio, criada.id).eventos
  assert.equal(eventos[0]?.texto.length, 8000)
  assert.ok(eventos[0]?.texto.endsWith('…'))
  const escrita = eventos[1]?.detalhe as { nome: string; entrada: { file_path: string; content: string } }
  assert.equal(escrita.nome, 'Write')
  assert.equal(escrita.entrada.file_path, 'a.ts')
  assert.ok(escrita.entrada.content.length < 50_000)
  assert.ok(Buffer.byteLength(JSON.stringify(escrita)) <= 16 * 1024)
  assert.equal(eventos[2]?.tipo, 'sistema')
  assert.ok(Buffer.byteLength(JSON.stringify(eventos[3]?.detalhe)) <= 16 * 1024)
  assert.equal(eventos[4]?.detalhe, '10')

  execucao.terminar({ status: 'erro', resultado: 'z'.repeat(200 * 1024), erro: '  Falhou feio  ' })
  const final = detalhe(escritorio, criada.id)
  assert.equal(final.ordem.status, 'erro')
  assert.equal(final.ordem.erro, 'Falhou feio')
  assert.ok(Buffer.byteLength(final.ordem.resultado ?? '') <= 100 * 1024)
  assert.ok(final.ordem.resultado?.endsWith('[Resultado cortado: passou de 100 KB.]'))
  assert.equal(final.eventos.at(-1)?.tipo, 'erro')
  assert.equal(final.eventos.at(-1)?.texto, 'Falhou feio')
  const comErro = agenteDe(escritorio, 'revisora')
  assert.equal(comErro.estado, 'erro')
  assert.equal(comErro.desde, final.ordem.finalizadaEm)

  const semMensagem = ordem(escritorio)
  fabrica.daOrdem(semMensagem.id).terminar({ status: 'erro', erro: null, resultado: null, duracaoMs: null })
  const semMensagemFinal = detalhe(escritorio, semMensagem.id).ordem
  assert.equal(semMensagemFinal.erro, 'A ordem terminou com erro.')
  assert.equal(typeof semMensagemFinal.duracaoMs, 'number')

  const estranha = ordem(escritorio)
  fabrica.daOrdem(estranha.id).terminar({ status: 'talvez' as never })
  assert.equal(detalhe(escritorio, estranha.id).ordem.status, 'erro')
})

test('pararOrdem para a execução, cancela pendências e marca como vista', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const criada = ordem(escritorio)
  const execucao = fabrica.daOrdem(criada.id)
  const promessa = execucao.contexto.ganchos.pedirAoHumano(PEDIDO_PERMISSAO, new AbortController().signal)

  const parada = await escritorio.pararOrdem(criada.id)
  assert.equal(parada.status, 'parada')
  assert.ok(parada.vistaEm)
  assert.equal(parada.vistaEm, parada.finalizadaEm)
  assert.equal(execucao.paradas, 1)
  assert.equal(await promessa, null)
  assert.equal(detalhe(escritorio, criada.id).pendencias[0]?.status, 'cancelada')
  assert.equal(detalhe(escritorio, criada.id).eventos.at(-1)?.texto, 'Você parou a ordem.')
  const livre = agenteDe(escritorio, 'revisora')
  assert.equal(livre.estado, 'livre')
  assert.equal(livre.desde, parada.finalizadaEm)
  assert.equal(livre.ultimaOrdem?.status, 'parada')

  await assert.rejects(escritorio.pararOrdem(criada.id), falha(409, /não está rodando/))
  await assert.rejects(escritorio.pararOrdem('nao-existe'), falha(404, /Ordem não encontrada/))
  ordem(escritorio)
  const naFila = ordem(escritorio)
  await assert.rejects(escritorio.pararOrdem(naFila.id), falha(409, /não está rodando/))
})

test('pararOrdem fecha a ordem mesmo se a execução não avisar o fim', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const fabrica = criarFabrica({ pararTermina: false })
  const { escritorio } = cenario(t).abrir({ fabrica })
  await escritorio.iniciar()
  const criada = ordem(escritorio)
  const execucao = fabrica.daOrdem(criada.id)

  const promessa = escritorio.pararOrdem(criada.id)
  const segunda = escritorio.pararOrdem(criada.id)
  await proximoCiclo()
  assert.equal(execucao.paradas, 1)
  assert.equal(await execucao.contexto.ganchos.pedirAoHumano(PEDIDO_PERMISSAO, new AbortController().signal), null)
  assert.equal(escritorio.pendenciasAbertas().length, 0)
  t.mock.timers.tick(8000)
  const parada = await promessa
  assert.equal(parada.status, 'parada')
  assert.equal((await segunda).status, 'parada')
  assert.equal(execucao.encerrada, true)

  execucao.terminar({ status: 'concluida' })
  assert.equal(detalhe(escritorio, criada.id).ordem.status, 'parada')
})

test('cancelarOrdem só vale para ordem na fila', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const rodando = ordem(escritorio)
  const naFila = ordem(escritorio)
  assert.equal(naFila.status, 'na_fila')
  assert.equal(agenteDe(escritorio, 'revisora').fila, 1)

  assert.throws(() => escritorio.cancelarOrdem(rodando.id), falha(409, /na fila/))
  const cancelada = escritorio.cancelarOrdem(naFila.id)
  assert.equal(cancelada.status, 'cancelada')
  assert.ok(cancelada.finalizadaEm)
  assert.throws(() => escritorio.cancelarOrdem(naFila.id), falha(409, /na fila/))
  assert.throws(() => escritorio.cancelarOrdem('nao-existe'), falha(404, /Ordem não encontrada/))
  assert.equal(agenteDe(escritorio, 'revisora').fila, 0)

  fabrica.daOrdem(rodando.id).terminar()
  assert.equal(fabrica.execucoes.length, 1)
  const revisora = agenteDe(escritorio, 'revisora')
  assert.equal(revisora.ultimaOrdem?.id, rodando.id)
  assert.equal(revisora.estado, 'concluiu')
  const historico = escritorio.detalheAgente('revisora')?.historico.map((item) => item.id)
  assert.deepEqual(new Set(historico), new Set([rodando.id, naFila.id]))
})

test('uma ordem por agente, limite global e fila por ordem de criação', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir({ maxSimultaneas: 2 })
  await escritorio.iniciar()
  const a1 = ordem(escritorio)
  const a2 = ordem(escritorio)
  const b1 = ordem(escritorio, { agenteId: 'testador' })
  const c1 = ordem(escritorio, { agenteId: 'claude' })
  assert.deepEqual([a1.status, a2.status, b1.status, c1.status], ['trabalhando', 'na_fila', 'trabalhando', 'na_fila'])

  const revisora = agenteDe(escritorio, 'revisora')
  assert.equal(revisora.estado, 'trabalhando')
  assert.equal(revisora.fila, 1)
  const claude = agenteDe(escritorio, 'claude')
  assert.equal(claude.estado, 'na_fila')
  assert.equal(claude.desde, c1.criadaEm)
  assert.equal(claude.fila, 1)

  fabrica.daOrdem(a1.id).terminar()
  assert.equal(detalhe(escritorio, a2.id).ordem.status, 'trabalhando')
  assert.equal(detalhe(escritorio, c1.id).ordem.status, 'na_fila')

  fabrica.daOrdem(b1.id).terminar()
  assert.equal(detalhe(escritorio, c1.id).ordem.status, 'trabalhando')
  assert.deepEqual(fabrica.execucoes.map((execucao) => execucao.contexto.ordem.id), [a1.id, b1.id, a2.id, c1.id])
})

test('estado do agente: erro, conclusão com pergunta, dispensar e vista', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const testador = agenteDe(escritorio, 'testador')
  assert.equal(testador.estado, 'livre')
  assert.equal(testador.desde, null)
  assert.equal(testador.ultimaOrdem, null)

  const comErro = ordem(escritorio, { agenteId: 'claude' })
  fabrica.daOrdem(comErro.id).terminar({ status: 'erro', erro: 'quebrou' })
  assert.equal(agenteDe(escritorio, 'claude').estado, 'erro')
  escritorio.marcarVista(comErro.id)
  assert.equal(agenteDe(escritorio, 'claude').estado, 'livre')

  const pergunta = ordem(escritorio)
  fabrica.daOrdem(pergunta.id).terminar({ resultado: 'Fiz a primeira parte.\n\n**Quer que eu continue?**' })
  const final = detalhe(escritorio, pergunta.id).ordem
  assert.equal(final.aguardaResposta, true)
  const aguardando = agenteDe(escritorio, 'revisora')
  assert.equal(aguardando.estado, 'aguardando')
  assert.equal(aguardando.desde, final.finalizadaEm)
  assert.equal(aguardando.ultimaOrdem?.aguardaResposta, true)
  assert.deepEqual(escritorio.detalheAgente('revisora')?.perguntaFinal, final)

  escritorio.dispensarResposta(pergunta.id)
  const dispensada = detalhe(escritorio, pergunta.id).ordem
  assert.equal(dispensada.aguardaResposta, false)
  assert.ok(dispensada.vistaEm)
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'livre')
  assert.equal(escritorio.detalheAgente('revisora')?.perguntaFinal, null)
  escritorio.dispensarResposta(pergunta.id)
  assert.throws(() => escritorio.dispensarResposta('nao-existe'), falha(404, /Ordem não encontrada/))

  const parada = ordem(escritorio, { agenteId: 'testador' })
  fabrica.daOrdem(parada.id).terminar({ status: 'parada', resultado: 'Quer que eu continue?' })
  const paradaFinal = detalhe(escritorio, parada.id).ordem
  assert.equal(paradaFinal.aguardaResposta, false)
  assert.equal(paradaFinal.vistaEm, paradaFinal.finalizadaEm)
  assert.equal(agenteDe(escritorio, 'testador').estado, 'livre')
})

test('continuação e ordem nova limpam a pergunta pendente', async (t) => {
  const { escritorio, fabrica, config } = cenario(t).abrir()
  await escritorio.iniciar()
  const primeira = ordem(escritorio, { modo: 'acceptEdits' })
  fabrica.daOrdem(primeira.id).contexto.ganchos.aoIniciarSessao({ sessaoId: 'sessao-1', modelo: 'opus' })
  fabrica.daOrdem(primeira.id).terminar({ resultado: 'Fiz.\nPosso seguir com o resto?' })
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'aguardando')

  const continuacao = ordem(escritorio, { projeto: 'beta', instrucao: 'Sim, siga', continuaDe: primeira.id })
  assert.equal(continuacao.projeto, join(config.dirProjetos, 'alfa'))
  assert.equal(continuacao.continuaDe, primeira.id)
  assert.equal(continuacao.sessaoId, 'sessao-1')
  assert.equal(continuacao.modo, 'default')
  assert.equal(fabrica.daOrdem(continuacao.id).contexto.retomarSessao, 'sessao-1')
  assert.equal(detalhe(escritorio, primeira.id).ordem.aguardaResposta, false)
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'trabalhando')

  fabrica.daOrdem(continuacao.id).terminar({ resultado: 'Pronto. Abro o PR?' })
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'aguardando')
  const nova = ordem(escritorio, { instrucao: 'Outra coisa' })
  assert.equal(nova.sessaoId, null)
  assert.equal(fabrica.daOrdem(nova.id).contexto.retomarSessao, null)
  assert.equal(detalhe(escritorio, continuacao.id).ordem.aguardaResposta, false)
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'trabalhando')

  const cadeia = detalhe(escritorio, continuacao.id).cadeia.map((item) => item.id)
  assert.deepEqual(cadeia, [primeira.id, continuacao.id])
  assert.deepEqual(detalhe(escritorio, nova.id).cadeia.map((item) => item.id), [nova.id])
})

test('a ordem que roda vence a pergunta final de outra, que volta quando o agente para', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const comPergunta = ordem(escritorio)
  const naFila = ordem(escritorio, { instrucao: 'Depois disso' })
  fabrica.daOrdem(comPergunta.id).terminar({ resultado: 'Fiz.\n\nQuer que eu já abra o PR?' })
  const pergunta = detalhe(escritorio, comPergunta.id).ordem
  assert.equal(pergunta.aguardaResposta, true)

  const trabalhando = agenteDe(escritorio, 'revisora')
  assert.equal(trabalhando.estado, 'trabalhando')
  assert.equal(trabalhando.desde, detalhe(escritorio, naFila.id).ordem.iniciadaEm)
  assert.equal(trabalhando.ordemAtual?.id, naFila.id)
  assert.equal(trabalhando.ultimaOrdem?.id, comPergunta.id)
  assert.deepEqual(escritorio.detalheAgente('revisora')?.perguntaFinal, pergunta)

  const { ganchos } = fabrica.daOrdem(naFila.id).contexto
  const permissao = ganchos.pedirAoHumano(PEDIDO_PERMISSAO, new AbortController().signal)
  const pendencia = abertaUnica(escritorio)
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'aguardando')
  assert.equal(agenteDe(escritorio, 'revisora').desde, pendencia.criadaEm)
  escritorio.responderPendencia(pendencia.id, { decisao: 'permitir' })
  await permissao
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'trabalhando')

  fabrica.daOrdem(naFila.id).terminar({ resultado: 'Pronto.' })
  const parado = agenteDe(escritorio, 'revisora')
  assert.equal(parado.estado, 'aguardando')
  assert.equal(parado.desde, pergunta.finalizadaEm)
  assert.equal(parado.ultimaOrdem?.id, naFila.id)
  assert.equal(escritorio.detalheAgente('revisora')?.perguntaFinal?.id, comPergunta.id)

  escritorio.dispensarResposta(comPergunta.id)
  assert.equal(escritorio.detalheAgente('revisora')?.perguntaFinal, null)
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'concluiu')
})

test('retomar uma ordem antiga não some com a pergunta final da mais recente', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const antiga = ordem(escritorio)
  fabrica.daOrdem(antiga.id).contexto.ganchos.aoIniciarSessao({ sessaoId: 'sessao-antiga', modelo: 'opus' })
  await escritorio.pararOrdem(antiga.id)
  const comPergunta = ordem(escritorio, { instrucao: 'Outra coisa' })
  fabrica.daOrdem(comPergunta.id).terminar({ resultado: 'Posso seguir?' })
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'aguardando')

  const retomada = escritorio.retomarOrdem(antiga.id)
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'trabalhando')
  assert.equal(escritorio.detalheAgente('revisora')?.perguntaFinal?.id, comPergunta.id)
  fabrica.daOrdem(retomada.id).terminar({ resultado: 'Terminei a antiga.' })
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'aguardando')
  assert.equal(escritorio.detalheAgente('revisora')?.perguntaFinal?.id, comPergunta.id)

  const resposta = ordem(escritorio, { instrucao: 'Sim, siga', continuaDe: comPergunta.id })
  assert.equal(resposta.continuaDe, comPergunta.id)
  assert.equal(escritorio.detalheAgente('revisora')?.perguntaFinal, null)
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'trabalhando')
})

test('responder a pergunta final com o agente ocupado põe a continuação na fila', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const comPergunta = ordem(escritorio)
  const naFila = ordem(escritorio, { instrucao: 'Depois disso' })
  fabrica.daOrdem(comPergunta.id).terminar({ resultado: 'Quer que eu já abra o PR?' })
  const resposta = ordem(escritorio, { instrucao: 'Sim', continuaDe: comPergunta.id })
  assert.equal(resposta.status, 'na_fila')
  assert.equal(escritorio.detalheAgente('revisora')?.perguntaFinal, null)
  fabrica.daOrdem(naFila.id).terminar()
  assert.equal(detalhe(escritorio, resposta.id).ordem.status, 'trabalhando')
})

test('retomarOrdem cria a continuação da ordem interrompida, parada ou com erro', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const comErro = ordem(escritorio, { modo: 'plan' })
  fabrica.daOrdem(comErro.id).contexto.ganchos.aoIniciarSessao({ sessaoId: 'sessao-a', modelo: 'opus' })
  fabrica.daOrdem(comErro.id).terminar({ status: 'erro', erro: 'caiu' })

  assert.throws(() => escritorio.retomarOrdem('nao-existe'), falha(404, /Ordem não encontrada/))
  const concluida = ordem(escritorio, { agenteId: 'testador' })
  fabrica.daOrdem(concluida.id).terminar()
  assert.throws(() => escritorio.retomarOrdem(concluida.id), falha(409, /retomar/))

  const retomada = escritorio.retomarOrdem(comErro.id)
  assert.equal(retomada.continuaDe, comErro.id)
  assert.equal(retomada.instrucao, 'Continue de onde parou.')
  assert.equal(retomada.projeto, comErro.projeto)
  assert.equal(retomada.modo, 'plan')
  assert.equal(retomada.sessaoId, 'sessao-a')
  assert.equal(fabrica.daOrdem(retomada.id).contexto.retomarSessao, 'sessao-a')
  assert.ok(detalhe(escritorio, comErro.id).ordem.vistaEm)
  assert.throws(() => escritorio.retomarOrdem(retomada.id), falha(409, /retomar/))

  const semSessao = ordem(escritorio, { agenteId: 'claude', instrucao: 'Arrume o build' })
  fabrica.daOrdem(semSessao.id).terminar({ status: 'erro', erro: 'não abriu' })
  const doZero = escritorio.retomarOrdem(semSessao.id)
  assert.equal(doZero.instrucao, 'Arrume o build')
  assert.equal(fabrica.daOrdem(doZero.id).contexto.retomarSessao, null)

  const parada = await escritorio.pararOrdem(doZero.id)
  const comTexto = escritorio.retomarOrdem(parada.id, '  Agora sim  ')
  assert.equal(comTexto.instrucao, 'Agora sim')
  assert.deepEqual(detalhe(escritorio, comTexto.id).cadeia.map((item) => item.id), [semSessao.id, doZero.id, comTexto.id])
})

test('não retoma de novo uma ordem que já tem continuação na fila ou rodando', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const comErro = ordem(escritorio)
  fabrica.daOrdem(comErro.id).contexto.ganchos.aoIniciarSessao({ sessaoId: 'sessao-1', modelo: 'opus' })
  fabrica.daOrdem(comErro.id).terminar({ status: 'erro', erro: 'caiu' })

  const retomada = escritorio.retomarOrdem(comErro.id)
  assert.equal(retomada.status, 'trabalhando')
  assert.throws(() => escritorio.retomarOrdem(comErro.id), falha(409, /^Essa ordem já foi retomada\.$/))
  assert.throws(() => escritorio.retomarOrdem(comErro.id, 'Outra instrução'), falha(409, /já foi retomada/))
  fabrica.daOrdem(retomada.id).terminar({ status: 'erro', erro: 'caiu de novo' })
  const segunda = escritorio.retomarOrdem(comErro.id)
  assert.equal(segunda.continuaDe, comErro.id)

  const ocupando = ordem(escritorio, { instrucao: 'Outra coisa' })
  await escritorio.pararOrdem(segunda.id)
  assert.equal(detalhe(escritorio, ocupando.id).ordem.status, 'trabalhando')
  const naFila = escritorio.retomarOrdem(segunda.id)
  assert.equal(naFila.status, 'na_fila')
  assert.throws(() => escritorio.retomarOrdem(segunda.id), falha(409, /já foi retomada/))
  escritorio.cancelarOrdem(naFila.id)
  assert.equal(escritorio.retomarOrdem(segunda.id).continuaDe, segunda.id)
})

test('retomar uma continuação que não chegou à sessão manda a instrução dela de novo', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const primeira = ordem(escritorio)
  fabrica.daOrdem(primeira.id).contexto.ganchos.aoIniciarSessao({ sessaoId: 'sessao-1', modelo: 'opus' })
  fabrica.daOrdem(primeira.id).terminar()
  const continuacao = ordem(escritorio, { instrucao: 'Agora adicione testes unitários', continuaDe: primeira.id })
  assert.equal(continuacao.sessaoId, 'sessao-1')
  await escritorio.pararOrdem(continuacao.id)

  const retomada = escritorio.retomarOrdem(continuacao.id)
  assert.equal(retomada.instrucao, 'Agora adicione testes unitários')
  assert.equal(retomada.sessaoId, 'sessao-1')
  assert.equal(fabrica.daOrdem(retomada.id).contexto.retomarSessao, 'sessao-1')

  fabrica.daOrdem(retomada.id).contexto.ganchos.aoIniciarSessao({ sessaoId: 'sessao-1', modelo: 'opus' })
  await escritorio.pararOrdem(retomada.id)
  assert.equal(escritorio.retomarOrdem(retomada.id).instrucao, 'Continue de onde parou.')
})

test('aprovar o plano grava o modo aprovado na ordem e quem continua herda esse modo', async (t) => {
  const { escritorio, fabrica, eventos } = cenario(t).abrir()
  await escritorio.iniciar()
  const planejada = ordem(escritorio, { modo: 'plan' })
  const { ganchos } = fabrica.daOrdem(planejada.id).contexto
  ganchos.aoIniciarSessao({ sessaoId: 'sessao-plano', modelo: 'opus' })
  const sinal = new AbortController().signal

  const ajuste = ganchos.pedirAoHumano(PEDIDO_PLANO, sinal)
  escritorio.responderPendencia(abertaUnica(escritorio).id, { decisao: 'ajustar', mensagem: 'Mais curto' })
  await ajuste
  assert.equal(detalhe(escritorio, planejada.id).ordem.modo, 'plan')

  const aprovacao = ganchos.pedirAoHumano(PEDIDO_PLANO, sinal)
  eventos.length = 0
  escritorio.responderPendencia(abertaUnica(escritorio).id, { decisao: 'aprovar' })
  await aprovacao
  assert.equal(detalhe(escritorio, planejada.id).ordem.modo, 'default')
  assert.ok(eventos.some((evento) => evento.tipo === 'ordem' && evento.dados.id === planejada.id && evento.dados.modo === 'default'))
  assert.equal(fabrica.daOrdem(planejada.id).contexto.ordem.modo, 'plan')

  fabrica.daOrdem(planejada.id).terminar({ status: 'erro', erro: 'caiu' })
  const retomada = escritorio.retomarOrdem(planejada.id)
  assert.equal(retomada.modo, 'default')
  assert.equal(fabrica.daOrdem(retomada.id).contexto.ordem.modo, 'default')

  const outra = ordem(escritorio, { agenteId: 'testador', modo: 'plan' })
  const editando = fabrica.daOrdem(outra.id).contexto.ganchos.pedirAoHumano(PEDIDO_PLANO, sinal)
  escritorio.responderPendencia(abertaUnica(escritorio).id, { decisao: 'aprovar_editando' })
  await editando
  assert.equal(detalhe(escritorio, outra.id).ordem.modo, 'bypassPermissions')
  fabrica.daOrdem(outra.id).terminar({ resultado: 'Pronto. Abro o PR?' })
  assert.equal(detalhe(escritorio, outra.id).ordem.modo, 'bypassPermissions')

  const permissao = ordem(escritorio, { agenteId: 'claude', modo: 'plan' })
  const pedido = fabrica.daOrdem(permissao.id).contexto.ganchos.pedirAoHumano(PEDIDO_PERMISSAO, sinal)
  escritorio.responderPendencia(abertaUnica(escritorio).id, { decisao: 'permitir' })
  await pedido
  assert.equal(detalhe(escritorio, permissao.id).ordem.modo, 'plan')
})

test('detalhe do agente e da ordem', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const atual = ordem(escritorio)
  const naFila = ordem(escritorio, { instrucao: 'Depois' })
  const { ganchos } = fabrica.daOrdem(atual.id).contexto
  for (let i = 0; i < 120; i++) ganchos.aoEvento('ferramenta', `Passo ${i}`)
  void ganchos.pedirAoHumano(PEDIDO_PERMISSAO, new AbortController().signal)

  const doAgente = escritorio.detalheAgente('revisora')
  assert.ok(doAgente)
  assert.equal(doAgente.agente.estado, 'aguardando')
  assert.equal(doAgente.ordemAtual?.id, atual.id)
  assert.deepEqual(doAgente.fila.map((item) => item.id), [naFila.id])
  assert.deepEqual(doAgente.historico, [])
  assert.equal(doAgente.perguntaFinal, null)
  assert.deepEqual(doAgente.totais, { historico: 0, concluidas: 0 })
  assert.equal(doAgente.pendencias.length, 1)
  assert.equal(doAgente.eventosAtuais.length, 100)
  assert.equal(doAgente.eventosAtuais.at(-1)?.tipo, 'pendencia')
  assert.equal(doAgente.eventosAtuais[0]?.texto, 'Passo 21')
  assert.equal(escritorio.detalheAgente('ninguem'), null)

  fabrica.daOrdem(atual.id).terminar()
  fabrica.daOrdem(naFila.id).terminar({ resultado: 'Segunda pronta.' })
  const depois = escritorio.detalheAgente('revisora')
  assert.equal(depois?.ordemAtual, null)
  assert.deepEqual(depois?.historico.map((item) => item.id), [naFila.id, atual.id])
  assert.deepEqual(depois?.totais, { historico: 2, concluidas: 2 })
  assert.deepEqual(depois?.pendencias, [])
  assert.equal(depois?.eventosAtuais.at(-1)?.texto, 'Segunda pronta.')

  const daOrdem = detalhe(escritorio, atual.id)
  assert.equal(daOrdem.agente.id, 'revisora')
  assert.equal(daOrdem.eventos.length, 122)
  assert.equal(daOrdem.pendencias[0]?.status, 'cancelada')
  assert.equal(escritorio.detalheOrdem('nao-existe'), null)
})

test('histórico do agente: totais sem o limite da lista e páginas mais antigas pelo cursor', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const recentesPrimeiro: string[] = []
  for (let i = 0; i < 103; i++) {
    const criada = ordem(escritorio, { instrucao: `Tarefa ${i}` })
    fabrica.daOrdem(criada.id).terminar(i % 25 === 0 ? { status: 'erro', erro: 'caiu' } : {})
    recentesPrimeiro.unshift(criada.id)
  }
  const rodando = ordem(escritorio, { instrucao: 'Rodando' })
  const cancelada = escritorio.cancelarOrdem(ordem(escritorio, { instrucao: 'Desisti' }).id)
  recentesPrimeiro.unshift(cancelada.id)
  const ids = (ordens: { id: string }[] | undefined) => ordens?.map((item) => item.id)

  const doAgente = escritorio.detalheAgente('revisora')
  assert.deepEqual(doAgente?.totais, { historico: 104, concluidas: 98 })
  assert.deepEqual(ids(doAgente?.historico), recentesPrimeiro.slice(0, 30))
  assert.deepEqual(escritorio.historicoDoAgente('revisora', null), doAgente?.historico)
  assert.deepEqual(ids(escritorio.historicoDoAgente('revisora', recentesPrimeiro[29] ?? '')), recentesPrimeiro.slice(30, 60))
  assert.deepEqual(ids(escritorio.historicoDoAgente('revisora', recentesPrimeiro[9] ?? '', 5)), recentesPrimeiro.slice(10, 15))
  assert.deepEqual(ids(escritorio.historicoDoAgente('revisora', recentesPrimeiro[99] ?? '')), recentesPrimeiro.slice(100))
  assert.deepEqual(escritorio.historicoDoAgente('revisora', recentesPrimeiro[103] ?? ''), [])
  assert.equal(escritorio.historicoDoAgente('revisora', null, 500).length, 100)
  assert.equal(escritorio.historicoDoAgente('revisora', null, 0).length, 1)
  assert.equal(escritorio.historicoDoAgente('revisora', null, 2.7).length, 2)
  assert.equal(escritorio.historicoDoAgente('revisora', null, Number.NaN).length, 30)
  assert.equal(escritorio.historicoDoAgente('revisora', '  ').length, 30)
  assert.deepEqual(escritorio.historicoDoAgente('testador', null), [])

  assert.throws(() => escritorio.historicoDoAgente('ninguem', null), falha(404, /^Agente não encontrado: ninguem$/))
  assert.throws(() => escritorio.historicoDoAgente('revisora', 'nao-existe'), falha(400, /histórico do agente/))
  assert.throws(() => escritorio.historicoDoAgente('revisora', rodando.id), falha(400, /histórico do agente/))
  assert.throws(() => escritorio.historicoDoAgente('testador', cancelada.id), falha(400, /histórico do agente/))
})

test('ordem da fila cuja pasta sumiu termina com erro claro, sem abrir o Claude Code', async (t) => {
  const { base, abrir } = cenario(t)
  const { escritorio, fabrica } = abrir()
  await escritorio.iniciar()
  const rodando = ordem(escritorio)
  const semPasta = ordem(escritorio, { projeto: 'beta', instrucao: 'Arrume o beta' })
  const depois = ordem(escritorio, { instrucao: 'Depois disso' })
  rmSync(join(base, 'projetos', 'beta'), { recursive: true })

  fabrica.daOrdem(rodando.id).terminar()
  const final = detalhe(escritorio, semPasta.id)
  const mensagem = `A pasta do projeto não existe mais: ${join(base, 'projetos', 'beta')}`
  assert.equal(final.ordem.status, 'erro')
  assert.equal(final.ordem.erro, mensagem)
  assert.equal(final.eventos.at(-1)?.texto, mensagem)
  assert.equal(fabrica.execucoes.some((execucao) => execucao.contexto.ordem.id === semPasta.id), false)
  assert.equal(detalhe(escritorio, depois.id).ordem.status, 'trabalhando')
  assert.throws(() => escritorio.retomarOrdem(semPasta.id), falha(400, /^Projeto não encontrado: /))
})

test('o evento de resultado não repete a última fala do agente', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir()
  await escritorio.iniciar()
  const finalDe = (dados: Partial<FimExecucao>, falas: string[] = []) => {
    const criada = ordem(escritorio)
    const { ganchos } = fabrica.daOrdem(criada.id).contexto
    for (const fala of falas) ganchos.aoEvento('texto', fala)
    ganchos.aoEvento('ferramenta', 'Lendo a.ts')
    fabrica.daOrdem(criada.id).terminar(dados)
    const final = detalhe(escritorio, criada.id)
    return { resultado: final.ordem.resultado, ultimo: [final.eventos.at(-1)?.tipo, final.eventos.at(-1)?.texto] }
  }

  assert.deepEqual(finalDe({ resultado: '  Pronto: mudei 3 arquivos.\n' }, ['Vou começar.', 'Pronto: mudei 3 arquivos.']), {
    resultado: 'Pronto: mudei 3 arquivos.',
    ultimo: ['resultado', 'Ordem concluída.'],
  })
  assert.deepEqual(finalDe({ resultado: 'Resumo final.' }, ['Resumo final.', 'Mais uma coisa.']).ultimo, ['resultado', 'Resumo final.'])
  assert.deepEqual(finalDe({ resultado: '   ' }, ['Feito.']).ultimo, ['resultado', 'Ordem concluída.'])
  const longa = `${'linha comprida '.repeat(700)}fim.`
  const comprida = finalDe({ resultado: longa }, [longa])
  assert.equal(comprida.resultado, longa)
  assert.deepEqual(comprida.ultimo, ['resultado', 'Ordem concluída.'])
  const outraLonga = finalDe({ resultado: `Outro começo. ${longa}` }, [longa]).ultimo
  assert.equal(outraLonga[0], 'resultado')
  assert.equal(outraLonga[1]?.length, 8000)
  assert.ok(outraLonga[1]?.startsWith('Outro começo.'))
})

test('o generalista leva o modelo configurado para ele', async (t) => {
  const { escritorio, fabrica } = cenario(t).abrir({ modeloGeneralista: 'sonnet' })
  await escritorio.iniciar()
  assert.equal(agenteDe(escritorio, 'claude').modelo, 'sonnet')
  assert.equal(agenteDe(escritorio, 'revisora').modelo, null)
  const criada = ordem(escritorio, { agenteId: 'claude' })
  assert.equal(fabrica.daOrdem(criada.id).contexto.agente.modelo, 'sonnet')
})

test('só emite agente quando o JSON dele muda', async (t) => {
  const { escritorio, fabrica, eventos } = cenario(t).abrir()
  await escritorio.iniciar()
  const criada = ordem(escritorio)
  const { ganchos } = fabrica.daOrdem(criada.id).contexto
  const tipos = (): string[] => eventos.splice(0).map((evento) => evento.tipo)
  tipos()

  ganchos.aoIniciarSessao({ sessaoId: 'sessao-1', modelo: 'sonnet' })
  assert.deepEqual(tipos(), ['ordem'])
  ganchos.aoAtividade('Lendo')
  assert.deepEqual(tipos(), ['ordem', 'agente'])
  ganchos.aoAtividade('Lendo')
  assert.deepEqual(tipos(), ['ordem'])
  ganchos.aoEvento('texto', 'oi')
  assert.deepEqual(tipos(), ['evento'])
  ganchos.aoTodos([{ conteudo: 'Ler', status: 'andamento' }])
  assert.deepEqual(tipos(), ['ordem', 'agente'])
})

test('eventos chegam pelo assinar e um ouvinte que lança não derruba o serviço', async (t) => {
  const erros = t.mock.method(console, 'error', () => {})
  const { escritorio, fabrica, eventos } = cenario(t).abrir()
  const pare = escritorio.assinar(() => {
    throw new Error('ouvinte quebrado')
  })
  await escritorio.iniciar()
  const criada = ordem(escritorio)
  assert.equal(criada.status, 'trabalhando')
  assert.ok(eventos.length > 0)
  assert.ok(erros.mock.callCount() > 0)
  pare()

  const recebidos: string[] = []
  const pareDeOuvir = escritorio.assinar((evento) => {
    recebidos.push(evento.tipo)
  })
  const { ganchos } = fabrica.daOrdem(criada.id).contexto
  ganchos.aoEvento('texto', 'oi')
  assert.deepEqual(recebidos, ['evento'])
  pareDeOuvir()
  ganchos.aoEvento('texto', 'de novo')
  assert.deepEqual(recebidos, ['evento'])
})

test('conta: atualizarConta e uso vindo da execução', async (t) => {
  const { escritorio, fabrica, eventos, config } = cenario(t).abrir()
  await escritorio.iniciar()
  assert.deepEqual(escritorio.estado().conta, {
    email: null,
    plano: null,
    autenticada: null,
    erro: null,
    uso: { status: null, cincoHoras: null, seteDias: null, reiniciaEm: null, atualizadoEm: null },
  })
  eventos.length = 0
  escritorio.atualizarConta({ email: 'eu@exemplo.com', plano: 'max', autenticada: true })
  const evento = eventos.at(-1)
  assert.ok(evento?.tipo === 'conta')
  assert.equal(evento.dados.email, 'eu@exemplo.com')
  assert.equal(evento.dados.plano, 'max')
  assert.equal(evento.dados.autenticada, true)

  const criada = ordem(escritorio)
  const { ganchos } = fabrica.daOrdem(criada.id).contexto
  ganchos.aoUsoConta({ status: 'allowed_warning', cincoHoras: 0.82 })
  ganchos.aoUsoConta({ seteDias: 0.4, reiniciaEm: '2026-10-29T15:00:00.000Z' })
  escritorio.atualizarConta({ autenticada: false, erro: 'Sem login' })
  const estado = escritorio.estado()
  assert.equal(estado.conta.email, 'eu@exemplo.com')
  assert.equal(estado.conta.autenticada, false)
  assert.equal(estado.conta.erro, 'Sem login')
  assert.equal(estado.conta.uso.status, 'allowed_warning')
  assert.equal(estado.conta.uso.cincoHoras, 0.82)
  assert.equal(estado.conta.uso.seteDias, 0.4)
  assert.equal(estado.conta.uso.reiniciaEm, '2026-10-29T15:00:00.000Z')
  assert.match(estado.conta.uso.atualizadoEm ?? '', /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(estado.servidor, {
    versao: '0.0.0-teste',
    simulado: true,
    maxSimultaneas: 4,
    conectoresClaudeAi: false,
    dirProjetos: config.dirProjetos,
    dirAgentes: config.dirAgentes,
    dirAgentesProjeto: config.dirAgentesProjeto,
  })
  assert.deepEqual(estado.projetos, [
    { nome: 'alfa', caminho: join(config.dirProjetos, 'alfa') },
    { nome: 'beta', caminho: join(config.dirProjetos, 'beta') },
  ])
})

test('falha ao criar ou iniciar a execução vira erro na ordem', async (t) => {
  const { abrir } = cenario(t)
  const quebrada = abrir({ fabrica: criarFabrica({ falharAoCriar: true }) })
  await quebrada.escritorio.iniciar()
  const criada = ordem(quebrada.escritorio)
  assert.equal(criada.status, 'erro')
  assert.equal(criada.erro, 'Não foi possível iniciar a ordem: não deu para abrir o processo')
  assert.equal(agenteDe(quebrada.escritorio, 'revisora').estado, 'erro')

  const natimorta = abrir({ fabrica: criarFabrica({ falharAoIniciar: true }) })
  await natimorta.escritorio.iniciar()
  const outra = ordem(natimorta.escritorio)
  assert.equal(outra.status, 'erro')
  assert.match(outra.erro ?? '', /o processo morreu ao nascer/)
})

test('recupera depois de reiniciar no mesmo arquivo de banco', async (t) => {
  const { base, abrir } = cenario(t)
  const caminhoBanco = join(base, 'dados', 'escritorio.db')
  const primeiro = abrir({ caminhoBanco, maxSimultaneas: 1 })
  await primeiro.escritorio.iniciar()
  const rodando = ordem(primeiro.escritorio, { modo: 'acceptEdits' })
  const { ganchos } = primeiro.fabrica.daOrdem(rodando.id).contexto
  ganchos.aoIniciarSessao({ sessaoId: 'sessao-longa', modelo: 'opus' })
  ganchos.aoAtividade('Editando')
  void ganchos.pedirAoHumano(PEDIDO_PERMISSAO, new AbortController().signal)
  const naFila = ordem(primeiro.escritorio, { agenteId: 'testador', instrucao: 'Depois disso' })
  assert.equal(naFila.status, 'na_fila')
  const pendencia = abertaUnica(primeiro.escritorio)

  const segundo = abrir({ caminhoBanco })
  assert.throws(
    () => segundo.escritorio.responderPendencia(pendencia.id, { decisao: 'permitir' }),
    falha(409, /^Essa pergunta expirou porque o servidor foi reiniciado\.$/),
  )
  assert.equal(detalhe(segundo.escritorio, rodando.id).pendencias[0]?.status, 'expirada')

  await segundo.escritorio.iniciar()
  const interrompida = detalhe(segundo.escritorio, rodando.id)
  assert.equal(interrompida.ordem.status, 'interrompida')
  assert.equal(interrompida.ordem.erro, 'O servidor foi reiniciado enquanto a ordem rodava.')
  assert.equal(interrompida.ordem.atividade, null)
  assert.ok(interrompida.ordem.finalizadaEm)
  assert.equal(interrompida.eventos.at(-1)?.texto, 'O servidor foi reiniciado enquanto a ordem rodava.')
  const revisora = agenteDe(segundo.escritorio, 'revisora')
  assert.equal(revisora.estado, 'interrompida')
  assert.equal(revisora.desde, interrompida.ordem.finalizadaEm)

  const execucao = segundo.fabrica.daOrdem(naFila.id)
  assert.equal(execucao.iniciada, true)
  assert.equal(detalhe(segundo.escritorio, naFila.id).ordem.status, 'trabalhando')
  assert.equal(agenteDe(segundo.escritorio, 'testador').estado, 'trabalhando')

  const retomada = segundo.escritorio.retomarOrdem(rodando.id)
  assert.equal(retomada.continuaDe, rodando.id)
  assert.equal(retomada.instrucao, 'Continue de onde parou.')
  assert.equal(retomada.sessaoId, 'sessao-longa')
  assert.equal(retomada.modo, 'acceptEdits')
  assert.equal(retomada.projeto, rodando.projeto)
  assert.equal(segundo.fabrica.daOrdem(retomada.id).contexto.retomarSessao, 'sessao-longa')
  assert.ok(detalhe(segundo.escritorio, rodando.id).ordem.vistaEm)
})

// Gatilho que faz o banco recusar a gravação do fim da ordem, como um disco cheio ou um banco travado por outro programa.
function travarFimDaOrdem(caminhoBanco: string, t: TestContext, soDaOrdem?: string) {
  const outra = new DatabaseSync(caminhoBanco)
  t.after(() => outra.close())
  const condicao = soDaOrdem ? ` AND NEW.id = '${soDaOrdem}'` : ''
  outra.exec(`CREATE TRIGGER falha_no_fim BEFORE UPDATE OF status ON ordens
    WHEN NEW.status IN ('concluida', 'erro', 'parada')${condicao} BEGIN SELECT RAISE(ABORT, 'disco cheio'); END`)
  return () => outra.exec('DROP TRIGGER falha_no_fim')
}

test('se o banco falha ao gravar o fim, o agente segue ocupado e o mesmo fim é gravado depois', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const erros = t.mock.method(console, 'error', () => {})
  const { base, abrir } = cenario(t)
  const caminhoBanco = join(base, 'dados', 'escritorio.db')
  const { escritorio, fabrica } = abrir({ caminhoBanco })
  await escritorio.iniciar()
  const primeira = ordem(escritorio)
  const segunda = ordem(escritorio, { instrucao: 'Depois disso' })
  const { ganchos } = fabrica.daOrdem(primeira.id).contexto
  ganchos.aoAtividade('Lendo package.json')
  const ultimoErro = () => String(erros.mock.calls.at(-1)?.arguments[0])

  let destravar = travarFimDaOrdem(caminhoBanco, t)
  fabrica.daOrdem(primeira.id).terminar({ resultado: 'Pronto.', custoUsd: 1.23 })
  assert.match(ultimoErro(), /não foi possível registrar o fim da ordem; tento de novo em 1 s/)
  ganchos.aoAtividade('depois do fim')
  assert.equal(detalhe(escritorio, primeira.id).ordem.status, 'trabalhando')
  assert.equal(detalhe(escritorio, primeira.id).ordem.atividade, 'Lendo package.json')
  assert.equal(detalhe(escritorio, segunda.id).ordem.status, 'na_fila')
  assert.equal(fabrica.execucoes.length, 1)
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'trabalhando')

  t.mock.timers.tick(1000)
  assert.match(ultimoErro(), /tento de novo em 2 s/)
  assert.equal(detalhe(escritorio, primeira.id).ordem.status, 'trabalhando')

  destravar()
  t.mock.timers.tick(2000)
  const final = detalhe(escritorio, primeira.id)
  assert.equal(final.ordem.status, 'concluida')
  assert.equal(final.ordem.resultado, 'Pronto.')
  assert.equal(final.ordem.custoUsd, 1.23)
  assert.equal(final.ordem.atividade, null)
  assert.deepEqual(final.eventos.filter((evento) => evento.tipo === 'resultado').map((evento) => evento.texto), ['Pronto.'])
  assert.equal(detalhe(escritorio, segunda.id).ordem.status, 'trabalhando')
  assert.equal(fabrica.execucoes.length, 2)

  // Parar enquanto o fim espera o banco grava o fim que a execução avisou, em vez de parar a ordem.
  destravar = travarFimDaOrdem(caminhoBanco, t)
  fabrica.daOrdem(segunda.id).terminar({ resultado: 'Segunda pronta.' })
  assert.equal((await escritorio.pararOrdem(segunda.id)).status, 'trabalhando')
  destravar()
  const parada = await escritorio.pararOrdem(segunda.id)
  assert.equal(parada.status, 'concluida')
  assert.equal(parada.resultado, 'Segunda pronta.')
  assert.equal(fabrica.daOrdem(segunda.id).paradas, 0)
  t.mock.timers.tick(60_000)
  assert.equal(detalhe(escritorio, segunda.id).eventos.filter((evento) => evento.tipo === 'resultado').length, 1)
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'concluiu')
})

test('parar com o banco recusando a gravação para a execução e grava o fim quando o banco volta', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const erros = t.mock.method(console, 'error', () => {})
  const { base, abrir } = cenario(t)
  const caminhoBanco = join(base, 'dados', 'escritorio.db')
  const { escritorio, fabrica } = abrir({ caminhoBanco })
  await escritorio.iniciar()
  const rodando = ordem(escritorio)
  const naFila = ordem(escritorio, { instrucao: 'Depois disso' })
  const pedido = fabrica.daOrdem(rodando.id).contexto.ganchos.pedirAoHumano(PEDIDO_PERMISSAO, new AbortController().signal)
  const pendencia = abertaUnica(escritorio)
  const outra = new DatabaseSync(caminhoBanco)
  t.after(() => outra.close())
  outra.exec(`CREATE TRIGGER falha_nos_pedidos BEFORE UPDATE OF status ON pendencias
    BEGIN SELECT RAISE(ABORT, 'banco travado'); END`)
  const mensagens = () => erros.mock.calls.map((chamada) => String(chamada.arguments[0]))

  const durante = await escritorio.pararOrdem(rodando.id)
  assert.equal(durante.status, 'aguardando')
  assert.equal(fabrica.daOrdem(rodando.id).paradas, 1)
  assert.ok(mensagens().some((texto) => /não foi possível cancelar os pedidos ao parar a ordem/.test(texto)))
  assert.match(mensagens().at(-1) ?? '', /registrar o fim da ordem; tento de novo em 1 s/)
  assert.equal(detalhe(escritorio, naFila.id).ordem.status, 'na_fila')
  assert.equal((await escritorio.pararOrdem(rodando.id)).status, 'aguardando')

  outra.exec('DROP TRIGGER falha_nos_pedidos')
  t.mock.timers.tick(2000)
  const parada = detalhe(escritorio, rodando.id)
  assert.equal(parada.ordem.status, 'parada')
  assert.equal(parada.pendencias.find((item) => item.id === pendencia.id)?.status, 'cancelada')
  assert.equal(await pedido, null)
  assert.equal(fabrica.daOrdem(rodando.id).paradas, 1)
  assert.equal(detalhe(escritorio, naFila.id).ordem.status, 'trabalhando')
})

test('ao desligar, tenta gravar mais uma vez o fim que esperava o banco', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(console, 'error', () => {})
  const { base, abrir } = cenario(t)
  const caminhoBanco = join(base, 'dados', 'escritorio.db')
  const { escritorio, fabrica } = abrir({ caminhoBanco })
  await escritorio.iniciar()
  const gravada = ordem(escritorio)
  const perdida = ordem(escritorio, { agenteId: 'testador' })
  const destravar = travarFimDaOrdem(caminhoBanco, t)
  fabrica.daOrdem(gravada.id).terminar({ resultado: 'Pronto.' })
  fabrica.daOrdem(perdida.id).terminar({ resultado: 'Também pronto.' })
  destravar()
  travarFimDaOrdem(caminhoBanco, t, perdida.id)

  await escritorio.encerrar()
  t.mock.timers.tick(60_000)
  const banco = abrirBanco(caminhoBanco)
  t.after(() => banco.fechar())
  assert.equal(banco.obterOrdem(gravada.id)?.status, 'concluida')
  assert.equal(banco.obterOrdem(gravada.id)?.resultado, 'Pronto.')
  assert.equal(banco.obterOrdem(perdida.id)?.status, 'interrompida')
  assert.equal(banco.obterOrdem(perdida.id)?.erro, 'O servidor foi desligado enquanto a ordem rodava.')
})

test('encerrar interrompe o que roda, expira pendências e fecha o banco', async (t) => {
  const { base, abrir } = cenario(t)
  const caminhoBanco = join(base, 'dados', 'escritorio.db')
  const { escritorio, fabrica } = abrir({ caminhoBanco })
  await escritorio.iniciar()
  const rodando = ordem(escritorio)
  const execucao = fabrica.daOrdem(rodando.id)
  const promessa = execucao.contexto.ganchos.pedirAoHumano(PEDIDO_PERMISSAO, new AbortController().signal)
  const naFila = ordem(escritorio)

  await escritorio.encerrar()
  assert.equal(execucao.encerrada, true)
  assert.equal(await promessa, null)
  execucao.terminar()
  execucao.contexto.ganchos.aoEvento('texto', 'tarde demais')
  execucao.contexto.ganchos.aoUsoConta({ cincoHoras: 1 })
  escritorio.atualizarConta({ email: 'depois@exemplo.com' })
  assert.throws(() => escritorio.estado(), falha(409, /desligando/))
  assert.throws(() => ordem(escritorio), falha(409, /desligando/))
  await escritorio.encerrar()

  const banco = abrirBanco(caminhoBanco)
  t.after(() => banco.fechar())
  const final = banco.obterOrdem(rodando.id)
  assert.equal(final?.status, 'interrompida')
  assert.equal(final?.erro, 'O servidor foi desligado enquanto a ordem rodava.')
  assert.ok(final?.finalizadaEm)
  assert.equal(banco.listarPendencias({ ordemId: rodando.id })[0]?.status, 'expirada')
  assert.equal(banco.obterOrdem(naFila.id)?.status, 'na_fila')
  assert.equal(banco.listarEventos(rodando.id, 10).some((evento) => evento.texto === 'tarde demais'), false)
})

test('recarrega os agentes quando a pasta muda e mantém o histórico de quem saiu', async (t) => {
  const { base, abrir } = cenario(t)
  const { escritorio, fabrica, eventos } = abrir()
  await escritorio.iniciar()
  const doTestador = ordem(escritorio, { agenteId: 'testador' })
  fabrica.daOrdem(doTestador.id).terminar()
  eventos.length = 0
  const ultimoEstado = () => eventos.filter((evento) => evento.tipo === 'estado').at(-1)
  const ids = () => {
    const evento = ultimoEstado()
    return evento?.tipo === 'estado' ? evento.dados.agentes.map((agente) => agente.id) : []
  }

  writeFileSync(join(base, 'agentes', 'nova.md'), '---\nname: Nova Agente\ndescription: Chegou agora.\n---\n')
  await esperar(() => ids().includes('nova-agente'))
  assert.deepEqual(ids(), ['claude', 'nova-agente', 'revisora', 'testador'])

  unlinkSync(join(base, 'agentes', 'testador.md'))
  await esperar(() => !ids().includes('testador'))
  assert.deepEqual(escritorio.estado().agentes.map((agente) => agente.id), ['claude', 'nova-agente', 'revisora'])
  assert.equal(escritorio.detalheAgente('testador'), null)
  assert.equal(detalhe(escritorio, doTestador.id).agente.nome, 'testador')
  assert.throws(() => ordem(escritorio, { agenteId: 'testador' }), falha(404, /Agente não encontrado/))

  const quantos = eventos.filter((evento) => evento.tipo === 'estado').length
  writeFileSync(join(base, 'agentes', 'nova.md'), '---\nname: Nova Agente\ndescription: Chegou agora.\n---\n')
  await new Promise((resolver) => setTimeout(resolver, 900))
  assert.equal(eventos.filter((evento) => evento.tipo === 'estado').length, quantos)
})

test('aguenta a pasta de agentes ausente e passa a vigiar quando ela aparece', async (t) => {
  const { base, abrir } = cenario(t)
  const dirAgentes = join(base, 'agentes-depois')
  const { escritorio, eventos } = abrir({ dirAgentes })
  await escritorio.iniciar()
  assert.deepEqual(escritorio.estado().agentes.map((agente) => agente.id), ['claude'])
  const temAgente = (id: string) => eventos.some((evento) => evento.tipo === 'estado'
    && evento.dados.agentes.some((agente) => agente.id === id))

  mkdirSync(dirAgentes)
  writeFileSync(join(dirAgentes, 'tardia.md'), '---\nname: Tardia\n---\n')
  await esperar(() => temAgente('tardia'), 6000)
  writeFileSync(join(dirAgentes, 'outra.md'), '---\nname: Outra\n---\n')
  await esperar(() => temAgente('outra'))
  assert.deepEqual(escritorio.estado().agentes.map((agente) => agente.id), ['claude', 'outra', 'tardia'])

  rmSync(dirAgentes, { recursive: true, force: true })
  await esperar(() => escritorio.estado().agentes.length === 1)
  mkdirSync(dirAgentes)
  writeFileSync(join(dirAgentes, 'volta.md'), '---\nname: Volta\n---\n')
  await esperar(() => temAgente('volta'), 6000)
  assert.deepEqual(escritorio.estado().agentes.map((agente) => agente.id), ['claude', 'volta'])
})

// ───────────────────────────── sala de reunião ─────────────────────────────

test('abrir a reunião é idempotente e a sala começa vazia', async (t) => {
  const { abrir } = cenario(t)
  const { escritorio, eventos } = abrir()
  await escritorio.iniciar()
  assert.equal(escritorio.reuniaoAberta(), null)
  assert.equal(escritorio.estado().reuniao, null)

  const primeira = escritorio.abrirReuniao()
  assert.deepEqual(primeira.convocados, [])
  assert.deepEqual(primeira.recados, [])
  assert.equal(escritorio.abrirReuniao().id, primeira.id, 'clicar de novo na mesa abriu outra reunião')
  assert.equal(escritorio.estado().reuniao?.id, primeira.id)
  assert.ok(eventos.some((evento) => evento.tipo === 'reuniao'), 'a reunião não foi avisada pelo tempo real')
})

test('convocar senta cada agente numa cadeira só, e a mesa enche nas sete', async (t) => {
  const { base, abrir } = cenario(t)
  for (let i = 0; i < 8; i++) {
    writeFileSync(join(base, 'agentes', `extra${i}.md`), `---\nname: Extra ${i}\ndescription: Enche a mesa.\n---\n`)
  }
  const { escritorio } = abrir()
  await escritorio.iniciar()
  escritorio.abrirReuniao()

  const reuniao = escritorio.convocarLivresParaReuniao()
  assert.equal(reuniao.convocados.length, 7, 'a mesa de reunião tem sete cadeiras para agentes')
  const cadeiras = reuniao.convocados.map((convocado) => convocado.vagaId)
  assert.deepEqual([...new Set(cadeiras)].sort(), cadeiras.slice().sort(), 'dois agentes na mesma cadeira')
  assert.deepEqual(cadeiras.slice().sort(), ['reuniao:0', 'reuniao:1', 'reuniao:2', 'reuniao:3', 'reuniao:4', 'reuniao:5', 'reuniao:6'])

  const deFora = escritorio.estado().agentes.find((agente) => !cadeiras.includes(agente.reuniao?.vagaId ?? ''))
  assert.ok(deFora, 'com mais de sete agentes, alguém tinha de ficar fora')
  assert.throws(() => escritorio.convocarParaReuniao(deFora.id), falha(409, /já está com 7 agentes/))

  // Chamar de novo quem já está sentado não tira ninguém do lugar nem abre cadeira nova.
  const jaSentado = reuniao.convocados[0]
  assert.ok(jaSentado)
  const depois = escritorio.convocarParaReuniao(jaSentado.agenteId)
  assert.equal(depois.convocados.length, 7)
  assert.equal(depois.convocados.find((c) => c.agenteId === jaSentado.agenteId)?.vagaId, jaSentado.vagaId)
})

test('a reunião recusa quem está com uma ordem sua, e a ordem nova tira da mesa quem já estava nela', async (t) => {
  const { abrir } = cenario(t)
  const { escritorio } = abrir()
  await escritorio.iniciar()
  escritorio.abrirReuniao()

  ordem(escritorio, { agenteId: 'revisora' })
  assert.equal(agenteDe(escritorio, 'revisora').estado, 'trabalhando')
  assert.throws(() => escritorio.convocarParaReuniao('revisora'), falha(409, /está com uma ordem sua/))
  assert.deepEqual(escritorio.reuniaoAberta()?.convocados, [])

  escritorio.convocarParaReuniao('testador')
  assert.equal(agenteDe(escritorio, 'testador').reuniao?.vagaId, 'reuniao:0')
  ordem(escritorio, { agenteId: 'testador' })
  assert.equal(agenteDe(escritorio, 'testador').reuniao, null, 'a ordem do humano não tirou o agente da reunião')
  assert.deepEqual(escritorio.reuniaoAberta()?.convocados, [])
})

test('dispensar tira um; encerrar solta todos e fecha a sala', async (t) => {
  const { abrir } = cenario(t)
  const { escritorio } = abrir()
  await escritorio.iniciar()
  escritorio.abrirReuniao()
  escritorio.convocarLivresParaReuniao()
  const dentro = escritorio.reuniaoAberta()?.convocados.map((c) => c.agenteId) ?? []
  assert.ok(dentro.length >= 2, 'o cenário precisa de pelo menos dois agentes livres')

  const [primeiro] = dentro
  assert.ok(primeiro)
  const depois = escritorio.dispensarDaReuniao(primeiro)
  assert.ok(!depois.convocados.some((c) => c.agenteId === primeiro))
  assert.equal(agenteDe(escritorio, primeiro).reuniao, null)
  // Dispensar quem já saiu não quebra nada.
  assert.equal(escritorio.dispensarDaReuniao(primeiro).convocados.length, depois.convocados.length)

  escritorio.encerrarReuniao()
  assert.equal(escritorio.reuniaoAberta(), null)
  assert.equal(escritorio.estado().reuniao, null)
  for (const agente of escritorio.estado().agentes) assert.equal(agente.reuniao, null, agente.id)
  assert.throws(() => escritorio.convocarParaReuniao('revisora'), falha(409, /Não há reunião aberta/))
  // Encerrar de novo não é erro: o botão pode ser clicado duas vezes.
  escritorio.encerrarReuniao()
})

test('o recado vai para quem estava na sala e entra na próxima ordem de cada um, uma vez só', async (t) => {
  const { abrir } = cenario(t)
  const { escritorio } = abrir()
  await escritorio.iniciar()
  escritorio.abrirReuniao()
  assert.throws(() => escritorio.darRecadoNaReuniao('ninguém aqui'), falha(409, /Chame alguém para a mesa/))

  escritorio.convocarParaReuniao('revisora')
  assert.throws(() => escritorio.darRecadoNaReuniao('   '), falha(400, /Escreva o recado/))
  assert.throws(() => escritorio.darRecadoNaReuniao('x'.repeat(4001)), falha(400, /passou de/))

  const comRecado = escritorio.darRecadoNaReuniao('  Todo PR precisa de teste.  ')
  assert.equal(comRecado.recados.length, 1)
  assert.equal(comRecado.recados[0]?.texto, 'Todo PR precisa de teste.')
  assert.deepEqual(comRecado.recados[0]?.paraIds, ['revisora'])

  // Quem não estava na sala não leva recado nenhum.
  assert.equal(ordem(escritorio, { agenteId: 'testador' }).recado, null)
  const primeira = ordem(escritorio, { agenteId: 'revisora' })
  assert.equal(primeira.recado, 'Todo PR precisa de teste.')
  assert.equal(escritorio.detalheOrdem(primeira.id)?.ordem.recado, 'Todo PR precisa de teste.')

  // O recado é de uma ordem só: a seguinte já vai limpa.
  assert.equal(ordem(escritorio, { agenteId: 'revisora' }).recado, null)
})

test('só o último recado pendente entra na ordem, e continuar a conversa não gasta nenhum', async (t) => {
  const { abrir } = cenario(t)
  const { escritorio, fabrica } = abrir()
  await escritorio.iniciar()
  escritorio.abrirReuniao()
  escritorio.convocarParaReuniao('revisora')
  escritorio.darRecadoNaReuniao('Primeiro recado.')
  escritorio.darRecadoNaReuniao('Segundo recado, que vale.')

  const anterior = ordem(escritorio, { agenteId: 'revisora' })
  assert.equal(anterior.recado, 'Segundo recado, que vale.', 'o recado que entrou não foi o mais novo')

  const execucao = fabrica.daOrdem(anterior.id)
  execucao.contexto.ganchos.aoIniciarSessao({ sessaoId: 'sessao-1', modelo: 'claude' })
  execucao.terminar()
  await esperar(() => escritorio.detalheOrdem(anterior.id)?.ordem.status === 'concluida')

  // Numa continuação o agente já está na mesma sessão: o recado novo fica guardado para a próxima ordem de verdade.
  escritorio.convocarParaReuniao('revisora')
  escritorio.darRecadoNaReuniao('Recado da segunda reunião.')
  const continuacao = escritorio.criarOrdem({ agenteId: 'revisora', projeto: 'alfa', instrucao: 'Siga', continuaDe: anterior.id })
  assert.equal(continuacao.recado, null, 'a continuação gastou o recado sem mostrá-lo')
  // E o recado velho, já consumido, nunca volta.
  assert.equal(ordem(escritorio, { agenteId: 'revisora' }).recado, 'Recado da segunda reunião.')
})

test('a reunião e quem está nela sobrevivem a um reinício do servidor', async (t) => {
  const { base, abrir } = cenario(t)
  const caminhoBanco = join(base, 'dados', 'reuniao.db')
  const antes = abrir({ caminhoBanco })
  await antes.escritorio.iniciar()
  antes.escritorio.abrirReuniao()
  antes.escritorio.convocarParaReuniao('revisora')
  antes.escritorio.darRecadoNaReuniao('Guarde isto.')
  const id = antes.escritorio.reuniaoAberta()?.id
  await antes.escritorio.encerrar()

  const depois = abrir({ caminhoBanco })
  await depois.escritorio.iniciar()
  const reaberta = depois.escritorio.reuniaoAberta()
  assert.equal(reaberta?.id, id)
  assert.deepEqual(reaberta?.convocados.map((c) => [c.agenteId, c.vagaId]), [['revisora', 'reuniao:0']])
  assert.equal(reaberta?.recados[0]?.texto, 'Guarde isto.')
  assert.equal(agenteDe(depois.escritorio, 'revisora').reuniao?.vagaId, 'reuniao:0')
  // E o recado continua esperando a próxima ordem.
  assert.equal(ordem(depois.escritorio, { agenteId: 'revisora' }).recado, 'Guarde isto.')
})
