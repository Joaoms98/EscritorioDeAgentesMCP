import { useId, useRef, useState } from 'react'
import { Hourglass, MessageCircleQuestion, Send } from 'lucide-react'
import { COR } from '../../constants/estados.js'
import { api } from '../../services/api.js'
import useAgora from '../../hooks/useAgora.js'
import { mensagemDoErro } from '../../utils/erros.js'
import { nomeDoCaminho, tempoRelativo } from '../../utils/formatacao.js'
import { ultimosParagrafos } from '../../utils/pendencias.js'
import TextoMarkdown from '../TextoMarkdown.jsx'
import { BOTAO_FANTASMA, BOTAO_PRIMARIO, CLASSE_ROTULO, CLASSE_TEXTAREA } from '../comum/classes.js'

// Cartão "Terminou com uma pergunta": o fim do resultado e a resposta que continua a conversa. Retorna o JSX.
export default function PerguntaFinal({ ordem, quem, ocupado = false, onEnviada, onDispensada }) {
  const agora = useAgora()
  const idTitulo = useId()
  const idCampo = useId()
  const campo = useRef(null)
  const [texto, setTexto] = useState('')
  const [envio, setEnvio] = useState({ acao: null, erro: null })
  const enviando = Boolean(envio.acao)

  const responder = async () => {
    const instrucao = texto.trim()
    if (!instrucao || enviando) return
    setEnvio({ acao: 'responder', erro: null })
    try {
      await api.criarOrdem({ agenteId: ordem.agenteId, projeto: ordem.projeto, instrucao, modo: ordem.modo, continuaDe: ordem.id })
      setTexto('')
      setEnvio({ acao: null, erro: null })
      onEnviada?.()
    } catch (erro) {
      setEnvio({ acao: null, erro: mensagemDoErro(erro, 'Não foi possível enviar a resposta.') })
      campo.current?.focus()
    }
  }

  const dispensar = async () => {
    if (enviando) return
    setEnvio({ acao: 'dispensar', erro: null })
    try {
      await api.dispensarResposta(ordem.id)
      setEnvio({ acao: null, erro: null })
      onDispensada?.()
    } catch (erro) {
      setEnvio({ acao: null, erro: mensagemDoErro(erro, 'Não foi possível dispensar.') })
      campo.current?.focus()
    }
  }

  return (
    <section
      aria-labelledby={idTitulo}
      data-pergunta-final={ordem.id}
      className="flex flex-col gap-4 p-4 sm:p-5 rounded-xl border border-[#fbbf24]/30 bg-superficie-2 min-w-0"
    >
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-8 h-8 shrink-0 rounded-md" style={{ background: `${COR.ambar}17`, color: COR.ambar }} aria-hidden="true">
          <MessageCircleQuestion className="w-4 h-4" />
        </span>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <h4 id={idTitulo} tabIndex={-1} className="text-[14px] font-semibold leading-[1.35] text-neutral-50 focus:outline-none">
            Terminou com uma pergunta
          </h4>
          <span className="text-[11.5px] text-neutral-400">
            {nomeDoCaminho(ordem.projeto)} · terminou {tempoRelativo(ordem.finalizadaEm, agora)}
          </span>
          <span className="text-[11.5px] text-neutral-500 truncate" title={ordem.instrucao}>
            Ordem: {ordem.instrucao}
          </span>
        </div>
      </div>

      <div className="px-4 py-3 rounded-lg bg-fundo border border-linha">
        <TextoMarkdown texto={ultimosParagrafos(ordem.resultado)} className="max-w-[80ch]" />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idCampo} className={CLASSE_ROTULO}>SUA RESPOSTA</label>
        {/* readOnly, não disabled: o foco não cai no <body> enquanto envia */}
        <textarea
          ref={campo}
          id={idCampo}
          rows={3}
          maxLength={20000}
          value={texto}
          readOnly={enviando}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              responder()
            }
          }}
          placeholder="Responda e o agente continua a mesma conversa"
          className={`${CLASSE_TEXTAREA} read-only:opacity-60`}
        />
        {ocupado && (
          <p className="flex items-start gap-2 m-0 text-[11.5px] leading-[1.45] text-neutral-400">
            <Hourglass className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
            {quem ?? 'O agente'} está ocupado; a resposta entra na fila.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={responder} disabled={!texto.trim() || enviando} className={BOTAO_PRIMARIO}>
          <Send className="w-4 h-4" aria-hidden="true" />
          {envio.acao === 'responder' ? 'Enviando…' : 'Enviar resposta'}
        </button>
        <button type="button" onClick={dispensar} disabled={enviando} className={BOTAO_FANTASMA}>
          {envio.acao === 'dispensar' ? 'Dispensando…' : 'Dispensar'}
        </button>
        <span className="hidden fino:sm:inline ml-auto font-mono text-[10.5px] text-neutral-600">Ctrl+Enter envia</span>
      </div>
      {envio.erro && (
        <p role="alert" className="m-0 text-[11.5px] font-medium" style={{ color: COR.vermelho }}>{envio.erro}</p>
      )}
    </section>
  )
}
