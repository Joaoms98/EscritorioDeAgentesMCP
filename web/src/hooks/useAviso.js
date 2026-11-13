import { useCallback, useEffect, useState } from 'react'

const DURACAO_MS = 6000

// Aviso curto de confirmação ("Resposta enviada…") para uma região role="status"; some sozinho. Retorna [texto, avisar].
export default function useAviso() {
  const [aviso, setAviso] = useState(null)

  useEffect(() => {
    if (!aviso) return undefined
    const timer = setTimeout(() => setAviso(null), DURACAO_MS)
    return () => clearTimeout(timer)
  }, [aviso])

  const avisar = useCallback((texto) => setAviso((atual) => ({ texto, vez: (atual?.vez ?? 0) + 1 })), [])

  // O espaço invisível alternado faz o leitor de tela anunciar de novo um texto igual ao anterior.
  return [aviso ? `${aviso.texto}${aviso.vez % 2 ? '' : '\u00a0'}` : '', avisar]
}
