import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Coffee, FolderOpen, Gamepad2, Presentation, Sofa, Tv, UserMinus, UserPlus } from 'lucide-react'
import { ESTADOS_AGENTE } from '../../constants/estados.js'
import { COLUNAS, MESAS_MINIMAS, REUNIAO_X, dimensoesDoEscritorio, divisoria, montarMesa } from './arteEscritorio.js'
import { ancorasDaVaga, montarLazer } from './arteLazer.js'
import { CADEIRAS_DA_CONVOCACAO, TAMPO_DA_REUNIAO, ancorasDaReuniao, montarReuniao } from './arteReuniao.js'
import { estadoDaCaminhada, inicioDoLazer, planejarCaminhada, postoDoAgente } from './caminhos.js'
import {
  ROTULOS, arteFixa, chaveDoLugar, chipAgora, larguraMaximaDoCracha, lugarDoAgente, origemDaReuniaoJunto,
  origemDoLazerJunto, palcoDaSala, planejarCena,
} from './disposicao.js'
import { P3 } from './iso.js'
import { useLarguraDoElemento } from './palco.js'
import BalaoFala from './BalaoFala.jsx'
import useFalas from '../../hooks/useFalas.js'
import { CINZA, aparenciaDoAgente, bonecoAndando } from './pessoas.js'
import { caixa, caixaNaTela, deslocarCaixa, encaixarAndantes } from './profundidade.js'
import './escritorio.css'

const TINTA = '#0b0b0c'
const SEM_AGENTES = []
// Crachá de quem anda: desliza até o boneco no começo da caminhada e até o lugar novo na chegada (o CSS leva 0,55 s).
const DESLIZE_NA_SAIDA = 320
const DESLIZE_NA_CHEGADA = 700
// Altura da cabeça de quem anda e meia largura do corpo, em unidades do mundo; e quanto o desenho ocupa do chão
// em volta dos pés ([x, y], o máximo entre os quadros do passo), andando na direção de x ou na de y.
const ALTURA_ANDANTE = 44
const MEIO_ANDANTE = 9
const CORPO_DE_LADO = [6, 7.7]
const CORPO_DE_FRENTE = [7.2, 6.5]
const ATIVIDADES = {
  tv: { Icone: Tv, texto: 'na área de lazer assistindo TV' },
  jogo: { Icone: Gamepad2, texto: 'na área de lazer jogando videogame' },
  cafe: { Icone: Coffee, texto: 'na área de lazer tomando um café' },
  reuniao: { Icone: Presentation, texto: 'na sala de reunião' },
}
// Para onde quem anda está indo, pela zona de destino.
const INDO_PARA = { lazer: 'indo para a área de lazer', reuniao: 'indo para a sala de reunião', mesa: 'indo para a mesa' }
// Título de cada sala da frente na cena empilhada (no modo junto as salas aparecem lado a lado, sem legenda) e como
// cada uma conta quem está nela.
const LEGENDAS = {
  lazer: { Icone: Sofa, titulo: 'Área de lazer', contar: (n) => (n === 1 ? '1 agente livre' : `${n} agentes livres`) },
  reuniao: { Icone: Presentation, titulo: 'Sala de reunião', contar: (n) => (n === 1 ? '1 agente na reunião' : `${n} agentes na reunião`) },
}
const CONSULTA_SEM_MOVIMENTO = '(prefers-reduced-motion: reduce)'
const DESTAQUE_ANDANTE = {
  pontos: [P3([0, 0], -9, -9, 0.3), P3([0, 0], 9, -9, 0.3), P3([0, 0], 9, 9, 0.3), P3([0, 0], -9, 9, 0.3)].join(' '),
  cor: 'rgba(96,165,250,.16)',
  contorno: '#60a5fa',
  espessura: '1.4',
}

function tempoNoEstado(desde, agora) {
  const inicio = desde ? Date.parse(desde) : NaN
  if (Number.isNaN(inicio)) return null
  const minutos = Math.max(0, Math.floor((agora - inicio) / 60000))
  if (minutos < 1) return { curto: 'agora', longo: 'agora' }
  if (minutos < 60) return { curto: `${minutos}m`, longo: `há ${minutos} min` }
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return { curto: `${horas}h`, longo: `há ${horas} h` }
  const dias = Math.floor(horas / 24)
  return { curto: `${dias}d`, longo: `há ${dias} ${dias === 1 ? 'dia' : 'dias'}` }
}

function rotuloDoAgente(agente, estado, tempo, atividade, andando, zona) {
  const situacao = estado.rotulo.charAt(0).toLowerCase() + estado.rotulo.slice(1)
  const partes = [agente.apelido, tempo ? `${situacao} ${tempo.longo}` : situacao]
  // Convocado para a reunião, é isso que ele está fazendo: nem a vida nem a mesa importam.
  if (zona === 'reuniao') {
    partes[1] += `, ${ATIVIDADES.reuniao.texto}`
    if (andando) partes.push(INDO_PARA.reuniao)
    return partes.join(', ')
  }
  // Com a vida ligada, o que ele está fazendo vem escrito do servidor (e um verbo novo aparece sem mexer aqui).
  if (agente.vida?.rotulo) {
    partes.push(agente.vida.rotulo)
    return partes.join(', ')
  }
  if (andando) partes.push(agente.estado === 'livre' ? INDO_PARA.lazer : INDO_PARA.mesa)
  if (atividade) {
    partes[1] += `, ${ATIVIDADES[atividade].texto}`
    return partes.join(', ')
  }
  if (agente.estado === 'na_fila' && agente.fila > 0) partes.push(`${agente.fila} ${agente.fila === 1 ? 'ordem' : 'ordens'} na fila`)
  if (agente.ordemAtual?.projetoNome) partes.push(`projeto ${agente.ordemAtual.projetoNome}`)
  if (agente.ordemAtual?.atividade) partes.push(agente.ordemAtual.atividade)
  return partes.join(', ')
}

