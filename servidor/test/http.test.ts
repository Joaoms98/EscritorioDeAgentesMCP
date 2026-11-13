import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { setTimeout as esperar } from 'node:timers/promises'
import { serve } from '@hono/node-server'
import { criarApp } from '../src/http.ts'
import { montarMundo } from '../src/mundo.ts'
import { ErroEscritorio } from '../src/tipos.ts'
import type {
  EstadoDaVida,
  AgenteComEstado,
  Config,
  EstadoGeral,
  Escritorio,
  EventoTempoReal,
  NovaOrdem,
  Ordem,
  Pendencia,
  RespostaPendencia,
  Reuniao,
} from '../src/tipos.ts'

const CHAVE = 'chave-de-teste-http-0123456789abcdef'

// O estado da vida num escritório de mentira: desligada e sem ninguém.
function estadoDaVidaFalso(): EstadoDaVida {
  return {
    ligada: false, disponivel: false, motivoPausa: null, explicacao: null, banda: 'normal',
    oficinaDisponivel: false, modelo: 'haiku', intervaloMs: 25_000, ligadaEm: null, decisoesNaHora: 0,
    custoUsdDoDia: 0, tetoCustoUsdDoDia: 1, vivos: 0, pasta: '/tmp/agentes-projeto', agentes: [],
  }
}

