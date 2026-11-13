import { useEffect } from 'react'
import { api } from '../services/api.js'

const STATUS_QUE_AVISAM = ['concluida', 'erro', 'interrompida']
const ESPERA_MS = 1500

// Marca a ordem terminada como vista depois que ela ficou ~1,5 s na tela (aba visível). Retorna nada.
export default function useMarcarVista(ref, ordem) {
  const pendente = Boolean(ordem && !ordem.vistaEm && STATUS_QUE_AVISAM.includes(ordem.status))
  const id = ordem?.id

  useEffect(() => {
    const el = ref.current
    if (!pendente || !el || typeof IntersectionObserver === 'undefined') return undefined
    let timer = null
    let naTela = false
    let feito = false

    const avaliar = () => {
      clearTimeout(timer)
      timer = null
      if (feito || !naTela || document.visibilityState !== 'visible') return
      timer = setTimeout(() => {
        feito = true
        api.marcarVista(id).catch((erro) => {
          feito = false
          console.warn('Falha ao marcar a ordem como vista:', erro)
        })
      }, ESPERA_MS)
    }

    const observador = new IntersectionObserver(([entrada]) => {
      naTela = entrada.isIntersecting
      avaliar()
    }, { threshold: 0.2 })
    observador.observe(el)
    document.addEventListener('visibilitychange', avaliar)
    return () => {
      observador.disconnect()
      document.removeEventListener('visibilitychange', avaliar)
      clearTimeout(timer)
    }
  }, [ref, id, pendente])
}
