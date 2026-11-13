import { useEffect, useRef, useState } from 'react'
import { LogOut, PanelLeftClose } from 'lucide-react'
import { COR, ESTADOS_AGENTE } from '../../constants/estados.js'
import useAgora from '../../hooks/useAgora.js'
import useArmadilhaDeFoco from '../../hooks/useArmadilhaDeFoco.js'
import { capitalizar, fracaoDeUso, inicialDe, plural, quandoRenova } from '../../utils/formatacao.js'
import AvatarAgente from '../comum/AvatarAgente.jsx'
import Marca from '../comum/Marca.jsx'
import { FOCO, TOM } from '../comum/classes.js'

function textoDoEstado(agente) {
  const projeto = agente.ordemAtual?.projetoNome ?? agente.ultimaOrdem?.projetoNome
  if (agente.estado === 'trabalhando') return projeto ? `Trabalhando · ${projeto}` : 'Trabalhando'
  if (agente.estado === 'na_fila') return `Na fila · ${plural(agente.fila, 'ordem', 'ordens')}`
  if (agente.estado === 'concluiu') return projeto ? `Concluiu · ${projeto}` : 'Concluiu'
  return (ESTADOS_AGENTE[agente.estado] ?? ESTADOS_AGENTE.livre).rotulo
}

// Branco enquanto sobra folga; âmbar e vermelho só perto do limite.
function corDoUso(fracao) {
  if (fracao >= 0.9) return COR.vermelho
  if (fracao >= 0.75) return COR.ambar
  return '#d4d4d4'
}

function BarraDeUso({ rotulo, valor }) {
  const fracao = fracaoDeUso(valor)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-neutral-500">{rotulo}</span>
        <span className="font-mono tabular-nums text-neutral-300">{fracao === null ? '—' : `${Math.round(fracao * 100)}%`}</span>
      </div>
      <div className="h-[3px] rounded-full bg-white/[.07] overflow-hidden" aria-hidden="true">
        {fracao !== null && (
          <div className="h-full rounded-full" style={{ width: `${Math.max(2, fracao * 100)}%`, background: corDoUso(fracao) }} />
        )}
      </div>
    </div>
  )
}

// A renovação pode ser dias depois (limite semanal) e some quando passa. Retorna o JSX ou null.
function Renovacao({ uso }) {
  const agora = useAgora()
  const quando = quandoRenova(uso.reiniciaEm, agora)
  if (!quando) return null
  return (
    <span className="text-[10.5px] text-neutral-600">
      {uso.status === 'rejected' ? `Limite atingido; renova ${quando}` : `Janela renova ${quando}`}
    </span>
  )
}

function BotaoSair({ onSair }) {
  const [armado, setArmado] = useState(false)

  useEffect(() => {
    if (!armado) return undefined
    const timer = setTimeout(() => setArmado(false), 4000)
    return () => clearTimeout(timer)
  }, [armado])

  return (
    <button
      type="button"
      onClick={() => (armado ? onSair() : setArmado(true))}
      onBlur={() => setArmado(false)}
      aria-label={armado ? 'Confirmar saída' : 'Sair'}
      title={armado ? 'Clique de novo para sair' : 'Sair'}
      className={`inline-flex items-center justify-center gap-1.5 h-9 shrink-0 rounded-md transition-colors ${armado ? 'px-2.5 bg-[#f87171]/[.12] text-[#f87171] text-[11.5px] font-medium' : 'w-9 text-neutral-500 hover:text-neutral-100 hover:bg-white/[.06]'} ${FOCO}`}
    >
      <LogOut className="w-4 h-4" aria-hidden="true" />
      {armado && 'Sair?'}
    </button>
  )
}

function LinhaAgente({ agente, selecionado, onSelecionar }) {
  const estado = ESTADOS_AGENTE[agente.estado] ?? ESTADOS_AGENTE.livre
  const aguardando = agente.estado === 'aguardando'
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelecionar(agente.id)}
        aria-current={selecionado ? 'true' : undefined}
        className={`group relative flex items-center gap-3 w-full min-h-[48px] px-2.5 py-2 rounded-md text-left transition-colors ${FOCO} ${
          selecionado ? 'bg-white/[.07]' : 'hover:bg-white/[.035]'
        }`}
      >
        <AvatarAgente agente={agente} estado={agente.estado} fundo={selecionado ? '#1b1b1b' : TOM.fundo} />
        <span className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className={`text-[13px] font-medium truncate ${selecionado ? 'text-neutral-50' : 'text-neutral-300 group-hover:text-neutral-100'}`}>
            {agente.apelido}
          </span>
          <span className="text-[11.5px] truncate" style={{ color: estado.urgente ? estado.cor : '#737373' }}>
            {textoDoEstado(agente)}
          </span>
        </span>
        {aguardando && (
          <span className="w-1.5 h-1.5 shrink-0 mr-1 rounded-full bg-[#fbbf24]" aria-hidden="true" />
        )}
      </button>
    </li>
  )
}

