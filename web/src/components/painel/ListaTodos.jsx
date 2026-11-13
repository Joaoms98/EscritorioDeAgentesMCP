import { Check, Circle, LoaderCircle } from 'lucide-react'
import { STATUS_TODO } from '../../constants/estados.js'
import RotuloSecao from '../comum/RotuloSecao.jsx'

function IconeTodo({ status }) {
  if (status === 'feito') {
    return (
      <span className="grid place-items-center w-4 h-4 mt-px shrink-0 rounded-full bg-neutral-700" aria-hidden="true">
        <Check className="w-2.5 h-2.5 text-neutral-100" strokeWidth={3.2} />
      </span>
    )
  }
  if (status === 'andamento') {
    return <LoaderCircle className="w-4 h-4 mt-px shrink-0 text-neutral-50 motion-safe:animate-spin" aria-hidden="true" />
  }
  return <Circle className="w-4 h-4 mt-px shrink-0 text-neutral-700" aria-hidden="true" />
}

// Lista de tarefas que o agente mantém (TodoWrite), com o progresso feitos/total. Retorna o JSX ou null.
export default function ListaTodos({ todos }) {
  if (!todos?.length) return null
  const feitos = todos.filter((t) => t.status === 'feito').length
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <RotuloSecao>TAREFAS DO AGENTE</RotuloSecao>
        <span className="font-mono text-[11px] tabular-nums text-neutral-400">
          {feitos}/{todos.length}
          <span className="sr-only"> feitas</span>
        </span>
      </div>
      <div className="h-[3px] rounded-full bg-white/[.07] overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-neutral-200 transition-[width] duration-300" style={{ width: `${(feitos / todos.length) * 100}%` }} />
      </div>
      <ul className="flex flex-col gap-0.5 pt-1">
        {todos.map((todo, i) => {
          const andamento = todo.status === 'andamento'
          return (
            <li
              key={`${i}-${todo.conteudo}`}
              className={`flex items-start gap-2.5 px-2.5 py-1.5 -mx-2.5 rounded-md ${andamento ? 'bg-white/[.04]' : ''}`}
            >
              <IconeTodo status={todo.status} />
              <span className="sr-only">{STATUS_TODO[todo.status]?.rotulo ?? todo.status}: </span>
              <span
                className={`flex-1 min-w-0 break-words text-[12.5px] leading-[1.45] ${
                  todo.status === 'feito' ? 'text-neutral-500 line-through decoration-neutral-700' : andamento ? 'text-neutral-50 font-medium' : 'text-neutral-300'
                }`}
              >
                {andamento && todo.ativo ? todo.ativo : todo.conteudo}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