function useAgora(intervalo) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), intervalo)
    return () => clearInterval(id)
  }, [intervalo])
  return agora
}

// Só anuncia quem acabou de entrar em "aguardando" ou "erro"; a primeira leitura da lista não fala nada.
function useAnuncio(agentes) {
  const anteriores = useRef(null)
  const [anuncio, setAnuncio] = useState({ id: 0, texto: '' })
  useEffect(() => {
    const antes = anteriores.current
    anteriores.current = new Map(agentes.map((a) => [a.id, a.estado]))
    if (!antes) return
    const frases = []
    for (const agente of agentes) {
      const anterior = antes.get(agente.id)
      if (anterior === undefined || anterior === agente.estado) continue
      if (agente.estado === 'aguardando') frases.push(`${agente.apelido} precisa de você.`)
      if (agente.estado === 'erro') frases.push(`${agente.apelido} terminou com erro.`)
    }
    if (frases.length) setAnuncio((atual) => ({ id: atual.id + 1, texto: frases.join(' ') }))
  }, [agentes])
  return anuncio
}

// false quando o sistema pede menos movimento: aí ninguém anda, cada um aparece direto no lugar novo.
function useComMovimento() {
  const [com, setCom] = useState(() => typeof window === 'undefined' || !window.matchMedia?.(CONSULTA_SEM_MOVIMENTO).matches)
  useEffect(() => {
    const consulta = window.matchMedia?.(CONSULTA_SEM_MOVIMENTO)
    if (!consulta) return undefined
    const mudar = () => setCom(!consulta.matches)
    consulta.addEventListener('change', mudar)
    return () => consulta.removeEventListener('change', mudar)
  }, [])
  return com
}

// Chão ocupado por quem está parado em pé (fora quem vai andar), para a caminhada nova contornar. Retorna os retângulos.
function parados(agentes, quemAnda) {
  const lista = []
  for (const [id, info] of agentes) if (id !== quemAnda && !info.caminhada && info.posto.pegada) lista.push(info.posto.pegada)
  return lista
}

// Caminhadas em curso. Quando um agente muda de lugar (mesa <-> lazer, sentar <-> levantar), ele vai andando até lá;
// quem muda de ideia no meio do caminho dá meia-volta de onde está. Na 1ª renderização, quando chega alguém novo ou
// muda a quantidade de fileiras, cada um já aparece no seu lugar. Retorna Map(id -> { posto, caminhada, chegada }).
function useCaminhadas(lista, fileiras, instante, comMovimento) {
  const ref = useRef(null)
  if (ref.current === null || ref.current.fileiras !== fileiras) ref.current = { fileiras, agentes: new Map() }
  const { agentes } = ref.current
  const presentes = new Set()
  lista.forEach((agente, i) => {
    presentes.add(agente.id)
    const posto = postoDoAgente(fileiras, i, agente, chaveDoLugar(agente))
    const atual = agentes.get(agente.id)
    if (!atual) {
      agentes.set(agente.id, { posto, caminhada: null, chegada: -Infinity })
      return
    }
    if (atual.caminhada && instante >= atual.caminhada.fim) atual.caminhada = null
    if (atual.posto.chave === posto.chave) return
    const de = atual.caminhada ? { caminhada: atual.caminhada } : { posto: atual.posto }
    atual.caminhada = comMovimento ? planejarCaminhada(fileiras, de, posto, instante, parados(agentes, agente.id)) : null
    atual.chegada = atual.caminhada ? atual.caminhada.chegada : -Infinity
    atual.posto = posto
  })
  for (const id of [...agentes.keys()]) if (!presentes.has(id)) agentes.delete(id)
  return agentes
}

// Enquanto alguém anda, pede um desenho novo a cada quadro da tela.
function useQuadros(ativo) {
  const [, redesenhar] = useState(0)
  useEffect(() => {
    if (!ativo) return undefined
    let pedido = requestAnimationFrame(function quadro() {
      redesenhar((n) => n + 1)
      pedido = requestAnimationFrame(quadro)
    })
    return () => cancelAnimationFrame(pedido)
  }, [ativo])
}

function poligono(p, chave) {
  return (
    <polygon
      key={chave}
      points={p.pontos}
      fill={p.cor}
      fillOpacity={p.opacidade}
      stroke={p.contorno}
      strokeWidth={p.espessura}
      strokeLinejoin={p.contorno ? 'round' : undefined}
      style={p.animacao ? { animation: `${p.animacao} ${p.atraso}`, transformBox: 'fill-box', transformOrigin: 'center' } : undefined}
    />
  )
}

