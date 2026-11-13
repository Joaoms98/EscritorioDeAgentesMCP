import { FlaskConical, TriangleAlert } from 'lucide-react'

const CLASSE_CODIGO = 'px-1 py-px rounded bg-white/[.06] font-mono text-[11.5px] text-neutral-200'

function ComCodigo({ texto }) {
  return texto.split(/`([^`]+)`/).map((parte, i) => (i % 2 ? <code key={i} className={CLASSE_CODIGO}>{parte}</code> : parte))
}

// Avisos do topo: modo simulado (neutro) e conta Claude sem acesso (vermelho). Retorna o JSX ou null.
export default function Avisos({ servidor, conta }) {
  const semConta = conta?.autenticada === false
  if (!servidor?.simulado && !semConta) return null
  const jaExplica = /\/login/.test(conta?.erro ?? '')
  return (
    <>
      {servidor?.simulado && (
        <div className="flex items-start gap-2.5 px-4 py-2.5 rounded-lg border border-dashed border-linha-forte">
          <FlaskConical className="w-4 h-4 mt-px shrink-0 text-neutral-500" aria-hidden="true" />
          <p className="m-0 text-[12.5px] leading-[1.5] text-neutral-400">
            <strong className="font-semibold text-neutral-200">Modo simulado.</strong> Os agentes são de mentira e não usam sua conta Claude.
          </p>
        </div>
      )}
      {semConta && (
        <div role="alert" className="flex items-start gap-2.5 px-4 py-3 rounded-lg border border-[#f87171]/25 bg-[#f87171]/[.05]">
          <TriangleAlert className="w-4 h-4 mt-px shrink-0 text-[#f87171]" aria-hidden="true" />
          <div className="flex flex-col gap-1 min-w-0">
            <p className="m-0 text-[12.5px] font-medium text-[#f87171]">Os agentes não conseguem usar sua conta Claude.</p>
            {conta.erro && (
              <p className="m-0 text-[12px] leading-[1.5] text-[#fecaca] break-words">
                <ComCodigo texto={conta.erro} />
              </p>
            )}
            {!jaExplica && (
              <p className="m-0 text-[12px] leading-[1.5] text-neutral-400">
                Neste computador, rode <code className={CLASSE_CODIGO}>claude</code>, faça{' '}
                <code className={CLASSE_CODIGO}>/login</code> e reinicie o servidor do escritório.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
