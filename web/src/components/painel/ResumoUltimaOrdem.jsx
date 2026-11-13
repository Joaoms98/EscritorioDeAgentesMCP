import { useId, useRef, useState } from 'react'
import { MessageSquareReply, RotateCw, Send } from 'lucide-react'
import { COR, STATUS_ORDEM } from '../../constants/estados.js'
import { api } from '../../services/api.js'
import useAgora from '../../hooks/useAgora.js'
import useMarcarVista from '../../hooks/useMarcarVista.js'
import { mensagemDoErro } from '../../utils/erros.js'
import { custoAproximado, duracao, nomeDoCaminho, tempoRelativo, TITULO_CUSTO } from '../../utils/formatacao.js'
import TextoMarkdown from '../TextoMarkdown.jsx'
import Recolhivel from '../comum/Recolhivel.jsx'
import { BOTAO_FANTASMA, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CLASSE_ROTULO, CLASSE_TEXTAREA } from '../comum/classes.js'

function ContinuarConversa({ ordem, onFechar }) {
  const id = useId()
  const [texto, setTexto] = useState('')
  const [envio, setEnvio] = useState({ enviando: false, erro: null })

  const enviar = async () => {
    const instrucao = texto.trim()
    if (!instrucao || envio.enviando) return
    setEnvio({ enviando: true, erro: null })
    try {
      await api.criarOrdem({ agenteId: ordem.agenteId, projeto: ordem.projeto, instrucao, modo: ordem.modo, continuaDe: ordem.id })
      onFechar()
    } catch (erro) {
      setEnvio({ enviando: false, erro: mensagemDoErro(erro, 'Não foi possível continuar a conversa.') })
    }
  }

  return (
    <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-fundo border border-linha">
      <label htmlFor={id} className={CLASSE_ROTULO}>CONTINUAR A CONVERSA</label>
      <textarea
        id={id}
        autoFocus
        rows={3}
        maxLength={20000}
        value={texto}
        disabled={envio.enviando}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            enviar()
          }
        }}
        placeholder="O agente retoma a mesma sessão, lembrando de tudo o que já fez"
        className={CLASSE_TEXTAREA}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={enviar} disabled={!texto.trim() || envio.enviando} className={BOTAO_PRIMARIO}>
          <Send className="w-4 h-4" aria-hidden="true" />
          {envio.enviando ? 'Enviando…' : 'Enviar'}
        </button>
        <button type="button" onClick={onFechar} disabled={envio.enviando} className={BOTAO_FANTASMA}>
          Cancelar
        </button>
        <span className="hidden fino:sm:inline ml-auto font-mono text-[10.5px] text-neutral-600">Ctrl+Enter envia</span>
      </div>
      {envio.erro && <p role="alert" className="m-0 text-[11.5px] font-medium" style={{ color: COR.vermelho }}>{envio.erro}</p>}
    </div>
  )
}

// Resumo da última ordem quando o agente não está trabalhando: status, resultado e o que dá para fazer. Retorna o JSX.
export default function ResumoUltimaOrdem({ ordem, permitirContinuar = true, retomadaAtiva = false, onAbrirOrdem }) {
  const agora = useAgora()
  const cartao = useRef(null)
  const [continuando, setContinuando] = useState(false)
  const [retomada, setRetomada] = useState({ enviando: false, erro: null, feita: false })
  const status = STATUS_ORDEM[ordem.status] ?? STATUS_ORDEM.concluida
  const { Icone } = status
  const podeRetomar = ordem.status === 'interrompida' || ordem.status === 'parada'
  const podeContinuar = permitirContinuar && Boolean(ordem.sessaoId) && ['concluida', 'erro'].includes(ordem.status)
  const retomou = retomada.feita || retomadaAtiva
  useMarcarVista(cartao, ordem)

  // Depois de retomar, o botão fica desligado até o painel ver a ordem nova (e enquanto ela estiver na fila): um toque
  // duplo retomaria duas vezes.
  const retomar = async () => {
    if (retomada.enviando || retomou) return
    setRetomada({ enviando: true, erro: null, feita: false })
    try {
      await api.retomarOrdem(ordem.id)
      setRetomada({ enviando: false, erro: null, feita: true })
    } catch (erro) {
      setRetomada({ enviando: false, erro: mensagemDoErro(erro, 'Não foi possível retomar a ordem.'), feita: false })
    }
  }

  const meta = [
    nomeDoCaminho(ordem.projeto),
    `terminou ${tempoRelativo(ordem.finalizadaEm ?? ordem.criadaEm, agora)}`,
    ordem.duracaoMs !== null ? duracao(ordem.duracaoMs) : null,
  ].filter(Boolean)

  return (
    <article ref={cartao} aria-label="Última ordem" className="flex flex-col gap-4 min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md border text-[11.5px] font-medium"
          style={{ borderColor: `${status.cor}55`, color: status.cor }}
        >
          <Icone className="w-3.5 h-3.5" strokeWidth={2.2} aria-hidden="true" />
          {status.rotulo}
        </span>
        <span className="text-[11.5px] text-neutral-500">
          {meta.join(' · ')}
          {ordem.custoUsd !== null && (
            <>
              {' · '}
              <span title={TITULO_CUSTO}>{custoAproximado(ordem.custoUsd)}</span>
            </>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={CLASSE_ROTULO}>ÚLTIMA ORDEM</span>
        <p className="m-0 pl-3.5 border-l-2 border-neutral-600 text-[13.5px] leading-[1.5] text-neutral-100 line-clamp-3 break-words [overflow-wrap:anywhere]">
          {ordem.instrucao}
        </p>
      </div>

      {ordem.resultado && (
        <div className="flex flex-col gap-2">
          <span className={CLASSE_ROTULO}>RESULTADO</span>
          <Recolhivel alturaMaxima={250}>
            <TextoMarkdown texto={ordem.resultado} className="max-w-[80ch]" />
          </Recolhivel>
        </div>
      )}

      {ordem.erro && (
        <div className="flex flex-col gap-1.5">
          <span className={CLASSE_ROTULO} style={{ color: COR.vermelho }}>ERRO</span>
          <p className="m-0 px-3.5 py-2.5 rounded-lg border border-[#f87171]/25 bg-[#f87171]/[.05] font-mono text-[12px] leading-[1.55] text-[#fecaca] whitespace-pre-wrap [overflow-wrap:anywhere]">
            {ordem.erro}
          </p>
        </div>
      )}

      {!continuando && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {podeRetomar && (
            <button type="button" onClick={retomar} disabled={retomada.enviando || retomou} className={BOTAO_PRIMARIO}>
              <RotateCw className="w-4 h-4" aria-hidden="true" />
              {retomou ? 'Retomada' : retomada.enviando ? 'Retomando…' : 'Retomar'}
            </button>
          )}
          {podeContinuar && (
            <button type="button" onClick={() => setContinuando(true)} className={BOTAO_SECUNDARIO}>
              <MessageSquareReply className="w-4 h-4" aria-hidden="true" />
              Continuar conversa
            </button>
          )}
          <button type="button" onClick={() => onAbrirOrdem(ordem.id)} className={BOTAO_FANTASMA}>
            Ver ordem completa
          </button>
        </div>
      )}
      {continuando && <ContinuarConversa ordem={ordem} onFechar={() => setContinuando(false)} />}
      {retomada.erro && <p role="alert" className="m-0 text-[11.5px] font-medium" style={{ color: COR.vermelho }}>{retomada.erro}</p>}
    </article>
  )
}
