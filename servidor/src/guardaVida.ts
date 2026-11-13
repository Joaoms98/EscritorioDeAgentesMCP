import { homedir } from 'node:os'
import { isAbsolute, join, sep } from 'node:path'
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { caminhoDentro } from './oficina.ts'
import type { Config, GanchosOficina } from './tipos.ts'

// A guarda da sessão da oficina: o canUseTool que resolve sozinho, nega e NUNCA pergunta ao humano
// (camada A4 do plano). No modo Vida não existe o clique "permitir": é isso que fecha a porta.
// Ela é necessária, não suficiente — a parede é o sandbox de kernel (camada A5) montado em execucaoVida.ts.

// O conjunto de ferramentas que a sessão da oficina tem: o `tools:` do frontmatter do agente é descartado
// (a persona viaja, a concessão de ferramentas não).
export const FERRAMENTAS_DA_VIDA: readonly string[] = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'TodoWrite', 'Bash']

export const FERRAMENTAS_NEGADAS: readonly string[] = [
  'Task',
  'WebFetch',
  'WebSearch',
  'NotebookEdit',
  'SlashCommand',
  'Skill',
  'KillShell',
  'AskUserQuestion',
  'ExitPlanMode',
  'BashOutput',
]

// As duas únicas que entram em allowedTools: allowedTools auto-aprova SEM passar pela guarda, então
// ferramenta de arquivo aqui sombrearia a guarda inteira.
export const FERRAMENTAS_MCP_LIBERADAS: readonly string[] = ['mcp__vida__falar', 'mcp__vida__olhar']

export const PREFIXO_MCP_DA_VIDA = 'mcp__vida__'
export const TETO_BYTES_POR_SESSAO = 2 * 1024 * 1024
export const TETO_ARQUIVOS_POR_SESSAO = 60
// Na terceira negação a sessão é interrompida: quem insiste em sair da pasta não está programando nada.
export const MAX_VIOLACOES = 3

const FERRAMENTAS_DE_ESCRITA = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const CHAVES_DE_CAMINHO = new Set([
  'path',
  'paths',
  'file_path',
  'file_paths',
  'filepath',
  'notebook_path',
  'old_path',
  'new_path',
  'cwd',
  'dir',
  'directory',
])
const PROGRAMAS_NEGADOS = new Set([
  'sudo', 'su', 'doas', 'ssh', 'scp', 'sftp', 'rsync', 'curl', 'wget', 'nc', 'ncat', 'netcat', 'telnet',
  'psql', 'mysql', 'mysqldump', 'mongo', 'mongosh', 'redis-cli', 'sqlite3',
  'aws', 'gcloud', 'az', 'gh', 'glab', 'docker', 'podman', 'kubectl', 'helm',
  'systemctl', 'service', 'crontab', 'at', 'mount', 'umount', 'chroot', 'unshare', 'bwrap',
  'apt', 'apt-get', 'dpkg', 'dnf', 'yum', 'pacman', 'brew', 'pip', 'pip3', 'pipx', 'npx', 'claude',
  'reboot', 'shutdown', 'chown', 'chgrp', 'killall', 'pkill',
])
const PARES_NEGADOS: ReadonlyArray<readonly [string, string]> = [
  ['git', 'push'],
  ['git', 'remote'],
  ['git', 'clone'],
  ['npm', 'publish'],
  ['yarn', 'publish'],
  ['pnpm', 'publish'],
]
const ENCADEAMENTOS: readonly string[] = [';', '&&', '||', '$(', '`', '\n', '\r']
// Com o que se programa: binário do sistema passa, todo outro caminho de fora não.
const PREFIXOS_DE_SISTEMA: readonly string[] = ['/usr/', '/bin/', '/sbin/', '/lib/', '/lib64/', '/dev/null']
const LIMITE_DO_COMANDO = 2000
const PROFUNDIDADE_MAXIMA = 6

// Um pedido de ferramenta recusado, com o motivo que vai para o painel e para o modelo.
type Negacao = { motivo: string }

