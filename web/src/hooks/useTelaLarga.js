import { useEffect, useState } from 'react'

// Do lg (1024px) para cima a barra da equipe fica ao lado do conteúdo; abaixo disso ela vira gaveta.
export const CONSULTA_TELA_LARGA = '(min-width: 1024px)'

// Acompanha a largura da tela. Retorna true do lg para cima.
export default function useTelaLarga() {
  const [larga, setLarga] = useState(() => window.matchMedia?.(CONSULTA_TELA_LARGA).matches ?? false)
  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA_TELA_LARGA)
    const aoMudar = () => setLarga(consulta.matches)
    aoMudar()
    consulta.addEventListener('change', aoMudar)
    return () => consulta.removeEventListener('change', aoMudar)
  }, [])
  return larga
}
