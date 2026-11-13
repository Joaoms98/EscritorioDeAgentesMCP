// Junta eventos sem repetir (pelo id), em ordem de chegada, guardando só os últimos `limite`. Retorna o array.
export function juntarEventos(atuais, novos, limite = 400) {
  if (!novos?.length) return atuais
  const ultimo = atuais[atuais.length - 1]
  if (novos.length === 1 && (!ultimo || novos[0].id > ultimo.id)) {
    const lista = [...atuais, novos[0]]
    return lista.length > limite ? lista.slice(-limite) : lista
  }
  const porId = new Map()
  for (const evento of atuais) porId.set(evento.id, evento)
  for (const evento of novos) porId.set(evento.id, evento)
  const lista = [...porId.values()].sort((a, b) => a.id - b.id)
  return lista.length > limite ? lista.slice(-limite) : lista
}