// O botão de fechar fica no canto esquerdo, no mesmo ponto da tela do botão de abrir do cabeçalho (o padding do topo
// acompanha o do cabeçalho: 1rem no celular, 2rem do sm para cima); a marca também cai no mesmo lugar.
function ConteudoBarra({ estado, selecionadoId, onSelecionar, onSair, onFechar, refFechar }) {
  const { agentes, conta, servidor } = estado
  const uso = conta?.uso ?? {}
  return (
    <>
      <div className="flex items-center gap-2 h-[61px] shrink-0 pl-4 sm:pl-8 pr-4 border-b border-linha">
        <button
          ref={refFechar}
          type="button"
          onClick={onFechar}
          aria-label="Fechar a barra da equipe"
          title="Fechar a barra da equipe"
          className={`grid place-items-center w-10 h-10 shrink-0 -ml-2.5 rounded-md text-neutral-400 transition-colors hover:bg-white/[.06] hover:text-neutral-50 ${FOCO}`}
        >
          <PanelLeftClose className="w-5 h-5" aria-hidden="true" />
        </button>
        <Marca className="w-7 h-7" />
        <span className="flex flex-col gap-0.5 min-w-0 flex-1 pl-0.5">
          <span className="text-[13.5px] font-semibold leading-tight tracking-[-.01em] text-neutral-50 truncate">Escritório de agentes</span>
          <span className="font-mono text-[10.5px] leading-tight text-neutral-500 truncate">
            {servidor?.versao ? `v${servidor.versao}` : ''}
            {servidor?.simulado ? ' · modo simulado' : ''}
          </span>
        </span>
      </div>

      <nav aria-label="Equipe" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-discreet px-3 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3 px-2.5 pb-2">
          <span className="font-mono text-[10.5px] font-medium uppercase tracking-[.06em] text-neutral-500">Equipe</span>
          <span className="font-mono text-[10.5px] tabular-nums text-neutral-600">{agentes.length}</span>
        </div>
        <ul className="flex flex-col gap-0.5">
          {agentes.map((agente) => (
            <LinhaAgente
              key={agente.id}
              agente={agente}
              selecionado={agente.id === selecionadoId}
              onSelecionar={onSelecionar}
            />
          ))}
        </ul>
        {/* O generalista sempre existe: só ele na lista quer dizer que a pasta de agentes está vazia ou não existe. */}
        {agentes.every((a) => a.generalista) && (
          <p className="m-0 px-2.5 pt-2 text-[12px] leading-[1.5] text-neutral-500 [overflow-wrap:anywhere]">
            Nenhum agente encontrado em <code className="font-mono text-[11.5px] text-neutral-400">{servidor?.dirAgentes ?? '~/.claude/agents'}</code>.
          </p>
        )}
      </nav>

      <div className="shrink-0 flex flex-col gap-3.5 px-4 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-linha">
        <div className="flex items-center gap-3">
          <span
            className="grid place-items-center w-8 h-8 shrink-0 rounded-full border border-linha-forte bg-superficie-2 text-neutral-200 text-[12.5px] font-semibold"
            aria-hidden="true"
          >
            {inicialDe(conta?.email ?? 'C')}
          </span>
          <span className="flex flex-col gap-0.5 min-w-0 flex-1">
            <span className="text-[12.5px] font-medium leading-tight text-neutral-100 truncate" title={conta?.email ?? undefined}>
              {conta?.email ?? 'Conta Claude'}
            </span>
            <span className="text-[11px] leading-tight text-neutral-500 truncate">
              {conta?.plano ? `Plano ${capitalizar(conta.plano)}` : conta?.autenticada === false ? 'Sem acesso à conta' : 'Plano —'}
            </span>
          </span>
          <BotaoSair onSair={onSair} />
        </div>
        <div role="group" aria-label="Uso da conta" className="flex flex-col gap-2">
          <BarraDeUso rotulo="Uso em 5 h" valor={uso.cincoHoras} />
          <BarraDeUso rotulo="Uso em 7 dias" valor={uso.seteDias} />
          <Renovacao uso={uso} />
        </div>
      </div>
    </>
  )
}

function MenuCelular({ onFechar, children }) {
  const painel = useRef(null)
  useArmadilhaDeFoco(painel, onFechar)
  return (
    <div className="fixed inset-0 z-[90] lg:hidden">
      <div className="absolute inset-0 bg-black/60 ctrl-overlay-in" onClick={onFechar} aria-hidden="true" />
      <div
        ref={painel}
        id="menu-equipe"
        role="dialog"
        aria-modal="true"
        aria-label="Menu da equipe"
        className="relative flex flex-col w-[300px] max-w-[86vw] h-full pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] bg-fundo border-r border-linha-forte shadow-[24px_0_60px_rgba(0,0,0,.55)] ctrl-gaveta-in"
      >
        {children}
      </div>
    </div>
  )
}

// Barra da equipe. Do lg para cima fica ao lado do conteúdo quando aberta (`barraAberta`, começa fechada); abaixo
// disso vira gaveta por cima da página (`menuAberto`). As duas abrem pelo botão do cabeçalho. Retorna o JSX.
export default function BarraLateral({
  estado, selecionadoId, onSelecionar, onSair, barraAberta, onFecharBarra, refFecharBarra, menuAberto, onFecharMenu,
}) {
  return (
    <>
      {barraAberta && (
        <aside id="barra-equipe" className="hidden lg:flex flex-col w-[272px] shrink-0 h-full bg-fundo border-r border-linha ctrl-gaveta-in">
          <ConteudoBarra
            estado={estado}
            selecionadoId={selecionadoId}
            onSelecionar={onSelecionar}
            onSair={onSair}
            onFechar={onFecharBarra}
            refFechar={refFecharBarra}
          />
        </aside>
      )}
      {menuAberto && (
        <MenuCelular onFechar={onFecharMenu}>
          <ConteudoBarra
            estado={estado}
            selecionadoId={selecionadoId}
            onSelecionar={onSelecionar}
            onSair={onSair}
            onFechar={onFecharMenu}
          />
        </MenuCelular>
      )}
    </>
  )
}
