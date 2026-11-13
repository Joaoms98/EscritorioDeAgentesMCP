import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Activity, Brain, ChevronDown, Coffee, Cpu, FolderGit2, History, Hourglass, LoaderCircle, Plus, Square, Wrench, X,
} from 'lucide-react'
import { CINZA, COR, ESTADOS_AGENTE } from '../../constants/estados.js'
import { api } from '../../services/api.js'
import useAgora from '../../hooks/useAgora.js'
import useAviso from '../../hooks/useAviso.js'
import { foiCancelado, mensagemDoErro } from '../../utils/erros.js'
import { juntarEventos } from '../../utils/eventos.js'
import { focarProximoPedido } from '../../utils/foco.js'
import { inicialDe, nomeDoCaminho, plural } from '../../utils/formatacao.js'
import { comOrdem, continuacaoNaFila, juntarHistorico } from '../../utils/ordens.js'
import AvisoAoVivo from '../comum/AvisoAoVivo.jsx'
import BotaoPerigo from '../comum/BotaoPerigo.jsx'
import {
  BOTAO_FANTASMA, BOTAO_PEQUENO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CLASSE_ERRO, CLASSE_LISTA, CLASSE_ROTULO, FOCO,
} from '../comum/classes.js'
import CartaoPendencia from './CartaoPendencia.jsx'
import LinhaOrdem from './LinhaOrdem.jsx'
import OrdemAtual from './OrdemAtual.jsx'
import PerguntaFinal from './PerguntaFinal.jsx'
import ResumoUltimaOrdem from './ResumoUltimaOrdem.jsx'

const SEM_EVENTOS = []
const SEM_ORDENS = []
const ESPERA_RECARGA_MS = 300

const ABAS = [
  { id: 'agora', rotulo: 'Agora', Icone: Activity },
  { id: 'fila', rotulo: 'Fila', Icone: Hourglass },
  { id: 'historico', rotulo: 'Histórico', Icone: History },
]

function comPendencia(lista, pendencia) {
  const indice = lista.findIndex((p) => p.id === pendencia.id)
  if (indice === -1) return [...lista, pendencia]
  const nova = lista.slice()
  nova[indice] = pendencia
  return nova
}

function Etiqueta({ Icone, children, titulo }) {
  return (
    <span title={titulo} className="inline-flex items-center gap-1.5 text-[11.5px] text-neutral-500">
      <Icone className="w-3.5 h-3.5 shrink-0 text-neutral-600" aria-hidden="true" />
      {children}
    </span>
  )
}

// Só o caminho do projeto (com título) é cortado; os outros valores quebram a linha em vez de virar "Precisa de v…".
// Sem caixa: os quatro ficam numa faixa, separados por uma linha fina do md para cima. `ponto` = cor do estado.
function Numero({ rotulo, valor, cor, titulo, ponto }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0 md:px-5 md:first:pl-0 md:border-l md:first:border-l-0 border-linha" title={titulo}>
      <dt className={CLASSE_ROTULO}>{rotulo}</dt>
      <dd
        className={`flex items-center gap-2 m-0 min-w-0 text-[15px] sm:text-[16px] font-semibold leading-tight tracking-[-.01em] ${typeof valor === 'number' ? 'tabular-nums' : ''}`}
        style={{ color: cor }}
      >
        {ponto && <span className="w-2 h-2 shrink-0 rounded-full" style={{ background: ponto }} aria-hidden="true" />}
        <span className={`min-w-0 ${titulo ? 'truncate' : 'break-words'}`}>{valor}</span>
      </dd>
    </div>
  )
}

