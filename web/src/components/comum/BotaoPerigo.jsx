import { useEffect, useState } from 'react'
import { COR } from '../../constants/estados.js'
import { FOCO } from './classes.js'

const ESTILO_ARMADO = { background: 'rgba(248,113,113,.12)', borderColor: 'rgba(248,113,113,.5)', color: COR.vermelho }
const ESTILO_NORMAL = { background: 'transparent', borderColor: '#2c2c2c', color: '#d4d4d4' }

// Ação destrutiva em dois toques (arma, depois executa; desarma sozinho). Retorna o <button>.
export default function BotaoPerigo({ Icone, rotulo, rotuloConfirmar, rotuloOcupado, ocupado = false, onConfirmar }) {
  const [armado, setArmado] = useState(false)

  useEffect(() => {
    if (!armado) return undefined
    const timer = setTimeout(() => setArmado(false), 4000)
    return () => clearTimeout(timer)
  }, [armado])

  const clicar = () => {
    if (!armado) {
      setArmado(true)
      return
    }
    setArmado(false)
    onConfirmar()
  }

  return (
    <button
      type="button"
      onClick={clicar}
      onBlur={() => setArmado(false)}
      disabled={ocupado}
      aria-busy={ocupado}
      className={`inline-flex items-center justify-center gap-1.5 shrink-0 min-h-[40px] fino:sm:min-h-[34px] px-3 rounded-md border text-[12.5px] font-medium transition-colors hover:bg-white/[.04] disabled:opacity-50 disabled:cursor-not-allowed ${FOCO}`}
      style={armado ? ESTILO_ARMADO : ESTILO_NORMAL}
    >
      {Icone && <Icone className="w-3.5 h-3.5" aria-hidden="true" />}
      {ocupado ? rotuloOcupado : armado ? rotuloConfirmar : rotulo}
    </button>
  )
}
