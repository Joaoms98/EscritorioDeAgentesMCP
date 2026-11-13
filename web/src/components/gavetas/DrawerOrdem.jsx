import { useEffect, useId, useRef, useState } from 'react'
import { LoaderCircle, MessageSquareReply, RotateCw, SearchX, Square, X } from 'lucide-react'
import { CINZA, COR, MODO_POR_ID, STATUS_ORDEM, TIPOS_PENDENCIA } from '../../constants/estados.js'
import { api } from '../../services/api.js'
import useAgora from '../../hooks/useAgora.js'
import useAviso from '../../hooks/useAviso.js'
import useMarcarVista from '../../hooks/useMarcarVista.js'
import { foiCancelado, mensagemDoErro } from '../../utils/erros.js'
import { juntarEventos } from '../../utils/eventos.js'
import { focarProximoPedido } from '../../utils/foco.js'
import {
  custoAproximado, dataHora, duracao, emMs, hora, nomeDoCaminho, numeroCompacto, tempoRelativo,
} from '../../utils/formatacao.js'
import { perguntasDaEntrada, rotuloDaDecisao } from '../../utils/pendencias.js'
import TextoMarkdown from '../TextoMarkdown.jsx'
import AvisoAoVivo from '../comum/AvisoAoVivo.jsx'
import BotaoPerigo from '../comum/BotaoPerigo.jsx'
import Gaveta from '../comum/Gaveta.jsx'
import Recolhivel from '../comum/Recolhivel.jsx'
import RotuloSecao from '../comum/RotuloSecao.jsx'
import {
  BOTAO_FANTASMA, BOTAO_FECHAR, BOTAO_LINK, BOTAO_PEQUENO, BOTAO_PRIMARIO, CLASSE_ERRO, CLASSE_ROTULO, FOCO,
} from '../comum/classes.js'
import CartaoPendencia from '../painel/CartaoPendencia.jsx'
import FeedEventos from '../painel/FeedEventos.jsx'
import ListaTodos from '../painel/ListaTodos.jsx'

const ESPERA_RECARGA_MS = 300
const EVENTOS_VISIVEIS = 150
const RODANDO = ['trabalhando', 'aguardando']

const COR_DA_DECISAO = {
  permitir: CINZA.forte,
  permitir_sempre: CINZA.forte,
  responder: CINZA.forte,
  aprovar: CINZA.forte,
  aprovar_editando: CINZA.forte,
  negar: COR.vermelho,
  recusar: COR.ambar,
  ajustar: COR.ambar,
}

function comPendencia(lista, pendencia) {
  const indice = lista.findIndex((p) => p.id === pendencia.id)
  if (indice === -1) return [...lista, pendencia]
  const nova = lista.slice()
  nova[indice] = pendencia
  return nova
}

