import { useLayoutEffect, useRef } from 'react'
import { COR, TIPOS_EVENTO } from '../../constants/estados.js'
import { hora } from '../../utils/formatacao.js'
import TextoMarkdown from '../TextoMarkdown.jsx'

const COR_DO_TEXTO = {
  erro: COR.vermelho,
  resultado_ferramenta: '#fca5a5',
  pendencia: '#fde68a',
  resposta: '#fafafa',
  resultado: '#fafafa',
}

function LinhaEvento({ evento, inteiro }) {
  const tipo = TIPOS_EVENTO[evento.tipo] ?? TIPOS_EVENTO.sistema
  const { Icone } = tipo
  return (
    <li className="flex items-start gap-2.5 px-3.5 py-2">
      <Icone className="w-3.5 h-3.5 mt-[2px] shrink-0" style={{ color: tipo.cor }} aria-hidden="true" />
      <div
        className={`flex-1 min-w-0 text-[12.5px] leading-[1.5] break-words [overflow-wrap:anywhere] ${
          inteiro ? (evento.tipo === 'texto' ? '' : 'whitespace-pre-wrap') : 'line-clamp-3'
        }`}
        style={{ color: COR_DO_TEXTO[evento.tipo] ?? '#d4d4d4' }}
      >
        <span className="sr-only">{tipo.rotulo}: </span>
        {inteiro && evento.tipo === 'texto' ? <TextoMarkdown texto={evento.texto} compacto /> : evento.texto}
      </div>
      <time dateTime={evento.criadoEm} className="shrink-0 pt-[2px] font-mono text-[10.5px] tabular-nums text-neutral-600">
        {hora(evento.criadoEm, { segundos: true })}
      </time>
    </li>
  )
}

// Eventos da ordem, mais novos embaixo; ao vivo, rola sozinho quando já estava no fim. Retorna o JSX.
export default function FeedEventos({ eventos, aoVivo = false, vazio = 'Nenhum evento ainda.' }) {
  const lista = useRef(null)
  const colado = useRef(true)

  useLayoutEffect(() => {
    const el = lista.current
    if (aoVivo && el && colado.current) el.scrollTop = el.scrollHeight
  }, [eventos, aoVivo])

  if (!eventos.length) {
    return (
      <p className="m-0 px-3 py-6 rounded-lg border border-dashed border-linha-forte text-center text-[12.5px] text-neutral-500">
        {vazio}
      </p>
    )
  }

  return (
    <ol
      ref={lista}
      aria-live="off"
      onScroll={(e) => {
        const el = e.currentTarget
        colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32
      }}
      className={`flex flex-col min-w-0 py-1 rounded-lg bg-fundo border border-linha ${
        aoVivo ? 'max-h-[360px] overflow-y-auto overscroll-contain' : ''
      }`}
    >
      {eventos.map((evento) => (
        <LinhaEvento key={evento.id} evento={evento} inteiro={!aoVivo} />
      ))}
    </ol>
  )
}
