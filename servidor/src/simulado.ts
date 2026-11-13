import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type { FabricaExecucao, FimExecucao, ModoPermissao, PedidoHumano, RespostaPendencia, Todo } from './tipos.ts'

type Passo = { ferramenta: string; atividade: string; entrada: Record<string, unknown> }

const PASSOS: readonly Passo[] = [
  { ferramenta: 'Read', atividade: 'Lendo package.json', entrada: { file_path: 'package.json' } },
  { ferramenta: 'Glob', atividade: 'Procurando arquivos src/**/*.ts', entrada: { pattern: 'src/**/*.ts' } },
  { ferramenta: 'Read', atividade: 'Lendo src/app.ts', entrada: { file_path: 'src/app.ts' } },
  { ferramenta: 'Grep', atividade: 'Buscando "TODO"', entrada: { pattern: 'TODO' } },
  {
    ferramenta: 'Edit',
    atividade: 'Editando src/app.ts',
    entrada: { file_path: 'src/app.ts', old_string: 'export function iniciar() {', new_string: 'export function iniciar(opcoes = {}) {' },
  },
  { ferramenta: 'Bash', atividade: 'Executando: npm test', entrada: { command: 'npm test', description: 'Rodar os testes' } },
  { ferramenta: 'Write', atividade: 'Escrevendo src/app.test.ts', entrada: { file_path: 'src/app.test.ts' } },
  { ferramenta: 'Bash', atividade: 'Executando: npm test', entrada: { command: 'npm test', description: 'Rodar os testes' } },
]

const TAREFAS = [
  { conteudo: 'Entender o pedido e o código envolvido', ativo: 'Entendendo o pedido e o código envolvido' },
  { conteudo: 'Fazer a mudança', ativo: 'Fazendo a mudança' },
  { conteudo: 'Rodar os testes', ativo: 'Rodando os testes' },
  { conteudo: 'Revisar o resultado', ativo: 'Revisando o resultado' },
]

const PERGUNTA = 'Qual abordagem você prefere?'
const PASSO_DA_PERGUNTA = 2
const PASSO_DO_PLANO = 4
const PASSO_DA_PERMISSAO = 5
const PAUSA_INICIAL_MS = 400
const PAUSA_FINAL_MS = 1000

