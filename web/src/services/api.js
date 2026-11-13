// Cliente da API do servidor do escritório. Autentica pelo cookie HttpOnly que /api/entrar grava.

export class ErroApi extends Error {
  constructor(status, mensagem) {
    super(mensagem)
    this.name = 'ErroApi'
    this.status = status
  }
}

// Faz a chamada e devolve o JSON (ou null em 204). Lança ErroApi com a mensagem do servidor.
async function pedir(caminho, { metodo = 'GET', corpo, sinal } = {}) {
  let resposta
  try {
    resposta = await fetch(caminho, {
      method: metodo,
      credentials: 'same-origin',
      headers: corpo === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: sinal,
    })
  } catch (erro) {
    if (erro?.name === 'AbortError') throw erro
    throw new ErroApi(0, 'Sem conexão com o servidor do escritório.')
  }
  if (resposta.status === 204) return null
  const texto = await resposta.text()
  let dados = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = null
  }
  if (!resposta.ok) {
    const padrao = resposta.status === 401 ? 'Entre com a chave do escritório.' : 'Não foi possível concluir a ação.'
    throw new ErroApi(resposta.status, dados?.erro || padrao)
  }
  return dados
}

const id = (valor) => encodeURIComponent(valor)

export const api = {
  entrar: (token) => pedir('/api/entrar', { metodo: 'POST', corpo: { token } }),
  sair: () => pedir('/api/sair', { metodo: 'POST', corpo: {} }),
  estado: (opcoes) => pedir('/api/estado', opcoes),
  // Link do escritório para o celular (com a chave) e o QR dele: { link, outros, qr: { tamanho, caminho } }.
  celular: (opcoes) => pedir('/api/celular', opcoes),
  // Modo Vida: estado, ligar/desligar, catálogo do mundo e o que cada agente andou querendo.
  vida: (opcoes) => pedir('/api/vida', opcoes),
  ligarVida: (ligada) => pedir('/api/vida', { metodo: 'POST', corpo: { ligada } }),
  mundoDaVida: (opcoes) => pedir('/api/vida/mundo', opcoes),
  forcarVontade: (vontade) => pedir('/api/vida/vontade', { metodo: 'POST', corpo: vontade }),
  vontadesDoAgente: (agenteId, opcoes) => pedir(`/api/vida/agentes/${id(agenteId)}/vontades`, opcoes),
  eventosDaVida: (desde, opcoes) => pedir(`/api/vida/eventos${desde ? `?${new URLSearchParams({ desde: String(desde) })}` : ''}`, opcoes),
  agente: (agenteId, opcoes) => pedir(`/api/agentes/${id(agenteId)}`, opcoes),
  // Página do histórico, mais recentes primeiro, só as mais antigas que a ordem antesDe (null = primeira página).
  historicoDoAgente: (agenteId, antesDe, opcoes) => pedir(
    `/api/agentes/${id(agenteId)}/historico${antesDe ? `?${new URLSearchParams({ antesDe })}` : ''}`,
    opcoes,
  ),
  ordem: (ordemId, opcoes) => pedir(`/api/ordens/${id(ordemId)}`, opcoes),
  // nova = { agenteId, projeto, instrucao, modo, continuaDe? }
  criarOrdem: (nova) => pedir('/api/ordens', { metodo: 'POST', corpo: nova }),
  pararOrdem: (ordemId) => pedir(`/api/ordens/${id(ordemId)}/parar`, { metodo: 'POST', corpo: {} }),
  cancelarOrdem: (ordemId) => pedir(`/api/ordens/${id(ordemId)}/cancelar`, { metodo: 'POST', corpo: {} }),
  retomarOrdem: (ordemId, instrucao) => pedir(`/api/ordens/${id(ordemId)}/retomar`, { metodo: 'POST', corpo: instrucao ? { instrucao } : {} }),
  marcarVista: (ordemId) => pedir(`/api/ordens/${id(ordemId)}/vista`, { metodo: 'POST', corpo: {} }),
  dispensarResposta: (ordemId) => pedir(`/api/ordens/${id(ordemId)}/dispensar`, { metodo: 'POST', corpo: {} }),
  // resposta = { decisao, respostas?, mensagem? }
  responderPendencia: (pendenciaId, resposta) => pedir(`/api/pendencias/${id(pendenciaId)}/responder`, { metodo: 'POST', corpo: resposta }),
  // Sala de reunião: a reunião aberta (ou null), abrir, chamar, dispensar, deixar o recado e encerrar.
  reuniao: (opcoes) => pedir('/api/reuniao', opcoes),
  abrirReuniao: () => pedir('/api/reuniao', { metodo: 'POST', corpo: {} }),
  convocar: (agenteId) => pedir('/api/reuniao/convocar', { metodo: 'POST', corpo: { agenteId } }),
  convocarLivres: () => pedir('/api/reuniao/convocar', { metodo: 'POST', corpo: { todos: true } }),
  dispensarDaReuniao: (agenteId) => pedir('/api/reuniao/dispensar', { metodo: 'POST', corpo: { agenteId } }),
  darRecado: (texto) => pedir('/api/reuniao/recado', { metodo: 'POST', corpo: { texto } }),
  encerrarReuniao: () => pedir('/api/reuniao/encerrar', { metodo: 'POST', corpo: {} }),
}

const TIPOS_TEMPO_REAL = ['estado', 'agente', 'ordem', 'evento', 'pendencia', 'conta', 'vida', 'fala', 'reuniao']

// Abre o fluxo de eventos (SSE). aoEvento({ tipo, dados }) recebe cada evento; aoConexao('aovivo' | 'reconectando')
// avisa a situação da conexão (o EventSource reconecta sozinho e o servidor manda o estado inteiro de novo).
// Retorna a função que fecha o fluxo.
export function abrirEventos(aoEvento, aoConexao) {
  const fonte = new EventSource('/api/eventos', { withCredentials: true })
  const ouvintes = TIPOS_TEMPO_REAL.map((tipo) => {
    const ouvinte = (mensagem) => {
      let dados
      try {
        dados = JSON.parse(mensagem.data)
      } catch {
        return
      }
      aoEvento({ tipo, dados })
    }
    fonte.addEventListener(tipo, ouvinte)
    return [tipo, ouvinte]
  })
  const aoAbrir = () => aoConexao?.('aovivo')
  const aoErro = () => aoConexao?.('reconectando')
  fonte.addEventListener('open', aoAbrir)
  fonte.addEventListener('error', aoErro)
  return () => {
    for (const [tipo, ouvinte] of ouvintes) fonte.removeEventListener(tipo, ouvinte)
    fonte.removeEventListener('open', aoAbrir)
    fonte.removeEventListener('error', aoErro)
    fonte.close()
  }
}
