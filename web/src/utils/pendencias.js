const ROTULO_DA_DECISAO = {
  permitir: 'Permitido',
  permitir_sempre: 'Permitido sempre nesta sessão',
  negar: 'Negado',
  responder: 'Respondido',
  recusar: 'Ficou sem resposta',
  aprovar: 'Plano aprovado',
  aprovar_editando: 'Plano aprovado, liberando tudo',
  ajustar: 'Pediu ajustes no plano',
}

// Perguntas do AskUserQuestion num formato estável para a tela. Retorna [{ pergunta, cabecalho, multipla, opcoes }].
export function perguntasDaEntrada(entrada) {
  const lista = Array.isArray(entrada?.questions) ? entrada.questions : []
  return lista
    .filter((q) => q && typeof q.question === 'string' && q.question.trim())
    .map((q) => ({
      pergunta: q.question,
      cabecalho: typeof q.header === 'string' ? q.header : '',
      multipla: Boolean(q.multiSelect),
      opcoes: (Array.isArray(q.options) ? q.options : [])
        .map((o) => (typeof o === 'string'
          ? { rotulo: o, descricao: '' }
          : { rotulo: String(o?.label ?? ''), descricao: String(o?.description ?? '') }))
        .filter((o) => o.rotulo),
    }))
}

// Resposta no formato do SDK (rótulos por vírgula; "Outro" vira o texto livre). Retorna a string ou ''.
export function textoDaResposta(pergunta, escolha) {
  const livre = escolha.outro ? escolha.texto.trim() : ''
  if (pergunta.multipla) return [...escolha.rotulos, ...(livre ? [livre] : [])].join(', ')
  return escolha.outro ? livre : (escolha.rotulos[0] ?? '')
}

// Nome legível da ferramenta ("mcp__srv__tool" vira "tool (srv)"). Retorna a string.
export function nomeDaFerramenta(nome) {
  const partes = /^mcp__(.+?)__(.+)$/.exec(nome ?? '')
  return partes ? `${partes[2]} (${partes[1]})` : nome ?? ''
}

// Rótulo da decisão tomada numa pendência. Retorna a string.
export function rotuloDaDecisao(decisao) {
  return ROTULO_DA_DECISAO[decisao] ?? decisao
}

function partesDoCaminho(caminho) {
  const partes = []
  for (const parte of String(caminho).split(/[\\/]+/)) {
    if (parte === '..') partes.pop()
    else if (parte && parte !== '.') partes.push(parte)
  }
  return partes
}

// Diz se um caminho absoluto fica fora da pasta (o relativo é relativo à própria pasta). Retorna true ou false.
export function foraDaPasta(caminho, pasta) {
  if (!caminho || !pasta || !/^([\\/]|[A-Za-z]:)/.test(caminho)) return false
  const alvo = partesDoCaminho(caminho)
  const base = partesDoCaminho(pasta)
  return base.length > alvo.length || base.some((parte, i) => parte !== alvo[i])
}

// Primeiras linhas de um texto. Retorna { texto, sobra } (sobra = linhas que ficaram de fora).
export function cortarLinhas(texto, maximo) {
  const linhas = String(texto ?? '').replace(/\n+$/, '').split('\n')
  if (linhas.length <= maximo) return { texto: linhas.join('\n'), sobra: 0 }
  return { texto: linhas.slice(0, maximo).join('\n'), sobra: linhas.length - maximo }
}

// JSON legível de qualquer valor. Retorna a string.
export function textoJson(valor) {
  try {
    return JSON.stringify(valor, null, 2) ?? String(valor)
  } catch {
    return String(valor)
  }
}

// Últimos parágrafos do resultado, onde costuma estar a pergunta do agente. Retorna a string em markdown.
export function ultimosParagrafos(texto, quantos = 2, limite = 900) {
  const blocos = String(texto ?? '').trim().split(/\n\s*\n/).filter((b) => b.trim())
  const fim = blocos.slice(-quantos).join('\n\n')
  return fim.length > limite ? `…${fim.slice(-limite)}` : fim
}