// Execução de mentira para desenvolver e demonstrar o painel sem a conta Claude. Retorna um roteiro fixo guiado por timers.
export const criarExecucaoSimulada: FabricaExecucao = ({ ordem, agente, retomarSessao, ganchos }) => {
  const semente = fnv1a(ordem.id)
  const pedido = normalizar(ordem.instrucao)
  const querPerguntaNoFinal = pedido.includes('pergunta no final')
  const querPergunta = pedido.replaceAll('pergunta no final', '').includes('pergunt')
  const querPermissao = pedido.includes('permiss') || pedido.includes('comando')
  const querErro = pedido.includes('erro')
  const totalDeTarefas = 3 + (semente % 2)
  const temporizadores = new Set<NodeJS.Timeout>()
  const sinal = new AbortController()
  const notas: string[] = []
  let comecou = false
  let acabou = false
  let inicio = Date.now()
  let ultimosTodos = ''
  // Como no Claude Code, aprovar o plano troca o modo da sessão; no automático o comando roda sem pedir.
  let modo: ModoPermissao = ordem.modo

  const dormir = (ms: number): Promise<void> => new Promise((resolver) => {
    const temporizador = setTimeout(() => {
      temporizadores.delete(temporizador)
      resolver()
    }, ms)
    temporizadores.add(temporizador)
  })

  const limparTimers = (): void => {
    for (const temporizador of temporizadores) clearTimeout(temporizador)
    temporizadores.clear()
  }

  const terminar = (fim: Pick<FimExecucao, 'status' | 'resultado' | 'erro'>): void => {
    if (acabou) return
    acabou = true
    limparTimers()
    ganchos.aoTerminar({
      ...fim,
      custoUsd: Number((0.01 + (semente % 2900) / 10_000).toFixed(4)),
      turnos: 3 + (semente % 10),
      duracaoMs: Date.now() - inicio,
      tokensEntrada: 8000 + (semente % 52_000),
      tokensSaida: 500 + (semente % 4500),
    })
    sinal.abort()
  }

  const intervalo = (passo: number): number => 1600 + (fnv1a(`${ordem.id}:${passo}`) % 801)

  const atualizarTodos = (passo: number): void => {
    const emAndamento = Math.min(totalDeTarefas, Math.floor((passo * totalDeTarefas) / PASSOS.length))
    const todos: Todo[] = TAREFAS.slice(0, totalDeTarefas).map((tarefa, indice) => {
      if (indice < emAndamento) return { conteudo: tarefa.conteudo, status: 'feito' }
      if (indice === emAndamento) return { conteudo: tarefa.conteudo, status: 'andamento', ativo: tarefa.ativo }
      return { conteudo: tarefa.conteudo, status: 'pendente' }
    })
    const json = JSON.stringify(todos)
    if (json === ultimosTodos) return
    ultimosTodos = json
    ganchos.aoTodos(todos)
  }

  const pedir = async (pedidoHumano: PedidoHumano): Promise<RespostaPendencia | null> => {
    const resposta = await ganchos.pedirAoHumano(pedidoHumano, sinal.signal)
    if (acabou) return null
    if (!resposta) {
      terminar({ status: 'parada', resultado: null, erro: null })
      return null
    }
    return resposta
  }

  const perguntar = async (): Promise<boolean> => {
    const entrada = {
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
    }
    ganchos.aoAtividade('Preparando uma pergunta para você')
    ganchos.aoEvento('ferramenta', 'Preparando uma pergunta para você', { nome: 'AskUserQuestion', entrada })
    const resposta = await pedir({
      tipo: 'pergunta',
      ferramenta: 'AskUserQuestion',
      titulo: 'Tem uma pergunta para você',
      descricao: null,
      entrada,
      permiteSempre: false,
      caminhoBloqueado: null,
    })
    if (!resposta) return false
    const escolha = resposta.respostas?.[PERGUNTA] ?? Object.values(resposta.respostas ?? {})[0]
    if (resposta.decisao === 'responder' && escolha) {
      notas.push(`Você escolheu a abordagem **${escolha}**.`)
    } else {
      ganchos.aoEvento('texto', 'Sem resposta, sigo pela abordagem mais simples.')
      notas.push('Você preferiu não escolher a abordagem, então segui pela mais simples.')
    }
    return true
  }

  const pedirPlano = async (): Promise<boolean> => {
    const plano = [
      '## Plano',
      '',
      `Para: ${ordem.instrucao.slice(0, 120)}`,
      '',
      '1. Ler o código envolvido em `src/app.ts`.',
      '2. Fazer a mudança pedida, sem mexer no resto.',
      '3. Rodar `npm test` e conferir o resultado.',
    ].join('\n')
    ganchos.aoAtividade('Apresentando o plano')
    ganchos.aoEvento('ferramenta', 'Apresentando o plano', { nome: 'ExitPlanMode', entrada: { plan: plano } })
    const resposta = await pedir({
      tipo: 'plano',
      ferramenta: 'ExitPlanMode',
      titulo: 'Terminou o plano e quer sua aprovação',
      descricao: null,
      entrada: { plan: plano },
      permiteSempre: false,
      caminhoBloqueado: null,
    })
    if (!resposta) return false
    if (resposta.decisao === 'ajustar') {
      ganchos.aoEvento('texto', resposta.mensagem ? `Ajustei o plano: ${resposta.mensagem}` : 'Ajustei o plano como você pediu.')
      notas.push('Ajustei o plano como você pediu antes de mexer no código.')
    } else {
      modo = resposta.decisao === 'aprovar_editando' ? 'bypassPermissions' : 'default'
      notas.push(resposta.decisao === 'aprovar_editando' ? 'Você aprovou o plano e liberou tudo.' : 'Você aprovou o plano.')
    }
    return true
  }

  const pedirPermissao = async (): Promise<boolean> => {
    const entrada = { command: 'npm install --save-dev vitest', description: 'Instalar o vitest' }
    ganchos.aoAtividade('Instalar o vitest')
    const resposta = await pedir({
      tipo: 'permissao',
      ferramenta: 'Bash',
      titulo: 'Quer executar um comando',
      descricao: null,
      entrada,
      permiteSempre: true,
      caminhoBloqueado: null,
    })
    if (!resposta) return false
    if (resposta.decisao === 'negar') {
      ganchos.aoEvento('texto', resposta.mensagem ? `Tudo bem, não instalei o vitest (${resposta.mensagem}).` : 'Tudo bem, não instalei o vitest.')
      notas.push('Você negou a instalação do vitest, então segui sem ele.')
    } else {
      ganchos.aoEvento('ferramenta', 'Instalar o vitest', { nome: 'Bash', entrada })
      notas.push(resposta.decisao === 'permitir_sempre'
        ? 'Você liberou comandos assim pelo resto da sessão e eu instalei o vitest.'
        : 'Você permitiu e eu instalei o vitest.')
    }
    return true
  }

  const executarPasso = (passo: number): void => {
    const atual = PASSOS[passo]
    if (!atual) return
    atualizarTodos(passo)
    ganchos.aoAtividade(atual.atividade)
    ganchos.aoEvento('ferramenta', atual.atividade, { nome: atual.ferramenta, entrada: atual.entrada })
    if (passo === 3) {
      ganchos.aoEvento('texto', 'Achei onde mexer: a parte principal fica em src/app.ts. Vou ajustar e depois rodar os testes.')
    }
  }

  const montarResultado = (): string => {
    const linhas = [
      '## Resumo',
      '',
      `Ordem simulada concluída no projeto **${basename(ordem.projeto)}**.`,
      '',
      '- Li o código envolvido e ajustei `src/app.ts`.',
      `- Rodei \`npm test\`: ${12 + (semente % 30)} testes passaram.`,
      ...notas.map((nota) => `- ${nota}`),
    ]
    if (querPerguntaNoFinal) linhas.push('', 'Quer que eu já abra o PR?')
    return linhas.join('\n')
  }

  const roteiro = async (): Promise<void> => {
    await dormir(PAUSA_INICIAL_MS)
    if (acabou) return
    const modelo = agente.modelo ?? 'opus'
    ganchos.aoIniciarSessao({ sessaoId: retomarSessao ?? randomUUID(), modelo })
    ganchos.aoEvento('sistema', `${retomarSessao ? 'Sessão retomada' : 'Sessão iniciada'} (modelo ${modelo})`)
    for (let passo = 0; passo < PASSOS.length; passo++) {
      await dormir(intervalo(passo))
      if (acabou) return
      if (passo === PASSO_DA_PERGUNTA && querPergunta && !(await perguntar())) return
      if (passo === PASSO_DO_PLANO && ordem.modo === 'plan' && !(await pedirPlano())) return
      if (passo === PASSO_DA_PERMISSAO && querPermissao && modo !== 'bypassPermissions' && !(await pedirPermissao())) return
      if (acabou) return
      executarPasso(passo)
    }
    await dormir(PAUSA_FINAL_MS)
    if (acabou) return
    atualizarTodos(PASSOS.length)
    if (querErro) {
      terminar({ status: 'erro', resultado: null, erro: 'Falha simulada: o comando npm test saiu com código 1.' })
      return
    }
    terminar({ status: 'concluida', resultado: montarResultado(), erro: null })
  }

  return {
    iniciar() {
      if (comecou || acabou) return
      comecou = true
      inicio = Date.now()
      roteiro().catch((erro: unknown) => {
        terminar({
          status: 'erro',
          resultado: null,
          erro: `O roteiro simulado falhou: ${erro instanceof Error ? erro.message : String(erro)}`,
        })
      })
    },
    async parar() {
      terminar({ status: 'parada', resultado: null, erro: null })
    },
    encerrar() {
      if (acabou) return
      acabou = true
      limparTimers()
      sinal.abort()
    },
  }
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase()
}

function fnv1a(texto: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}
