import { useCallback, useMemo, useSyncExternalStore } from 'react'

const MUDOU = 'escritorio:url'

function assinar(aoMudar) {
  window.addEventListener('popstate', aoMudar)
  window.addEventListener(MUDOU, aoMudar)
  return () => {
    window.removeEventListener('popstate', aoMudar)
    window.removeEventListener(MUDOU, aoMudar)
  }
}

const lerBusca = () => window.location.search

// Parâmetros da URL como estado (replaceState, ou pushState com empilhar). Retorna [params, alterar].
export default function useParametrosDaUrl() {
  const busca = useSyncExternalStore(assinar, lerBusca)
  const params = useMemo(() => new URLSearchParams(busca), [busca])

  const alterar = useCallback((mudancas, { empilhar = false, estado } = {}) => {
    const url = new URL(window.location.href)
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor === null || valor === undefined || valor === '') url.searchParams.delete(chave)
      else url.searchParams.set(chave, valor)
    }
    const destino = `${url.pathname}${url.search}${url.hash}`
    if (empilhar) window.history.pushState(estado ?? null, '', destino)
    else window.history.replaceState(estado === undefined ? window.history.state : estado, '', destino)
    window.dispatchEvent(new Event(MUDOU))
  }, [])

  return [params, alterar]
}
