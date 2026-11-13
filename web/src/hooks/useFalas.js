import { useEffect, useRef, useState } from 'react'

// Quanto tempo uma fala fica no ar e quantas de cada agente a gente guarda.
export const DURACAO_DA_FALA_MS = 4500
const POR_AGENTE = 3

// Põe a fala no anel e tira as que já venceram ou são de quem saiu do escritório. Retorna o anel novo (ou o mesmo,
// quando nada muda, para a tela não redesenhar à toa).
export function aplicarFala(anel, fala, agora, idsPresentes = null) {
  const limpo = []
  for (const item of anel) {
    if (agora - item.quando >= DURACAO_DA_FALA_MS) continue
    if (idsPresentes && !idsPresentes.has(item.agenteId)) continue
    if (fala && item.agenteId === fala.agenteId && limpo.filter((outro) => outro.agenteId === fala.agenteId).length >= POR_AGENTE - 1) continue
    limpo.push(item)
  }
  if (fala && fala.texto && (!idsPresentes || idsPresentes.has(fala.agenteId))) {
    limpo.push({ id: fala.id, agenteId: fala.agenteId, texto: fala.texto, quando: agora })
  }
  if (limpo.length === anel.length && limpo.every((item, i) => item === anel[i])) return anel
  return limpo
}

// A última fala de cada agente que ainda está no ar. Retorna um objeto { [agenteId]: texto }.
export function falasPorAgente(anel) {
  const mapa = {}
  for (const item of anel) mapa[item.agenteId] = item.texto
  return mapa
}

// As falas que estão no ar agora, assinando o fluxo de eventos do escritório. Retorna { [agenteId]: texto }.
export default function useFalas(assinar, idsPresentes) {
  const [anel, setAnel] = useState([])
  const presentes = useRef(idsPresentes)
  presentes.current = idsPresentes

  useEffect(() => {
    if (!assinar) return undefined
    return assinar((evento) => {
      if (evento.tipo !== 'fala') return
      setAnel((atual) => aplicarFala(atual, evento.dados, Date.now(), presentes.current))
    })
  }, [assinar])

  // Uma fala que venceu tem de sumir mesmo sem nenhuma fala nova chegando.
  useEffect(() => {
    if (!anel.length) return undefined
    const id = window.setTimeout(() => setAnel((atual) => aplicarFala(atual, null, Date.now(), presentes.current)), DURACAO_DA_FALA_MS / 2)
    return () => window.clearTimeout(id)
  }, [anel])

  return falasPorAgente(anel)
}
