import { useCallback, useEffect, useRef, useState } from 'react'
import { SearchX } from 'lucide-react'
import { COR } from '../constants/estados.js'
import useParametrosDaUrl from '../hooks/useParametrosDaUrl.js'
import { api } from '../services/api.js'
import { mensagemDoErro } from '../utils/erros.js'
import useTelaLarga, { CONSULTA_TELA_LARGA } from '../hooks/useTelaLarga.js'
import LimiteDeErro from '../components/comum/LimiteDeErro.jsx'
import { BOTAO_PEQUENO, CLASSE_ERRO } from '../components/comum/classes.js'
import Avisos from '../components/pagina/Avisos.jsx'
import BarraLateral from '../components/pagina/BarraLateral.jsx'
import Cabecalho from '../components/pagina/Cabecalho.jsx'
import FaixaAtencao from '../components/pagina/FaixaAtencao.jsx'
import SecaoEscritorio from '../components/pagina/SecaoEscritorio.jsx'
import PainelAgente from '../components/painel/PainelAgente.jsx'
import DrawerCelular from '../components/gavetas/DrawerCelular.jsx'
import DrawerNovaOrdem from '../components/gavetas/DrawerNovaOrdem.jsx'
import DrawerOrdem from '../components/gavetas/DrawerOrdem.jsx'
import DrawerReuniao from '../components/gavetas/DrawerReuniao.jsx'

const TITULO = 'Escritório de agentes'

