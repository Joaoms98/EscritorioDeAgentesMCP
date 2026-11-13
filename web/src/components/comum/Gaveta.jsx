import { useLayoutEffect, useRef } from 'react'
import useArmadilhaDeFoco from '../../hooks/useArmadilhaDeFoco.js'

// Drawer lateral do padrão DrawerCartao (tela cheia no celular, rodapé fixo). Retorna o JSX.
export default function Gaveta({ idTitulo, onFechar, refFocoInicial, rodape, chave, children }) {
  const painel = useRef(null)
  const miolo = useRef(null)
  const comecouNoFundo = useRef(false)
  useArmadilhaDeFoco(painel, onFechar, refFocoInicial)

  useLayoutEffect(() => {
    if (miolo.current) miolo.current.scrollTop = 0
  }, [chave])

  // A partir de sm a gaveta não encosta na borda esquerda: a área segura só conta em cima, à direita e embaixo.
  return (
    <div
      className="fixed inset-0 z-[100] flex justify-end bg-black/60 ctrl-overlay-in"
      onPointerDown={(e) => {
        comecouNoFundo.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        // Arrastar uma seleção de dentro da gaveta e soltar no fundo também gera clique no fundo: esse não fecha.
        if (comecouNoFundo.current && e.target === e.currentTarget) onFechar()
        comecouNoFundo.current = false
      }}
    >
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="flex flex-col w-[480px] max-w-full h-full leading-[normal] bg-superficie sm:border-l border-linha-forte shadow-[-24px_0_60px_rgba(0,0,0,.55)] ctrl-sheet-in"
      >
        <div ref={miolo} className="flex flex-col gap-[18px] flex-1 min-h-0 overflow-y-auto overscroll-contain pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))] pb-6 sm:pl-6 sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-[max(1.5rem,env(safe-area-inset-top))]">
          {children}
        </div>
        {rodape && (
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pl-6 sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-linha bg-superficie">
            {rodape}
          </div>
        )}
      </div>
    </div>
  )
}
