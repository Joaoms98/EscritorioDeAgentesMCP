import { spawn } from 'node:child_process'

// O banner do servidor aponta para o Vite; com --strictPort ele falha em vez de trocar de porta e deixar o link errado.
const PORTA_WEB = 5173
const ESPERA_SAIDA_MS = 12_000

// Sobe o servidor (com recarga) e o Vite juntos, cada um no seu grupo de processos; derruba os dois se um cair ou no Ctrl+C.
const processos = [
  ['servidor', ['run', 'dev', '-w', 'servidor'], { ESCRITORIO_URL_WEB: process.env.ESCRITORIO_URL_WEB ?? `http://localhost:${PORTA_WEB}` }],
  ['web', ['run', 'dev', '-w', 'web', '--', '--port', String(PORTA_WEB), '--strictPort'], {}],
].map(([nome, args, env]) => {
  const filho = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }, detached: true })
  const prefixar = (destino) => (pedaco) => {
    for (const linha of pedaco.toString().split('\n')) if (linha) destino.write(`[${nome}] ${linha}\n`)
  }
  filho.stdout.on('data', prefixar(process.stdout))
  filho.stderr.on('data', prefixar(process.stderr))
  filho.on('exit', (codigo) => {
    process.stderr.write(`[${nome}] saiu com código ${codigo}\n`)
    encerrar(codigo ?? 1)
  })
  return filho
})

// O npm roda o comando num sh que não repassa o sinal, e o servidor ficaria órfão: o sinal vai para o grupo inteiro.
function sinalizar(sinal) {
  for (const filho of processos) {
    try {
      process.kill(-filho.pid, sinal)
    } catch {}
  }
}

function algumGrupoVivo() {
  return processos.some((filho) => {
    try {
      process.kill(-filho.pid, 0)
      return true
    } catch {
      return false
    }
  })
}

let encerrando = false
function encerrar(codigo = 0) {
  if (encerrando) return
  encerrando = true
  sinalizar('SIGTERM')
  const limite = Date.now() + ESPERA_SAIDA_MS
  const espera = setInterval(() => {
    if (algumGrupoVivo() && Date.now() < limite) return
    clearInterval(espera)
    sinalizar('SIGKILL')
    process.exit(codigo)
  }, 100)
}

process.on('SIGINT', () => encerrar(0))
process.on('SIGTERM', () => encerrar(0))
process.on('SIGHUP', () => encerrar(0))
