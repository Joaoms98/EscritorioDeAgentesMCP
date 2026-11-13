import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { AgenteComEstado, DecisaoPendencia, DetalheAgente, Escritorio, Ordem, Pendencia } from './tipos.ts'
import { ErroEscritorio } from './tipos.ts'

const LIMITE_PERGUNTA = 500

const DECISOES = [
  'permitir',
  'permitir_sempre',
  'negar',
  'responder',
  'recusar',
  'aprovar',
  'aprovar_editando',
  'ajustar',
] as const satisfies readonly DecisaoPendencia[]

const SOMENTE_LEITURA = { readOnlyHint: true, openWorldHint: false }

function emTexto(dados: unknown): CallToolResult {
  return { content: [{ type: 'text', text: typeof dados === 'string' ? dados : JSON.stringify(dados, null, 2) }] }
}

function ehErroEscritorio(erro: unknown): erro is ErroEscritorio {
  return erro instanceof ErroEscritorio || (erro instanceof Error && erro.name === 'ErroEscritorio' && typeof (erro as { status?: unknown }).status === 'number')
}

async function protegido(acao: () => unknown): Promise<CallToolResult> {
  try {
    return emTexto(await acao())
  } catch (erro) {
    if (ehErroEscritorio(erro)) return { content: [{ type: 'text', text: erro.message }], isError: true }
    console.error('[escritorio] Erro numa ferramenta MCP:', erro)
    return { content: [{ type: 'text', text: 'Erro interno.' }], isError: true }
  }
}

function cortar(texto: string, limite: number): string {
  return texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto
}

// O fim do texto, onde fica a pergunta; quando corta, começa numa linha inteira se der. Retorna o trecho.
export function finalDoTexto(texto: string, limite: number): string {
  const limpo = texto.trim()
  if (limpo.length <= limite) return limpo
  let fim = limpo.slice(limpo.length - limite + 1)
  const quebra = fim.indexOf('\n')
  if (quebra >= 0 && fim.slice(quebra + 1).trim()) fim = fim.slice(quebra + 1)
  else if (/^[\uDC00-\uDFFF]/.test(fim)) fim = fim.slice(1)
  return `…${fim.trimStart()}`
}

// Acha o agente pelo id, pelo nome ou pelo apelido, sem diferenciar maiúsculas.
export function encontrarAgente(agentes: AgenteComEstado[], termo: string): AgenteComEstado {
  const alvo = termo.trim().toLowerCase()
  const agente =
    agentes.find((a) => a.id.toLowerCase() === alvo) ??
    agentes.find((a) => a.nome.toLowerCase() === alvo) ??
    agentes.find((a) => a.apelido.toLowerCase() === alvo)
  if (!agente) throw new ErroEscritorio(404, `Agente não encontrado: ${termo}. Agentes do escritório: ${agentes.map((a) => a.id).join(', ')}.`)
  return agente
}

function resumoDoAgente(agente: AgenteComEstado, detalhe: DetalheAgente | null) {
  const ordem = agente.ordemAtual
  const ultima = agente.ultimaOrdem
  const pergunta = detalhe?.perguntaFinal ?? null
  return {
    id: agente.id,
    nome: agente.nome,
    apelido: agente.apelido,
    estado: agente.estado,
    desde: agente.desde,
    projeto: ordem?.projeto ?? null,
    ordemAtual: ordem ? { id: ordem.id, status: ordem.status, modo: ordem.modo, instrucao: cortar(ordem.instrucao, 200) } : null,
    atividade: ordem?.atividade ?? null,
    fila: agente.fila,
    ordensNaFila: (detalhe?.fila ?? []).map((naFila) => ({ id: naFila.id, instrucao: cortar(naFila.instrucao, 200) })),
    pendencias: agente.pendencias,
    ultimaOrdem: ultima ? { id: ultima.id, status: ultima.status, instrucao: cortar(ultima.instrucao, 200), finalizadaEm: ultima.finalizadaEm } : null,
    perguntaFinal: pergunta ? { ordemId: pergunta.id, pergunta: finalDoTexto(pergunta.resultado ?? '', LIMITE_PERGUNTA) } : null,
  }
}

