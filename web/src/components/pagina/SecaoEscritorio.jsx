import { COR, ESTADOS_AGENTE, ORDEM_DOS_ESTADOS } from '../../constants/estados.js'
import { plural } from '../../utils/formatacao.js'
import CenaEscritorio from '../escritorio/CenaEscritorio.jsx'
import AvatarAgente from '../comum/AvatarAgente.jsx'
import LimiteDeErro from '../comum/LimiteDeErro.jsx'
import { BOTAO_PEQUENO, CLASSE_ERRO, CLASSE_SECAO, FOCO } from '../comum/classes.js'

function Legenda() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legenda dos estados">
      {ORDEM_DOS_ESTADOS.map((chave) => {
        const { curto, cor } = ESTADOS_AGENTE[chave]
        return (
          <li key={chave} className="inline-flex items-center gap-1.5 text-[11.5px] text-neutral-500">
            <span className="w-2 h-2 rounded-full" style={{ background: cor }} aria-hidden="true" />
            {curto}
          </li>
        )
      })}
    </ul>
  )
}

function CenaReserva({ agentes, selecionadoId, onSelecionar, onTentarDeNovo }) {
  return (
    <div className="flex flex-col gap-3 px-5 sm:px-0">
      <div role="alert" className={CLASSE_ERRO}>
        <span className="text-[12px] font-medium" style={{ color: COR.vermelho }}>
          Não foi possível desenhar o escritório. A equipe continua aqui embaixo.
        </span>
        <button
          type="button"
          onClick={onTentarDeNovo}
          className={BOTAO_PEQUENO}
        >
          Tentar de novo
        </button>
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2.5">
        {agentes.map((agente) => {
          const estado = ESTADOS_AGENTE[agente.estado] ?? ESTADOS_AGENTE.livre
          const ativo = agente.id === selecionadoId
          return (
            <li key={agente.id}>
              <button
                type="button"
                onClick={() => onSelecionar(agente.id)}
                aria-current={ativo ? 'true' : undefined}
                className={`flex items-center gap-2.5 w-full p-2.5 sm:gap-3 sm:p-3 rounded-lg border text-left transition-colors ${FOCO} ${
                  ativo ? 'bg-white/[.06] border-neutral-500' : 'bg-superficie-2 border-linha hover:border-neutral-700'
                }`}
              >
                <AvatarAgente agente={agente} estado={agente.estado} fundo="#161616" />
                <span className="flex flex-col min-w-0">
                  <span className="text-[13px] font-medium text-neutral-100 truncate">{agente.apelido}</span>
                  <span className="text-[11.5px] truncate" style={{ color: estado.urgente ? estado.cor : '#737373' }}>{estado.curto}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Seção do escritório: contagens, legenda e a cena isométrica (de ponta a ponta no celular). Retorna o JSX.
export default function SecaoEscritorio({
  agentes, selecionadoId, onSelecionar, assinar, vida, reuniao, modoReuniao, onMesaDeReuniao, onConvocar, onDispensar,
}) {
  const trabalhando = agentes.filter((a) => a.estado === 'trabalhando').length
  const aguardando = agentes.filter((a) => a.estado === 'aguardando').length
  const naReuniao = reuniao?.convocados?.length ?? 0
  return (
    <section aria-labelledby="titulo-escritorio" className={CLASSE_SECAO}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1 min-w-0">
          <h2 id="titulo-escritorio" className="text-[14px] font-semibold tracking-[-.01em] text-neutral-50">
            Escritório
          </h2>
          <span className="text-[12px] leading-[1.5] text-neutral-500">
            {plural(agentes.length, 'agente', 'agentes')}
            {' · '}
            <span className={trabalhando ? 'text-neutral-200' : undefined}>{trabalhando} trabalhando</span>
            {' · '}
            <span style={{ color: aguardando ? COR.ambar : undefined }}>
              {aguardando === 0 ? 'ninguém' : aguardando} {aguardando > 1 ? 'precisam' : 'precisa'} de você
            </span>
            {' · '}
            {vida?.ligada ? `${plural(vida.vivos, 'com vida própria', 'com vida própria')}` : 'clique num agente para ver o que ele está fazendo'}
            {naReuniao > 0 && (
              <>
                {' · '}
                <span className="text-neutral-200">{plural(naReuniao, 'na reunião', 'na reunião')}</span>
              </>
            )}
          </span>
        </div>
        <Legenda />
      </div>
      <div className="isolate -mx-5 sm:mx-0">
        <LimiteDeErro
          alternativa={({ tentarDeNovo }) => (
            <CenaReserva agentes={agentes} selecionadoId={selecionadoId} onSelecionar={onSelecionar} onTentarDeNovo={tentarDeNovo} />
          )}
        >
          <CenaEscritorio
            agentes={agentes}
            selecionadoId={selecionadoId}
            onSelecionar={onSelecionar}
            assinar={assinar}
            modoReuniao={modoReuniao}
            onMesaDeReuniao={onMesaDeReuniao}
            onConvocar={onConvocar}
            onDispensar={onDispensar}
          />
        </LimiteDeErro>
      </div>
    </section>
  )
}
