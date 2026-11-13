import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { BOTAO_LINK, TOM } from './classes.js'

// Conteúdo comprido mostrado até `alturaMaxima` px, com degradê e "Ver tudo" só quando transborda. Retorna o JSX.
export default function Recolhivel({ alturaMaxima = 250, corFundo = TOM.superficie, children }) {
  const [aberto, setAberto] = useState(false)
  const [transborda, setTransborda] = useState(false)
  const conteudo = useRef(null)

  useLayoutEffect(() => {
    const el = conteudo.current
    if (!el) return undefined
    const medir = () => setTransborda(el.scrollHeight > alturaMaxima + 24)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [alturaMaxima])

  const recolhido = transborda && !aberto
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="relative min-w-0 overflow-hidden" style={recolhido ? { maxHeight: alturaMaxima } : undefined}>
        <div ref={conteudo}>{children}</div>
        {recolhido && (
          <div
            className="absolute inset-x-0 bottom-0 h-14 pointer-events-none"
            style={{ background: `linear-gradient(to top, ${corFundo}, ${corFundo}00)` }}
            aria-hidden="true"
          />
        )}
      </div>
      {transborda && (
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className={BOTAO_LINK}
        >
          {aberto ? 'Recolher' : 'Ver tudo'}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