// Desenho de quem anda, por aparência, direção e quadro do passo, montado uma vez só (fica guardado).
const DESENHOS_ANDANDO = new Map()
function desenhoAndando(agente, direcao, quadro) {
  const cinza = agente.estado === 'interrompida'
  const chave = `${agente.id}|${agente.cor ?? ''}|${cinza ? 1 : 0}|${direcao}|${quadro}`
  let desenho = DESENHOS_ANDANDO.get(chave)
  if (!desenho) {
    if (DESENHOS_ANDANDO.size > 800) DESENHOS_ANDANDO.clear()
    const aparencia = aparenciaDoAgente(agente)
    const a = cinza ? { ...aparencia, ...CINZA } : aparencia
    desenho = <g>{bonecoAndando([0, 0], 0, 0, a, direcao, quadro).map((p, i) => poligono(p, i))}</g>
    DESENHOS_ANDANDO.set(chave, desenho)
  }
  return desenho
}

function Andante({ andante, selecionado }) {
  const { sx, sy, opacidade } = andante
  return (
    <g transform={`translate(${sx.toFixed(2)} ${sy.toFixed(2)})`} opacity={opacidade < 0.999 ? opacidade.toFixed(3) : undefined}>
      {selecionado && poligono(DESTAQUE_ANDANTE, 'destaque')}
      {desenhoAndando(andante.agente, andante.direcao, andante.quadro)}
    </g>
  )
}

// Peça fixa da cena (móvel, pessoa parada ou trecho de parede), com a animação de quem levanta ou senta.
function elementoDaPeca(peca) {
  const estilo = peca.desliza ? { '--esc-dx': `${peca.desliza[0].toFixed(1)}px`, '--esc-dy': `${peca.desliza[1].toFixed(1)}px` } : undefined
  return (
    <g key={`p-${peca.chave}`} className={peca.classe} style={estilo}>
      {peca.poligonos.map((p, i) => poligono(p, i))}
    </g>
  )
}

function MarcadorDeAtencao({ id, ponto, cor, onClick }) {
  return (
    <span
      aria-hidden="true"
      data-agente={id}
      onClick={onClick}
      className="esc-flutuar absolute z-30 -translate-x-1/2 grid place-items-center w-[26px] h-[26px] rounded-full text-[17px] leading-none font-black cursor-pointer shadow-[0_0_0_2px_#0b0b0c,0_6px_14px_rgba(0,0,0,.45)]"
      style={{ left: ponto.x, top: ponto.y - ROTULOS.marcador, background: cor, color: TINTA }}
    >
      <span className="esc-halo absolute -inset-[2px] rounded-full border-2" style={{ borderColor: cor }} />
      !
      <span className="absolute left-1/2 -bottom-[5px] w-2 h-2 -translate-x-1/2 rotate-45" style={{ background: cor }} />
    </span>
  )
}

function BalaoDoAgente({ agente, ponto, onSelecionar }) {
  const estado = ESTADOS_AGENTE[agente.estado] ?? ESTADOS_AGENTE.livre
  const selecionar = () => onSelecionar?.(agente.id)
  if (agente.estado === 'aguardando') return <MarcadorDeAtencao id={agente.id} ponto={ponto} cor={estado.cor} onClick={selecionar} />
  const desligado = agente.estado === 'interrompida'
  const fundo = desligado ? '#27272a' : estado.cor
  const { Icone } = estado
  return (
    <span
      aria-hidden="true"
      data-agente={agente.id}
      onClick={selecionar}
      className={`absolute ${estado.urgente ? 'z-30' : 'z-10'} -translate-x-1/2 inline-flex items-center gap-1 h-[18px] px-2 rounded-full text-[11px] font-extrabold leading-none tabular-nums cursor-pointer shadow-[0_6px_14px_rgba(0,0,0,.45)] ${desligado ? 'border border-dashed border-white/[.28] text-[#a1a1aa]' : ''}`}
      style={{ left: ponto.x, top: ponto.y - ROTULOS.balao, background: fundo, color: desligado ? undefined : TINTA }}
    >
      {agente.estado === 'trabalhando' ? (
        <span className="esc-pontos inline-flex items-center gap-[3px]">
          <span />
          <span />
          <span />
        </span>
      ) : (
        <Icone className="w-3 h-3" strokeWidth={2.6} />
      )}
      {agente.estado === 'na_fila' && agente.fila > 0 && agente.fila}
      <span className="absolute left-1/2 -bottom-[4px] w-2 h-2 -translate-x-1/2 rotate-45" style={{ background: fundo }} />
    </span>
  )
}

