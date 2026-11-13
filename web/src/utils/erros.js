export const EVENTO_SEM_SESSAO = 'escritorio:sem-sessao'

// Chamada cancelada de propósito (troca de agente, drawer fechado). Retorna true ou false.
export function foiCancelado(erro) {
  return erro?.name === 'AbortError'
}

// Mensagem da falha para mostrar perto da ação; um 401 leva o app de volta à entrada. Retorna a string.
export function mensagemDoErro(erro, padrao = 'Não foi possível concluir a ação.') {
  if (erro?.status === 401) window.dispatchEvent(new Event(EVENTO_SEM_SESSAO))
  return erro?.message || padrao
}
