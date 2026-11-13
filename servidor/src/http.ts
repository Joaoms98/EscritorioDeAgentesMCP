import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { Context, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import { chaveConfere, chaveDoBearer, cookieDeEntrada, cookieDeSaida, requisicaoAutorizada } from './auth.ts'
import { linksDoBanner, motivoSemCelular, qrEmSvg } from './links.ts'
import { responderMcp } from './mcp.ts'
import { DECISOES_POR_TIPO, ErroEscritorio, MODOS_PERMISSAO } from './tipos.ts'
import type { Config, DecisaoPendencia, Escritorio, ModoPermissao, NovaOrdem, RespostaPendencia } from './tipos.ts'

export type OpcoesApp = {
  batimentoMs?: number
  // Links do escritório para o celular, na ordem de preferência (o index.ts sabe a porta de verdade e a do Vite).
  linksDoCelular?: () => string[]
}

const LIMITE_CORPO = 1024 * 1024
const METODOS_QUE_MUDAM = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const DECISOES = new Set<string>(Object.values(DECISOES_POR_TIPO).flat())

const PAGINA_SEM_BUILD = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Escritório de agentes</title>
<style>
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #000; color: #e4e4e7; font: 16px/1.5 system-ui, sans-serif; }
main { max-width: 32rem; padding: 2rem 1.25rem; }
h1 { font-size: 1.25rem; margin: 0 0 .75rem; color: #f4f4f5; }
code { background: #1c1c1f; color: #60a5fa; padding: .1rem .35rem; border-radius: .3rem; }
</style>
</head>
<body>
<main>
<h1>Escritório de agentes</h1>
<p>O servidor está no ar, mas a interface ainda não foi gerada.</p>
<p>Rode <code>npm run build</code> (ou <code>npm start</code>) na pasta do projeto e recarregue esta página.</p>
</main>
</body>
</html>
`

function ehErroEscritorio(erro: unknown): erro is ErroEscritorio {
  return erro instanceof ErroEscritorio || (erro instanceof Error && erro.name === 'ErroEscritorio' && typeof (erro as { status?: unknown }).status === 'number')
}

function ehJson(tipo: string | undefined): boolean {
  return (tipo ?? '').split(';')[0]?.trim().toLowerCase() === 'application/json'
}

function erroJsonRpc(codigo: number, mensagem: string) {
  return { jsonrpc: '2.0', error: { code: codigo, message: mensagem }, id: null }
}

async function lerCorpo(c: Context): Promise<Record<string, unknown>> {
  const texto = await c.req.text()
  if (!texto.trim()) return {}
  let corpo: unknown
  try {
    corpo = JSON.parse(texto)
  } catch {
    throw new ErroEscritorio(400, 'O corpo da requisição não é um JSON válido.')
  }
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw new ErroEscritorio(400, 'O corpo da requisição precisa ser um objeto JSON.')
  }
  return corpo as Record<string, unknown>
}

// Texto que pode faltar (vem como null quando não veio). Retorna o texto ou null.
function textoOpcional(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

function textoObrigatorio(valor: unknown, mensagem: string): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new ErroEscritorio(400, mensagem)
  return valor.trim()
}

function lerNovaOrdem(corpo: Record<string, unknown>): NovaOrdem {
  const nova: NovaOrdem = {
    agenteId: textoObrigatorio(corpo.agenteId, 'Escolha o agente.'),
    projeto: textoObrigatorio(corpo.projeto, 'Escolha o projeto.'),
    instrucao: textoObrigatorio(corpo.instrucao, 'Escreva a instrução da ordem.'),
  }
  if (nova.instrucao.length > 20_000) throw new ErroEscritorio(400, 'A instrução passou de 20.000 caracteres.')
  if (corpo.modo !== undefined && corpo.modo !== null) {
    if (!MODOS_PERMISSAO.includes(corpo.modo as ModoPermissao)) throw new ErroEscritorio(400, 'Modo de permissão inválido.')
    nova.modo = corpo.modo as ModoPermissao
  }
  if (corpo.continuaDe !== undefined && corpo.continuaDe !== null) {
    nova.continuaDe = textoObrigatorio(corpo.continuaDe, 'A ordem a continuar é inválida.')
  }
  return nova
}

function lerLimite(valor: string | undefined): number | undefined {
  const texto = valor?.trim()
  if (!texto) return undefined
  const limite = Number(texto)
  if (!/^\d+$/.test(texto) || !Number.isSafeInteger(limite) || limite < 1) {
    throw new ErroEscritorio(400, 'O limite precisa ser um número inteiro maior que zero.')
  }
  return limite
}

function lerResposta(corpo: Record<string, unknown>): RespostaPendencia {
  if (typeof corpo.decisao !== 'string' || !DECISOES.has(corpo.decisao)) throw new ErroEscritorio(400, 'Decisão inválida.')
  const resposta: RespostaPendencia = { decisao: corpo.decisao as DecisaoPendencia }
  if (corpo.respostas !== undefined && corpo.respostas !== null) {
    const respostas = corpo.respostas
    if (typeof respostas !== 'object' || Array.isArray(respostas) || Object.values(respostas).some((v) => typeof v !== 'string')) {
      throw new ErroEscritorio(400, 'As respostas precisam ser textos, uma por pergunta.')
    }
    resposta.respostas = respostas as Record<string, string>
  }
  if (corpo.mensagem !== undefined && corpo.mensagem !== null) {
    if (typeof corpo.mensagem !== 'string') throw new ErroEscritorio(400, 'A mensagem precisa ser um texto.')
    if (corpo.mensagem.length > 5000) throw new ErroEscritorio(400, 'A mensagem passou de 5.000 caracteres.')
    if (corpo.mensagem.trim()) resposta.mensagem = corpo.mensagem.trim()
  }
  return resposta
}

// App HTTP do escritório: API REST, eventos ao vivo (SSE), /mcp e os arquivos da interface. Retorna o app Hono.
export function criarApp(escritorio: Escritorio, config: Config, opcoes: OpcoesApp = {}): Hono {
  const batimentoMs = opcoes.batimentoMs ?? 20_000
  const app = new Hono()
  const limiteDoCorpo = bodyLimit({
    maxSize: LIMITE_CORPO,
    onError: (c) => {
      c.header('Connection', 'close')
      return c.json({ erro: 'O corpo da requisição passou de 1 MB.' }, 400)
    },
  })

  app.use('*', async (c, next) => {
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Frame-Options', 'DENY')
  })

  app.use('/api/*', async (c, next) => {
    if (METODOS_QUE_MUDAM.has(c.req.method) && !ehJson(c.req.header('content-type'))) {
      return c.json({ erro: 'Envie os dados em JSON (content-type: application/json).' }, 415)
    }
    const publica = c.req.method === 'POST' && c.req.path === '/api/entrar'
    if (!publica && !requisicaoAutorizada(c.req.raw.headers, config.token)) {
      return c.json({ erro: 'Entre com a chave do escritório.' }, 401)
    }
    await next()
  }, limiteDoCorpo)

  app.post('/api/entrar', async (c) => {
    const corpo = await lerCorpo(c)
    const recebida = typeof corpo.token === 'string' ? corpo.token.trim() : null
    // Num link com a chave sem codificar, o '+' chega como espaço.
    if (!chaveConfere(recebida, config.token) && !chaveConfere(recebida?.replaceAll(' ', '+'), config.token)) {
      return c.json({ erro: 'Chave inválida.' }, 401)
    }
    c.header('Set-Cookie', cookieDeEntrada(config.token))
    return c.body(null, 204)
  })

  app.post('/api/sair', (c) => {
    c.header('Set-Cookie', cookieDeSaida())
    return c.body(null, 204)
  })

  app.get('/api/estado', (c) => c.json(escritorio.estado()))

  // Link do escritório para o celular (com a chave) e o QR dele, para a tela mostrar. Não fica em cache: leva a chave.
  app.get('/api/celular', (c) => {
    const links = opcoes.linksDoCelular?.() ?? linksDoBanner(config, config.porta).naRede
    const [link = null, ...outros] = links
    c.header('Cache-Control', 'no-store')
    return c.json({ link, outros, qr: link ? qrEmSvg(link) : null, motivo: link ? null : motivoSemCelular(config.host) })
  })

  // ── modo Vida ──
  app.get('/api/vida', (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json({ vida: escritorio.estadoDaVida(), falas: escritorio.falasDaVida(20), eventos: escritorio.eventosDaVida(null, 30) })
  })

  app.post('/api/vida', async (c) => {
    const corpo = await lerCorpo(c)
    if (typeof corpo.ligada !== 'boolean') throw new ErroEscritorio(400, 'Diga se a vida fica ligada ou desligada.')
    return c.json(escritorio.ligarVida(corpo.ligada))
  })

  app.get('/api/vida/mundo', (c) => c.json(escritorio.mundoDaVida()))

  app.post('/api/vida/vontade', async (c) => {
    const corpo = await lerCorpo(c)
    return c.json(escritorio.forcarVontade({
      agenteId: textoObrigatorio(corpo.agenteId, 'Escolha o agente.'),
      verbo: textoObrigatorio(corpo.verbo, 'Escolha o que ele vai querer.'),
      objetoId: textoOpcional(corpo.objetoId),
      vagaId: textoOpcional(corpo.vagaId),
      comId: textoOpcional(corpo.comId),
      tarefa: textoOpcional(corpo.tarefa),
      duracaoMs: typeof corpo.duracaoMs === 'number' ? corpo.duracaoMs : undefined,
    }), 201)
  })

  app.get('/api/vida/vontades', (c) => {
    const agenteId = c.req.query('agente')
    if (!agenteId) throw new ErroEscritorio(400, 'Diga de qual agente você quer as vontades.')
    return c.json(escritorio.vontadesDoAgente(agenteId, lerLimite(c.req.query('limite'))))
  })

  app.get('/api/vida/eventos', (c) => {
    const texto = c.req.query('desde')?.trim()
    if (texto && !/^\d+$/.test(texto)) throw new ErroEscritorio(400, 'O "desde" precisa ser um número.')
    return c.json(escritorio.eventosDaVida(texto ? Number(texto) : null, lerLimite(c.req.query('limite'))))
  })

  // ── sala de reunião ──
  app.get('/api/reuniao', (c) => c.json(escritorio.reuniaoAberta()))

  app.post('/api/reuniao', (c) => c.json(escritorio.abrirReuniao(), 201))

  app.post('/api/reuniao/convocar', async (c) => {
    const corpo = await lerCorpo(c)
    if (corpo.todos === true) return c.json(escritorio.convocarLivresParaReuniao())
    return c.json(escritorio.convocarParaReuniao(textoObrigatorio(corpo.agenteId, 'Escolha quem você quer chamar.')))
  })

  app.post('/api/reuniao/dispensar', async (c) => {
    const corpo = await lerCorpo(c)
    return c.json(escritorio.dispensarDaReuniao(textoObrigatorio(corpo.agenteId, 'Escolha quem você quer dispensar.')))
  })

  app.post('/api/reuniao/recado', async (c) => {
    const corpo = await lerCorpo(c)
    return c.json(escritorio.darRecadoNaReuniao(textoObrigatorio(corpo.texto, 'Escreva o recado da reunião.')))
  })

  app.post('/api/reuniao/encerrar', (c) => {
    escritorio.encerrarReuniao()
    return c.body(null, 204)
  })

  app.get('/api/agentes/:id', (c) => {
    const detalhe = escritorio.detalheAgente(c.req.param('id'))
    if (!detalhe) throw new ErroEscritorio(404, 'Agente não encontrado.')
    return c.json(detalhe)
  })

  app.get('/api/agentes/:id/historico', (c) => {
    const antesDe = c.req.query('antesDe')?.trim() || null
    return c.json(escritorio.historicoDoAgente(c.req.param('id'), antesDe, lerLimite(c.req.query('limite'))))
  })

  app.get('/api/ordens/:id', (c) => {
    const detalhe = escritorio.detalheOrdem(c.req.param('id'))
    if (!detalhe) throw new ErroEscritorio(404, 'Ordem não encontrada.')
    return c.json(detalhe)
  })

  app.post('/api/ordens', async (c) => c.json(escritorio.criarOrdem(lerNovaOrdem(await lerCorpo(c))), 201))

  app.post('/api/ordens/:id/parar', async (c) => c.json(await escritorio.pararOrdem(c.req.param('id'))))

  app.post('/api/ordens/:id/cancelar', (c) => c.json(escritorio.cancelarOrdem(c.req.param('id'))))

  app.post('/api/ordens/:id/retomar', async (c) => {
    const corpo = await lerCorpo(c)
    if (corpo.instrucao !== undefined && corpo.instrucao !== null && typeof corpo.instrucao !== 'string') {
      throw new ErroEscritorio(400, 'A instrução precisa ser um texto.')
    }
    const instrucao = typeof corpo.instrucao === 'string' && corpo.instrucao.trim() ? corpo.instrucao.trim() : undefined
    if (instrucao && instrucao.length > 20_000) throw new ErroEscritorio(400, 'A instrução passou de 20.000 caracteres.')
    return c.json(escritorio.retomarOrdem(c.req.param('id'), instrucao), 201)
  })

  app.post('/api/ordens/:id/vista', (c) => {
    escritorio.marcarVista(c.req.param('id'))
    return c.body(null, 204)
  })

  app.post('/api/ordens/:id/dispensar', (c) => {
    escritorio.dispensarResposta(c.req.param('id'))
    return c.body(null, 204)
  })

  app.post('/api/pendencias/:id/responder', async (c) => {
    const resposta = lerResposta(await lerCorpo(c))
    return c.json(escritorio.responderPendencia(c.req.param('id'), resposta))
  })

  app.get('/api/eventos', (c) => {
    c.header('X-Accel-Buffering', 'no')
    return streamSSE(c, async (stream) => {
      let fila: Promise<unknown> = Promise.resolve()
      const enviar = (escrever: () => Promise<unknown>) => {
        fila = fila.then(escrever).catch(() => {})
      }
      const acabou = new Promise<void>((resolve) => {
        stream.onAbort(() => resolve())
        c.req.raw.signal.addEventListener('abort', () => resolve(), { once: true })
      })
      const estado = JSON.stringify(escritorio.estado())
      enviar(() => stream.writeSSE({ event: 'estado', data: estado }))
      const cancelar = escritorio.assinar((evento) => {
        const dados = JSON.stringify(evento.dados)
        enviar(() => stream.writeSSE({ event: evento.tipo, data: dados }))
      })
      const batimento = setInterval(() => enviar(() => stream.write(': batimento\n\n')), batimentoMs)
      try {
        await acabou
      } finally {
        clearInterval(batimento)
        cancelar()
      }
    })
  })

  app.all('/api/*', (c) => c.json({ erro: 'Rota não encontrada.' }, 404))

  app.use('/mcp', async (c, next) => {
    if (!chaveConfere(chaveDoBearer(c.req.header('authorization')), config.token)) {
      c.header('WWW-Authenticate', 'Bearer realm="escritorio"')
      return c.json(erroJsonRpc(-32001, 'Chave inválida ou ausente. Use o cabeçalho Authorization: Bearer <chave>.'), 401)
    }
    await next()
  }, limiteDoCorpo)

  app.post('/mcp', (c) => responderMcp(c.req.raw, escritorio, config.versao))

  app.all('/mcp', (c) => {
    c.header('Allow', 'POST')
    return c.json(erroJsonRpc(-32000, 'Método não permitido.'), 405)
  })

  const indice = join(config.dirWeb, 'index.html')
  let arquivos: MiddlewareHandler | null = null

  app.get('*', async (c) => {
    if (!existsSync(indice)) return c.html(PAGINA_SEM_BUILD, 503)
    arquivos ??= serveStatic({
      root: config.dirWeb,
      onFound: (caminho, ctx) => {
        ctx.header('Cache-Control', caminho.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    })
    const resposta = await arquivos(c, async () => {})
    if (resposta) return resposta
    if (extname(c.req.path)) return c.text('Arquivo não encontrado.', 404)
    c.header('Cache-Control', 'no-cache')
    return c.html(await readFile(indice, 'utf8'))
  })

  app.notFound((c) => c.json({ erro: 'Rota não encontrada.' }, 404))

  app.onError((erro, c) => {
    if (ehErroEscritorio(erro)) return c.json({ erro: erro.message }, erro.status)
    if (erro instanceof HTTPException) return erro.getResponse()
    console.error(`[escritorio] Erro em ${c.req.method} ${c.req.path}:`, erro)
    return c.json({ erro: 'Erro interno.' }, 500)
  })

  return app
}