function criarEscritorioFalso() {
  const ouvintes = new Set<(evento: EventoTempoReal) => void>()
  const chamadas: Array<[string, ...unknown[]]> = []
  const ordem: Ordem = {
    id: 'ordem-1',
    agenteId: 'claude',
    projeto: '/home/ana/projects/loja',
    instrucao: 'Rode os testes',
    modo: 'default',
    status: 'trabalhando',
    sessaoId: 'sessao-1',
    continuaDe: null,
    modelo: 'claude-haiku-5-5',
    atividade: 'Rodando os testes',
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
    criadaEm: '2026-10-29T12:00:00.000Z',
    iniciadaEm: '2026-10-29T12:00:01.000Z',
    finalizadaEm: null,
    vistaEm: null,
  }
  const agente: AgenteComEstado = {
    id: 'claude',
    nome: 'Claude',
    apelido: 'Claude',
    descricao: 'Generalista',
    modelo: null,
    cor: '#d97757',
    ferramentas: null,
    memoria: null,
    arquivo: null,
    generalista: true,
    origem: null,
    estado: 'trabalhando',
    desde: ordem.iniciadaEm,
    ordemAtual: null,
    ultimaOrdem: null,
    fila: 0,
    pendencias: 1,
    vida: null,
    reuniao: null,
  }
  const pendencia: Pendencia = {
    id: 'pend-1',
    ordemId: 'ordem-1',
    agenteId: 'claude',
    tipo: 'permissao',
    ferramenta: 'Bash',
    titulo: 'Quer executar um comando',
    descricao: null,
    entrada: { command: 'npm test' },
    permiteSempre: true,
    caminhoBloqueado: null,
    status: 'aberta',
    resposta: null,
    criadaEm: '2026-10-29T12:00:02.000Z',
    respondidaEm: null,
  }
  const estado: EstadoGeral = {
    agentes: [agente],
    projetos: [{ nome: 'loja', caminho: '/home/ana/projects/loja' }],
    conta: { email: 'ana@exemplo.com', plano: 'Claude Max', autenticada: true, erro: null, uso: { status: null, cincoHoras: null, seteDias: null, reiniciaEm: null, atualizadoEm: null } },
    vida: {
      ligada: false, disponivel: false, motivoPausa: null, explicacao: null, banda: 'normal',
      oficinaDisponivel: false, modelo: 'haiku', intervaloMs: 25_000, ligadaEm: null, decisoesNaHora: 0,
      custoUsdDoDia: 0, tetoCustoUsdDoDia: 1, vivos: 0, pasta: '/tmp/agentes-projeto', agentes: [],
    },
    servidor: { versao: '0.1.0', simulado: true, maxSimultaneas: 4, conectoresClaudeAi: false, dirProjetos: '/home/ana/projects', dirAgentes: '/home/ana/.claude/agents', dirAgentesProjeto: '/home/ana/agentes-projeto' },
    reuniao: null,
  }
  const reuniao: Reuniao = {
    id: 'reu-1',
    abertaEm: '2026-10-29T12:00:00.000Z',
    convocados: [{ agenteId: 'claude', vagaId: 'reuniao:0', desde: '2026-10-29T12:00:01.000Z' }],
    recados: [],
  }
  const escritorio: Escritorio = {
    iniciar: async () => {},
    encerrar: async () => {},
    estado: () => estado,
    detalheAgente: (id) => (id === 'claude'
      ? { agente, ordemAtual: ordem, fila: [], historico: [], perguntaFinal: null, totais: { historico: 0, concluidas: 0 }, pendencias: [pendencia], eventosAtuais: [] }
      : null),
    historicoDoAgente: (id, antesDe, limite) => {
      chamadas.push(['historicoDoAgente', id, antesDe, limite])
      if (id !== 'claude') throw new ErroEscritorio(404, 'Agente não encontrado.')
      if (antesDe !== null && antesDe !== 'ordem-1') throw new ErroEscritorio(400, 'Essa ordem não está no histórico do agente.')
      return [{ ...ordem, id: 'ordem-0', status: 'concluida', finalizadaEm: '2026-10-29T11:00:00.000Z' }]
    },
    detalheOrdem: (id) => (id === 'ordem-1' ? { ordem, agente, eventos: [], pendencias: [pendencia], cadeia: [] } : null),
    criarOrdem: (nova: NovaOrdem) => {
      chamadas.push(['criarOrdem', nova])
      if (nova.agenteId === 'sumido') throw new ErroEscritorio(404, 'Agente não encontrado.')
      return { ...ordem, id: 'ordem-nova', status: 'na_fila', agenteId: nova.agenteId, projeto: nova.projeto, instrucao: nova.instrucao, modo: nova.modo ?? 'default', continuaDe: nova.continuaDe ?? null }
    },
    pararOrdem: async (id) => {
      chamadas.push(['pararOrdem', id])
      if (id !== 'ordem-1') throw new ErroEscritorio(409, 'A ordem não está rodando.')
      return { ...ordem, status: 'parada' }
    },
    cancelarOrdem: (id) => {
      if (id === 'explode') throw new Error('falha inesperada no banco')
      if (id !== 'na-fila') throw new ErroEscritorio(409, 'A ordem não está na fila.')
      return { ...ordem, id, status: 'cancelada' }
    },
    retomarOrdem: (id, instrucao) => {
      chamadas.push(['retomarOrdem', id, instrucao])
      return { ...ordem, id: 'ordem-2', continuaDe: id, instrucao: instrucao ?? 'Continue de onde parou.', status: 'na_fila' }
    },
    marcarVista: (id) => {
      chamadas.push(['marcarVista', id])
    },
    dispensarResposta: (id) => {
      chamadas.push(['dispensarResposta', id])
    },
    responderPendencia: (id, resposta: RespostaPendencia) => {
      chamadas.push(['responderPendencia', id, resposta])
      if (id !== 'pend-1') throw new ErroEscritorio(409, 'Essa pendência já foi respondida.')
      return { ...pendencia, status: 'respondida', resposta, respondidaEm: '2026-10-29T12:00:09.000Z' }
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
    reuniaoAberta: () => {
      chamadas.push(['reuniaoAberta'])
      return reuniao
    },
    abrirReuniao: () => {
      chamadas.push(['abrirReuniao'])
      return reuniao
    },
    convocarParaReuniao: (agenteId) => {
      chamadas.push(['convocarParaReuniao', agenteId])
      if (agenteId === 'ocupado') throw new ErroEscritorio(409, 'Esse agente está com uma ordem sua.')
      return reuniao
    },
    convocarLivresParaReuniao: () => {
      chamadas.push(['convocarLivresParaReuniao'])
      return reuniao
    },
    dispensarDaReuniao: (agenteId) => {
      chamadas.push(['dispensarDaReuniao', agenteId])
      return reuniao
    },
    darRecadoNaReuniao: (texto) => {
      chamadas.push(['darRecadoNaReuniao', texto])
      return { ...reuniao, recados: [{ id: 1, texto, criadoEm: '2026-10-29T12:00:05.000Z', paraIds: ['claude'] }] }
    },
    encerrarReuniao: () => {
      chamadas.push(['encerrarReuniao'])
    },
    assinar: (ouvinte) => {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },
  }
  return { escritorio, chamadas, ouvintes, emitir: (evento: EventoTempoReal) => ouvintes.forEach((o) => o(evento)), ordem, pendencia }
}

function criarConfig(dirWeb: string): Config {
  return {
    porta: 0,
    host: '127.0.0.1',
    dirDados: '/tmp/x',
    dirProjetos: '/tmp',
    dirAgentes: '/tmp',
    dirAgentesProjeto: '/tmp/agentes-projeto',
    dirWeb,
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
}

async function subir(escritorio: Escritorio, config: Config, batimentoMs = 20_000): Promise<{ servidor: Server; base: string }> {
  const app = criarApp(escritorio, config, { batimentoMs })
  const servidor = await new Promise<Server>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => resolve(s as Server)) as Server
  })
  const { port } = servidor.address() as AddressInfo
  return { servidor, base: `http://127.0.0.1:${port}` }
}

