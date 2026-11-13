import { CircleCheck } from 'lucide-react'
import { COR } from '../../constants/estados.js'

// Região role="status" sempre montada (o leitor de tela só anuncia mudanças nela); visível só com texto. Retorna o <p>.
export default function AvisoAoVivo({ texto }) {
  return (
    <p
      role="status"
      className={texto ? 'flex items-center gap-2 m-0 text-[12.5px] font-medium leading-[1.45] text-neutral-200' : 'sr-only'}
    >
      {texto && <CircleCheck className="w-4 h-4 shrink-0" style={{ color: COR.verde }} aria-hidden="true" />}
      {texto}
    </p>
  )
}