// Quem está andando leva só o nome (sem o tempo no estado), para os crachás de quem anda junto não se amontoarem.
// Durante o deslize a transição é só a do esc-deslizar: com o transition-colors junto, a do Tailwind (que vem depois na folha) ganharia.
function CrachaDoAgente({ agente, posicao, atividade, zona, andando, larguraMaxima, selecionado, deslizando, agora, onSelecionar }) {
  const estado = ESTADOS_AGENTE[agente.estado] ?? ESTADOS_AGENTE.livre
  const tempo = andando ? null : tempoNoEstado(agente.desde, agora)
  const { urgente } = estado
  const Atividade = atividade ? ATIVIDADES[atividade].Icone : null
  const cores = selecionado
    ? 'bg-kalfe-orange border-kalfe-orange text-[#0b0b0c]'
    : 'bg-[#18181b]/90 border-white/15 text-[#e4e4e7] hover:border-kalfe-orange/70'
  return (
    <button
      type="button"
      data-agente={agente.id}
      data-zona={andando ? 'andando' : zona}
      onClick={() => onSelecionar?.(agente.id)}
      aria-current={selecionado ? 'true' : undefined}
      aria-label={rotuloDoAgente(agente, estado, tempo, atividade, andando, zona)}
      title={atividade ? `${agente.apelido} está ${ATIVIDADES[atividade].texto}` : agente.ordemAtual?.atividade || agente.apelido}
      className={`absolute ${selecionado ? 'z-[24]' : andando ? 'z-[22]' : 'z-20'} hover:z-[25] focus-visible:z-[25] ${posicao.centralizado ? '-translate-x-1/2' : ''} ${deslizando ? 'esc-deslizar' : 'transition-colors'} inline-flex items-center gap-1.5 h-6 pl-2 ${tempo ? 'pr-1' : 'pr-2.5'} rounded-full border text-[11px] font-bold leading-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kalfe-orange/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#18181a] ${cores}`}
      style={{ left: posicao.x, top: posicao.y, maxWidth: larguraMaxima, borderColor: urgente ? estado.cor : undefined }}
    >
      {urgente && (
        <span aria-hidden="true" className="grid place-items-center w-3.5 h-3.5 shrink-0 -ml-0.5 rounded-full text-[10px] font-black" style={{ background: estado.cor, color: TINTA }}>
          !
        </span>
      )}
      {Atividade && <Atividade aria-hidden="true" className={`w-3 h-3 shrink-0 ${selecionado ? '' : 'text-[#a1a1aa]'}`} strokeWidth={2.4} />}
      <span className="truncate">{agente.apelido}</span>
      {tempo && (
        <span className={`shrink-0 px-1.5 py-[3px] rounded-full text-[9.5px] font-extrabold tabular-nums ${selecionado ? 'bg-black/15' : 'bg-white/10 text-[#a1a1aa]'}`}>
          {tempo.curto}
        </span>
      )}
    </button>
  )
}

function ProjetoDoAgente({ id, nome, posicao }) {
  return (
    <span
      aria-hidden="true"
      data-agente={id}
      className={`absolute z-[5] ${posicao.centralizado ? '-translate-x-1/2' : ''} inline-flex items-center gap-1 max-w-[140px] text-[10px] font-semibold leading-3 text-[#a1a1aa] pointer-events-none [text-shadow:0_1px_2px_rgba(0,0,0,.9)]`}
      style={{ left: posicao.x, top: posicao.y }}
    >
      <FolderOpen className="w-2.5 h-2.5 shrink-0" strokeWidth={2.4} />
      <span className="truncate">{nome}</span>
    </span>
  )
}

// Alvo de chamar (ou de dispensar) alguém da reunião: só aparece com o modo reunião aberto, em cima do corpo de quem
// pode entrar na mesa ou já está nela.
function AlvoDaReuniao({ agente, ponto, dentro, onAcao }) {
  const Icone = dentro ? UserMinus : UserPlus
  const rotulo = dentro ? `Dispensar ${agente.apelido} da reunião` : `Chamar ${agente.apelido} para a reunião`
  return (
    <button
      type="button"
      data-reuniao={agente.id}
      onClick={() => onAcao(agente.id)}
      aria-label={rotulo}
      title={rotulo}
      className={`absolute z-[27] grid place-items-center w-[26px] h-[26px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 cursor-pointer shadow-[0_6px_14px_rgba(0,0,0,.5)] transition-colors ${
        dentro
          ? 'bg-[#18181b]/95 border-white/30 text-[#e4e4e7] hover:bg-[#27272a] hover:border-white/60'
          : 'bg-kalfe-orange border-kalfe-orange text-[#0b0b0c] hover:brightness-110'
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70`}
      style={{ left: ponto.x, top: ponto.y }}
    >
      <Icone className="w-3.5 h-3.5" strokeWidth={2.8} aria-hidden="true" />
    </button>
  )
}

const limitar = (valor) => Math.min(1, Math.max(0, valor))
const naTelaDoMundo = ([x, y]) => [(x - y) * 0.866, (x + y) * 0.5]
// Estados em que o agente está com uma ordem do humano: nessa hora ele não entra na reunião (a sessão dele é de verdade).
const COM_ORDEM = ['na_fila', 'trabalhando', 'aguardando']

