import { PanelLeftOpen, Plus, QrCode } from 'lucide-react'
import ToggleVida from './ToggleVida.jsx'
import { COR } from '../../constants/estados.js'
import Marca from '../comum/Marca.jsx'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, FOCO } from '../comum/classes.js'

const CONEXAO = {
  aovivo: { rotulo: 'Ao vivo', cor: COR.verde, pulso: true },
  reconectando: { rotulo: 'Reconectando…', cor: COR.ambar, pulso: false },
  conectando: { rotulo: 'Conectando…', cor: '#737373', pulso: false },
}

// Situação da conexão: um ponto e o texto, sem pílula. Retorna o JSX.
function Conexao({ conexao }) {
  const { rotulo, cor, pulso } = CONEXAO[conexao] ?? CONEXAO.conectando
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-neutral-400 whitespace-nowrap">
      <span className={`w-1.5 h-1.5 rounded-full ${pulso ? 'ctrl-pulso' : ''}`} style={{ background: cor }} aria-hidden="true" />
      {rotulo}
    </span>
  )
}

// Cabeçalho fixo da página: o botão que abre a barra da equipe (no canto esquerdo; some do lg para cima enquanto a barra
// está aberta, porque o de fechar fica no mesmo ponto, dentro dela), título, situação da conexão, o QR para abrir no
// celular (do tablet para cima), o interruptor da vida dos agentes e "Nova ordem". A altura (60px + a linha) bate com o topo da barra. Retorna o JSX.
export default function Cabecalho({ conexao, alerta, telaLarga, barraAberta, menuAberto, refAbrirBarra, onAbrirBarra, vida, onAlternarVida, onAbrirVida, onCelular, onNovaOrdem }) {
  const rotulo = alerta ? 'Abrir a barra da equipe (tem agente precisando de você)' : 'Abrir a barra da equipe'
  return (
    <header className="sticky top-0 z-10 bg-fundo border-b border-linha pt-[env(safe-area-inset-top)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))]">
      <div className="flex items-center justify-between gap-3 h-[60px]">
        <div className="flex items-center gap-2 min-w-0">
          <button
            ref={refAbrirBarra}
            type="button"
            onClick={onAbrirBarra}
            aria-label={rotulo}
            title="Abrir a barra da equipe"
            aria-expanded={telaLarga ? barraAberta : menuAberto}
            aria-haspopup={telaLarga ? undefined : 'dialog'}
            className={`relative grid place-items-center w-10 h-10 shrink-0 -ml-2.5 rounded-md text-neutral-400 transition-colors hover:bg-white/[.06] hover:text-neutral-50 ${barraAberta ? 'lg:hidden' : ''} ${FOCO}`}
          >
            <PanelLeftOpen className="w-5 h-5" aria-hidden="true" />
            {alerta && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#fbbf24] ring-2 ring-fundo" aria-hidden="true" />
            )}
          </button>
          <Marca className={`w-7 h-7 hidden sm:block ${barraAberta ? 'lg:hidden' : ''}`} />
          <div className="flex flex-col gap-0.5 min-w-0 sm:pl-0.5">
            <h1 className="text-[15px] sm:text-[16px] font-semibold leading-tight tracking-[-.01em] text-neutral-50 truncate">Escritório de agentes</h1>
            <p className="hidden sm:block m-0 text-[11.5px] leading-tight text-neutral-500 truncate">
              Quem está fazendo o quê, em qual projeto, e quem precisa de você
            </p>
            <p className="sm:hidden m-0 leading-tight" role="status">
              <Conexao conexao={conexao} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex mr-2" role="status">
            <Conexao conexao={conexao} />
          </span>
          <ToggleVida vida={vida} onAlternar={onAlternarVida} onAbrirDetalhe={onAbrirVida} />
          <button type="button" onClick={onCelular} aria-haspopup="dialog" title="Abrir no celular" className={`${BOTAO_SECUNDARIO} hidden sm:inline-flex`}>
            <QrCode className="w-4 h-4" aria-hidden="true" />
            <span className="max-md:sr-only">Celular</span>
          </button>
          <button type="button" onClick={onNovaOrdem} className={BOTAO_PRIMARIO}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span className="max-[379px]:sr-only">Nova ordem</span>
          </button>
        </div>
      </div>
    </header>
  )
}