// O canUseTool da oficina: confina caminho, corta o óbvio no Bash, impõe o teto de disco e avisa cada
// violação pelos ganchos. Retorna a função que o SDK chama antes de cada ferramenta.
export function criarGuardaDaVida(
  raiz: string,
  config: Pick<Config, 'dirDados' | 'dirProjetos'>,
  ganchos: { aoViolacao?: GanchosOficina['aoViolacao'] },
): CanUseTool {
  const proibidos = caminhosProibidos(config)
  let arquivos = 0
  let bytes = 0
  let violacoes = 0

  function negar(motivo: string): PermissionResult {
    violacoes++
    try {
      ganchos.aoViolacao?.(motivo)
    } catch (erro) {
      console.error('[escritorio] Gancho aoViolacao da oficina falhou:', erro)
    }
    const message = `No modo Vida você só escreve na sua pasta: ${raiz}. Motivo: ${motivo}.`
    // Interromper na terceira é o que impede uma sessão de gastar os 12 turnos batendo na parede.
    return violacoes >= MAX_VIOLACOES ? { behavior: 'deny', message, interrupt: true } : { behavior: 'deny', message }
  }

  return async (nome, entrada, opcoes) => {
    try {
      if (nome.startsWith(PREFIXO_MCP_DA_VIDA)) {
        // Só o servidor em processo que o próprio escritório registrou; prefixo de nome não é prova.
        if (opcoes.mcpServer && opcoes.mcpServer.source !== 'sdk') return negar(`servidor MCP de fora (${nome})`)
        return { behavior: 'allow', updatedInput: entrada }
      }
      if (!FERRAMENTAS_DA_VIDA.includes(nome)) return negar(`a ferramenta ${nome} não existe no modo Vida`)
      const foraDaPasta = conferirCaminhos(raiz, entrada)
      if (foraDaPasta) return negar(foraDaPasta.motivo)
      if (nome === 'Bash') {
        const comando = typeof entrada.command === 'string' ? entrada.command : null
        if (comando === null) return negar('não sei interpretar essa chamada de Bash (sem command)')
        const problema = comandoSeguro(raiz, comando, proibidos)
        if (problema) return negar(problema)
      }
      if (FERRAMENTAS_DE_ESCRITA.has(nome)) {
        const novos = bytesDaEscrita(entrada)
        if (arquivos + 1 > TETO_ARQUIVOS_POR_SESSAO) return negar(`teto de ${TETO_ARQUIVOS_POR_SESSAO} arquivos por sessão`)
        if (bytes + novos > TETO_BYTES_POR_SESSAO) return negar('teto de 2 MiB por sessão')
        arquivos++
        bytes += novos
      }
      return { behavior: 'allow', updatedInput: entrada }
    } catch (erro) {
      console.error('[escritorio] A guarda da oficina falhou:', erro)
      // Falha fechada: dúvida na guarda nega a chamada, nunca vira pergunta ao humano.
      return negar('a guarda não conseguiu conferir esta chamada')
    }
  }
}

