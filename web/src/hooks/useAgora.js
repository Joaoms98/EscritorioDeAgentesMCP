import { useSyncExternalStore } from 'react'

const relogios = new Map()

function relogioDe(intervalo) {
  let relogio = relogios.get(intervalo)
  if (relogio) return relogio
  const ouvintes = new Set()
  let timer = null
  relogio = {
    agora: Date.now(),
    ler: () => relogio.agora,
    assinar: (aoMudar) => {
      ouvintes.add(aoMudar)
      if (!timer) {
        relogio.agora = Date.now()
        timer = setInterval(() => {
          relogio.agora = Date.now()
          for (const ouvinte of ouvintes) ouvinte()
        }, intervalo)
      }
      return () => {
        ouvintes.delete(aoMudar)
        if (!ouvintes.size) {
          clearInterval(timer)
          timer = null
        }
      }
    },
  }
  relogios.set(intervalo, relogio)
  return relogio
}

// Hora atual, atualizada a cada `intervalo` ms por um relógio compartilhado. Retorna o timestamp em ms.
export default function useAgora(intervalo = 30_000) {
  const relogio = relogioDe(intervalo)
  return useSyncExternalStore(relogio.assinar, relogio.ler)
}
