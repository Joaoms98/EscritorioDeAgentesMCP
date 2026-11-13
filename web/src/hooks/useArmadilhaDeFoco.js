import { useEffect, useRef } from 'react'

const SELETOR_FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const camadas = []

function focaveisDe(raiz) {
  return [...raiz.querySelectorAll(SELETOR_FOCAVEIS)].filter((el) => el.getClientRects().length > 0)
}

// Camada modal: foco inicial, Tab preso, Esc fecha e o foco volta para quem abriu. Retorna nada.
export default function useArmadilhaDeFoco(refPainel, aoFechar, refFocoInicial) {
  const fechar = useRef(aoFechar)
  useEffect(() => {
    fechar.current = aoFechar
  })

  useEffect(() => {
    const camada = {}
    camadas.push(camada)
    const anterior = document.activeElement
    const painel = refPainel.current
    const inicial = refFocoInicial?.current ?? (painel ? focaveisDe(painel)[0] : null)
    inicial?.focus({ preventScroll: true })

    const aoTeclar = (e) => {
      if (e.isComposing || camadas[camadas.length - 1] !== camada || !refPainel.current) return
      if (e.key === 'Escape') {
        e.preventDefault()
        fechar.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const focaveis = focaveisDe(refPainel.current)
      if (!focaveis.length) return
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      const dentro = refPainel.current.contains(document.activeElement)
      if (!dentro || (e.shiftKey && document.activeElement === primeiro)) {
        e.preventDefault()
        ;(e.shiftKey ? ultimo : primeiro).focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    }

    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      camadas.splice(camadas.indexOf(camada), 1)
      if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus({ preventScroll: true })
    }
  }, [refPainel, refFocoInicial])
}
