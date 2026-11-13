import { STATUS_ORDEM } from '../../constants/estados.js'
import { custoAproximado, duracao, nomeDoCaminho, tempoRelativo, TITULO_CUSTO } from '../../utils/formatacao.js'
import { CLASSE_LINHA } from '../comum/classes.js'

function metaDaOrdem(ordem, agora) {
  const partes = [nomeDoCaminho(ordem.projeto)]
  if (ordem.status === 'na_fila') {
    partes.push(`na fila ${tempoRelativo(ordem.criadaEm, agora)}`)
    return partes
  }
  if (ordem.duracaoMs !== null && ordem.duracaoMs !== undefined) partes.push(duracao(ordem.duracaoMs))
  partes.push(tempoRelativo(ordem.finalizadaEm ?? ordem.iniciadaEm ?? ordem.criadaEm, agora))
  if (ordem.custoUsd !== null && ordem.custoUsd !== undefined) {
    partes.push(<span title={TITULO_CUSTO}>{custoAproximado(ordem.custoUsd)}</span>)
  }
  return partes
}

// Linha de uma ordem na fila ou no histórico (status, instrução, projeto · duração · quando · custo), dentro de uma
// lista com divisórias. Retorna o <li>.
export default function LinhaOrdem({ ordem, agora, onAbrir, acao = null }) {
  const status = STATUS_ORDEM[ordem.status] ?? STATUS_ORDEM.concluida
  const { Icone } = status
  const nova = status.final && !ordem.vistaEm && ['concluida', 'erro', 'interrompida'].includes(ordem.status)
  return (
    <li className={`flex items-center gap-2 min-w-0 ${acao ? 'pr-2.5' : ''}`}>
      <button type="button" data-ordem={ordem.id} onClick={() => onAbrir(ordem.id)} className={`${CLASSE_LINHA} flex-1 min-w-0`}>
        <span className="grid place-items-center w-7 h-7 shrink-0 rounded-full bg-white/[.05]" style={{ color: status.cor }} aria-hidden="true">
          <Icone className={`w-3.5 h-3.5 ${status.rodando ? 'motion-safe:animate-spin' : ''}`} strokeWidth={2.2} />
        </span>
        <span className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="text-[13px] font-medium leading-[1.35] text-neutral-100 line-clamp-2 break-words [overflow-wrap:anywhere]">
            {ordem.instrucao}
          </span>
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-neutral-500">
            <span className="sm:hidden inline-flex items-center gap-1.5">
              <span className="font-medium" style={{ color: status.cor }}>{status.rotulo}</span>
              <span aria-hidden="true">·</span>
            </span>
            {metaDaOrdem(ordem, agora).map((parte, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true" className="text-neutral-700">·</span>}
                {parte}
              </span>
            ))}
          </span>
        </span>
        <span className="hidden sm:flex flex-col items-end gap-1 shrink-0">
          <span className="text-[11.5px] font-medium whitespace-nowrap" style={{ color: status.cor }}>
            {status.rotulo}
          </span>
          {nova && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-300">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-50" aria-hidden="true" />
              não vista
            </span>
          )}
        </span>
      </button>
      {acao}
    </li>
  )
}