function Cabecalho({ agente, ordemAtual, parando, onNovaOrdem, onParar }) {
  const rodando = Boolean(ordemAtual) && ['trabalhando', 'aguardando'].includes(ordemAtual.status)
  const ferramentas = agente.ferramentas
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-4 pb-5 border-b border-linha">
      <span
        className="grid place-items-center w-11 h-11 shrink-0 rounded-full border border-linha-forte bg-superficie-3 text-[17px] font-semibold text-neutral-50"
        aria-hidden="true"
      >
        {inicialDe(agente.apelido)}
      </span>
      <div className="flex flex-col gap-1.5 flex-[999_1_0%] min-w-[200px]">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <h3 className="text-[19px] font-semibold leading-tight tracking-[-.015em] text-neutral-50 break-words">{agente.apelido}</h3>
          <span className="font-mono text-[11px] text-neutral-500">
            {agente.generalista ? 'generalista' : agente.nome !== agente.apelido ? agente.nome : 'agente'}
          </span>
        </div>
        {agente.descricao && (
          <p className="m-0 max-w-[90ch] text-[12.5px] leading-[1.55] text-neutral-400 line-clamp-2" title={agente.descricao}>
            {agente.descricao}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
          <Etiqueta Icone={Cpu} titulo="Modelo">{agente.modelo ?? 'modelo padrão'}</Etiqueta>
          <Etiqueta Icone={Wrench} titulo={ferramentas?.length ? ferramentas.join(', ') : 'Sem restrição de ferramentas'}>
            {ferramentas?.length ? plural(ferramentas.length, 'ferramenta', 'ferramentas') : 'todas as ferramentas'}
          </Etiqueta>
          {agente.memoria && <Etiqueta Icone={Brain} titulo="Memória do agente">memória: {agente.memoria}</Etiqueta>}
          {agente.origem && (
            <Etiqueta Icone={FolderGit2} titulo={`Agente do projeto em ${agente.origem}; nas ordens de outros projetos ele continua achando os arquivos de lá`}>
              do projeto {nomeDoCaminho(agente.origem)}
            </Etiqueta>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:pt-1">
        <button type="button" onClick={onNovaOrdem} className={BOTAO_PRIMARIO}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          Nova ordem
        </button>
        {rodando && (
          <BotaoPerigo
            Icone={Square}
            rotulo="Parar"
            rotuloConfirmar="Confirmar: parar a ordem"
            rotuloOcupado="Parando…"
            ocupado={parando}
            onConfirmar={onParar}
          />
        )}
      </div>
    </div>
  )
}

function Abas({ aba, onTrocar, contagens, idBase }) {
  const trocarPorTeclado = (e, indice) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const proxima = ABAS[(indice + (e.key === 'ArrowRight' ? 1 : ABAS.length - 1)) % ABAS.length]
    onTrocar(proxima.id)
    document.getElementById(`${idBase}-aba-${proxima.id}`)?.focus()
  }
  return (
    <div role="tablist" aria-label="O que ver do agente" className="flex gap-1 border-b border-linha">
      {ABAS.map(({ id, rotulo, Icone }, indice) => {
        const ativo = aba === id
        return (
          <button
            key={id}
            id={`${idBase}-aba-${id}`}
            type="button"
            role="tab"
            aria-selected={ativo}
            aria-controls={`${idBase}-painel`}
            tabIndex={ativo ? 0 : -1}
            onClick={() => onTrocar(id)}
            onKeyDown={(e) => trocarPorTeclado(e, indice)}
            className={`inline-flex items-center gap-1.5 shrink-0 min-h-[42px] fino:sm:min-h-[38px] px-3 -mb-px border-b-2 rounded-t-md text-[12.5px] font-medium transition-colors ${FOCO} focus-visible:ring-inset ${
              ativo ? 'border-neutral-50 text-neutral-50' : 'border-transparent text-neutral-500 hover:text-neutral-200'
            }`}
          >
            <Icone className="w-3.5 h-3.5" aria-hidden="true" />
            {rotulo}
            {contagens[id] !== undefined && <span className="font-mono text-[11px] tabular-nums text-neutral-600">{contagens[id]}</span>}
          </button>
        )
      })}
    </div>
  )
}

function BotaoCancelarFila({ ordem, onErro }) {
  const [cancelando, setCancelando] = useState(false)
  const cancelar = async () => {
    setCancelando(true)
    try {
      await api.cancelarOrdem(ordem.id)
    } catch (erro) {
      onErro(mensagemDoErro(erro, 'Não foi possível cancelar a ordem.'))
      setCancelando(false)
    }
  }
  return (
    <button
      type="button"
      onClick={cancelar}
      disabled={cancelando}
      aria-label={`Cancelar a ordem: ${ordem.instrucao.slice(0, 80)}`}
      className={`${BOTAO_SECUNDARIO} shrink-0`}
    >
      <X className="w-4 h-4 sm:hidden" aria-hidden="true" />
      <span className="hidden sm:inline">{cancelando ? 'Cancelando…' : 'Cancelar'}</span>
    </button>
  )
}

function Vazio({ Icone, texto, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 rounded-lg border border-dashed border-linha-forte text-center">
      <Icone className="w-5 h-5 text-neutral-600" aria-hidden="true" />
      <p className="m-0 max-w-[46ch] text-[12.5px] text-neutral-500 [text-wrap:balance]">{texto}</p>
      {children}
    </div>
  )
}

// Painel do agente escolhido: pedidos abertos, pergunta final, números e as abas Agora, Fila e Histórico. Retorna o JSX.
export default function PainelAgente({ agente, assinar, onNovaOrdem, onAbrirOrdem }) {
  const agora = useAgora()
  const idBase = useId()
  const [detalhe, setDetalhe] = useState(null)
  const [carga, setCarga] = useState({ carregando: true, erro: null })
  const [recarga, setRecarga] = useState(0)
  const [eventos, setEventos] = useState(SEM_EVENTOS)
  const [aba, setAba] = useState('agora')
  const [parando, setParando] = useState(false)
  const [erroAcao, setErroAcao] = useState(null)
  const [antigas, setAntigas] = useState(SEM_ORDENS)
  const [paginacao, setPaginacao] = useState({ carregando: false, erro: null, fim: false })
  const [aviso, avisar] = useAviso()
  const ordemConhecida = useRef(null)
  const eventosAvulsos = useRef([])
  const sinalDoAgente = useRef(null)
  const buscas = useRef({ feitas: 0, aplicada: 0 })
  const blocoPedidos = useRef(null)
  const listaHistorico = useRef(null)
  const focarNaLista = useRef(null)

  useEffect(() => {
    const controle = new AbortController()
    sinalDoAgente.current = controle.signal
    return () => controle.abort()
  }, [agente.id])

  // Recarga não cancela a busca anterior (num link lento nenhuma chegaria); só a resposta mais velha que a aplicada é ignorada.
  useEffect(() => {
    const numero = ++buscas.current.feitas
    const sinal = sinalDoAgente.current
    api.agente(agente.id, { sinal })
      .then((novo) => {
        if (numero < buscas.current.aplicada) return
        buscas.current.aplicada = numero
        const idAtual = novo.ordemAtual?.id ?? null
        ordemConhecida.current = novo.ordemAtual ? { id: idAtual, status: novo.ordemAtual.status } : null
        const extras = eventosAvulsos.current.filter((e) => e.ordemId === idAtual)
        eventosAvulsos.current = []
        const base = idAtual ? (novo.eventosAtuais ?? SEM_EVENTOS).filter((e) => e.ordemId === idAtual) : SEM_EVENTOS
        setDetalhe(novo)
        setEventos((anteriores) => (idAtual
          ? juntarEventos(juntarEventos(base, anteriores.filter((e) => e.ordemId === idAtual)), extras)
          : SEM_EVENTOS))
        setCarga({ carregando: false, erro: null })
      })
      .catch((erro) => {
        if (sinal?.aborted || foiCancelado(erro) || numero < buscas.current.aplicada) return
        console.warn('Falha ao carregar o painel do agente:', erro)
        setCarga({ carregando: false, erro: mensagemDoErro(erro, 'Não foi possível carregar o painel do agente.') })
      })
  }, [agente.id, recarga])

  useEffect(() => {
    let timer = null
    const recarregar = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setRecarga((n) => n + 1), ESPERA_RECARGA_MS)
    }
    const desassinar = assinar(({ tipo, dados }) => {
      if (tipo === 'estado') {
        recarregar()
        return
      }
      if (tipo === 'evento') {
        if (dados.ordemId === ordemConhecida.current?.id) setEventos((lista) => juntarEventos(lista, [dados]))
        else eventosAvulsos.current = [...eventosAvulsos.current.slice(-80), dados]
        return
      }
      if (dados?.agenteId !== agente.id) return
      if (tipo === 'ordem') {
        setAntigas((lista) => comOrdem(lista, dados))
        const conhecida = ordemConhecida.current
        if (conhecida?.id === dados.id) {
          setDetalhe((atual) => (atual?.ordemAtual?.id === dados.id ? { ...atual, ordemAtual: dados } : atual))
          if (conhecida.status === dados.status) return
          ordemConhecida.current = { id: dados.id, status: dados.status }
        }
        recarregar()
        return
      }
      if (tipo === 'pendencia') {
        setDetalhe((atual) => (atual ? { ...atual, pendencias: comPendencia(atual.pendencias, dados) } : atual))
        recarregar()
      }
    })
    return () => {
      desassinar()
      clearTimeout(timer)
    }
  }, [assinar, agente.id])

  useEffect(() => {
    const id = focarNaLista.current
    if (!id) return
    focarNaLista.current = null
    for (const botao of listaHistorico.current?.querySelectorAll('[data-ordem]') ?? []) {
      if (botao.dataset.ordem === id) botao.focus()
    }
  }, [antigas])

  const ordemAtual = detalhe?.ordemAtual ?? null
  const rodando = Boolean(ordemAtual) && ['trabalhando', 'aguardando'].includes(ordemAtual.status)
  const historico = useMemo(() => juntarHistorico(detalhe?.historico ?? SEM_ORDENS, antigas), [detalhe?.historico, antigas])

  useEffect(() => {
    if (!rodando) setParando(false)
  }, [rodando])

  const parar = async () => {
    if (!ordemAtual || parando) return
    setParando(true)
    setErroAcao(null)
    try {
      await api.pararOrdem(ordemAtual.id)
    } catch (erro) {
      setParando(false)
      setErroAcao(mensagemDoErro(erro, 'Não foi possível parar a ordem.'))
    }
  }

  // O cartão some da tela junto com a resposta: o foco vai para o próximo pedido (ou a aba) e o aviso fica no painel.
  const depoisDeResolver = (id, texto) => {
    if (texto) avisar(texto)
    focarProximoPedido(blocoPedidos.current, id, document.getElementById(`${idBase}-aba-${aba}`))
  }

  const aoResponder = (pendenciaId, atualizada) => {
    if (atualizada) setDetalhe((atual) => (atual ? { ...atual, pendencias: comPendencia(atual.pendencias, atualizada) } : atual))
    else setRecarga((n) => n + 1)
    depoisDeResolver(pendenciaId, atualizada ? `Resposta enviada. ${agente.apelido} continua daqui.` : null)
  }

  const carregarMaisAntigas = async () => {
    const ultimaCarregada = historico[historico.length - 1]
    if (paginacao.carregando || !ultimaCarregada) return
    setPaginacao({ carregando: true, erro: null, fim: false })
    try {
      const pagina = await api.historicoDoAgente(agente.id, ultimaCarregada.id, { sinal: sinalDoAgente.current })
      // Guarda também o que já estava na tela: se a primeira página andar (ordem nova terminando), nada some do meio.
      const vistas = juntarHistorico(historico, pagina)
      setAntigas((atuais) => juntarHistorico(atuais, vistas))
      setPaginacao({ carregando: false, erro: null, fim: pagina.length === 0 })
      focarNaLista.current = pagina[0]?.id ?? null
    } catch (erro) {
      if (foiCancelado(erro)) return
      setPaginacao({ carregando: false, erro: mensagemDoErro(erro, 'Não foi possível carregar as ordens mais antigas.'), fim: false })
    }
  }

  const estado = ESTADOS_AGENTE[agente.estado] ?? ESTADOS_AGENTE.livre
  const abertas = (detalhe?.pendencias ?? []).filter((p) => p.status === 'aberta')
  const fila = detalhe?.fila ?? SEM_ORDENS
  const ultima = historico.find((o) => o.id === agente.ultimaOrdem?.id) ?? historico[0] ?? null
  // Com a continuação da última ordem na fila o "Retomar" fica desligado; cancelada, a chave do resumo muda e ele volta.
  const retomadaAtiva = continuacaoNaFila(fila, ultima)
  const perguntaFinal = detalhe?.perguntaFinal ?? null
  const ocupado = rodando || fila.length > 0
  const concluidas = detalhe?.totais?.concluidas ?? 0
  const totalHistorico = Math.max(detalhe?.totais?.historico ?? 0, historico.length)
  const temMaisAntigas = historico.length < totalHistorico && !paginacao.fim
  const projetoAtual = ordemAtual?.projeto ?? agente.ordemAtual?.projeto ?? null
  const projetoAnterior = projetoAtual ? null : ultima?.projeto ?? agente.ultimaOrdem?.projeto ?? null
  const projetoDaOrdem = (pendencia) => (ordemAtual?.id === pendencia.ordemId ? ordemAtual.projeto : null)

  return (
    <section
      aria-label={`Painel de ${agente.apelido}`}
      className="flex flex-col gap-5 px-4 sm:px-6 pt-5 sm:pt-6 pb-6 rounded-xl bg-superficie border border-linha min-w-0"
    >
      <Cabecalho
        agente={agente}
        ordemAtual={ordemAtual}
        parando={parando}
        onNovaOrdem={() => onNovaOrdem({ agenteId: agente.id })}
        onParar={parar}
      />
      {erroAcao && <p role="alert" className="m-0 text-[12px] font-medium" style={{ color: COR.vermelho }}>{erroAcao}</p>}
      <AvisoAoVivo texto={aviso} />

      {!detalhe && carga.carregando && (
        <div className="flex items-center justify-center gap-2 py-14 text-[12px] text-neutral-500">
          <LoaderCircle className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
          Abrindo o painel de {agente.apelido}…
        </div>
      )}

      {!detalhe && carga.erro && (
        <div className={CLASSE_ERRO}>
          <span className="text-[12px] font-medium" style={{ color: COR.vermelho }}>{carga.erro}</span>
          <button
            type="button"
            onClick={() => {
              setCarga({ carregando: true, erro: null })
              setRecarga((n) => n + 1)
            }}
            className={BOTAO_PEQUENO}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {detalhe && (
        <>
          {(abertas.length > 0 || perguntaFinal) && (
            <div ref={blocoPedidos} className="flex flex-col gap-2.5">
              <h4 className="flex items-center gap-2 font-mono text-[10.5px] font-medium tracking-[.06em] uppercase" style={{ color: COR.ambar }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: COR.ambar }} aria-hidden="true" />
                Precisa de você
                {abertas.length > 1 && <span className="tabular-nums text-neutral-500">{abertas.length}</span>}
              </h4>
              {abertas.map((pendencia) => (
                <CartaoPendencia
                  key={pendencia.id}
                  pendencia={pendencia}
                  projeto={projetoDaOrdem(pendencia)}
                  onRespondida={(atualizada) => aoResponder(pendencia.id, atualizada)}
                />
              ))}
              {perguntaFinal && (
                <PerguntaFinal
                  key={perguntaFinal.id}
                  ordem={perguntaFinal}
                  quem={agente.apelido}
                  ocupado={ocupado}
                  onEnviada={() => depoisDeResolver(perguntaFinal.id, ocupado
                    ? `Resposta enviada. Ela entra na fila de ${agente.apelido}.`
                    : `Resposta enviada. ${agente.apelido} continua daqui.`)}
                  onDispensada={() => depoisDeResolver(perguntaFinal.id, 'Pergunta dispensada.')}
                />
              )}
            </div>
          )}

          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-5 m-0">
            <Numero rotulo="Agora" valor={estado.curto} cor={estado.urgente ? estado.cor : CINZA.forte} ponto={estado.cor} />
            {projetoAtual || !projetoAnterior ? (
              <Numero rotulo="Projeto" valor={nomeDoCaminho(projetoAtual)} cor={projetoAtual ? CINZA.forte : CINZA.apagado} titulo={projetoAtual ?? undefined} />
            ) : (
              <Numero rotulo="Projeto" valor={nomeDoCaminho(projetoAnterior)} cor={CINZA.medio} titulo={`Última ordem em ${projetoAnterior}`} />
            )}
            <Numero rotulo="Na fila" valor={fila.length} cor={fila.length ? CINZA.forte : CINZA.escuro} />
            <Numero rotulo="Concluídas" valor={concluidas} cor={concluidas ? CINZA.forte : CINZA.escuro} />
          </dl>

          <Abas aba={aba} onTrocar={setAba} idBase={idBase} contagens={{ fila: fila.length, historico: totalHistorico }} />

          <div id={`${idBase}-painel`} role="tabpanel" aria-labelledby={`${idBase}-aba-${aba}`} className="min-w-0">
            {aba === 'agora' && (
              ordemAtual ? (
                <OrdemAtual ordem={ordemAtual} eventos={eventos} onAbrirOrdem={onAbrirOrdem} />
              ) : (
                <div className="flex flex-col gap-3">
                  {agente.estado === 'na_fila' && (
                    <p className="flex items-start gap-2.5 m-0 px-3.5 py-2.5 rounded-lg border border-linha-forte text-[12.5px] leading-[1.5] text-neutral-300">
                      <Hourglass className="w-4 h-4 mt-px shrink-0 text-neutral-500" aria-hidden="true" />
                      {plural(fila.length, 'ordem esperando', 'ordens esperando')} uma vaga: o escritório já está com o máximo de agentes trabalhando ao mesmo tempo.
                    </p>
                  )}
                  {ultima ? (
                    <ResumoUltimaOrdem
                      key={`${ultima.id}:${retomadaAtiva}`}
                      ordem={ultima}
                      retomadaAtiva={retomadaAtiva}
                      permitirContinuar={perguntaFinal?.id !== ultima.id}
                      onAbrirOrdem={onAbrirOrdem}
                    />
                  ) : (
                    agente.estado !== 'na_fila' && (
                      <Vazio Icone={Coffee} texto="Livre. Dê uma ordem para começar.">
                        <button type="button" onClick={() => onNovaOrdem({ agenteId: agente.id })} className={BOTAO_PRIMARIO}>
                          <Plus className="w-4 h-4" aria-hidden="true" />
                          Nova ordem
                        </button>
                      </Vazio>
                    )
                  )}
                </div>
              )
            )}

            {aba === 'fila' && (
              fila.length === 0 ? (
                <Vazio Icone={Hourglass} texto={`Nada na fila de ${agente.apelido}. Ordens dadas enquanto o agente está ocupado esperam aqui.`} />
              ) : (
                <ol className={CLASSE_LISTA}>
                  {fila.map((ordem) => (
                    <LinhaOrdem
                      key={ordem.id}
                      ordem={ordem}
                      agora={agora}
                      onAbrir={onAbrirOrdem}
                      acao={<BotaoCancelarFila ordem={ordem} onErro={setErroAcao} />}
                    />
                  ))}
                </ol>
              )
            )}

            {aba === 'historico' && (
              historico.length === 0 ? (
                <Vazio Icone={History} texto="Nenhuma ordem terminada ainda." />
              ) : (
                <div className="flex flex-col gap-2">
                  <ol ref={listaHistorico} className={CLASSE_LISTA}>
                    {historico.map((ordem) => (
                      <LinhaOrdem key={ordem.id} ordem={ordem} agora={agora} onAbrir={onAbrirOrdem} />
                    ))}
                  </ol>
                  {temMaisAntigas && (
                    <button
                      type="button"
                      onClick={carregarMaisAntigas}
                      aria-disabled={paginacao.carregando}
                      className={`${BOTAO_FANTASMA} self-start -ml-2 aria-disabled:opacity-60 aria-disabled:cursor-wait`}
                    >
                      {paginacao.carregando ? (
                        <LoaderCircle className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="w-4 h-4" aria-hidden="true" />
                      )}
                      {paginacao.carregando ? 'Carregando…' : `Ver mais antigas (${totalHistorico - historico.length})`}
                    </button>
                  )}
                  {paginacao.erro && (
                    <p role="alert" className="m-0 text-[11.5px] font-medium" style={{ color: COR.vermelho }}>{paginacao.erro}</p>
                  )}
                </div>
              )
            )}
          </div>
        </>
      )}
    </section>
  )
}
