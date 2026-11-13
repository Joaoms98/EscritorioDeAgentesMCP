// Quando um pedido sai da tela, foca o título do próximo da lista (ou a reserva) para o foco não cair no <body>. Retorna nada.
export function focarProximoPedido(lista, idResolvido, reserva) {
  const cartoes = [...(lista?.querySelectorAll('[data-pendencia], [data-pergunta-final]') ?? [])]
  const indice = cartoes.findIndex((el) => (el.dataset.pendencia ?? el.dataset.perguntaFinal) === idResolvido)
  const resto = cartoes.filter((_, i) => i !== indice)
  const proximo = resto[Math.max(indice, 0)] ?? resto[resto.length - 1]
  const alvo = proximo?.querySelector('h4') ?? reserva
  alvo?.focus()
}