// Escritório isométrico com 8+ mesas e, na frente dele, a área de lazer e a sala de reunião: quem está livre vai para
// o sofá/videogame, quem tem ordem fica na própria mesa, quem o humano convocou senta numa cadeira da reunião, e a
// troca de lugar é andando pelos corredores e pelas duas portas da mureta.
// Clicar na mesa de reunião chama onMesaDeReuniao; com modoReuniao ligado, cada agente livre ganha um alvo de chamar
// (onConvocar) e cada um que já está sentado, um de dispensar (onDispensar).
export default function CenaEscritorio({
  agentes, selecionadoId, onSelecionar, assinar, modoReuniao = false, onMesaDeReuniao, onConvocar, onDispensar,
}) {
  const lista = agentes ?? SEM_AGENTES
  const refPalco = useRef(null)
  const larguraDisponivel = useLarguraDoElemento(refPalco, 0)
  const agora = useAgora(30000)
  const anuncio = useAnuncio(lista)
  const idsPresentes = useMemo(() => new Set(lista.map((agente) => agente.id)), [lista])
  const falas = useFalas(assinar, idsPresentes)
  const comMovimento = useComMovimento()

  // O lugar e o rótulo da vida entram na chave: sem isso a cena guardaria o plano antigo e o crachá ficaria no lugar errado.
  const chavePlano = `${larguraDisponivel}|${lista.map((a) => `${a.id}\t${a.apelido}\t${a.estado}\t${a.ordemAtual?.projetoNome ?? ''}\t${chipAgora(a, agora)}\t${a.vida?.vagaId ?? ''}\t${a.vida?.rotulo ?? ''}\t${a.reuniao?.vagaId ?? ''}`).join('\n')}`
  const plano = useMemo(() => planejarCena(lista, larguraDisponivel, agora), [chavePlano])
  const { modo, fileiras, palcos } = plano
  const totalMesas = Math.max(MESAS_MINIMAS, fileiras * COLUNAS)

  const instante = performance.now()
  const caminhadas = useCaminhadas(lista, fileiras, instante, comMovimento)
  useQuadros([...caminhadas.values()].some((c) => c.caminhada))

  const chaveFixa = `${modo}|${fileiras}`
  const fixos = useMemo(
    () => new Map(palcos.map((p) => [p.chave, <g key="fixo">{arteFixa(p.chave, fileiras, p.origem).map((q, i) => poligono(q, i))}</g>])),
    [chaveFixa],
  )

  const palcoMesas = palcos[0]
  const palcoLazer = palcoDaSala(palcos, 'lazer')
  const palcoReuniao = palcoDaSala(palcos, 'reuniao')
  const origemLazer = modo === 'junto' ? origemDoLazerJunto(palcoLazer.origem, fileiras) : palcoLazer.origem
  const origemReuniao = modo === 'junto' ? origemDaReuniaoJunto(palcoReuniao.origem, fileiras) : palcoReuniao.origem
  const { profundidade } = dimensoesDoEscritorio(fileiras)
  const comecoDoLazer = inicioDoLazer(fileiras)

  // Quem está parado em cada lugar (ou levantando dele, ou sentando nele) e quem está andando agora.
  const ocupacaoMesas = new Map()
  const ocupacaoLazer = new Map()
  const ocupacaoReuniao = new Map()
  const cadeirasAfastadas = new Set()
  const andantes = []
  const colocar = (posto, ocupante) => {
    const desliza = naTelaDoMundo(posto.desliza)
    if (posto.mesa !== undefined) ocupacaoMesas.set(posto.mesa, { ...ocupante, pose: posto.pose, desliza })
    else if (posto.cadeiraDaReuniao !== undefined) ocupacaoReuniao.set(posto.cadeiraDaReuniao, { ...ocupante, desliza })
    else ocupacaoLazer.set(posto.vagaDoLazer, { ...ocupante, desliza })
  }
  lista.forEach((agente, i) => {
    const info = caminhadas.get(agente.id)
    if (!info) return
    const c = info.caminhada
    if (!c) {
      colocar(info.posto, { agente })
      return
    }
    const e = estadoDaCaminhada(c, instante)
    if (e.fase === 'levantando' && c.de) colocar(c.de, { agente, classe: 'esc-levantar' })
    if (e.fase === 'sentando' || e.fase === 'fim') colocar(c.para, { agente, classe: e.fase === 'sentando' ? 'esc-sentar' : undefined })
    // Trocando de pose na própria mesa (levantou para pedir algo, voltou a sentar), a mesa continua acesa, só sem ninguém.
    if (c.para.mesa !== undefined && c.mesaDeOrigem === c.para.mesa && !ocupacaoMesas.has(c.para.mesa)) {
      ocupacaoMesas.set(c.para.mesa, { agente, pose: null })
    }
    if (e.vaga) cadeirasAfastadas.add(e.vaga)
    if (e.fase !== 'fim') andantes.push({ agente, indice: i, ...e })
  })

  const chaveMesas = `${chaveFixa}|${Array.from({ length: totalMesas }, (_, i) => {
    const o = ocupacaoMesas.get(i)
    if (o) return `${o.agente.id}:${o.agente.estado}:${o.agente.cor}:${o.pose}:${o.classe ?? ''}`
    return cadeirasAfastadas.has(`mesa-${i}`) ? 'afastada' : '-'
  }).join('|')}`
  const mesas = useMemo(
    () => Array.from({ length: totalMesas }, (_, i) => montarMesa(palcoMesas.origem, i, ocupacaoMesas.get(i) ?? null, cadeirasAfastadas.has(`mesa-${i}`))),
    [chaveMesas],
  )
  const chaveLazer = `${chaveFixa}|${[...ocupacaoLazer].map(([v, o]) => `${v}:${o.agente.id}:${o.agente.cor}:${o.classe ?? ''}`).join('|')}`
  const lazer = useMemo(() => montarLazer(origemLazer, ocupacaoLazer), [chaveLazer])
  const afastadasDaReuniao = new Set(
    CADEIRAS_DA_CONVOCACAO.filter((c) => cadeirasAfastadas.has(`cadeira-reuniao-${c}`) && !ocupacaoReuniao.has(c)),
  )
  const chaveReuniao = `${chaveFixa}|${[...ocupacaoReuniao].map(([c, o]) => `${c}:${o.agente.id}:${o.agente.cor}:${o.classe ?? ''}`).join('|')}|${[...afastadasDaReuniao].join(',')}`
  const reuniao = useMemo(
    () => montarReuniao(origemReuniao, modo === 'junto' ? 'junto' : 'separado', ocupacaoReuniao, afastadasDaReuniao),
    [chaveReuniao],
  )

  // Peças fixas de cada palco na ordem do pintor, com a caixa no mundo e o retângulo na tela (para encaixar quem anda).
  const pecasPorPalco = useMemo(() => {
    const preparar = (pecas, o, dy = 0, dx = 0) => pecas.map((p) => {
      const c = p.caixa ? deslocarCaixa(p.caixa, dx, dy) : null
      return { chave: p.chave, caixa: c, tela: c ? caixaNaTela(o, c) : null, assento: p.assento, elemento: elementoDaPeca(p) }
    })
    const doEscritorio = (o) => preparar(mesas.flatMap((m) => m.pecas).concat(divisoria(o, fileiras)), o)
    return new Map(palcos.map((p) => {
      if (p.chave === 'junto') {
        // Ordem do pintor das três salas: escritório (mesas e mureta), depois o lazer e, mais à direita, a reunião.
        return [p.chave, doEscritorio(p.origem).concat(
          preparar(lazer.camadas, p.origem, comecoDoLazer),
          preparar(reuniao.camadas, p.origem, comecoDoLazer, REUNIAO_X),
        )]
      }
      if (p.chave === 'escritorio') return [p.chave, doEscritorio(p.origem)]
      if (p.chave === 'reuniao') return [p.chave, preparar(reuniao.camadas, p.origem)]
      return [p.chave, preparar(lazer.camadas, p.origem)]
    }))
  }, [mesas, lazer, reuniao])

  // Cada andante no palco em que está agora: no empilhado, quem passa pela porta some do escritório e aparece no lazer.
  const andantesPorPalco = new Map(palcos.map((p) => [p.chave, []]))
  const andantePorId = new Map()
  for (const w of andantes) {
    const [xMundo, yMundo] = w.ponto
    let chave = 'junto'
    let x = xMundo
    let y = yMundo
    let opacidade = 1
    if (modo !== 'junto') {
      if (yMundo < profundidade + 2.5) {
        chave = 'escritorio'
        opacidade = limitar((profundidade + 2.5 - yMundo) / 10)
      } else {
        // Na faixa da frente, a metade esquerda é o lazer e a direita é a sala de reunião: cada uma tem o palco dela.
        chave = xMundo >= REUNIAO_X ? 'reuniao' : 'lazer'
        if (chave === 'reuniao') x = xMundo - REUNIAO_X
        y = yMundo - comecoDoLazer
        opacidade = limitar((y + 2.5) / 10)
      }
    }
    if (w.fase === 'levantando') opacidade *= limitar(w.progresso)
    if (w.fase === 'sentando') opacidade *= 1 - limitar(w.progresso)
    const palco = palcos.find((p) => p.chave === chave)
    const [dx, dy] = naTelaDoMundo([x, y])
    const [lx, ly] = w.direcao === '+x' || w.direcao === '-x' ? CORPO_DE_LADO : CORPO_DE_FRENTE
    const item = {
      ...w,
      sx: palco.origem[0] + dx,
      sy: palco.origem[1] + dy,
      opacidade,
      caixa: caixa(x - 3, y - 3, 0, x + 3, y + 3, ALTURA_ANDANTE),
      tela: caixaNaTela(palco.origem, caixa(x - lx, y - ly, 0, x + lx, y + ly, ALTURA_ANDANTE + 1)),
    }
    andantesPorPalco.get(chave).push(item)
    const s = palco.escala
    const pes = { x: palco.x + item.sx * s, y: palco.y + item.sy * s }
    andantePorId.set(w.agente.id, { ...item, s, pes, cabeca: { x: pes.x, y: pes.y - ALTURA_ANDANTE * s } })
  }

  const indiceSelecionado = lista.findIndex((a) => a.id === selecionadoId)
  const selecionado = indiceSelecionado >= 0 ? lista[indiceSelecionado] : null
  const andandoSelecionado = selecionado ? andantePorId.get(selecionado.id) : null
  // O destaque vai no lugar onde o agente está (a vaga que o servidor mandou, ou a posição dele na lista), nunca no
  // índice dele: com o modo Vida ligado os dois deixam de ser a mesma coisa.
  const lugarSelecionado = selecionado && (!andandoSelecionado || andandoSelecionado.fase === 'sentando') ? lugarDoAgente(selecionado, indiceSelecionado, fileiras) : null
  const destaqueMesa = lugarSelecionado?.zona === 'mesa' ? mesas[lugarSelecionado.mesa]?.destaque : null
  const destaqueLazer = lugarSelecionado?.zona === 'lazer' ? ancorasDaVaga(origemLazer, lugarSelecionado.vaga).destaque : null
  const destaqueReuniao = lugarSelecionado?.zona === 'reuniao' ? ancorasDaReuniao(origemReuniao, lugarSelecionado.vaga).destaque : null

  const conteudo = (palco) => {
    const filhos = [fixos.get(palco.chave)]
    if (palco.chave !== 'lazer' && palco.chave !== 'reuniao' && destaqueMesa) filhos.push(poligono(destaqueMesa, 'destaque-mesa'))
    if ((palco.chave === 'junto' || palco.chave === 'lazer') && destaqueLazer) filhos.push(poligono(destaqueLazer, 'destaque-lazer'))
    if ((palco.chave === 'junto' || palco.chave === 'reuniao') && destaqueReuniao) filhos.push(poligono(destaqueReuniao, 'destaque-reuniao'))
    const pecas = pecasPorPalco.get(palco.chave)
    const doPalco = andantesPorPalco.get(palco.chave)
    const posicoes = encaixarAndantes(pecas, doPalco)
    const porPosicao = new Map()
    doPalco
      .map((andante, k) => ({ andante, posicao: posicoes[k] }))
      .sort((a, b) => a.posicao - b.posicao || a.andante.caixa.x1 + a.andante.caixa.y1 - (b.andante.caixa.x1 + b.andante.caixa.y1))
      .forEach(({ andante, posicao }) => porPosicao.set(posicao, (porPosicao.get(posicao) ?? []).concat(andante)))
    // Quem anda vai num grupo próprio entre as peças: assim as peças nunca trocam de lugar no SVG (mover um nó recomeça
    // as animações dele, como a TV e as telas das mesas).
    for (let j = 0; j <= pecas.length; j++) {
      const aqui = porPosicao.get(j)
      if (aqui) {
        filhos.push(
          <g key={`entre-${j}`}>
            {aqui.map((andante) => <Andante key={`andante-${andante.agente.id}`} andante={andante} selecionado={andante.agente.id === selecionadoId} />)}
          </g>,
        )
      }
      if (j < pecas.length) filhos.push(pecas[j].elemento)
    }
    return filhos
  }

  const { larguraInterna, altura, rola } = plano
  const primeiroUrgente = plano.agentes.find((g) => g.zona === 'mesa' && g.agente.estado === 'aguardando')
  const focoDaRolagem = primeiroUrgente ? primeiroUrgente.bolha.x : null
  const rolagemPosicionada = useRef(false)
  useLayoutEffect(() => {
    const palco = refPalco.current
    if (!palco || !rola) {
      rolagemPosicionada.current = false
      return
    }
    if (rolagemPosicionada.current) return
    rolagemPosicionada.current = true
    palco.scrollLeft = focoDaRolagem === null ? 0 : Math.max(0, focoDaRolagem + 170 - palco.clientWidth)
  }, [rola, focoDaRolagem])

  const naLegenda = (chave) => plano.agentes.filter((g) => g.zona === chave).length
  // Área clicável da mesa de reunião: o tampo dela projetado em px do contêiner, recortado no quadrilátero exato
  // (a caixa reta cobriria as cadeiras e as pessoas da frente).
  const areaDaMesa = (() => {
    const p = palcoReuniao
    const cantos = TAMPO_DA_REUNIAO.map(([x, y, z]) => {
      const [dx, dy] = naTelaDoMundo([x, y])
      return { x: p.x + (origemReuniao[0] + dx) * p.escala, y: p.y + (origemReuniao[1] + dy - z) * p.escala }
    })
    const x = Math.min(...cantos.map((q) => q.x))
    const y = Math.min(...cantos.map((q) => q.y))
    const w = Math.max(...cantos.map((q) => q.x)) - x
    const h = Math.max(...cantos.map((q) => q.y)) - y
    if (w <= 0 || h <= 0) return null
    const recorte = cantos.map((q) => `${(((q.x - x) / w) * 100).toFixed(2)}% ${(((q.y - y) / h) * 100).toFixed(2)}%`)
    return { x, y, w, h, recorte: `polygon(${recorte.join(', ')})` }
  })()
  // Quem está a caminho (levantando ou andando) leva o crachá junto; balão e projeto só aparecem quando chega.
  const aCaminho = (id) => {
    const w = andantePorId.get(id)
    return w && w.fase !== 'sentando' ? w : null
  }
  const deslizando = (id) => {
    const info = caminhadas.get(id)
    if (!info) return false
    if (info.caminhada && instante - info.caminhada.inicio < DESLIZE_NA_SAIDA) return true
    return instante >= info.chegada && instante - info.chegada < DESLIZE_NA_CHEGADA
  }
  // Quem o modo reunião deixa clicar: quem já está na mesa (para sair) e quem está livre de ordens (para entrar).
  // Quem está andando fica de fora: o alvo dele mudaria de lugar debaixo do dedo.
  const alvoDaReuniao = (g) => {
    if (!modoReuniao || aCaminho(g.agente.id)) return null
    if (g.zona === 'reuniao') return 'dispensar'
    return COM_ORDEM.includes(g.agente.estado) ? null : 'convocar'
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div ref={refPalco} className={`w-full ${rola ? 'overflow-x-auto' : 'overflow-x-hidden'} overflow-y-hidden sm:rounded-[10px]`}>
        <div className="relative" style={{ width: larguraInterna, height: altura }} data-modo={modo}>
          {palcos.map((p) => (
            <div
              key={p.chave}
              data-palco={p.chave}
              className="absolute top-0 left-0 origin-top-left bg-[radial-gradient(circle,rgba(255,255,255,.06)_1.2px,transparent_1.7px)] bg-[length:22px_22px]"
              style={{ width: p.largura, height: p.altura, transform: `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) scale(${p.escala.toFixed(4)})` }}
            >
              <svg
                viewBox={`0 0 ${p.largura} ${p.altura}`}
                width={p.largura}
                height={p.altura}
                className="esc-desenho absolute left-0 top-0 overflow-visible"
                aria-hidden="true"
              >
                {conteudo(p)}
              </svg>
            </div>
          ))}
          {palcos.filter((p) => p.legenda).map((p) => {
            const { Icone, titulo, contar } = LEGENDAS[p.chave]
            const quantos = naLegenda(p.chave)
            return (
              <div
                key={`legenda-${p.chave}`}
                aria-hidden="true"
                className="absolute left-0 flex items-center gap-2 px-5 sm:px-1 text-[11px] font-semibold text-[#a1a1aa] pointer-events-none"
                style={{ top: p.legenda.y, width: Math.min(larguraInterna, larguraDisponivel) }}
              >
                <Icone className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
                <span className="whitespace-nowrap">{titulo}</span>
                <span className="whitespace-nowrap font-medium text-[#71717a]">
                  {quantos > 0 ? contar(quantos) : 'vazia'}
                </span>
                <span className="flex-1 h-px bg-white/[.07]" />
              </div>
            )
          })}
          {onMesaDeReuniao && areaDaMesa && (
            <button
              type="button"
              data-mesa="reuniao"
              onClick={onMesaDeReuniao}
              aria-pressed={modoReuniao}
              aria-label={modoReuniao ? 'Sala de reunião aberta: ver quem está na mesa' : 'Abrir a sala de reunião e chamar os agentes'}
              title={modoReuniao ? 'Reunião aberta' : 'Clique para abrir a reunião'}
              className={`absolute z-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-white/[.14] ${
                modoReuniao ? 'bg-kalfe-orange/25' : 'hover:bg-white/[.09]'
              }`}
              style={{ left: areaDaMesa.x, top: areaDaMesa.y, width: areaDaMesa.w, height: areaDaMesa.h, clipPath: areaDaMesa.recorte }}
            />
          )}
          {plano.agentes.map((g) => {
            const w = aCaminho(g.agente.id)
            const area = w
              ? { x: w.cabeca.x - MEIO_ANDANTE * w.s, y: w.cabeca.y - 4 * w.s, w: 2 * MEIO_ANDANTE * w.s, h: w.pes.y - w.cabeca.y + 6 * w.s }
              : g.area
            return (
              <button
                key={`area-${g.agente.id}`}
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                data-area={g.agente.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelecionar?.(g.agente.id)}
                className="absolute rounded-full cursor-pointer"
                style={{ left: area.x, top: area.y, width: area.w, height: area.h }}
              />
            )
          })}
          {plano.agentes.map((g) => {
            const texto = falas[g.agente.id]
            if (!texto) return null
            const andando = aCaminho(g.agente.id)
            const ponto = andando
              ? { x: andando.cabeca.x, y: andando.cabeca.y - 46 }
              : g.zona === 'mesa'
                ? { x: g.bolha.x, y: g.bolha.y - 52 }
                : { x: g.topo.x, y: g.topo.y - 38 }
            return <BalaoFala key={`fala-${g.agente.id}`} texto={texto} ponto={ponto} />
          })}
          {plano.agentes.map((g) => g.zona === 'mesa' && !aCaminho(g.agente.id) && (
            <BalaoDoAgente key={`balao-${g.agente.id}-${g.agente.estado}`} agente={g.agente} ponto={g.bolha} onSelecionar={onSelecionar} />
          ))}
          {plano.agentes.map((g) => g.zona === 'mesa' && g.rotulo.projeto && !aCaminho(g.agente.id) && (
            <ProjetoDoAgente key={`projeto-${g.agente.id}`} id={g.agente.id} nome={g.agente.ordemAtual.projetoNome} posicao={g.rotulo.projeto} />
          ))}
          {plano.agentes.map((g) => {
            const w = aCaminho(g.agente.id)
            const sentado = !w && g.zona !== 'mesa'
            return (
              <CrachaDoAgente
                key={`cracha-${g.agente.id}`}
                agente={g.agente}
                posicao={w ? { x: w.cabeca.x, y: w.cabeca.y - 8 - 24, centralizado: true } : g.rotulo.cracha}
                atividade={sentado ? g.atividade : null}
                zona={g.zona}
                andando={Boolean(w)}
                larguraMaxima={larguraMaximaDoCracha(g.escala, sentado)}
                selecionado={g.agente.id === selecionadoId}
                deslizando={deslizando(g.agente.id)}
                agora={agora}
                onSelecionar={onSelecionar}
              />
            )
          })}
          {plano.agentes.map((g) => {
            const alvo = alvoDaReuniao(g)
            if (!alvo) return null
            const dentro = alvo === 'dispensar'
            return (
              <AlvoDaReuniao
                key={`reuniao-${g.agente.id}`}
                agente={g.agente}
                ponto={{ x: (g.corpo.x1 + g.corpo.x2) / 2, y: (g.corpo.y1 + g.corpo.y2) / 2 }}
                dentro={dentro}
                onAcao={dentro ? onDispensar : onConvocar}
              />
            )
          })}
          {lista.length === 0 && (
            <div className="absolute inset-0 grid place-items-center">
              <span className="px-4 py-2 rounded-lg bg-[#18181b]/90 border border-white/10 text-[12.5px] font-semibold text-[#a1a1aa]">
                Nenhum agente no escritório ainda
              </span>
            </div>
          )}
        </div>
      </div>
      {rola && <p className="m-0 px-5 sm:px-0 text-[11px] font-medium text-[#a1a1aa]">Deslize para o lado para ver todo o escritório.</p>}
      <ul role="log" aria-label="O que os agentes estão dizendo" className="sr-only">
        {Object.entries(falas).map(([agenteId, texto]) => (
          <li key={`${agenteId}-${texto}`}>{`${lista.find((agente) => agente.id === agenteId)?.apelido ?? agenteId}: ${texto}`}</li>
        ))}
      </ul>
      <div role="status" aria-live="polite" className="sr-only">
        {anuncio.texto && <span key={anuncio.id}>{anuncio.texto}</span>}
      </div>
    </div>
  )
}
