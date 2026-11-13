import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import { serve } from '@hono/node-server'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { criarApp } from '../src/http.ts'
import { encontrarAgente, finalDoTexto } from '../src/mcp.ts'
import { montarMundo } from '../src/mundo.ts'
import { ErroEscritorio } from '../src/tipos.ts'
import type { AgenteComEstado, Config, DetalheAgente, Escritorio, EstadoDaVida, Evento, NovaOrdem, Ordem, Pendencia, RespostaPendencia } from '../src/tipos.ts'

const CHAVE = 'chave-de-teste-mcp-0123456789abcdef'

// O estado da vida num escritório de mentira: desligada e sem ninguém.
function estadoDaVidaFalso(): EstadoDaVida {
  return {
    ligada: false, disponivel: false, motivoPausa: null, explicacao: null, banda: 'normal',
    oficinaDisponivel: false, modelo: 'haiku', intervaloMs: 25_000, ligadaEm: null, decisoesNaHora: 0,
    custoUsdDoDia: 0, tetoCustoUsdDoDia: 1, vivos: 0, pasta: '/tmp/agentes-projeto', agentes: [],
  }
}

function criarEscritorioFalso() {
  const chamadas: Array<[string, ...unknown[]]> = []
  const ordem: Ordem = {
    id: 'ordem-1',
    agenteId: 'agente-rds',
    projeto: '/home/ana/projects/loja',
    instrucao: 'Conferir os índices',
    modo: 'default',
    status: 'aguardando',
    sessaoId: 'sessao-1',
    continuaDe: null,
    modelo: 'claude-opus-5-5',
    atividade: 'Lendo o schema',
    recado: null,
    todos: [{ conteudo: 'Ler o schema', status: 'andamento', ativo: 'Lendo o schema' }],
    resultado: null,
    erro: null,
    aguardaResposta: false,
    custoUsd: null,
    turnos: null,
    duracaoMs: null,
    tokensEntrada: null,
    tokensSaida: null,
    criadaEm: '2026-10-29T12:00:00.000Z',
    iniciadaEm: '2026-10-29T12:00:01.000Z',
    finalizadaEm: null,
    vistaEm: null,
  }
  const ordemPergunta: Ordem = {
    ...ordem,
    id: 'ordem-pergunta',
    agenteId: 'claude',
    instrucao: 'Revise o projeto',
    modo: 'acceptEdits',
    status: 'concluida',
    atividade: null,
    recado: null,
    todos: null,
    resultado: `Revisei o projeto.\n\n${'Detalhe da revisão. '.repeat(40).trim()}\n\nQuer que eu já abra o PR?`,
    aguardaResposta: true,
    finalizadaEm: '2026-10-29T12:10:00.000Z',
  }
  const ordemNaFila: Ordem = { ...ordem, id: 'ordem-fila', instrucao: 'Atualizar as estatísticas', status: 'na_fila', sessaoId: null, atividade: null, iniciadaEm: null }
  const base = {
    descricao: 'x',
    modelo: null,
    cor: '#60a5fa',
    ferramentas: null,
    memoria: null,
    arquivo: null,
    origem: null,
    desde: null,
    ultimaOrdem: null,
    fila: 0,
    pendencias: 0,
    vida: null,
    reuniao: null,
  }
  const agentes: AgenteComEstado[] = [
    {
      ...base,
      id: 'claude',
      nome: 'Claude',
      apelido: 'Claude',
      generalista: true,
      estado: 'aguardando',
      desde: ordemPergunta.finalizadaEm,
      ordemAtual: null,
      ultimaOrdem: {
        id: 'ordem-pergunta',
        agenteId: 'claude',
        projeto: '/home/ana/projects/loja',
        projetoNome: 'loja',
        instrucao: 'Revise o projeto',
        modo: 'acceptEdits',
        status: 'concluida',
        atividade: null,
        aguardaResposta: true,
        continuaDe: null,
        todosFeitos: 0,
        todosTotal: 0,
        criadaEm: ordemPergunta.criadaEm,
        iniciadaEm: ordemPergunta.iniciadaEm,
        finalizadaEm: ordemPergunta.finalizadaEm,
        vistaEm: null,
      },
    },
    {
      ...base,
      id: 'agente-rds',
      nome: 'Agente-RDS',
      apelido: 'RDS',
      generalista: false,
      estado: 'aguardando',
      desde: '2026-10-29T12:00:02.000Z',
      fila: 1,
      pendencias: 1,
      vida: null,
      reuniao: null,
      ordemAtual: {
        id: 'ordem-1',
        agenteId: 'agente-rds',
        projeto: '/home/ana/projects/loja',
        projetoNome: 'loja',
        instrucao: 'Conferir os índices',
        modo: 'default',
        status: 'aguardando',
        atividade: 'Lendo o schema',
        aguardaResposta: false,
        continuaDe: null,
        todosFeitos: 0,
        todosTotal: 1,
        criadaEm: ordem.criadaEm,
        iniciadaEm: ordem.iniciadaEm,
        finalizadaEm: null,
        vistaEm: null,
      },
    },
  ]
  const pendencia: Pendencia = {
    id: 'pend-1',
    ordemId: 'ordem-1',
    agenteId: 'agente-rds',
    tipo: 'pergunta',
    ferramenta: 'AskUserQuestion',
    titulo: 'Tem uma pergunta para você',
    descricao: null,
    entrada: { questions: [{ question: 'Qual banco?', header: 'Banco', multiSelect: false, options: [{ label: 'staging', description: '' }, { label: 'prod', description: '' }] }] },
    permiteSempre: false,
    caminhoBloqueado: null,
    status: 'aberta',
    resposta: null,
    criadaEm: '2026-10-29T12:00:02.000Z',
    respondidaEm: null,
  }
  const eventos: Evento[] = Array.from({ length: 25 }, (_, i) => ({
    id: i + 1,
    ordemId: 'ordem-1',
    tipo: 'ferramenta',
    texto: `Passo ${i + 1}`,
    detalhe: null,
    criadoEm: '2026-10-29T12:00:03.000Z',
  }))
  const detalhes: Record<string, Omit<DetalheAgente, 'agente'>> = {
    'claude': { ordemAtual: null, fila: [], historico: [ordemPergunta], perguntaFinal: ordemPergunta, totais: { historico: 1, concluidas: 1 }, pendencias: [], eventosAtuais: [] },
    'agente-rds': { ordemAtual: ordem, fila: [ordemNaFila], historico: [], perguntaFinal: null, totais: { historico: 0, concluidas: 0 }, pendencias: [pendencia], eventosAtuais: [] },
  }
  const escritorio: Escritorio = {
    iniciar: async () => {},
    encerrar: async () => {},
    estado: () => ({
      agentes,
      projetos: [{ nome: 'loja', caminho: '/home/ana/projects/loja' }],
      conta: { email: null, plano: null, autenticada: null, erro: null, uso: { status: null, cincoHoras: null, seteDias: null, reiniciaEm: null, atualizadoEm: null } },
      vida: {
        ligada: false, disponivel: false, motivoPausa: null, explicacao: null, banda: 'normal',
        oficinaDisponivel: false, modelo: 'haiku', intervaloMs: 25_000, ligadaEm: null, decisoesNaHora: 0,
        custoUsdDoDia: 0, tetoCustoUsdDoDia: 1, vivos: 0, pasta: '/tmp/agentes-projeto', agentes: [],
      },
      servidor: { versao: '0.1.0', simulado: true, maxSimultaneas: 4, conectoresClaudeAi: false, dirProjetos: '/home/ana/projects', dirAgentes: '/x', dirAgentesProjeto: '/x/agentes-projeto' },
      reuniao: null,
    }),
    detalheAgente: (id) => {
      const agente = agentes.find((a) => a.id === id)
      const detalhe = detalhes[id]
      return agente && detalhe ? { agente, ...detalhe } : null
    },
    historicoDoAgente: () => [],
    detalheOrdem: (id) => {
      if (id === 'ordem-1') return { ordem, agente: agentes[1]!, eventos, pendencias: [pendencia, { ...pendencia, id: 'pend-0', status: 'respondida' }], cadeia: [] }
      if (id === 'ordem-pergunta') return { ordem: ordemPergunta, agente: agentes[0]!, eventos: [], pendencias: [], cadeia: [] }
      return null
    },
    criarOrdem: (nova: NovaOrdem) => {
      chamadas.push(['criarOrdem', nova])
      if (nova.projeto === 'nao-existe') throw new ErroEscritorio(400, 'Projeto não encontrado: nao-existe')
      return {
        ...ordem,
        id: 'ordem-nova',
        agenteId: nova.agenteId,
        projeto: '/home/ana/projects/loja',
        instrucao: nova.instrucao,
        modo: nova.modo ?? 'default',
        status: 'trabalhando',
        continuaDe: nova.continuaDe ?? null,
      }
    },
    pararOrdem: async (id) => {
      if (id !== 'ordem-1') throw new ErroEscritorio(409, 'A ordem não está rodando.')
      return { ...ordem, status: 'parada' }
    },
    cancelarOrdem: (id) => {
      chamadas.push(['cancelarOrdem', id])
      if (id !== 'ordem-fila') throw new ErroEscritorio(409, 'Só dá para cancelar uma ordem que ainda está na fila.')
      return { ...ordemNaFila, status: 'cancelada' }
    },
    retomarOrdem: (id, instrucao) => {
      chamadas.push(['retomarOrdem', id, instrucao])
      if (id !== 'ordem-interrompida') throw new ErroEscritorio(409, 'Só dá para retomar uma ordem interrompida, parada ou com erro.')
      return { ...ordem, id: 'ordem-retomada', agenteId: 'claude', status: 'na_fila', continuaDe: id, instrucao: instrucao ?? 'Continue de onde parou.' }
    },
    marcarVista: () => {},
    dispensarResposta: (id) => {
      chamadas.push(['dispensarResposta', id])
    },
    responderPendencia: (id, resposta: RespostaPendencia) => {
      chamadas.push(['responderPendencia', id, resposta])
      if (id !== 'pend-1') throw new ErroEscritorio(409, 'Essa pendência já foi respondida.')
      return { ...pendencia, status: 'respondida', resposta }
    },
    pendenciasAbertas: () => [pendencia],
    atualizarConta: () => {},
    ligarVida: () => estadoDaVidaFalso(),
    estadoDaVida: () => estadoDaVidaFalso(),
    mundoDaVida: () => montarMundo(0),
    forcarVontade: () => {
      throw new ErroEscritorio(409, 'Este escritório de teste não tem vida.')
    },
    vontadesDoAgente: () => [],
    eventosDaVida: () => [],
    falasDaVida: () => [],
    pausarVidaDoAgente: () => null,
    // O MCP não mexe na sala de reunião: aqui ela só existe para o tipo fechar.
    reuniaoAberta: () => null,
    abrirReuniao: () => {
      throw new ErroEscritorio(409, 'Este escritório de teste não tem reunião.')
    },
    convocarParaReuniao: () => {
      throw new ErroEscritorio(409, 'Este escritório de teste não tem reunião.')
    },
    convocarLivresParaReuniao: () => {
      throw new ErroEscritorio(409, 'Este escritório de teste não tem reunião.')
    },
    dispensarDaReuniao: () => {
      throw new ErroEscritorio(409, 'Este escritório de teste não tem reunião.')
    },
    darRecadoNaReuniao: () => {
      throw new ErroEscritorio(409, 'Este escritório de teste não tem reunião.')
    },
    encerrarReuniao: () => {},
    assinar: () => () => {},
  }
  return { escritorio, chamadas, agentes }
}

