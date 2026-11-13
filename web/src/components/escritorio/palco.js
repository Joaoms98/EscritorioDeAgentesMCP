import { useLayoutEffect, useState } from 'react'

// Encaixa o palco na largura (centralizado, entre a escala mínima e a máxima, até alturaMaxima). Retorna { altura, escala, deslocamento, transform }.
export function enquadrarPalco(largura, larguraPalco, alturaPalco, { escalaMaxima = 1, escalaMinima = 0, alturaMaxima = Infinity } = {}) {
  const escala = Math.max(escalaMinima, Math.min(escalaMaxima, largura / larguraPalco, alturaMaxima / alturaPalco))
  const altura = Math.round(alturaPalco * escala)
  const larguraEscalada = larguraPalco * escala
  const alturaEscalada = alturaPalco * escala
  const dx = larguraEscalada <= largura ? (largura - larguraEscalada) / 2 : 0
  const dy = alturaEscalada <= altura ? (altura - alturaEscalada) / 2 : 0
  return {
    altura,
    escala,
    deslocamento: { x: dx, y: dy },
    transform: `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) scale(${escala.toFixed(4)})`,
  }
}

// Mede a largura do elemento e acompanha as mudanças de tamanho. Retorna a largura em pixels.
export function useLarguraDoElemento(ref, larguraInicial) {
  const [largura, setLargura] = useState(larguraInicial)
  useLayoutEffect(() => {
    const elemento = ref.current
    if (!elemento) return undefined
    const medir = () => {
      const w = elemento.clientWidth
      // 0 = container escondido; a folga de 1px evita ficar oscilando quando a barra de rolagem aparece e some.
      if (w) setLargura((atual) => (Math.abs(w - atual) > 1 ? w : atual))
    }
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [ref])
  return largura
}
