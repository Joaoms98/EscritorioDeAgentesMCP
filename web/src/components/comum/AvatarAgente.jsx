import { ESTADOS_AGENTE } from '../../constants/estados.js'
import { inicialDe } from '../../utils/formatacao.js'
import { TOM } from './classes.js'

const TAMANHOS = {
  sm: 'w-[22px] h-[22px] text-[10px]',
  md: 'w-8 h-8 text-[12.5px]',
}

// Bolinha cinza com a inicial do agente; com `estado`, um ponto na cor do estado (a mesma da cena). Retorna o JSX.
export default function AvatarAgente({ agente, tamanho = 'md', estado = null, fundo = TOM.fundo }) {
  const corEstado = estado ? ESTADOS_AGENTE[estado]?.cor : null
  return (
    <span className="relative shrink-0" aria-hidden="true">
      <span className={`grid place-items-center rounded-full bg-neutral-800 font-semibold leading-none text-neutral-100 ${TAMANHOS[tamanho]}`}>
        {inicialDe(agente.apelido)}
      </span>
      {corEstado && (
        <span
          className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border-2"
          style={{ background: corEstado, borderColor: fundo }}
        />
      )}
    </span>
  )
}
