import { readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const NOME_DO_ARQUIVO = 'servidor.trava'
// Uma trava sem PID legível tão nova assim é de um servidor que acabou de criá-la e ainda vai escrever o PID.
const IDADE_MINIMA_SEM_PID_MS = 5000

export type Trava = {
  arquivo: string
  soltar(): void
}

// Garante um servidor só por pasta de dados: cria a trava com o PID deste processo, ou assume a de um processo que já morreu. Retorna a Trava.
export function travarPastaDeDados(dirDados: string, pid: number = process.pid): Trava {
  const arquivo = join(dirDados, NOME_DO_ARQUIVO)
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      writeFileSync(arquivo, `${pid}\n`, { flag: 'wx', mode: 0o600 })
      return criarTrava(arquivo, pid)
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code !== 'EEXIST') throw erro
    }
    const dono = lerPid(arquivo)
    if (dono !== null && dono !== pid && processoVivo(dono)) {
      throw new Error(
        `Outro servidor do escritório (PID ${dono}) já está usando a pasta de dados ${dirDados}. ` +
          `Feche esse servidor ou use outra pasta com ESCRITORIO_DADOS. Se nenhum servidor estiver aberto, apague ${arquivo}.`,
      )
    }
    if (dono === null && idadeMs(arquivo) < IDADE_MINIMA_SEM_PID_MS) {
      throw new Error(`Outro servidor do escritório está abrindo a pasta de dados ${dirDados} agora. Espere ele subir ou feche-o.`)
    }
    apagar(arquivo)
  }
  throw new Error(`Não consegui travar a pasta de dados ${dirDados}: apague ${arquivo} e tente de novo.`)
}

function criarTrava(arquivo: string, pid: number): Trava {
  let solta = false
  return {
    arquivo,
    soltar() {
      if (solta) return
      solta = true
      try {
        if (lerPid(arquivo) === pid) apagar(arquivo)
      } catch {}
    },
  }
}

function lerPid(arquivo: string): number | null {
  try {
    const texto = readFileSync(arquivo, 'utf8').trim()
    const pid = Number(texto)
    return /^\d+$/.test(texto) && Number.isSafeInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function processoVivo(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (erro) {
    return (erro as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function idadeMs(arquivo: string): number {
  try {
    return Date.now() - statSync(arquivo).mtimeMs
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function apagar(arquivo: string): void {
  try {
    unlinkSync(arquivo)
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code !== 'ENOENT') throw erro
  }
}