// Página do escritório: equipe, cena, quem precisa de você, painel do agente e os drawers. Retorna o JSX.
export default function Escritorio({ estado, conexao, assinar, sair }) {
  const [params, alterarUrl] = useParametrosDaUrl()
  const agenteId = params.get('agente')
  const ordemId = params.get('ordem')
  const telaLarga = useTelaLarga()
  // A barra da equipe começa fechada; do lg para cima ela abre ao lado do conteúdo, abaixo disso vira gaveta (menuAberto).
  const [barraAberta, setBarraAberta] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const refAbrirBarra = useRef(null)
  const refFecharBarra = useRef(null)
  const focoDaBarra = useRef(null)
  const [novaOrdem, setNovaOrdem] = useState(null)
  const [celular, setCelular] = useState(false)
  const [reuniaoAberta, setReuniaoAberta] = useState(false)
  const [erroDaReuniao, setErroDaReuniao] = useState(null)
  const [erroDaVida, setErroDaVida] = useState(null)
  const [pedidoDeRolagem, setPedidoDeRolagem] = useState(0)
  const refPainel = useRef(null)
  const voltando = useRef(null)

  const agente = agenteId ? estado.agentes.find((a) => a.id === agenteId) ?? null : null
  const aguardando = estado.agentes.filter((a) => a.estado === 'aguardando')

  useEffect(() => {
    document.title = aguardando.length ? `(${aguardando.length}) ${TITULO}` : TITULO
  }, [aguardando.length])

  useEffect(() => () => {
    document.title = TITULO
  }, [])

  // Baixa o pedaço do markdown cedo, para o primeiro painel ou drawer já abrir formatado.
  useEffect(() => {
    const id = window.setTimeout(() => import('../components/MarkdownRenderizado.jsx'), 1500)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!pedidoDeRolagem) return
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    refPainel.current?.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' })
  }, [pedidoDeRolagem])

  // Quem abre ou fecha a barra some da tela junto com ela: o foco passa para o botão que ficou no mesmo lugar.
  useEffect(() => {
    const alvo = focoDaBarra.current
    focoDaBarra.current = null
    if (alvo === 'fechar') refFecharBarra.current?.focus({ preventScroll: true })
    if (alvo === 'abrir') refAbrirBarra.current?.focus({ preventScroll: true })
  }, [barraAberta])

  const abrirBarra = useCallback(() => {
    if (!window.matchMedia(CONSULTA_TELA_LARGA).matches) {
      setMenuAberto(true)
      return
    }
    focoDaBarra.current = 'fechar'
    setBarraAberta(true)
  }, [])

  const fecharBarra = useCallback(() => {
    focoDaBarra.current = 'abrir'
    setBarraAberta(false)
  }, [])

  useEffect(() => {
    if (!menuAberto) return undefined
    const largo = window.matchMedia(CONSULTA_TELA_LARGA)
    const aoMudar = () => {
      if (largo.matches) setMenuAberto(false)
    }
    largo.addEventListener('change', aoMudar)
    return () => largo.removeEventListener('change', aoMudar)
  }, [menuAberto])

  // O "voltar" fecha a folha de nova ordem e a do celular; depois de um "voltar" nosso, aplica a mudança que esperava por ele.
  useEffect(() => {
    const aoVoltar = () => {
      const aplicar = voltando.current?.aplicar
      voltando.current = null
      if (!window.history.state?.novaOrdem) setNovaOrdem(null)
      if (!window.history.state?.celular) setCelular(false)
      aplicar?.()
    }
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  // Gaveta e folha têm entrada no histórico (o "voltar" do celular as fecha): sair delas tira a entrada antes de mudar a URL.
  const voltarEDepois = useCallback((aplicar) => {
    if (voltando.current && Date.now() < voltando.current.ate) return
    if (!window.history.state?.gaveta && !window.history.state?.novaOrdem && !window.history.state?.celular) {
      voltando.current = null
      aplicar()
      return
    }
    // Um segundo toque antes do popstate daria outro "voltar" e sairia do app.
    voltando.current = { aplicar, ate: Date.now() + 1000 }
    window.history.back()
  }, [])

  const selecionar = useCallback((id) => {
    alterarUrl({ agente: id })
    setMenuAberto(false)
    setPedidoDeRolagem((n) => n + 1)
  }, [alterarUrl])

  const abrirOrdem = useCallback((id) => {
    const jaAberta = new URLSearchParams(window.location.search).has('ordem')
    alterarUrl({ ordem: id }, jaAberta ? {} : { empilhar: true, estado: { gaveta: true } })
  }, [alterarUrl])

  const fecharOrdem = useCallback(() => {
    voltarEDepois(() => alterarUrl({ ordem: null }))
  }, [alterarUrl, voltarEDepois])

  const verAgente = useCallback((id) => {
    voltarEDepois(() => {
      alterarUrl({ ordem: null, agente: id })
      setPedidoDeRolagem((n) => n + 1)
    })
  }, [alterarUrl, voltarEDepois])

  // A folha de continuar fica com a entrada da gaveta no histórico: o "voltar" fecha a folha.
  const continuar = useCallback((ordem) => {
    if (window.history.state?.gaveta) {
      alterarUrl({ ordem: null }, { estado: { novaOrdem: true } })
    } else {
      alterarUrl({ ordem: null })
      alterarUrl({}, { empilhar: true, estado: { novaOrdem: true } })
    }
    setNovaOrdem({ agenteId: ordem.agenteId, continuaDe: ordem })
  }, [alterarUrl])

  const abrirNovaOrdem = useCallback((inicial) => {
    if (!window.history.state?.novaOrdem) alterarUrl({}, { empilhar: true, estado: { novaOrdem: true } })
    setNovaOrdem({ agenteId: inicial?.agenteId ?? agenteId ?? null })
  }, [agenteId, alterarUrl])

  const fecharNovaOrdem = useCallback(() => {
    voltarEDepois(() => setNovaOrdem(null))
  }, [voltarEDepois])

  // Recarregar com uma folha aberta deixaria a marca dela no histórico sem folha nenhuma na tela, e o próximo
  // "fechar" voltaria uma página a mais, desfazendo a escolha do agente. A marca sai na montagem.
  useEffect(() => {
    const estado = window.history.state
    if (!estado?.celular && !estado?.novaOrdem) return
    const { celular: _celular, novaOrdem: _novaOrdem, ...resto } = estado
    window.history.replaceState(Object.keys(resto).length ? resto : null, '')
  }, [])

  // Liga e desliga a vida dos agentes. O estado novo chega de volta pelo evento ao vivo, então aqui só mandamos.
  const alternarVida = useCallback(async (ligada) => {
    setErroDaVida(null)
    try {
      await api.ligarVida(ligada)
    } catch (erro) {
      setErroDaVida(mensagemDoErro(erro, 'Não consegui mudar a vida dos agentes.'))
    }
  }, [])

  // Clicar na mesa abre a reunião no servidor (se ainda não houver uma) e mostra a gaveta dela.
  const abrirReuniao = useCallback(async () => {
    setReuniaoAberta(true)
    setErroDaReuniao(null)
    try {
      await api.abrirReuniao()
    } catch (erro) {
      setErroDaReuniao(mensagemDoErro(erro, 'Não foi possível abrir a sala de reunião.'))
    }
  }, [])

  // Chamar e dispensar pelos bonecos da cena. O estado novo chega de volta pelo evento ao vivo, então aqui só mandamos.
  const convocar = useCallback(async (agenteId) => {
    setErroDaReuniao(null)
    try {
      await api.convocar(agenteId)
    } catch (erro) {
      setErroDaReuniao(mensagemDoErro(erro, 'Não foi possível chamar esse agente.'))
    }
  }, [])

  const dispensar = useCallback(async (agenteId) => {
    setErroDaReuniao(null)
    try {
      await api.dispensarDaReuniao(agenteId)
    } catch (erro) {
      setErroDaReuniao(mensagemDoErro(erro, 'Não foi possível dispensar esse agente.'))
    }
  }, [])

  const abrirCelular = useCallback(() => {
    if (!window.history.state?.celular) alterarUrl({}, { empilhar: true, estado: { celular: true } })
    setCelular(true)
  }, [alterarUrl])

  const fecharCelular = useCallback(() => {
    voltarEDepois(() => setCelular(false))
  }, [voltarEDepois])

  const aoCriarOrdem = useCallback((ordem) => {
    voltarEDepois(() => {
      setNovaOrdem(null)
      selecionar(ordem.agenteId)
    })
  }, [selecionar, voltarEDepois])

  return (
    <div className="flex h-full bg-fundo">
      <BarraLateral
        estado={estado}
        selecionadoId={agente?.id ?? null}
        onSelecionar={selecionar}
        onSair={sair}
        barraAberta={barraAberta}
        onFecharBarra={fecharBarra}
        refFecharBarra={refFecharBarra}
        menuAberto={menuAberto}
        onFecharMenu={() => setMenuAberto(false)}
      />

      <main className="flex-1 min-w-0 h-full overflow-auto">
        <Cabecalho
          conexao={conexao}
          alerta={aguardando.length > 0}
          telaLarga={telaLarga}
          barraAberta={barraAberta}
          menuAberto={menuAberto}
          refAbrirBarra={refAbrirBarra}
          vida={estado.vida}
          onAlternarVida={alternarVida}
          onAbrirVida={() => setCelular(false)}
          onAbrirBarra={abrirBarra}
          onCelular={abrirCelular}
          onNovaOrdem={() => abrirNovaOrdem()}
        />

        <div className="flex flex-col gap-5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-5 sm:pt-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))] leading-[normal]">
          <Avisos servidor={estado.servidor} conta={estado.conta} />

          {aguardando.length > 0 && (
            <FaixaAtencao agentes={aguardando} selecionadoId={agente?.id ?? null} onSelecionar={selecionar} />
          )}

          <SecaoEscritorio
            agentes={estado.agentes}
            selecionadoId={agente?.id ?? null}
            onSelecionar={selecionar}
            assinar={assinar}
            vida={estado.vida}
            reuniao={estado.reuniao}
            modoReuniao={reuniaoAberta}
            onMesaDeReuniao={abrirReuniao}
            onConvocar={convocar}
            onDispensar={dispensar}
          />

          {agenteId && !agente && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-linha bg-superficie">
              <SearchX className="w-4 h-4 shrink-0 text-neutral-500" aria-hidden="true" />
              <span className="text-[12.5px] text-neutral-400">
                Esse agente não está mais no escritório. Escolha alguém na cena ou na equipe.
              </span>
            </div>
          )}

          {agente ? (
            <div ref={refPainel} className="scroll-mt-20">
              <LimiteDeErro
                key={agente.id}
                alternativa={({ tentarDeNovo }) => (
                  <div role="alert" className={CLASSE_ERRO}>
                    <span className="text-[12.5px] font-medium" style={{ color: COR.vermelho }}>
                      Não foi possível mostrar o painel de {agente.apelido}.
                    </span>
                    <button
                      type="button"
                      onClick={tentarDeNovo}
                      className={BOTAO_PEQUENO}
                    >
                      Tentar de novo
                    </button>
                  </div>
                )}
              >
                <PainelAgente agente={agente} assinar={assinar} onNovaOrdem={abrirNovaOrdem} onAbrirOrdem={abrirOrdem} />
              </LimiteDeErro>
            </div>
          ) : (
            !agenteId && (
              <p className="m-0 text-[12.5px] text-neutral-500">
                Clique num agente no escritório para ver a tarefa, o projeto e o que ele está fazendo.
              </p>
            )
          )}
        </div>
      </main>

      {ordemId && (
        <DrawerOrdem
          ordemId={ordemId}
          assinar={assinar}
          onFechar={fecharOrdem}
          onAbrirOrdem={abrirOrdem}
          onContinuar={continuar}
          onVerAgente={verAgente}
        />
      )}

      {celular && <DrawerCelular onFechar={fecharCelular} />}

      {reuniaoAberta && (
        <DrawerReuniao
          reuniao={estado.reuniao}
          agentes={estado.agentes}
          erro={erroDaReuniao}
          onErro={setErroDaReuniao}
          onFechar={() => setReuniaoAberta(false)}
        />
      )}

      {novaOrdem && (
        <DrawerNovaOrdem
          estado={estado}
          inicial={novaOrdem}
          onFechar={fecharNovaOrdem}
          onCriada={aoCriarOrdem}
        />
      )}
    </div>
  )
}
