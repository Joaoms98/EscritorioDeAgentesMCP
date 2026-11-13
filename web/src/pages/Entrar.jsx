import { useId, useState } from 'react'
import { LogIn } from 'lucide-react'
import { COR } from '../constants/estados.js'
import Marca from '../components/comum/Marca.jsx'
import { BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_ROTULO } from '../components/comum/classes.js'

function tokenDoTexto(texto) {
  const limpo = texto.trim()
  if (!limpo) return ''
  try {
    const url = new URL(limpo)
    return url.searchParams.get('t')?.trim() ?? ''
  } catch {
    return limpo
  }
}

const PASSOS = [
  'No computador onde o escritório está rodando, olhe o terminal do servidor.',
  'No celular, aponte a câmera para o QR code; no computador, abra o endereço com ?t=.',
  'Ou copie a chave (o que vem depois de ?t=) e cole aqui embaixo.',
]

// Tela de entrada: explica onde achar o link e aceita a chave (ou o link inteiro) colada. Retorna o JSX.
export default function Entrar({ aviso, onEntrar }) {
  const idCampo = useId()
  const idAjuda = useId()
  const [texto, setTexto] = useState('')
  const [envio, setEnvio] = useState({ enviando: false, erro: null })
  const token = tokenDoTexto(texto)

  const enviar = async (e) => {
    e.preventDefault()
    if (!token || envio.enviando) return
    setEnvio({ enviando: true, erro: null })
    try {
      await onEntrar(token)
    } catch (erro) {
      setEnvio({
        enviando: false,
        erro: erro?.status === 401 ? 'Essa chave não confere. Copie de novo do terminal do servidor.' : erro?.message || 'Não foi possível entrar.',
      })
    }
  }

  return (
    <main className="h-full overflow-y-auto bg-fundo">
      <div className="flex flex-col justify-center gap-8 w-full max-w-[420px] min-h-full mx-auto pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2.5">
          <Marca className="w-7 h-7" />
          <span className="text-[14px] font-semibold tracking-[-.01em] text-neutral-50">Escritório de agentes</span>
        </div>

        <section aria-labelledby="titulo-entrar" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 id="titulo-entrar" className="text-[24px] font-semibold leading-[1.2] tracking-[-.02em] text-neutral-50">Entrar no escritório</h1>
            <p className="m-0 text-[13px] leading-[1.55] text-neutral-400 [text-wrap:pretty]">
              Abra o link ou escaneie o QR code que aparece no terminal onde o servidor está rodando. O acesso fica
              salvo neste navegador.
            </p>
          </div>

          {aviso && (
            <p role="alert" className="m-0 px-3.5 py-2.5 rounded-lg border border-[#fbbf24]/30 bg-[#fbbf24]/[.05] text-[12.5px] font-medium leading-[1.45] text-[#fde68a]">
              {aviso}
            </p>
          )}

          <ol className="flex flex-col m-0 p-0 list-none border-y border-linha divide-y divide-linha">
            {PASSOS.map((passo, i) => (
              <li key={i} className="flex items-start gap-4 py-3">
                <span className="pt-px font-mono text-[11px] font-medium tabular-nums text-neutral-600" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[13px] leading-[1.5] text-neutral-300">{passo}</span>
              </li>
            ))}
          </ol>

          <form onSubmit={enviar} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={idCampo} className={CLASSE_ROTULO}>CHAVE DO ESCRITÓRIO</label>
              <input
                id={idCampo}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby={idAjuda}
                aria-invalid={Boolean(envio.erro)}
                placeholder="Cole a chave ou o link inteiro"
                className={`${CLASSE_CAMPO} ${texto ? 'font-mono' : ''}`}
                style={envio.erro ? { borderColor: `${COR.vermelho}99` } : undefined}
              />
              <span id={idAjuda} className="text-[11.5px] leading-[1.45] text-neutral-500">
                O link tem o formato <span className="font-mono text-neutral-400">http://endereço:porta/?t=chave</span>.
              </span>
            </div>
            {envio.erro && (
              <p role="alert" className="m-0 text-[12px] font-medium" style={{ color: COR.vermelho }}>{envio.erro}</p>
            )}
            <button type="submit" disabled={!token || envio.enviando} className={`${BOTAO_PRIMARIO} w-full mt-1`}>
              <LogIn className="w-4 h-4" aria-hidden="true" />
              {envio.enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