function Fato({ rotulo, children, largo = false, mono = false }) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${largo ? 'col-span-2' : ''}`}>
      <dt className={CLASSE_ROTULO}>{rotulo}</dt>
      <dd className={`m-0 text-[12.5px] leading-[1.45] text-neutral-200 break-words ${mono ? 'font-mono text-[11.5px] [overflow-wrap:anywhere]' : ''}`}>
        {children}
      </dd>
    </div>
  )
}

function Fatos({ ordem }) {
  const agora = useAgora(1000)
  const modo = MODO_POR_ID[ordem.modo] ?? MODO_POR_ID.default
  const inicio = emMs(ordem.iniciadaEm)
  const tempo = ordem.duracaoMs ?? (RODANDO.includes(ordem.status) && inicio !== null ? agora - inicio : null)
  const tokens = ordem.tokensEntrada === null && ordem.tokensSaida === null
    ? '—'
    : `${numeroCompacto(ordem.tokensEntrada)} entrada · ${numeroCompacto(ordem.tokensSaida)} saída`
  return (
    <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5 m-0 py-4 border-y border-linha">
      <Fato rotulo="CRIADA">{dataHora(ordem.criadaEm)}</Fato>
      <Fato rotulo="COMEÇOU">{dataHora(ordem.iniciadaEm)}</Fato>
      <Fato rotulo="TERMINOU">{dataHora(ordem.finalizadaEm)}</Fato>
      <Fato rotulo="DURAÇÃO">{duracao(tempo)}</Fato>
      <Fato rotulo="CUSTO">{ordem.custoUsd === null ? '—' : `${custoAproximado(ordem.custoUsd)} a preço de tabela`}</Fato>
      <Fato rotulo="TURNOS">{ordem.turnos ?? '—'}</Fato>
      <Fato rotulo="TOKENS">{tokens}</Fato>
      <Fato rotulo="MODO">{modo.rotulo}</Fato>
      <Fato rotulo="MODELO">{ordem.modelo ?? '—'}</Fato>
      <Fato rotulo="SESSÃO" mono>{ordem.sessaoId ? `${ordem.sessaoId.slice(0, 8)}…` : '—'}</Fato>
      <Fato rotulo="PASTA DO PROJETO" largo mono>{ordem.projeto}</Fato>
    </dl>
  )
}

function RespostaDada({ pendencia }) {
  if (pendencia.status === 'cancelada') {
    return <span className="text-[11.5px] text-neutral-500">Cancelada: a ordem parou antes da resposta.</span>
  }
  if (pendencia.status === 'expirada') {
    return <span className="text-[11.5px] text-neutral-500">Expirou: o servidor reiniciou antes da resposta.</span>
  }
  const resposta = pendencia.resposta
  if (!resposta) return null
  const perguntas = pendencia.tipo === 'pergunta' ? perguntasDaEntrada(pendencia.entrada) : []
  const respostas = Object.entries(resposta.respostas ?? {})
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[11.5px] font-semibold" style={{ color: COR_DA_DECISAO[resposta.decisao] ?? CINZA.medio }}>
        {rotuloDaDecisao(resposta.decisao)}
      </span>
      {respostas.length > 0 && (
        <ul className="flex flex-col gap-1">
          {respostas.map(([pergunta, texto]) => (
            <li key={pergunta} className="flex flex-col gap-0.5 text-[12px] leading-[1.45]">
              <span className="text-neutral-500 break-words">{perguntas.find((p) => p.pergunta === pergunta)?.cabecalho || pergunta}</span>
              <span className="font-medium text-neutral-100 break-words">{texto}</span>
            </li>
          ))}
        </ul>
      )}
      {resposta.mensagem && (
        <p className="m-0 pl-2.5 border-l-2 border-linha-forte text-[12px] leading-[1.45] text-neutral-300 whitespace-pre-wrap break-words">
          {resposta.mensagem}
        </p>
      )}
    </div>
  )
}

function Cadeia({ cadeia, atualId, agora, onAbrirOrdem }) {
  return (
    <section className="flex flex-col gap-2">
      <RotuloSecao>CONVERSA ({cadeia.length} ORDENS)</RotuloSecao>
      <ol className="flex flex-col rounded-lg border border-linha divide-y divide-linha overflow-hidden">
        {cadeia.map((item, i) => {
          const status = STATUS_ORDEM[item.status] ?? STATUS_ORDEM.concluida
          const atual = item.id === atualId
          const conteudo = (
            <>
              <span className="grid place-items-center w-6 h-6 shrink-0 rounded-full bg-white/[.05] font-mono text-[10.5px] font-medium tabular-nums" style={{ color: status.cor }}>
                {i + 1}
              </span>
              <span className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className={`text-[12.5px] leading-[1.35] line-clamp-2 break-words ${atual ? 'font-medium text-neutral-50' : 'text-neutral-300'}`}>
                  {item.instrucao}
                </span>
                <span className="text-[11px] text-neutral-500">
                  {status.rotulo} · {tempoRelativo(item.finalizadaEm ?? item.iniciadaEm ?? item.criadaEm, agora)}
                </span>
              </span>
            </>
          )
          return (
            <li key={item.id}>
              {atual ? (
                <div aria-current="true" className="flex items-center gap-2.5 px-3 py-2.5 bg-white/[.05] shadow-[inset_2px_0_0_#fafafa]">
                  {conteudo}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onAbrirOrdem(item.id)}
                  className={`flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-colors hover:bg-white/[.03] ${FOCO} focus-visible:ring-inset`}
                >
                  {conteudo}
                </button>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// Drawer com a ordem inteira: dados, pedidos ao humano, resultado, eventos, conversa e as ações. Retorna o JSX.
export default function DrawerOrdem({ ordemId, assinar, onFechar, onAbrirOrdem, onContinuar, onVerAgente }) {
  const agora = useAgora()
  const idTitulo = useId()
  const botaoFechar = useRef(null)
  const corpo = useRef(null)
  const [dados, setDados] = useState(null)
  const [carga, setCarga] = useState({ carregando: true, erro: null, naoExiste: false })
  const [recarga, setRecarga] = useState(0)
  const [acao, setAcao] = useState({ executando: null, erro: null })
  const [todosEventos, setTodosEventos] = useState(false)
  const [exibida, setExibida] = useState(ordemId)
  const [aviso, avisar] = useAviso()
  const statusConhecido = useRef(null)
  const eventosAntes = useRef([])
  const mudouNaCarga = useRef({ id: null, status: null, pendencia: false })
  const pedidos = useRef(null)
  const chipStatus = useRef(null)

  // Trocar de ordem (conversa, retomar) troca só o conteúdo: o drawer continua aberto, sem piscar.
  if (exibida !== ordemId) {
    setExibida(ordemId)
    setDados(null)
    setCarga({ carregando: true, erro: null, naoExiste: false })
    setAcao({ executando: null, erro: null })
    setTodosEventos(false)
  }

  useEffect(() => {
    const controle = new AbortController()
    api.ordem(ordemId, { sinal: controle.signal })
      .then((novo) => {
        statusConhecido.current = { id: ordemId, status: novo.ordem.status }
        const extras = eventosAntes.current.filter((e) => e.ordemId === ordemId)
        eventosAntes.current = []
        const mudou = mudouNaCarga.current
        mudouNaCarga.current = { id: null, status: null, pendencia: false }
        setDados((atual) => ({
          ...novo,
          eventos: juntarEventos(
            juntarEventos(novo.eventos ?? [], atual?.ordem?.id === ordemId ? atual.eventos : [], 5000),
            extras,
            5000,
          ),
        }))
        setCarga({ carregando: false, erro: null, naoExiste: false })
        // A foto do servidor pode ser de antes do que chegou ao vivo durante a carga: busca de novo, uma vez.
        if (mudou.id === ordemId && (mudou.pendencia || (mudou.status && mudou.status !== novo.ordem.status))) {
          setRecarga((n) => n + 1)
        }
      })
      .catch((erro) => {
        if (controle.signal.aborted || foiCancelado(erro)) return
        if (erro?.status === 404) {
          setCarga({ carregando: false, erro: null, naoExiste: true })
          return
        }
        console.warn('Falha ao abrir a ordem:', erro)
        setCarga({ carregando: false, erro: mensagemDoErro(erro, 'Não foi possível abrir a ordem.'), naoExiste: false })
      })
    return () => controle.abort()
  }, [ordemId, recarga])

  useEffect(() => {
    let timer = null
    const recarregar = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setRecarga((n) => n + 1), ESPERA_RECARGA_MS)
    }
    // Enquanto a primeira carga desta ordem não chega, guarda o que mudou ao vivo (o status e se houve pedido).
    const anotarNaCarga = (mudanca) => {
      if (statusConhecido.current?.id === ordemId) return
      const atual = mudouNaCarga.current.id === ordemId ? mudouNaCarga.current : { id: ordemId, status: null, pendencia: false }
      mudouNaCarga.current = { ...atual, ...mudanca }
    }
    const desassinar = assinar(({ tipo, dados: valor }) => {
      if (tipo === 'estado') {
        recarregar()
        return
      }
      if (tipo === 'evento' && valor.ordemId === ordemId) {
        if (statusConhecido.current?.id !== ordemId) eventosAntes.current = [...eventosAntes.current, valor]
        setDados((atual) => (atual?.ordem?.id === ordemId ? { ...atual, eventos: juntarEventos(atual.eventos, [valor], 5000) } : atual))
        return
      }
      if (tipo === 'ordem') {
        if (valor.id === ordemId) {
          anotarNaCarga({ status: valor.status })
          setDados((atual) => (atual?.ordem?.id === ordemId ? { ...atual, ordem: valor } : atual))
          const conhecido = statusConhecido.current
          if (conhecido?.id === ordemId && conhecido.status !== valor.status) {
            statusConhecido.current = { id: ordemId, status: valor.status }
            recarregar()
          }
        } else if (valor.continuaDe === ordemId) {
          recarregar()
        }
        return
      }
      if (tipo === 'pendencia' && valor.ordemId === ordemId) {
        anotarNaCarga({ pendencia: true })
        setDados((atual) => (atual?.ordem?.id === ordemId ? { ...atual, pendencias: comPendencia(atual.pendencias, valor) } : atual))
      }
    })
    return () => {
      desassinar()
      clearTimeout(timer)
    }
  }, [assinar, ordemId])

  const ordem = dados?.ordem ?? null
  useMarcarVista(corpo, ordem)

  const executar = async (nome, chamada, padrao) => {
    if (acao.executando) return
    setAcao({ executando: nome, erro: null })
    try {
      const resultado = await chamada()
      setAcao({ executando: null, erro: null })
      return resultado
    } catch (erro) {
      setAcao({ executando: null, erro: mensagemDoErro(erro, padrao) })
      return null
    }
  }

  const retomar = async () => {
    const nova = await executar('retomar', () => api.retomarOrdem(ordemId), 'Não foi possível retomar a ordem.')
    if (nova?.id) onAbrirOrdem(nova.id)
  }

  const agente = dados?.agente ?? null

  const aoResponder = (pendenciaId, atualizada) => {
    if (atualizada) {
      setDados((atual) => (atual?.ordem?.id === atualizada.ordemId ? { ...atual, pendencias: comPendencia(atual.pendencias, atualizada) } : atual))
      avisar(`Resposta enviada. ${agente?.apelido ?? 'O agente'} continua daqui.`)
    } else {
      setRecarga((n) => n + 1)
    }
    focarProximoPedido(pedidos.current, pendenciaId, chipStatus.current)
  }

  const status = ordem ? STATUS_ORDEM[ordem.status] ?? STATUS_ORDEM.concluida : null
  const abertas = (dados?.pendencias ?? []).filter((p) => p.status === 'aberta')
  const fechadas = (dados?.pendencias ?? []).filter((p) => p.status !== 'aberta')
  const eventos = dados?.eventos ?? []
  const eventosMostrados = todosEventos || eventos.length <= EVENTOS_VISIVEIS ? eventos : eventos.slice(-EVENTOS_VISIVEIS)
  const cabecalho = ['ORDEM', agente?.apelido, ordem ? nomeDoCaminho(ordem.projeto) : null]
    .filter(Boolean)
    .join(' · ')
    .toLocaleUpperCase('pt-BR')

  const rodape = ordem && (
    <>
      {acao.erro && (
        <p role="alert" className="w-full m-0 text-[11.5px] font-medium" style={{ color: COR.vermelho }}>{acao.erro}</p>
      )}
      {agente ? (
        <button type="button" onClick={() => onVerAgente(agente.id)} className={`${BOTAO_FANTASMA} -ml-2`}>
          Ver painel de {agente.apelido}
        </button>
      ) : <span />}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {RODANDO.includes(ordem.status) && (
          <BotaoPerigo
            Icone={Square}
            rotulo="Parar ordem"
            rotuloConfirmar="Confirmar: parar"
            rotuloOcupado="Parando…"
            ocupado={acao.executando === 'parar'}
            onConfirmar={() => executar('parar', () => api.pararOrdem(ordemId), 'Não foi possível parar a ordem.')}
          />
        )}
        {ordem.status === 'na_fila' && (
          <BotaoPerigo
            Icone={X}
            rotulo="Cancelar ordem"
            rotuloConfirmar="Confirmar: cancelar"
            rotuloOcupado="Cancelando…"
            ocupado={acao.executando === 'cancelar'}
            onConfirmar={() => executar('cancelar', () => api.cancelarOrdem(ordemId), 'Não foi possível cancelar a ordem.')}
          />
        )}
        {(ordem.status === 'interrompida' || ordem.status === 'parada') && (
          <button type="button" onClick={retomar} disabled={Boolean(acao.executando)} className={BOTAO_PRIMARIO}>
            <RotateCw className="w-4 h-4" aria-hidden="true" />
            {acao.executando === 'retomar' ? 'Retomando…' : 'Retomar'}
          </button>
        )}
        {(ordem.status === 'concluida' || ordem.status === 'erro') && ordem.sessaoId && (
          <button type="button" onClick={() => onContinuar(ordem)} className={BOTAO_PRIMARIO}>
            <MessageSquareReply className="w-4 h-4" aria-hidden="true" />
            Continuar conversa
          </button>
        )}
      </div>
    </>
  )

  return (
    <Gaveta idTitulo={idTitulo} onFechar={onFechar} refFocoInicial={botaoFechar} rodape={rodape} chave={ordemId}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <span id={idTitulo} className={`${CLASSE_ROTULO} break-words`}>{cabecalho}</span>
          {ordem && (
            <Recolhivel key={ordemId} alturaMaxima={190}>
              <h2 className="m-0 text-[16px] font-semibold leading-[1.45] tracking-[-.01em] text-neutral-50 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {ordem.instrucao}
              </h2>
            </Recolhivel>
          )}
        </div>
        <button ref={botaoFechar} type="button" onClick={onFechar} aria-label="Fechar" className={BOTAO_FECHAR}>
          <X className="w-4 h-4 fino:sm:w-3.5 fino:sm:h-3.5" aria-hidden="true" />
        </button>
      </div>

      {!dados && carga.carregando && (
        <div className="flex items-center justify-center gap-2 py-16 text-[12px] text-neutral-500">
          <LoaderCircle className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
          Abrindo a ordem…
        </div>
      )}
      {carga.naoExiste && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg border border-linha bg-fundo">
          <SearchX className="w-4 h-4 shrink-0 text-neutral-500" aria-hidden="true" />
          <span className="text-[12.5px] text-neutral-400">Essa ordem não existe mais no escritório.</span>
        </div>
      )}
      {!dados && carga.erro && (
        <div className={CLASSE_ERRO}>
          <span className="text-[12px] font-medium" style={{ color: COR.vermelho }}>{carga.erro}</span>
          <button
            type="button"
            onClick={() => {
              setCarga({ carregando: true, erro: null, naoExiste: false })
              setRecarga((n) => n + 1)
            }}
            className={BOTAO_PEQUENO}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {ordem && (
        <div ref={corpo} className="flex flex-col gap-[18px] min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span
              ref={chipStatus}
              tabIndex={-1}
              className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md border text-[11.5px] font-medium focus:outline-none"
              style={{ borderColor: `${status.cor}55`, color: status.cor }}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${status.rodando ? 'ctrl-pulso' : ''}`} style={{ background: status.cor }} aria-hidden="true" />
              {status.rotulo}
            </span>
            {ordem.atividade && status.rodando && (
              <span className="font-mono text-[11.5px] text-neutral-400 min-w-0 break-words">{ordem.atividade}</span>
            )}
          </div>

          <AvisoAoVivo texto={aviso} />

          {abertas.length > 0 && (
            <div ref={pedidos} className="flex flex-col gap-2.5">
              {abertas.map((pendencia) => (
                <CartaoPendencia
                  key={pendencia.id}
                  pendencia={pendencia}
                  quem={agente?.apelido}
                  projeto={ordem.projeto}
                  onRespondida={(atualizada) => aoResponder(pendencia.id, atualizada)}
                />
              ))}
            </div>
          )}

          <Fatos ordem={ordem} />

          <ListaTodos todos={ordem.todos} />

          {ordem.resultado && (
            <section className="flex flex-col gap-2">
              <RotuloSecao>RESULTADO</RotuloSecao>
              <div className="px-4 py-3 rounded-lg bg-fundo border border-linha">
                <TextoMarkdown texto={ordem.resultado} />
              </div>
            </section>
          )}

          {ordem.erro && (
            <section className="flex flex-col gap-2">
              <span className={CLASSE_ROTULO} style={{ color: COR.vermelho }}>ERRO</span>
              <p className="m-0 px-3.5 py-2.5 rounded-lg border border-[#f87171]/25 bg-[#f87171]/[.05] font-mono text-[12px] leading-[1.55] text-[#fecaca] whitespace-pre-wrap [overflow-wrap:anywhere]">
                {ordem.erro}
              </p>
            </section>
          )}

          {fechadas.length > 0 && (
            <section className="flex flex-col gap-2">
              <RotuloSecao>PEDIDOS AO HUMANO</RotuloSecao>
              <ul className="flex flex-col rounded-lg border border-linha divide-y divide-linha">
                {fechadas.map((pendencia) => {
                  const { Icone, rotulo } = TIPOS_PENDENCIA[pendencia.tipo] ?? TIPOS_PENDENCIA.permissao
                  return (
                    <li key={pendencia.id} className="flex flex-col gap-2 px-3.5 py-3">
                      <div className="flex items-start gap-2">
                        <Icone className="w-3.5 h-3.5 mt-px shrink-0 text-neutral-500" aria-hidden="true" />
                        <span className="flex-1 min-w-0 text-[12.5px] font-medium leading-[1.35] text-neutral-100 break-words">
                          <span className="sr-only">{rotulo}: </span>
                          {pendencia.titulo}
                        </span>
                        <time dateTime={pendencia.respondidaEm ?? pendencia.criadaEm} className="shrink-0 font-mono text-[10.5px] tabular-nums text-neutral-600">
                          {hora(pendencia.respondidaEm ?? pendencia.criadaEm)}
                        </time>
                      </div>
                      <RespostaDada pendencia={pendencia} />
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {dados.cadeia?.length > 1 && (
            <Cadeia cadeia={dados.cadeia} atualId={ordem.id} agora={agora} onAbrirOrdem={onAbrirOrdem} />
          )}

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <RotuloSecao>EVENTOS</RotuloSecao>
              <span className="font-mono text-[10.5px] tabular-nums text-neutral-600">{eventos.length}</span>
            </div>
            {eventosMostrados.length < eventos.length && (
              <button
                type="button"
                onClick={() => setTodosEventos(true)}
                className={BOTAO_LINK}
              >
                Mostrar os {eventos.length - eventosMostrados.length} eventos mais antigos
              </button>
            )}
            <FeedEventos eventos={eventosMostrados} vazio="Nenhum evento registrado nesta ordem." />
          </section>
        </div>
      )}
    </Gaveta>
  )
}