const config: Config = {
  porta: 0,
  host: '127.0.0.1',
  dirDados: '/tmp/x',
  dirProjetos: '/tmp',
  dirAgentes: '/tmp',
  dirAgentesProjeto: '/tmp/agentes-projeto',
  dirWeb: '/tmp/sem-dist-para-o-teste-mcp',
  maxSimultaneas: 4,
  conectoresClaudeAi: false,
  usarApiKey: false,
  simulado: true,
  modeloGeneralista: null,
  token: CHAVE,
  versao: '0.1.0',
  dirVida: '/tmp/vida',
  modeloVida: 'haiku',
  intervaloVidaMs: 25_000,
  maxNoLote: 4,
  tetoCustoUsdDoDia: 1,
  tetoHorasVida: 4,
  vidaNoBoot: false,
}

type Conteudo = Array<{ type: string; text: string }>

function textoDe(resultado: unknown): string {
  return ((resultado as { content?: Conteudo }).content ?? []).map((c) => c.text).join('')
}

describe('MCP do escritório', () => {
  const falso = criarEscritorioFalso()
  let servidor: Server
  let url: URL
  let cliente: Client

  before(async () => {
    const app = criarApp(falso.escritorio, config)
    servidor = await new Promise<Server>((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => resolve(s as Server)) as Server
    })
    url = new URL(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}/mcp`)
    cliente = new Client({ name: 'teste', version: '0.0.0' })
    await cliente.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${CHAVE}` } } }))
  })

  after(async () => {
    await cliente.close()
    servidor.closeAllConnections()
    await new Promise((resolve) => servidor.close(resolve))
  })

  it('sem a chave o cliente recebe 401', async () => {
    const anonimo = new Client({ name: 'anonimo', version: '0.0.0' })
    await assert.rejects(anonimo.connect(new StreamableHTTPClientTransport(url)), (erro: unknown) => erro instanceof StreamableHTTPError && erro.code === 401)
    const errado = new Client({ name: 'errado', version: '0.0.0' })
    await assert.rejects(
      errado.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: 'Bearer errada' } } })),
      (erro: unknown) => erro instanceof StreamableHTTPError && erro.code === 401,
    )
  })

  it('lista as ferramentas do escritório, as das ordens e as da vida', async () => {
    const { tools } = await cliente.listTools()
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      'cancelar_ordem',
      'dispensar_pergunta',
      'enviar_ordem',
      'ligar_vida',
      'listar_agentes',
      'listar_mundo',
      'listar_pendencias',
      'listar_projetos',
      'mandar_vontade',
      'parar_ordem',
      'pausar_vida_do_agente',
      'responder_pendencia',
      'retomar_ordem',
      'ver_ordem',
      'ver_vida',
      'vontades_do_agente',
    ])
    const enviar = tools.find((t) => t.name === 'enviar_ordem')
    assert.deepEqual([...(enviar?.inputSchema.required ?? [])].sort(), ['agente', 'instrucao'])
    assert.ok(enviar?.inputSchema.properties?.continuaDe)
    const retomar = tools.find((t) => t.name === 'retomar_ordem')
    assert.deepEqual(retomar?.inputSchema.required, ['id'])
  })

  it('listar_agentes traz estado, projeto, atividade, fila, pendências, última ordem e a pergunta final', async () => {
    const resultado = await cliente.callTool({ name: 'listar_agentes', arguments: {} })
    assert.equal(resultado.isError, undefined)
    const agentes = JSON.parse(textoDe(resultado)) as Array<Record<string, unknown>>
    assert.deepEqual(agentes.map((a) => a.id), ['claude', 'agente-rds'])
    assert.deepEqual(agentes[1], {
      id: 'agente-rds',
      nome: 'Agente-RDS',
      apelido: 'RDS',
      estado: 'aguardando',
      desde: '2026-10-29T12:00:02.000Z',
      projeto: '/home/ana/projects/loja',
      ordemAtual: { id: 'ordem-1', status: 'aguardando', modo: 'default', instrucao: 'Conferir os índices' },
      atividade: 'Lendo o schema',
      fila: 1,
      ordensNaFila: [{ id: 'ordem-fila', instrucao: 'Atualizar as estatísticas' }],
      pendencias: 1,
      ultimaOrdem: null,
      perguntaFinal: null,
    })
    assert.deepEqual(agentes[0]?.ultimaOrdem, { id: 'ordem-pergunta', status: 'concluida', instrucao: 'Revise o projeto', finalizadaEm: '2026-10-29T12:10:00.000Z' })
    assert.deepEqual(agentes[0]?.perguntaFinal, { ordemId: 'ordem-pergunta', pergunta: '…Quer que eu já abra o PR?' })
  })

  it('finalDoTexto guarda o fim do resultado, começando numa linha inteira quando corta', () => {
    assert.equal(finalDoTexto('  Quer que eu abra o PR?  ', 500), 'Quer que eu abra o PR?')
    assert.equal(finalDoTexto(`${'a'.repeat(30)}\nb\nQual opção?`, 20), '…b\nQual opção?')
    const semQuebra = finalDoTexto(`${'x'.repeat(30)} Qual opção?`, 20)
    assert.equal(semQuebra, `…${'x'.repeat(7)} Qual opção?`)
    assert.equal(semQuebra.length, 20)
    assert.equal(finalDoTexto(`${'x'.repeat(30)}😀 ok?`, 6), '…ok?')
    assert.equal(finalDoTexto(`${'x'.repeat(30)}😀ok?`, 5), '…ok?')
    assert.equal(finalDoTexto(`${'x'.repeat(30)}😀ok?`, 6), '…😀ok?')
    assert.equal(finalDoTexto(`${'x'.repeat(30)}\n`, 10), `…${'x'.repeat(9)}`)
  })

  it('listar_projetos', async () => {
    const resultado = await cliente.callTool({ name: 'listar_projetos', arguments: {} })
    assert.deepEqual(JSON.parse(textoDe(resultado)), [{ nome: 'loja', caminho: '/home/ana/projects/loja' }])
  })

  it('enviar_ordem acha o agente pelo nome sem diferenciar maiúsculas', async () => {
    const resultado = await cliente.callTool({ name: 'enviar_ordem', arguments: { agente: 'AGENTE-rds', projeto: 'loja', instrucao: 'Listar os índices lentos', modo: 'plan' } })
    assert.equal(resultado.isError, undefined)
    const ordem = JSON.parse(textoDe(resultado)) as Record<string, unknown>
    assert.equal(ordem.id, 'ordem-nova')
    assert.equal(ordem.status, 'trabalhando')
    assert.equal(ordem.agente, 'RDS')
    assert.deepEqual(falso.chamadas.at(-1), ['criarOrdem', { agenteId: 'agente-rds', projeto: 'loja', instrucao: 'Listar os índices lentos', modo: 'plan' }])
    const porId = await cliente.callTool({ name: 'enviar_ordem', arguments: { agente: 'claude', projeto: 'loja', instrucao: 'Oi' } })
    assert.equal((JSON.parse(textoDe(porId)) as Record<string, unknown>).agente, 'Claude')
    assert.deepEqual(falso.chamadas.at(-1), ['criarOrdem', { agenteId: 'claude', projeto: 'loja', instrucao: 'Oi' }])
  })

  it('enviar_ordem devolve isError com a mensagem do escritório', async () => {
    const sumido = await cliente.callTool({ name: 'enviar_ordem', arguments: { agente: 'ninguem', projeto: 'loja', instrucao: 'x' } })
    assert.equal(sumido.isError, true)
    assert.ok(textoDe(sumido).startsWith('Agente não encontrado: ninguem.'))
    const projeto = await cliente.callTool({ name: 'enviar_ordem', arguments: { agente: 'claude', projeto: 'nao-existe', instrucao: 'x' } })
    assert.equal(projeto.isError, true)
    assert.equal(textoDe(projeto), 'Projeto não encontrado: nao-existe')
    const modo = await cliente.callTool({ name: 'enviar_ordem', arguments: { agente: 'claude', projeto: 'loja', instrucao: 'x', modo: 'dontAsk' } })
    assert.equal(modo.isError, true)
    const semProjeto = await cliente.callTool({ name: 'enviar_ordem', arguments: { agente: 'claude', instrucao: 'x' } })
    assert.equal(semProjeto.isError, true)
    assert.equal(textoDe(semProjeto), 'Escolha o projeto (ou passe continuaDe para continuar uma ordem).')
  })

  it('enviar_ordem com continuaDe responde a pergunta final na mesma conversa, no projeto e no modo da ordem', async () => {
    const resposta = await cliente.callTool({ name: 'enviar_ordem', arguments: { agente: 'claude', continuaDe: 'ordem-pergunta', instrucao: 'Sim, pode abrir o PR.' } })
    assert.equal(resposta.isError, undefined)
    const criada = JSON.parse(textoDe(resposta)) as Record<string, unknown>
    assert.equal(criada.continuaDe, 'ordem-pergunta')
    assert.equal(criada.modo, 'acceptEdits')
    assert.deepEqual(falso.chamadas.at(-1), ['criarOrdem', {
      agenteId: 'claude',
      projeto: '/home/ana/projects/loja',
      instrucao: 'Sim, pode abrir o PR.',
      modo: 'acceptEdits',
      continuaDe: 'ordem-pergunta',
    }])
    await cliente.callTool({ name: 'enviar_ordem', arguments: { agente: 'claude', projeto: 'outro', continuaDe: 'ordem-pergunta', instrucao: 'Abra como rascunho.', modo: 'default' } })
    assert.deepEqual(falso.chamadas.at(-1), ['criarOrdem', {
      agenteId: 'claude',
      projeto: '/home/ana/projects/loja',
      instrucao: 'Abra como rascunho.',
      modo: 'default',
      continuaDe: 'ordem-pergunta',
    }])
    const sumida = await cliente.callTool({ name: 'enviar_ordem', arguments: { agente: 'claude', continuaDe: 'nada', instrucao: 'x' } })
    assert.equal(sumida.isError, true)
    assert.equal(textoDe(sumida), 'Ordem não encontrada.')
  })

  it('cancelar_ordem tira da fila; o erro do escritório vira isError', async () => {
    const cancelada = await cliente.callTool({ name: 'cancelar_ordem', arguments: { id: 'ordem-fila' } })
    assert.deepEqual(JSON.parse(textoDe(cancelada)), { id: 'ordem-fila', status: 'cancelada' })
    const rodando = await cliente.callTool({ name: 'cancelar_ordem', arguments: { id: 'ordem-1' } })
    assert.equal(rodando.isError, true)
    assert.equal(textoDe(rodando), 'Só dá para cancelar uma ordem que ainda está na fila.')
  })

  it('retomar_ordem cria a continuação, com ou sem instrução', async () => {
    const comInstrucao = await cliente.callTool({ name: 'retomar_ordem', arguments: { id: 'ordem-interrompida', instrucao: '  Continue pelos testes.  ' } })
    assert.equal(comInstrucao.isError, undefined)
    const retomada = JSON.parse(textoDe(comInstrucao)) as Record<string, unknown>
    assert.equal(retomada.id, 'ordem-retomada')
    assert.equal(retomada.continuaDe, 'ordem-interrompida')
    assert.equal(retomada.agente, 'Claude')
    assert.equal(retomada.mensagem, 'A ordem entrou na fila.')
    await cliente.callTool({ name: 'retomar_ordem', arguments: { id: 'ordem-interrompida' } })
    await cliente.callTool({ name: 'retomar_ordem', arguments: { id: 'ordem-interrompida', instrucao: '   ' } })
    assert.deepEqual(falso.chamadas.filter((c) => c[0] === 'retomarOrdem'), [
      ['retomarOrdem', 'ordem-interrompida', 'Continue pelos testes.'],
      ['retomarOrdem', 'ordem-interrompida', undefined],
      ['retomarOrdem', 'ordem-interrompida', undefined],
    ])
    const concluida = await cliente.callTool({ name: 'retomar_ordem', arguments: { id: 'ordem-1' } })
    assert.equal(concluida.isError, true)
    assert.equal(textoDe(concluida), 'Só dá para retomar uma ordem interrompida, parada ou com erro.')
  })

  it('dispensar_pergunta só dispensa uma ordem que espera resposta', async () => {
    const dispensada = await cliente.callTool({ name: 'dispensar_pergunta', arguments: { ordemId: 'ordem-pergunta' } })
    assert.equal(textoDe(dispensada), 'Pergunta dispensada.')
    const semPergunta = await cliente.callTool({ name: 'dispensar_pergunta', arguments: { ordemId: 'ordem-1' } })
    assert.equal(semPergunta.isError, undefined)
    assert.equal(textoDe(semPergunta), 'Essa ordem não tem pergunta esperando resposta.')
    assert.deepEqual(falso.chamadas.filter((c) => c[0] === 'dispensarResposta'), [['dispensarResposta', 'ordem-pergunta']])
    const sumida = await cliente.callTool({ name: 'dispensar_pergunta', arguments: { ordemId: 'nada' } })
    assert.equal(sumida.isError, true)
    assert.equal(textoDe(sumida), 'Ordem não encontrada.')
  })

  it('listar_pendencias mostra o que está esperando o humano', async () => {
    const resultado = await cliente.callTool({ name: 'listar_pendencias', arguments: {} })
    const pendencias = JSON.parse(textoDe(resultado)) as Array<Record<string, unknown>>
    assert.equal(pendencias.length, 1)
    assert.equal(pendencias[0]?.id, 'pend-1')
    assert.equal(pendencias[0]?.agente, 'RDS')
    assert.equal(pendencias[0]?.tipo, 'pergunta')
    assert.equal(pendencias[0]?.ferramenta, 'AskUserQuestion')
    assert.ok(pendencias[0]?.entrada)
  })

  it('responder_pendencia repassa a resposta e mostra o resultado', async () => {
    const resultado = await cliente.callTool({ name: 'responder_pendencia', arguments: { id: 'pend-1', decisao: 'responder', respostas: { 'Qual banco?': 'staging' } } })
    assert.equal(resultado.isError, undefined)
    assert.equal((JSON.parse(textoDe(resultado)) as Record<string, unknown>).status, 'respondida')
    assert.deepEqual(falso.chamadas.at(-1), ['responderPendencia', 'pend-1', { decisao: 'responder', respostas: { 'Qual banco?': 'staging' } }])
    const respondida = await cliente.callTool({ name: 'responder_pendencia', arguments: { id: 'pend-9', decisao: 'permitir' } })
    assert.equal(respondida.isError, true)
    assert.equal(textoDe(respondida), 'Essa pendência já foi respondida.')
    const invalida = await cliente.callTool({ name: 'responder_pendencia', arguments: { id: 'pend-1', decisao: 'talvez' } })
    assert.equal(invalida.isError, true)
  })

  it('ver_ordem traz a ordem, as pendências abertas e os últimos 20 eventos', async () => {
    const resultado = await cliente.callTool({ name: 'ver_ordem', arguments: { id: 'ordem-1' } })
    const visto = JSON.parse(textoDe(resultado)) as { ordem: Record<string, unknown>; pendencias: unknown[]; eventos: Array<{ texto: string }> }
    assert.equal(visto.ordem.id, 'ordem-1')
    assert.equal(visto.ordem.agente, 'RDS')
    assert.equal(visto.pendencias.length, 1)
    assert.equal(visto.eventos.length, 20)
    assert.equal(visto.eventos[0]?.texto, 'Passo 6')
    const sumida = await cliente.callTool({ name: 'ver_ordem', arguments: { id: 'nada' } })
    assert.equal(sumida.isError, true)
    assert.equal(textoDe(sumida), 'Ordem não encontrada.')
  })

  it('parar_ordem', async () => {
    const parada = await cliente.callTool({ name: 'parar_ordem', arguments: { id: 'ordem-1' } })
    assert.deepEqual(JSON.parse(textoDe(parada)), { id: 'ordem-1', status: 'parada' })
    const outra = await cliente.callTool({ name: 'parar_ordem', arguments: { id: 'outra' } })
    assert.equal(outra.isError, true)
    assert.equal(textoDe(outra), 'A ordem não está rodando.')
  })

  it('encontrarAgente aceita id, nome e apelido', () => {
    assert.equal(encontrarAgente(falso.agentes, 'agente-rds').id, 'agente-rds')
    assert.equal(encontrarAgente(falso.agentes, ' Agente-RDS ').id, 'agente-rds')
    assert.equal(encontrarAgente(falso.agentes, 'rds').id, 'agente-rds')
    assert.throws(() => encontrarAgente(falso.agentes, 'x'), (erro: unknown) => erro instanceof ErroEscritorio && erro.status === 404)
  })
})
