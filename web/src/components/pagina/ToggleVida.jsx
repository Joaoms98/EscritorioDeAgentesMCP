import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { COR } from '../../constants/estados.js'
import { FOCO } from '../comum/classes.js'

// Cor do pontinho: verde vivendo, âmbar quando a vida está segurando o gasto ou pausada, cinza desligada.
function situacao(vida) {
  if (!vida?.ligada) return { cor: '#737373', texto: 'A vida dos agentes está desligada. Ligue para eles andarem pelo escritório por vontade própria.' }
  if (vida.motivoPausa || vida.banda !== 'normal') return { cor: COR.ambar, texto: vida.explicacao ?? 'A vida está em ritmo mais lento para poupar a sua conta.' }
  return { cor: COR.verde, texto: `${vida.vivos} ${vida.vivos === 1 ? 'agente vivendo' : 'agentes vivendo'} agora. Clique para desligar.` }
}

// Botão que liga e desliga a vida dos agentes, com o resumo do que está acontecendo ao lado. Retorna o JSX.
export default function ToggleVida({ vida, onAlternar, onAbrirDetalhe }) {
  const [mandando, setMandando] = useState(false)
  const ligada = Boolean(vida?.ligada)
  const { cor, texto } = situacao(vida)
  const impedida = vida ? !vida.disponivel && !ligada : true
  const explicacao = impedida ? (vida?.explicacao ?? 'A vida não pode ser ligada agora.') : texto

  const alternar = async () => {
    if (mandando || impedida) return
    setMandando(true)
    try {
      await onAlternar(!ligada)
    } finally {
      setMandando(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={ligada}
        aria-label={`Vida dos agentes: ${ligada ? 'ligada' : 'desligada'}. ${explicacao}`}
        title={explicacao}
        disabled={impedida || mandando}
        onClick={alternar}
        className={`inline-flex items-center gap-1.5 min-h-[40px] fino:sm:min-h-[34px] px-3 rounded-lg border text-[12.5px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${FOCO} ${
          ligada ? 'border-white/20 bg-white/[.06] text-neutral-50' : 'border-linha text-neutral-300 hover:bg-white/[.04]'
        }`}
      >
        <span className="relative grid place-items-center w-4 h-4" aria-hidden="true">
          <Sparkles className="w-4 h-4" style={{ color: ligada ? cor : undefined }} />
        </span>
        <span className="max-md:sr-only">Vida</span>
        <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${ligada && !vida?.motivoPausa ? 'ctrl-pulso' : ''}`} style={{ background: cor }} />
      </button>
      {ligada && (
        <button
          type="button"
          onClick={onAbrirDetalhe}
          className={`hidden xl:inline text-[11.5px] font-medium text-neutral-500 hover:text-neutral-300 transition-colors ${FOCO} rounded`}
        >
          {vida.vivos} vivendo · {vida.decisoesNaHora} {vida.decisoesNaHora === 1 ? 'decisão' : 'decisões'} na hora · US$ {vida.custoUsdDoDia.toFixed(2)} hoje
        </button>
      )}
    </span>
  )
}