function resumoDaOrdemCriada(ordem: Ordem, agentes: AgenteComEstado[]) {
  return {
    id: ordem.id,
    status: ordem.status,
    agente: agentes.find((a) => a.id === ordem.agenteId)?.apelido ?? ordem.agenteId,
    projeto: ordem.projeto,
    modo: ordem.modo,
    continuaDe: ordem.continuaDe,
    mensagem: ordem.status === 'na_fila' ? 'A ordem entrou na fila.' : 'A ordem foi entregue ao agente.',
  }
}

function resumoDaPendencia(pendencia: Pendencia, agentes: AgenteComEstado[]) {
  return {
    id: pendencia.id,
    ordemId: pendencia.ordemId,
    agenteId: pendencia.agenteId,
    agente: agentes.find((a) => a.id === pendencia.agenteId)?.apelido ?? pendencia.agenteId,
    tipo: pendencia.tipo,
    titulo: pendencia.titulo,
    descricao: pendencia.descricao,
    ferramenta: pendencia.ferramenta,
    entrada: pendencia.entrada,
    permiteSempre: pendencia.permiteSempre,
    status: pendencia.status,
    criadaEm: pendencia.criadaEm,
  }
}

// Servidor MCP do escritório (um por requisição, no modo sem sessão).
export function criarServidorMcp(escritorio: Escritorio, versao: string): McpServer {
  const servidor = new McpServer(
    { name: 'escritorio-de-agentes', version: versao },
    {
      instructions:
        'Controla o Escritório de Agentes: veja os agentes, mande ordens, acompanhe o trabalho e responda o que eles perguntam. ' +
        'Pendências (permissões, perguntas e planos) se respondem com responder_pendencia. A pergunta que uma ordem fez no fim ' +
        '(perguntaFinal em listar_agentes) se responde com enviar_ordem e continuaDe, ou se dispensa com dispensar_pergunta.',
    },
  )

  servidor.registerTool('listar_agentes', {
    title: 'Listar agentes',
    description:
      'Lista os agentes do escritório com estado, projeto atual, atividade, ordens na fila, pendências, a última ordem terminada ' +
      'e a perguntaFinal: a pergunta com que uma ordem terminou, esperando resposta (ou null).',
    annotations: SOMENTE_LEITURA,
  }, async () => protegido(() => escritorio.estado().agentes.map((agente) => resumoDoAgente(agente, escritorio.detalheAgente(agente.id)))))

  servidor.registerTool('listar_projetos', {
    title: 'Listar projetos',
    description: 'Lista os projetos (pastas) onde os agentes podem trabalhar.',
    annotations: SOMENTE_LEITURA,
  }, async () => protegido(() => escritorio.estado().projetos))

  servidor.registerTool('enviar_ordem', {
    title: 'Enviar ordem',
    description:
      'Dá uma ordem a um agente. Se ele estiver ocupado, a ordem entra na fila. Para responder a uma ordem (por exemplo a ' +
      'perguntaFinal de listar_agentes), passe continuaDe com o id dela: a conversa continua na mesma sessão e no mesmo projeto.',
    inputSchema: {
      agente: z.string().min(1).describe('Id, nome ou apelido do agente (ex.: claude)'),
      projeto: z.string().min(1).optional()
        .describe('Nome do projeto (de listar_projetos) ou caminho absoluto da pasta. Obrigatório, menos com continuaDe (aí vem da ordem anterior)'),
      instrucao: z.string().min(1).max(20_000).describe('O que o agente deve fazer'),
      modo: z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan']).optional()
        .describe('default = pede confirmação; acceptEdits = edita sem perguntar; bypassPermissions = automático: edita e roda comandos sem perguntar (perguntas ainda chegam); plan = só planeja e pede aprovação. Com continuaDe, o padrão é o modo da ordem anterior'),
      continuaDe: z.string().min(1).optional().describe('Id de uma ordem do mesmo agente para continuar a conversa dela'),
    },
  }, async ({ agente, projeto, instrucao, modo, continuaDe }) => protegido(() => {
    const agentes = escritorio.estado().agentes
    const escolhido = encontrarAgente(agentes, agente)
    const anterior = continuaDe ? escritorio.detalheOrdem(continuaDe)?.ordem : null
    if (continuaDe && !anterior) throw new ErroEscritorio(404, 'Ordem não encontrada.')
    if (!anterior && !projeto) throw new ErroEscritorio(400, 'Escolha o projeto (ou passe continuaDe para continuar uma ordem).')
    const modoDaOrdem = modo ?? anterior?.modo
    const ordem = escritorio.criarOrdem({
      agenteId: escolhido.id,
      projeto: anterior ? anterior.projeto : projeto ?? '',
      instrucao,
      ...(modoDaOrdem ? { modo: modoDaOrdem } : {}),
      ...(anterior ? { continuaDe: anterior.id } : {}),
    })
    return resumoDaOrdemCriada(ordem, agentes)
  }))

  servidor.registerTool('ver_ordem', {
    title: 'Ver ordem',
    description: 'Mostra uma ordem: situação, resultado, pendências abertas e os últimos 20 eventos.',
    inputSchema: { id: z.string().min(1).describe('Id da ordem') },
    annotations: SOMENTE_LEITURA,
  }, async ({ id }) => protegido(() => {
    const detalhe = escritorio.detalheOrdem(id)
    if (!detalhe) throw new ErroEscritorio(404, 'Ordem não encontrada.')
    const agentes = escritorio.estado().agentes
    return {
      ordem: { ...detalhe.ordem, agente: detalhe.agente.apelido },
      pendencias: detalhe.pendencias.filter((p) => p.status === 'aberta').map((p) => resumoDaPendencia(p, agentes)),
      eventos: detalhe.eventos.slice(-20).map((e) => ({ tipo: e.tipo, texto: e.texto, criadoEm: e.criadoEm })),
    }
  }))

  // ── modo Vida ──
  servidor.registerTool('ver_vida', {
    title: 'Ver a vida dos agentes',
    description:
      'Mostra como está o modo Vida: ligado ou não, o ritmo, quanto já custou hoje e o que cada agente está fazendo por ' +
      'vontade própria, com o motivo que ele mesmo deu. Não mostra nada das ordens que você mandou.',
    annotations: SOMENTE_LEITURA,
  }, async () => protegido(() => {
    const vida = escritorio.estadoDaVida()
    return {
      ligada: vida.ligada,
      banda: vida.banda,
      motivoPausa: vida.motivoPausa,
      explicacao: vida.explicacao,
      modelo: vida.modelo,
      intervaloSegundos: Math.round(vida.intervaloMs / 1000),
      decisoesNaHora: vida.decisoesNaHora,
      custoUsdDoDia: vida.custoUsdDoDia,
      oficinaDisponivel: vida.oficinaDisponivel,
      pasta: vida.pasta,
      agentes: vida.agentes.map((item) => ({
        agente: item.agenteId,
        fazendo: item.rotulo,
        onde: item.vagaId,
        comQuem: item.comId,
        motivo: item.motivo,
        desde: item.desde,
      })),
    }
  }))

  servidor.registerTool('ligar_vida', {
    title: 'Ligar ou desligar a vida',
    description: 'Liga ou desliga a vida dos agentes. Desligar para tudo na hora e não deixa nada pela metade.',
    inputSchema: { ligada: z.boolean().describe('true liga, false desliga') },
  }, async ({ ligada }) => protegido(() => escritorio.ligarVida(ligada)))

  servidor.registerTool('listar_mundo', {
    title: 'Listar o mundo',
    description: 'O catálogo do escritório: cômodos, objetos, verbos e os lugares, com quem está em cada um.',
    annotations: SOMENTE_LEITURA,
  }, async () => protegido(() => {
    const mundo = escritorio.mundoDaVida()
    const ocupadas = new Map(escritorio.estadoDaVida().agentes.filter((item) => item.vagaId).map((item) => [item.vagaId!, item.agenteId]))
    return {
      comodos: mundo.comodos,
      objetos: mundo.objetos.map((objeto) => ({ id: objeto.id, nome: objeto.nome, comodo: objeto.comodoId, acao: objeto.acao, verbos: objeto.verbos, lugares: objeto.vagas.length })),
      verbos: mundo.verbos.map((verbo) => ({ id: verbo.id, descricao: verbo.descricao, alvo: verbo.alvo })),
      lugares: mundo.vagas.map((vaga) => ({ id: vaga.id, nome: vaga.nome, objeto: vaga.objetoId, ocupadoPor: ocupadas.get(vaga.id) ?? null })),
    }
  }))

  servidor.registerTool('vontades_do_agente', {
    title: 'Vontades de um agente',
    description: 'As últimas coisas que um agente quis fazer por conta própria, com o motivo e o que aconteceu.',
    inputSchema: {
      agente: z.string().min(1).describe('Id, nome ou apelido do agente'),
      limite: z.number().int().min(1).max(50).optional().describe('Quantas vontades (padrão 10)'),
    },
    annotations: SOMENTE_LEITURA,
  }, async ({ agente, limite }) => protegido(() => {
    const escolhido = encontrarAgente(escritorio.estado().agentes, agente)
    return escritorio.vontadesDoAgente(escolhido.id, limite ?? 10)
  }))

  servidor.registerTool('mandar_vontade', {
    title: 'Mandar uma vontade',
    description:
      'Faz um agente querer alguma coisa agora, sem gastar nada: ele larga o que estava fazendo e vai. Use os ids de ' +
      'listar_mundo. A vida precisa estar ligada.',
    inputSchema: {
      agente: z.string().min(1).describe('Id, nome ou apelido do agente'),
      verbo: z.string().min(1).describe('Id do verbo (de listar_mundo), por exemplo usar ou conversar'),
      objeto: z.string().min(1).optional().describe('Id do objeto, por exemplo fliperama'),
      lugar: z.string().min(1).optional().describe('Id do lugar, por exemplo lazer:7'),
      com: z.string().min(1).optional().describe('Id do outro agente, para conversar'),
      tarefa: z.string().min(1).max(600).optional().describe('Só para programar: o que ele vai fazer na pasta dele'),
    },
  }, async ({ agente, verbo, objeto, lugar, com, tarefa }) => protegido(() => {
    const agentes = escritorio.estado().agentes
    const escolhido = encontrarAgente(agentes, agente)
    const parceiro = com ? encontrarAgente(agentes, com) : null
    return escritorio.forcarVontade({
      agenteId: escolhido.id,
      verbo,
      objetoId: objeto ?? null,
      vagaId: lugar ?? null,
      comId: parceiro?.id ?? null,
      tarefa: tarefa ?? null,
    })
  }))

  servidor.registerTool('pausar_vida_do_agente', {
    title: 'Pausar a vida de um agente',
    description: 'Tira um agente da vida por alguns minutos, para ele ficar parado enquanto você manda ordens.',
    inputSchema: {
      agente: z.string().min(1).describe('Id, nome ou apelido do agente'),
      minutos: z.number().int().min(1).max(600).describe('Por quantos minutos'),
    },
  }, async ({ agente, minutos }) => protegido(() => {
    const escolhido = encontrarAgente(escritorio.estado().agentes, agente)
    return escritorio.pausarVidaDoAgente(escolhido.id, minutos) ?? { aviso: `${escolhido.apelido} não está vivendo agora.` }
  }))

  servidor.registerTool('listar_pendencias', {
    title: 'Listar pendências',
    description:
      'Lista o que os agentes estão esperando do humano durante uma ordem: permissões, perguntas e planos para aprovar. ' +
      'A pergunta com que uma ordem terminou não é pendência: ela aparece como perguntaFinal em listar_agentes.',
    annotations: SOMENTE_LEITURA,
  }, async () => protegido(() => {
    const agentes = escritorio.estado().agentes
    return escritorio.pendenciasAbertas().map((p) => resumoDaPendencia(p, agentes))
  }))

  servidor.registerTool('responder_pendencia', {
    title: 'Responder pendência',
    description:
      'Responde uma pendência. permissao: permitir | permitir_sempre | negar. pergunta: responder (com respostas: { "<texto exato da pergunta>": "<rótulo ou texto livre>" }) | recusar. plano: aprovar | aprovar_editando | ajustar (com mensagem).',
    inputSchema: {
      id: z.string().min(1).describe('Id da pendência'),
      decisao: z.enum(DECISOES).describe('Decisão do humano'),
      respostas: z.record(z.string(), z.string()).optional()
        .describe('Para perguntas: texto exato da pergunta -> resposta (vários rótulos separados por vírgula)'),
      mensagem: z.string().max(5000).optional().describe('Motivo da negação, ajuste pedido no plano ou observação'),
    },
  }, async ({ id, decisao, respostas, mensagem }) => protegido(() => {
    const pendencia = escritorio.responderPendencia(id, {
      decisao,
      ...(respostas ? { respostas } : {}),
      ...(mensagem ? { mensagem } : {}),
    })
    return resumoDaPendencia(pendencia, escritorio.estado().agentes)
  }))

  servidor.registerTool('parar_ordem', {
    title: 'Parar ordem',
    description: 'Para uma ordem que está rodando. Para tirar da fila uma ordem que ainda não começou, use cancelar_ordem.',
    inputSchema: { id: z.string().min(1).describe('Id da ordem') },
  }, async ({ id }) => protegido(async () => {
    const ordem = await escritorio.pararOrdem(id)
    return { id: ordem.id, status: ordem.status }
  }))

  servidor.registerTool('cancelar_ordem', {
    title: 'Cancelar ordem',
    description: 'Tira da fila uma ordem que ainda não começou.',
    inputSchema: { id: z.string().min(1).describe('Id da ordem na fila') },
  }, async ({ id }) => protegido(() => {
    const ordem = escritorio.cancelarOrdem(id)
    return { id: ordem.id, status: ordem.status }
  }))

  servidor.registerTool('retomar_ordem', {
    title: 'Retomar ordem',
    description:
      'Retoma, na mesma sessão, uma ordem interrompida, parada ou com erro. Cria uma ordem nova (que entra na fila se o agente ' +
      'estiver ocupado). Sem instrução, o agente continua de onde parou.',
    inputSchema: {
      id: z.string().min(1).describe('Id da ordem a retomar'),
      instrucao: z.string().max(20_000).optional().describe('O que dizer ao agente ao retomar (opcional)'),
    },
  }, async ({ id, instrucao }) => protegido(() => {
    const ordem = escritorio.retomarOrdem(id, instrucao?.trim() || undefined)
    return resumoDaOrdemCriada(ordem, escritorio.estado().agentes)
  }))

  servidor.registerTool('dispensar_pergunta', {
    title: 'Dispensar pergunta',
    description: 'Dispensa, sem responder, a pergunta com que uma ordem terminou (a perguntaFinal de listar_agentes).',
    inputSchema: { ordemId: z.string().min(1).describe('Id da ordem que terminou com a pergunta') },
  }, async ({ ordemId }) => protegido(() => {
    const detalhe = escritorio.detalheOrdem(ordemId)
    if (!detalhe) throw new ErroEscritorio(404, 'Ordem não encontrada.')
    if (!detalhe.ordem.aguardaResposta) return 'Essa ordem não tem pergunta esperando resposta.'
    escritorio.dispensarResposta(ordemId)
    return 'Pergunta dispensada.'
  }))

  return servidor
}

// Atende um POST em /mcp com um servidor e um transporte novos (sem sessão, resposta em JSON).
export async function responderMcp(requisicao: Request, escritorio: Escritorio, versao: string): Promise<Response> {
  const servidor = criarServidorMcp(escritorio, versao)
  const transporte = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await servidor.connect(transporte)
    return await transporte.handleRequest(requisicao)
  } finally {
    servidor.close().catch(() => {})
  }
}
