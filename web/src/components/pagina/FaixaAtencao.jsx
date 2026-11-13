import useAgora from '../../hooks/useAgora.js'
import { tempoRelativo } from '../../utils/formatacao.js'
import AvatarAgente from '../comum/AvatarAgente.jsx'
import { FOCO } from '../comum/classes.js'

// Faixa de quem está esperando o humano (a única com cor no topo, em âmbar); cada chip abre o painel do agente.
// Retorna o JSX.
export default function FaixaAtencao({ agentes, selecionadoId, onSelecionar }) {
  const agora = useAgora()
  const n = agentes.length
  return (
    <section
      aria-labelledby="titulo-atencao"
      className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-x-5 gap-y-2.5 pl-4 pr-3 py-3 rounded-xl border border-[#fbbf24]/25 bg-[#fbbf24]/[.035]"
    >
      <h2 id="titulo-atencao" className="inline-flex items-center gap-2.5 text-[13px] font-semibold text-neutral-50">
        <span className="w-2 h-2 shrink-0 rounded-full bg-[#fbbf24]" aria-hidden="true" />
        {n === 1 ? '1 agente precisa de você' : `${n} agentes precisam de você`}
      </h2>
      <ul className="flex flex-wrap gap-1.5">
        {agentes.map((agente) => {
          const ativo = agente.id === selecionadoId
          return (
            <li key={agente.id}>
              <button
                type="button"
                onClick={() => onSelecionar(agente.id)}
                aria-current={ativo ? 'true' : undefined}
                className={`inline-flex items-center gap-2 min-h-[36px] pl-1.5 pr-2.5 rounded-md border text-[12.5px] font-medium transition-colors ${FOCO} ${
                  ativo
                    ? 'bg-white/[.08] border-neutral-500 text-neutral-50'
                    : 'bg-superficie border-linha-forte text-neutral-200 hover:border-neutral-600 hover:text-neutral-50'
                }`}
              >
                <AvatarAgente agente={agente} tamanho="sm" />
                {agente.apelido}
                <span className="font-mono text-[11px] text-[#fbbf24]/85 tabular-nums">{tempoRelativo(agente.desde, agora)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
