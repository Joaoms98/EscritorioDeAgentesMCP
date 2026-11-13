import { realpathSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { lerConfig } from './config.ts'
import { criarEscritorio } from './escritorio.ts'
import { criarExecucaoReal, sondarConta } from './execucao.ts'
import { criarApp } from './http.ts'
import { linksDoBanner, textoDosLinks } from './links.ts'
import { carregarVida, personalidadePadrao, vigiarVida } from './personalidades.ts'
import { criarExecucaoSimulada } from './simulado.ts'
import { criarExecucaoDaVidaReal } from './execucaoVida.ts'
import { criarVida } from './vida.ts'
import { criarDeliberadorBarato, criarDeliberadorHaiku } from './vontade.ts'
import { travarPastaDeDados } from './trava.ts'
import type { Config, Escritorio } from './tipos.ts'

// O SDK avisa em toda ordem que o allowedTools dispensa o canUseTool para o informar_status, que é o que queremos.
const emitirAviso = process.emitWarning.bind(process) as (...argumentos: unknown[]) => void
process.emitWarning = ((aviso: unknown, ...resto: unknown[]) => {
  const opcoes = resto[0]
  if (opcoes && typeof opcoes === 'object' && (opcoes as { code?: unknown }).code === 'CLAUDE_SDK_CAN_USE_TOOL_SHADOWED') return
  emitirAviso(aviso, ...resto)
}) as typeof process.emitWarning

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro)
}

function mostrarBanner(config: Config, porta: number, urlWeb: string | null): void {
  const links = linksDoBanner(config, porta, urlWeb)
  console.log(['', `Escritório de Agentes ${config.versao} está no ar.`, '', textoDosLinks(links)].join('\n'))
  const { comandoMcp } = links
  console.log([
    '  Para usar pelo Claude Code (MCP), em todos os seus projetos:',
    `    ${comandoMcp}`,
    '',
    `  Dados: ${config.dirDados}`,
    ...(config.simulado ? ['  Modo simulado: os agentes são de mentira e não usam sua conta Claude.'] : []),
    '  Ctrl+C desliga o escritório.',
    '',
  ].join('\n'))
}

function conferirConta(escritorio: Escritorio, config: Config): void {
  if (config.simulado) {
    escritorio.atualizarConta({ email: 'simulado@local', plano: 'Simulação', autenticada: true, erro: null })
    return
  }
  sondarConta(config).then(
    ({ email, plano }) => {
      escritorio.atualizarConta({ email, plano, autenticada: true, erro: null })
      console.log(`Conta Claude: ${email ?? 'sem e-mail'}${plano ? ` (${plano})` : ''}.`)
    },
    (erro: unknown) => {
      escritorio.atualizarConta({ email: null, plano: null, autenticada: false, erro: mensagemDe(erro) })
      console.error(`Não consegui confirmar a conta Claude: ${mensagemDe(erro)}`)
    },
  )
}

function escutar(app: { fetch: (requisicao: Request) => Response | Promise<Response> }, config: Config): Promise<Server> {
  return new Promise((resolve, rejeitar) => {
    const servidor = serve({ fetch: app.fetch, port: config.porta, hostname: config.host }, () => resolve(servidor)) as Server
    servidor.once('error', rejeitar)
  })
}

async function principal(): Promise<void> {
  // Ouvinte único desde antes da trava: sem ouvinte o sinal mata sem o 'exit' (a trava fica), e trocá-lo perde um sinal pendente.
  let desligar: (() => Promise<void>) | null = null
  const aoSinal = () => {
    if (desligar) void desligar()
    else process.exit(1)
  }
  process.on('SIGINT', aoSinal)
  process.on('SIGTERM', aoSinal)
  // Fechar a janela do terminal manda SIGHUP: sem isto o servidor morria sem soltar a trava da pasta de dados.
  process.on('SIGHUP', aoSinal)
  const config = lerConfig()
  const trava = travarPastaDeDados(config.dirDados)
  process.once('exit', () => trava.soltar())
  const escritorio = criarEscritorio({
    config,
    criarExecucao: config.simulado ? criarExecucaoSimulada : criarExecucaoReal,
    criarVida: (nucleo) => {
      // Os .md da vida são relidos a quente: dá para mexer na personalidade de alguém com o escritório no ar.
      let lida = carregarVida(config.dirVida, nucleo.agentes())
      for (const aviso of lida.avisos) console.log(`[vida] ${aviso}`)
      vigiarVida(config.dirVida, () => {
        lida = carregarVida(config.dirVida, nucleo.agentes())
      })
      return criarVida({
        config,
        banco: nucleo.banco,
        // No modo simulado (e sem conta) ninguém gasta token: a vida anda com o deliberador determinístico.
        deliberador: config.simulado ? criarDeliberadorBarato() : criarDeliberadorHaiku({ config }),
        agentes: nucleo.agentes,
        personalidadeDe: (agente) => lida.personalidades.get(agente.id) ?? personalidadePadrao(agente),
        regras: () => lida.regras,
        ocupadoComOHumano: nucleo.ocupadoComOHumano,
        algumaOrdemDoHumano: nucleo.algumaOrdemDoHumano,
        emitir: nucleo.emitir,
        aoMudarAgente: nucleo.aoMudarAgente,
        criarExecucaoDaVida: criarExecucaoDaVidaReal,
      })
    },
  })
  const urlWeb = process.env.ESCRITORIO_URL_WEB ?? null
  // A porta de verdade só se sabe depois de abrir o servidor (ESCRITORIO_PORTA=0 escolhe uma livre).
  let porta = config.porta
  const app = criarApp(escritorio, config, { linksDoCelular: () => linksDoBanner(config, porta, urlWeb).naRede })
  let servidor: Server
  try {
    servidor = await escutar(app, config)
  } catch (erro) {
    // Sem iniciar() o banco ficou como estava; encerrar() ainda expiraria as pendências abertas.
    const ocupada = (erro as NodeJS.ErrnoException).code === 'EADDRINUSE'
    throw new Error(ocupada
      ? `A porta ${config.porta} já está em uso. Feche o outro servidor ou escolha outra com ESCRITORIO_PORTA.`
      : `Não consegui abrir o servidor em ${config.host}:${config.porta}: ${mensagemDe(erro)}`)
  }
  porta = (servidor.address() as AddressInfo).port
  await escritorio.iniciar()
  mostrarBanner(config, porta, urlWeb)
  conferirConta(escritorio, config)

  let desligando = false
  desligar = async () => {
    if (desligando) process.exit(1)
    desligando = true
    console.log('\nDesligando o escritório…')
    setTimeout(() => process.exit(1), 10_000).unref()
    try {
      await escritorio.encerrar()
    } catch (erro) {
      console.error('Falha ao encerrar o escritório:', erro)
    }
    servidor.closeAllConnections()
    await new Promise((resolve) => servidor.close(resolve))
    process.exit(0)
  }
}

// Diz se este arquivo é o programa que o node rodou (os testes só importam as funções do banner).
// import.meta.main só existe a partir do Node 24.2; antes, compara com o script da linha de comando.
export function ehOProgramaPrincipal(principal: boolean | undefined, script: string | undefined): boolean {
  if (typeof principal === 'boolean') return principal
  if (!script) return false
  try {
    return realpathSync(script) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}

if (ehOProgramaPrincipal(import.meta.main, process.argv[1])) {
  principal().catch((erro: unknown) => {
    console.error(`Não foi possível iniciar o Escritório de Agentes: ${mensagemDe(erro)}`)
    process.exit(1)
  })
}
