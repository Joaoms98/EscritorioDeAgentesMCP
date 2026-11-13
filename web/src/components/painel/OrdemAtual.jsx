import { ArrowUpRight, Cpu, FolderOpen } from 'lucide-react'
import { COR, MODO_POR_ID, STATUS_ORDEM } from '../../constants/estados.js'
import useAgora from '../../hooks/useAgora.js'
import { duracao, emMs, hora, nomeDoCaminho } from '../../utils/formatacao.js'
import Recolhivel from '../comum/Recolhivel.jsx'
import RotuloSecao from '../comum/RotuloSecao.jsx'
import { BOTAO_SECUNDARIO } from '../comum/classes.js'
import FeedEventos from './FeedEventos.jsx'
import ListaTodos from './ListaTodos.jsx'

const EVENTOS_NO_FEED = 40

function Etiqueta({ Icone, children, titulo }) {
  return (
    <span title={titulo} className="inline-flex items-center gap-1.5 max-w-full text-[11.5px] text-neutral-500">
      <Icone className="w-3.5 h-3.5 shrink-0 text-neutral-600" aria-hidden="true" />
      <span className="truncate">{children}</span>
    </span>
  )
}

function LinhaStatus({ ordem }) {
  const agora = useAgora(1000)
  const status = STATUS_ORDEM[ordem.status] ?? STATUS_ORDEM.trabalhando
  const inicio = emMs(ordem.iniciadaEm)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
      <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: status.cor }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.cor }} aria-hidden="true" />
        {status.rotulo}
      </span>
      {inicio !== null && (
        <>
          <span className="font-mono text-[11.5px] tabular-nums text-neutral-300">há {duracao(agora - inicio)}</span>
          <span className="text-neutral-500">começou às {hora(ordem.iniciadaEm)}</span>
        </>
      )}
    </div>
  )
}

function Atividade({ ordem }) {
  const aguardando = ordem.status === 'aguardando'
  const cor = aguardando ? COR.ambar : '#fafafa'
  const texto = aguardando ? 'Esperando a sua resposta no cartão “Precisa de você”.' : ordem.atividade || 'Começando…'
  return (
    <div
      className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg border bg-fundo"
      style={{ borderColor: aguardando ? `${cor}40` : '#2c2c2c' }}
    >
      <span className="w-1.5 h-1.5 mt-[7px] shrink-0 rounded-full ctrl-pulso" style={{ background: cor }} aria-hidden="true" />
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="sr-only">O que está fazendo agora: </span>
        <span className="font-mono text-[12px] leading-[1.55] text-neutral-200 break-words [overflow-wrap:anywhere]">{texto}</span>
      </span>
    </div>
  )
}

// Ordem em andamento: instrução, projeto e modo, tempo, atividade, tarefas e o feed ao vivo. Retorna o JSX.
export default function OrdemAtual({ ordem, eventos, onAbrirOrdem }) {
  const modo = MODO_POR_ID[ordem.modo] ?? MODO_POR_ID.default
  const recentes = eventos.length > EVENTOS_NO_FEED ? eventos.slice(-EVENTOS_NO_FEED) : eventos
  return (
    <div className="grid gap-x-8 gap-y-6 xl:grid-cols-2 min-w-0">
      <div className="flex flex-col gap-3.5 min-w-0">
        <div className="flex flex-col gap-2">
          <RotuloSecao>ORDEM</RotuloSecao>
          <div className="pl-3.5 border-l-2 border-neutral-600">
            <Recolhivel alturaMaxima={150}>
              <p className="m-0 text-[13.5px] leading-[1.55] text-neutral-100 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {ordem.instrucao}
              </p>
            </Recolhivel>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Etiqueta Icone={FolderOpen} titulo={ordem.projeto}>{nomeDoCaminho(ordem.projeto)}</Etiqueta>
          <Etiqueta Icone={modo.Icone} titulo={modo.descricao}>{modo.rotulo}</Etiqueta>
          {ordem.modelo && <Etiqueta Icone={Cpu}>{ordem.modelo}</Etiqueta>}
        </div>
        <LinhaStatus ordem={ordem} />
        <Atividade ordem={ordem} />
        <ListaTodos todos={ordem.todos} />
      </div>
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <RotuloSecao>AO VIVO</RotuloSecao>
          {eventos.length > EVENTOS_NO_FEED && (
            <span className="font-mono text-[10.5px] text-neutral-600">últimos {EVENTOS_NO_FEED} de {eventos.length}</span>
          )}
        </div>
        <FeedEventos eventos={recentes} aoVivo vazio="O agente ainda não fez nada nesta ordem." />
        <button type="button" onClick={() => onAbrirOrdem(ordem.id)} className={`${BOTAO_SECUNDARIO} self-start`}>
          Ver ordem completa
          <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