// Confere a string de um comando de shell. ATENÇÃO, com todas as letras: isto é HEURÍSTICA, não
// fronteira. Serve para dar mensagem boa e cortar o óbvio; a parede é o sandbox de kernel. Retorna o
// motivo da recusa, ou null quando o comando passa.
export function comandoSeguro(raiz: string, comando: string, proibidos: readonly string[] = []): string | null {
  const texto = comando.trim()
  if (!texto) return 'comando vazio'
  if (texto.length > LIMITE_DO_COMANDO) return 'comando comprido demais'
  for (const sinal of ENCADEAMENTOS) {
    if (texto.includes(sinal)) return `encadeamento de comandos (${sinal === '\n' ? 'quebra de linha' : sinal})`
  }
  const tokens = texto.split(/\s+/).filter(Boolean)
  const primeiro = nomeDoPrograma(tokens[0] ?? '')
  if (PROGRAMAS_NEGADOS.has(primeiro)) return `o comando ${primeiro} não existe no modo Vida`
  for (const [programa, acao] of PARES_NEGADOS) {
    if (primeiro === programa && tokens.slice(1).some((token) => token === acao)) return `"${programa} ${acao}" não existe no modo Vida`
  }
  if (/(^|\s)rm\s+(-\S+\s+)*(\/|~)(\s|$)/.test(texto)) return 'apagar a raiz do disco ou a casa do humano'
  for (const achado of texto.matchAll(/(^|\s)\d?>>?\s*(['"]?)([^\s'"|&;]+)/g)) {
    const alvo = achado[3] ?? ''
    if (alvo === '/dev/null') continue
    if (!caminhoDentro(raiz, alvo)) return `redirecionamento para fora da sua pasta (${alvo})`
  }
  for (const achado of texto.matchAll(/(^|\s)cd\s+(['"]?)([^\s'"]+)/g)) {
    const alvo = achado[3] ?? ''
    if (!caminhoDentro(raiz, alvo)) return `cd para fora da sua pasta (${alvo})`
  }
  for (const token of tokens) {
    const limpo = token.replace(/^['"]|['"]$/g, '')
    if (!limpo.startsWith('/') && !limpo.startsWith('~') && !limpo.includes('..')) continue
    for (const proibido of proibidos) {
      if (limpo === proibido || limpo.startsWith(proibido + sep)) return `caminho proibido no comando (${limpo})`
    }
    // Os binários do sistema passam (é com eles que se programa); todo outro caminho de fora, não.
    if (PREFIXOS_DE_SISTEMA.some((prefixo) => limpo === prefixo || limpo.startsWith(prefixo))) continue
    if (!caminhoDentro(raiz, limpo)) return `caminho para fora da sua pasta (${limpo})`
  }
  return null
}

// Os caminhos que nem aparecem num comando: os dados do escritório, os projetos do humano e as
// credenciais da casa. Retorna a lista já resolvida.
export function caminhosProibidos(config: Pick<Config, 'dirDados' | 'dirProjetos'>): string[] {
  const casa = homedir()
  return [
    config.dirDados,
    config.dirProjetos,
    join(casa, '.claude'),
    join(casa, '.ssh'),
    join(casa, '.aws'),
    join(casa, '.config', 'gcloud'),
  ]
}

// A base literal de um padrão de Glob/Grep ('/etc/**' => '/etc', 'src/*.ts' => 'src', '**/*.ts' => '').
// Retorna a parte sem curinga, que é a única que dá para conferir.
export function baseLiteralDoPadrao(padrao: string): string {
  const corte = padrao.search(/[*?[\]{}]/)
  if (corte === -1) return padrao.trim()
  const literal = padrao.slice(0, corte)
  const barra = literal.lastIndexOf('/')
  return barra === -1 ? '' : literal.slice(0, barra).trim()
}

// Todo campo com cara de caminho da entrada de uma ferramenta, em qualquer profundidade (pega
// edits[].file_path e a base de pattern). Retorna o motivo da recusa, ou null quando tudo cai dentro.
function conferirCaminhos(raiz: string, entrada: Record<string, unknown>): Negacao | null {
  for (const { chave, valor } of camposDeCaminho(entrada)) {
    if (chave === 'pattern') {
      const base = typeof valor === 'string' ? baseLiteralDoPadrao(valor) : null
      if (base === null) return { motivo: 'não sei interpretar o padrão de busca' }
      if (base && !caminhoDentro(raiz, base)) return { motivo: `o padrão "${String(valor)}" aponta para fora da sua pasta` }
      continue
    }
    const valores = valoresDeCaminho(valor)
    // Falha fechada: campo de caminho que a guarda não sabe interpretar nega a chamada inteira.
    if (!valores) return { motivo: `não sei interpretar o campo de caminho "${chave}"` }
    for (const bruto of valores) {
      if (!caminhoDentro(raiz, bruto)) return { motivo: `o caminho "${bruto}" (${chave}) fica fora da sua pasta` }
    }
  }
  return null
}

function camposDeCaminho(
  valor: unknown,
  profundidade = 0,
  achados: Array<{ chave: string; valor: unknown }> = [],
): Array<{ chave: string; valor: unknown }> {
  if (profundidade > PROFUNDIDADE_MAXIMA || achados.length > 200) return achados
  if (Array.isArray(valor)) {
    for (const item of valor) camposDeCaminho(item, profundidade + 1, achados)
    return achados
  }
  if (!valor || typeof valor !== 'object') return achados
  for (const [chave, dentro] of Object.entries(valor as Record<string, unknown>)) {
    if (ehChaveDeCaminho(chave) || chave === 'pattern') achados.push({ chave, valor: dentro })
    else camposDeCaminho(dentro, profundidade + 1, achados)
  }
  return achados
}

function ehChaveDeCaminho(chave: string): boolean {
  const nome = chave.toLowerCase()
  return CHAVES_DE_CAMINHO.has(nome) || nome.endsWith('_path') || nome.endsWith('_paths') || nome.endsWith('_dir') || nome.endsWith('_directory')
}

function valoresDeCaminho(valor: unknown): string[] | null {
  if (typeof valor === 'string') return valor.trim() ? [valor] : null
  if (Array.isArray(valor) && valor.every((item) => typeof item === 'string' && item.trim())) return valor as string[]
  return null
}

function bytesDaEscrita(entrada: Record<string, unknown>): number {
  let total = 0
  for (const chave of ['content', 'new_string', 'new_source', 'text']) {
    const valor = entrada[chave]
    if (typeof valor === 'string') total += Buffer.byteLength(valor)
  }
  const edicoes = entrada.edits
  if (Array.isArray(edicoes)) {
    for (const edicao of edicoes) {
      const novo = (edicao as { new_string?: unknown } | null)?.new_string
      if (typeof novo === 'string') total += Buffer.byteLength(novo)
    }
  }
  return total
}

function nomeDoPrograma(token: string): string {
  const limpo = token.replace(/^['"]|['"]$/g, '')
  const base = isAbsolute(limpo) || limpo.includes('/') ? (limpo.split('/').pop() ?? limpo) : limpo
  return base.toLowerCase()
}