async function descer(servidor: Server): Promise<void> {
  servidor.closeAllConnections()
  await new Promise((resolve) => servidor.close(resolve))
}

const json = { 'content-type': 'application/json' }
const bearer = { authorization: `Bearer ${CHAVE}` }

describe('API HTTP', () => {
  const falso = criarEscritorioFalso()
  const pasta = mkdtempSync(join(tmpdir(), 'escritorio-http-'))
  const dirWeb = join(pasta, 'dist')
  let servidor: Server
  let base = ''

  before(async () => {
    mkdirSync(join(dirWeb, 'assets'), { recursive: true })
    writeFileSync(join(dirWeb, 'index.html'), '<!doctype html><title>Escritório</title><div id="root"></div>')
    writeFileSync(join(dirWeb, 'assets', 'app-123.js'), 'console.log("oi")')
    writeFileSync(join(dirWeb, 'manifest.webmanifest'), '{}')
    const subido = await subir(falso.escritorio, criarConfig(dirWeb), 60)
    servidor = subido.servidor
    base = subido.base
  })

  after(async () => {
    await descer(servidor)
    rmSync(pasta, { recursive: true, force: true })
  })

  const pedir = (caminho: string, init: RequestInit = {}) => fetch(`${base}${caminho}`, init)
  const postar = (caminho: string, corpo: unknown, cabecalhos: Record<string, string> = bearer) =>
    pedir(caminho, { method: 'POST', headers: { ...json, ...cabecalhos }, body: JSON.stringify(corpo) })

  it('sem chave a API responde 401', async () => {
    for (const caminho of ['/api/estado', '/api/agentes/claude', '/api/agentes/claude/historico', '/api/ordens/ordem-1', '/api/eventos']) {
      const resposta = await pedir(caminho)
      assert.equal(resposta.status, 401, caminho)
      assert.deepEqual(await resposta.json(), { erro: 'Entre com a chave do escritório.' })
    }
    assert.equal((await postar('/api/ordens', {}, {})).status, 401)
    assert.equal((await pedir('/api/estado', { headers: { authorization: 'Bearer errada' } })).status, 401)
    assert.equal((await pedir('/api/estado', { headers: { cookie: 'escritorio_chave=errada' } })).status, 401)
  })

  it('entrar grava o cookie, que depois autentica; sair apaga', async () => {
    const errada = await postar('/api/entrar', { token: 'nada' }, {})
    assert.equal(errada.status, 401)
    assert.deepEqual(await errada.json(), { erro: 'Chave inválida.' })
    const certa = await postar('/api/entrar', { token: CHAVE }, {})
    assert.equal(certa.status, 204)
    const cookie = certa.headers.get('set-cookie')
    assert.equal(cookie, `escritorio_chave=${CHAVE}; HttpOnly; SameSite=Strict; Path=/; Max-Age=34560000`)
    const comCookie = await pedir('/api/estado', { headers: { cookie: `escritorio_chave=${CHAVE}` } })
    assert.equal(comCookie.status, 200)
    assert.equal(((await comCookie.json()) as EstadoGeral).agentes[0]?.id, 'claude')
    const sair = await postar('/api/sair', {}, { cookie: `escritorio_chave=${CHAVE}` })
    assert.equal(sair.status, 204)
    assert.equal(sair.headers.get('set-cookie'), 'escritorio_chave=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0')
  })

  it('Bearer também autentica', async () => {
    const resposta = await pedir('/api/estado', { headers: bearer })
    assert.equal(resposta.status, 200)
    assert.equal(resposta.headers.get('content-type'), 'application/json')
  })

  it('requisição que muda algo precisa de content-type JSON', async () => {
    const texto = await pedir('/api/ordens', { method: 'POST', headers: { ...bearer, 'content-type': 'text/plain' }, body: '{}' })
    assert.equal(texto.status, 415)
    assert.ok(((await texto.json()) as { erro: string }).erro.includes('JSON'))
    const semTipo = await pedir('/api/entrar', { method: 'POST', body: JSON.stringify({ token: CHAVE }) })
    assert.equal(semTipo.status, 415)
    const formulario = await pedir('/api/ordens/ordem-1/parar', { method: 'POST', headers: { ...bearer, 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1' })
    assert.equal(formulario.status, 415)
    const comCharset = await pedir('/api/ordens/ordem-1/vista', { method: 'POST', headers: { ...bearer, 'content-type': 'application/json; charset=utf-8' }, body: '{}' })
    assert.equal(comCharset.status, 204)
  })

  it('JSON inválido e corpo acima de 1 MB dão 400', async () => {
    const invalido = await pedir('/api/ordens', { method: 'POST', headers: { ...json, ...bearer }, body: '{"agenteId":' })
    assert.equal(invalido.status, 400)
    assert.deepEqual(await invalido.json(), { erro: 'O corpo da requisição não é um JSON válido.' })
    const lista = await postar('/api/ordens', [1, 2])
    assert.equal(lista.status, 400)
    const grande = await postar('/api/ordens', { agenteId: 'claude', projeto: 'loja', instrucao: 'x'.repeat(1024 * 1024 + 10) })
    assert.equal(grande.status, 400)
    assert.deepEqual(await grande.json(), { erro: 'O corpo da requisição passou de 1 MB.' })
    const pedacos = new ReadableStream<Uint8Array>({
      start(controle) {
        for (let i = 0; i < 9; i++) controle.enqueue(new Uint8Array(150 * 1024).fill(32))
        controle.close()
      },
    })
    const emPartes = await pedir('/api/ordens', { method: 'POST', headers: { ...json, ...bearer }, body: pedacos, duplex: 'half' } as RequestInit)
    assert.equal(emPartes.status, 400)
  })

  it('detalhes de agente e ordem, com 404 quando não existem', async () => {
    const agente = await pedir('/api/agentes/claude', { headers: bearer })
    assert.equal(agente.status, 200)
    assert.equal(((await agente.json()) as { agente: { id: string } }).agente.id, 'claude')
    const semAgente = await pedir('/api/agentes/ninguem', { headers: bearer })
    assert.equal(semAgente.status, 404)
    assert.deepEqual(await semAgente.json(), { erro: 'Agente não encontrado.' })
    const ordem = await pedir('/api/ordens/ordem-1', { headers: bearer })
    assert.equal(ordem.status, 200)
    assert.equal(((await ordem.json()) as { ordem: { id: string } }).ordem.id, 'ordem-1')
    assert.equal((await pedir('/api/ordens/nenhuma', { headers: bearer })).status, 404)
    const rota = await pedir('/api/nao-existe', { headers: bearer })
    assert.equal(rota.status, 404)
    assert.deepEqual(await rota.json(), { erro: 'Rota não encontrada.' })
  })

  it('histórico do agente em páginas: cursor antesDe e limite repassados ao escritório', async () => {
    const primeira = await pedir('/api/agentes/claude/historico', { headers: bearer })
    assert.equal(primeira.status, 200)
    assert.deepEqual(((await primeira.json()) as Ordem[]).map((o) => o.id), ['ordem-0'])
    const seguinte = await pedir('/api/agentes/claude/historico?antesDe=ordem-1&limite=10', { headers: bearer })
    assert.equal(seguinte.status, 200)
    assert.equal((await pedir('/api/agentes/claude/historico?antesDe=&limite=', { headers: bearer })).status, 200)
    assert.deepEqual(falso.chamadas.filter((c) => c[0] === 'historicoDoAgente'), [
      ['historicoDoAgente', 'claude', null, undefined],
      ['historicoDoAgente', 'claude', 'ordem-1', 10],
      ['historicoDoAgente', 'claude', null, undefined],
    ])
    for (const limite of ['0', '-1', 'dez', '2.5', '1e2']) {
      const invalido = await pedir(`/api/agentes/claude/historico?limite=${limite}`, { headers: bearer })
      assert.equal(invalido.status, 400, limite)
      assert.deepEqual(await invalido.json(), { erro: 'O limite precisa ser um número inteiro maior que zero.' })
    }
    const semAgente = await pedir('/api/agentes/ninguem/historico', { headers: bearer })
    assert.equal(semAgente.status, 404)
    assert.deepEqual(await semAgente.json(), { erro: 'Agente não encontrado.' })
    const cursorDesconhecido = await pedir('/api/agentes/claude/historico?antesDe=sumida', { headers: bearer })
    assert.equal(cursorDesconhecido.status, 400)
  })

  it('cria ordem (201) e valida o corpo', async () => {
    const criada = await postar('/api/ordens', { agenteId: 'claude', projeto: 'loja', instrucao: '  Rode os testes  ', modo: 'plan', continuaDe: null })
    assert.equal(criada.status, 201)
    const ordem = (await criada.json()) as Ordem
    assert.equal(ordem.id, 'ordem-nova')
    assert.deepEqual(falso.chamadas.find((c) => c[0] === 'criarOrdem')?.[1], { agenteId: 'claude', projeto: 'loja', instrucao: 'Rode os testes', modo: 'plan' })
    const continuacao = await postar('/api/ordens', { agenteId: 'claude', projeto: 'loja', instrucao: 'Sim, pode abrir', continuaDe: 'ordem-1' })
    assert.equal(((await continuacao.json()) as Ordem).continuaDe, 'ordem-1')
    const casos: Array<[unknown, string]> = [
      [{ projeto: 'loja', instrucao: 'x' }, 'Escolha o agente.'],
      [{ agenteId: 'claude', instrucao: 'x' }, 'Escolha o projeto.'],
      [{ agenteId: 'claude', projeto: 'loja', instrucao: '   ' }, 'Escreva a instrução da ordem.'],
      [{ agenteId: 'claude', projeto: 'loja', instrucao: 'x', modo: 'auto' }, 'Modo de permissão inválido.'],
      [{ agenteId: 'claude', projeto: 'loja', instrucao: 'x'.repeat(20_001) }, 'A instrução passou de 20.000 caracteres.'],
    ]
    for (const [corpo, erro] of casos) {
      const resposta = await postar('/api/ordens', corpo)
      assert.equal(resposta.status, 400, erro)
      assert.deepEqual(await resposta.json(), { erro })
    }
    const sumido = await postar('/api/ordens', { agenteId: 'sumido', projeto: 'loja', instrucao: 'x' })
    assert.equal(sumido.status, 404)
    assert.deepEqual(await sumido.json(), { erro: 'Agente não encontrado.' })
  })

  it('parar, cancelar e retomar repassam os erros do escritório', async () => {
    const parada = await postar('/api/ordens/ordem-1/parar', {})
    assert.equal(parada.status, 200)
    assert.equal(((await parada.json()) as Ordem).status, 'parada')
    const naoRodando = await postar('/api/ordens/outra/parar', {})
    assert.equal(naoRodando.status, 409)
    assert.deepEqual(await naoRodando.json(), { erro: 'A ordem não está rodando.' })
    const cancelada = await postar('/api/ordens/na-fila/cancelar', {})
    assert.equal(cancelada.status, 200)
    assert.equal(((await cancelada.json()) as Ordem).status, 'cancelada')
    assert.equal((await postar('/api/ordens/ordem-1/cancelar', {})).status, 409)
    const retomada = await postar('/api/ordens/ordem-1/retomar', { instrucao: 'Continue, por favor' })
    assert.equal(retomada.status, 201)
    assert.equal(((await retomada.json()) as Ordem).continuaDe, 'ordem-1')
    const semInstrucao = await postar('/api/ordens/ordem-1/retomar', {})
    assert.equal(semInstrucao.status, 201)
    assert.deepEqual(falso.chamadas.filter((c) => c[0] === 'retomarOrdem'), [['retomarOrdem', 'ordem-1', 'Continue, por favor'], ['retomarOrdem', 'ordem-1', undefined]])
    assert.equal((await postar('/api/ordens/ordem-1/retomar', { instrucao: 42 })).status, 400)
  })

  it('erro inesperado vira 500 "Erro interno." e fica no log', async () => {
    const original = console.error
    const logados: unknown[] = []
    console.error = (...args: unknown[]) => logados.push(args)
    try {
      const resposta = await postar('/api/ordens/explode/cancelar', {})
      assert.equal(resposta.status, 500)
      assert.deepEqual(await resposta.json(), { erro: 'Erro interno.' })
      assert.equal(logados.length, 1)
    } finally {
      console.error = original
    }
  })

  it('vista e dispensar respondem 204', async () => {
    assert.equal((await postar('/api/ordens/ordem-1/vista', {})).status, 204)
    assert.equal((await postar('/api/ordens/ordem-1/dispensar', {})).status, 204)
    assert.ok(falso.chamadas.some((c) => c[0] === 'marcarVista' && c[1] === 'ordem-1'))
    assert.ok(falso.chamadas.some((c) => c[0] === 'dispensarResposta' && c[1] === 'ordem-1'))
  })

  it('responder pendência valida a decisão e as respostas', async () => {
    const ok = await postar('/api/pendencias/pend-1/responder', { decisao: 'negar', mensagem: '  Não rode isso.  ' })
    assert.equal(ok.status, 200)
    const pendencia = (await ok.json()) as Pendencia
    assert.equal(pendencia.status, 'respondida')
    assert.deepEqual(pendencia.resposta, { decisao: 'negar', mensagem: 'Não rode isso.' })
    const pergunta = await postar('/api/pendencias/pend-1/responder', { decisao: 'responder', respostas: { 'Qual?': 'b.txt' } })
    assert.deepEqual(((await pergunta.json()) as Pendencia).resposta, { decisao: 'responder', respostas: { 'Qual?': 'b.txt' } })
    assert.deepEqual(await (await postar('/api/pendencias/pend-1/responder', { decisao: 'talvez' })).json(), { erro: 'Decisão inválida.' })
    assert.equal((await postar('/api/pendencias/pend-1/responder', { decisao: 'responder', respostas: { a: 1 } })).status, 400)
    assert.equal((await postar('/api/pendencias/pend-1/responder', { decisao: 'responder', respostas: ['a'] })).status, 400)
    const fechada = await postar('/api/pendencias/pend-9/responder', { decisao: 'permitir' })
    assert.equal(fechada.status, 409)
    assert.deepEqual(await fechada.json(), { erro: 'Essa pendência já foi respondida.' })
  })

  it('cabeçalhos de segurança em todas as respostas', async () => {
    for (const resposta of [await pedir('/api/estado'), await pedir('/api/estado', { headers: bearer }), await pedir('/'), await pedir('/mcp')]) {
      assert.equal(resposta.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(resposta.headers.get('referrer-policy'), 'no-referrer')
      assert.equal(resposta.headers.get('x-frame-options'), 'DENY')
    }
  })

  it('eventos ao vivo: primeiro o estado, depois os eventos e o batimento; ao fechar, sai da assinatura', async () => {
    const controle = new AbortController()
    const resposta = await pedir('/api/eventos', { headers: bearer, signal: controle.signal })
    assert.equal(resposta.status, 200)
    assert.equal(resposta.headers.get('content-type'), 'text/event-stream')
    assert.equal(resposta.headers.get('x-content-type-options'), 'nosniff')
    const leitor = resposta.body!.getReader()
    const decodificador = new TextDecoder()
    let texto = ''
    const lerAte = async (condicao: () => boolean) => {
      const limite = Date.now() + 3000
      while (!condicao()) {
        if (Date.now() > limite) throw new Error(`tempo esgotado; recebido: ${texto}`)
        const { value, done } = await leitor.read()
        if (done) throw new Error('fluxo terminou')
        texto += decodificador.decode(value, { stream: true })
      }
    }
    await lerAte(() => texto.includes('\n\n'))
    const primeiro = texto.slice(0, texto.indexOf('\n\n'))
    const [linhaEvento, linhaDados] = primeiro.split('\n')
    assert.equal(linhaEvento, 'event: estado')
    assert.ok(linhaDados?.startsWith('data: '))
    assert.equal((JSON.parse(linhaDados!.slice(6)) as EstadoGeral).agentes[0]?.id, 'claude')
    await lerAte(() => falso.ouvintes.size === 1)
    falso.emitir({ tipo: 'ordem', dados: falso.ordem })
    falso.emitir({ tipo: 'pendencia', dados: falso.pendencia })
    await lerAte(() => texto.includes('event: pendencia'))
    assert.ok(texto.includes(`event: ordem\ndata: ${JSON.stringify(falso.ordem)}\n\n`))
    assert.ok(texto.includes(`event: pendencia\ndata: ${JSON.stringify(falso.pendencia)}\n\n`))
    await lerAte(() => texto.includes(': batimento\n\n'))
    controle.abort()
    const limite = Date.now() + 3000
    while (falso.ouvintes.size > 0 && Date.now() < limite) await esperar(10)
    assert.equal(falso.ouvintes.size, 0)
  })

  it('serve a interface, com volta para o index.html nas rotas da SPA', async () => {
    const raiz = await pedir('/')
    assert.equal(raiz.status, 200)
    assert.ok((await raiz.text()).includes('<div id="root">'))
    const js = await pedir('/assets/app-123.js')
    assert.equal(js.status, 200)
    assert.ok(js.headers.get('content-type')?.includes('javascript'))
    assert.equal(js.headers.get('cache-control'), 'public, max-age=31536000, immutable')
    const manifesto = await pedir('/manifest.webmanifest')
    assert.equal(manifesto.status, 200)
    const rotaSpa = await pedir('/agente/claude?ordem=ordem-1')
    assert.equal(rotaSpa.status, 200)
    assert.ok(rotaSpa.headers.get('content-type')?.includes('text/html'))
    assert.ok((await rotaSpa.text()).includes('<div id="root">'))
    assert.equal((await pedir('/assets/sumiu.js')).status, 404)
    for (const caminho of ['/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/assets/..%2f..%2f..%2fetc%2fpasswd']) {
      assert.ok(!(await (await pedir(caminho)).text()).includes('root:'), caminho)
    }
  })

  it('/mcp exige Bearer e só aceita POST', async () => {
    const semChave = await pedir('/mcp', { method: 'POST', headers: { ...json, accept: 'application/json, text/event-stream' }, body: '{}' })
    assert.equal(semChave.status, 401)
    assert.equal(semChave.headers.get('www-authenticate'), 'Bearer realm="escritorio"')
    const cookie = await pedir('/mcp', { method: 'POST', headers: { ...json, cookie: `escritorio_chave=${CHAVE}` }, body: '{}' })
    assert.equal(cookie.status, 401)
    const get = await pedir('/mcp', { headers: bearer })
    assert.equal(get.status, 405)
    assert.equal(get.headers.get('allow'), 'POST')
    assert.equal((await pedir('/mcp', { method: 'DELETE', headers: bearer })).status, 405)
    const lista = await pedir('/mcp', {
      method: 'POST',
      headers: { ...json, ...bearer, accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    assert.equal(lista.status, 200)
    const corpo = (await lista.json()) as { result: { tools: Array<{ name: string }> } }
    assert.ok(corpo.result.tools.some((t) => t.name === 'enviar_ordem'))
  })

  it('as rotas da sala de reunião: abrir, chamar, dispensar, recado e encerrar', async () => {
    falso.chamadas.length = 0
    const aberta = await pedir('/api/reuniao', { headers: bearer })
    assert.equal(aberta.status, 200)
    assert.equal(((await aberta.json()) as { id: string }).id, 'reu-1')

    const nova = await postar('/api/reuniao', {})
    assert.equal(nova.status, 201)

    assert.equal((await postar('/api/reuniao/convocar', { agenteId: 'claude' })).status, 200)
    assert.equal((await postar('/api/reuniao/convocar', { todos: true })).status, 200)
    assert.equal((await postar('/api/reuniao/dispensar', { agenteId: 'claude' })).status, 200)

    const recado = await postar('/api/reuniao/recado', { texto: '  Teste em todo PR.  ' })
    assert.equal(recado.status, 200)
    assert.equal(((await recado.json()) as { recados: Array<{ texto: string }> }).recados[0]?.texto, 'Teste em todo PR.')

    assert.equal((await postar('/api/reuniao/encerrar', {})).status, 204)
    assert.deepEqual(falso.chamadas, [
      ['reuniaoAberta'],
      ['abrirReuniao'],
      ['convocarParaReuniao', 'claude'],
      ['convocarLivresParaReuniao'],
      ['dispensarDaReuniao', 'claude'],
      ['darRecadoNaReuniao', 'Teste em todo PR.'],
      ['encerrarReuniao'],
    ])
  })

  it('a reunião recusa pedido sem agente, sem texto e sem chave, e devolve o 409 do escritório', async () => {
    assert.equal((await postar('/api/reuniao/convocar', {})).status, 400)
    assert.equal((await postar('/api/reuniao/dispensar', {})).status, 400)
    assert.equal((await postar('/api/reuniao/recado', { texto: '   ' })).status, 400)
    const cheia = await postar('/api/reuniao/convocar', { agenteId: 'ocupado' })
    assert.equal(cheia.status, 409)
    assert.deepEqual(await cheia.json(), { erro: 'Esse agente está com uma ordem sua.' })
    assert.equal((await pedir('/api/reuniao')).status, 401)
    assert.equal((await postar('/api/reuniao', {}, {})).status, 401)
  })
})

describe('API HTTP com "+" na chave', () => {
  it('entrar aceita o "+" que um link sem codificar entrega como espaço', async () => {
    const chave = 'Zm9v+YmFy/YmF6=revisao12'
    const falso = criarEscritorioFalso()
    const { servidor, base } = await subir(falso.escritorio, { ...criarConfig(join(tmpdir(), 'escritorio-sem-dist-que-nao-existe')), token: chave })
    try {
      const entrar = (token: string) => fetch(`${base}/api/entrar`, { method: 'POST', headers: json, body: JSON.stringify({ token }) })
      const comEspaco = await entrar(new URLSearchParams('t=Zm9v+YmFy/YmF6=revisao12').get('t') ?? '')
      assert.equal(comEspaco.status, 204)
      assert.equal(comEspaco.headers.get('set-cookie'), `escritorio_chave=${encodeURIComponent(chave)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=34560000`)
      assert.equal((await entrar(chave)).status, 204)
      assert.equal((await entrar('Zm9v YmFy/YmF6=revisao13')).status, 401)
    } finally {
      await descer(servidor)
    }
  })

  it('uma chave com espaço (escrita à mão em dados/chave) continua entrando', async () => {
    const falso = criarEscritorioFalso()
    const { servidor, base } = await subir(falso.escritorio, { ...criarConfig(join(tmpdir(), 'escritorio-sem-dist-que-nao-existe')), token: 'minha chave de casa 2026' })
    try {
      const resposta = await fetch(`${base}/api/entrar`, { method: 'POST', headers: json, body: JSON.stringify({ token: 'minha chave de casa 2026' }) })
      assert.equal(resposta.status, 204)
    } finally {
      await descer(servidor)
    }
  })
})

describe('API HTTP sem a interface gerada', () => {
  it('mostra a página que manda rodar o build', async () => {
    const falso = criarEscritorioFalso()
    const { servidor, base } = await subir(falso.escritorio, criarConfig(join(tmpdir(), 'escritorio-sem-dist-que-nao-existe')))
    try {
      const resposta = await fetch(`${base}/`)
      assert.equal(resposta.status, 503)
      const html = await resposta.text()
      assert.ok(html.includes('npm run build'))
      assert.ok(html.includes('npm start'))
      assert.equal((await fetch(`${base}/api/estado`, { headers: bearer })).status, 200)
    } finally {
      await descer(servidor)
    }
  })
})

describe('API HTTP: link do celular', () => {
  const falso = criarEscritorioFalso()
  const config = criarConfig(join(tmpdir(), 'escritorio-sem-dist-que-nao-existe'))
  const naRede = [`http://192.168.0.15:41793/?t=${CHAVE}`, `http://10.0.0.5:41793/?t=${CHAVE}`]

  it('exige a chave', async () => {
    const app = criarApp(falso.escritorio, config, { linksDoCelular: () => naRede })
    assert.equal((await app.request('/api/celular')).status, 401)
  })

  it('devolve o primeiro link da rede com o QR dele, as outras redes e não deixa guardar em cache', async () => {
    const app = criarApp(falso.escritorio, config, { linksDoCelular: () => naRede })
    const resposta = await app.request('/api/celular', { headers: bearer })
    assert.equal(resposta.status, 200)
    assert.equal(resposta.headers.get('cache-control'), 'no-store')
    const corpo = (await resposta.json()) as { link: string; outros: string[]; qr: { tamanho: number; caminho: string } }
    assert.equal(corpo.link, naRede[0])
    assert.deepEqual(corpo.outros, [naRede[1]])
    assert.ok(corpo.qr.tamanho >= 21 && (corpo.qr.tamanho - 17) % 4 === 0)
    assert.match(corpo.qr.caminho, /^(M\d+ \d+h\d+v1h-\d+z)+$/)
  })

  it('sem rede para o celular (só este computador), não há link nem QR', async () => {
    const app = criarApp(falso.escritorio, config, { linksDoCelular: () => [] })
    const corpo = await (await app.request('/api/celular', { headers: bearer })).json()
    assert.deepEqual(corpo, { link: null, outros: [], qr: null, motivo: 'so-local' })
  })

  it('aceitando a rede mas sem nenhuma agora, o motivo é a falta de rede', async () => {
    const app = criarApp(falso.escritorio, { ...config, host: '0.0.0.0' }, { linksDoCelular: () => [] })
    const corpo = await (await app.request('/api/celular', { headers: bearer })).json()
    assert.equal(corpo.motivo, 'sem-rede')
  })
})
