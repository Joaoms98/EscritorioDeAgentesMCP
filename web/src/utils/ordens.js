function maisRecentePrimeiro(a, b) {
  const fimA = a.finalizadaEm ?? ''
  const fimB = b.finalizadaEm ?? ''
  if (fimA !== fimB) return fimA < fimB ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

// Primeira página do histórico (cópias mais novas) + páginas antigas já carregadas, sem repetir, na ordem do servidor. Retorna o array.
export function juntarHistorico(recentes, antigas) {
  if (!antigas.length) return recentes
  const porId = new Map()
  for (const ordem of antigas) porId.set(ordem.id, ordem)
  for (const ordem of recentes) porId.set(ordem.id, ordem)
  return [...porId.values()].sort(maisRecentePrimeiro)
}

// Diz se a ordem tem uma continuação esperando vaga na fila (retomada aqui ou em outro aparelho). Retorna true ou false.
export function continuacaoNaFila(fila, ordem) {
  return Boolean(ordem) && fila.some((o) => o.continuaDe === ordem.id)
}

// Troca a ordem pela cópia nova se ela estiver na lista. Retorna a mesma lista quando não está.
export function comOrdem(lista, ordem) {
  const indice = lista.findIndex((o) => o.id === ordem.id)
  if (indice === -1) return lista
  const nova = lista.slice()
  nova[indice] = ordem
  return nova
}
