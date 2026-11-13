import { useId, useRef, useState } from 'react'
import { DoorOpen, MessageSquarePlus, Presentation, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { COR, ESTADOS_AGENTE } from '../../constants/estados.js'
import { api } from '../../services/api.js'
import { mensagemDoErro } from '../../utils/erros.js'
import { plural, tempoRelativo } from '../../utils/formatacao.js'
import AvatarAgente from '../comum/AvatarAgente.jsx'
import Gaveta from '../comum/Gaveta.jsx'
import RotuloSecao from '../comum/RotuloSecao.jsx'
import {
  BOTAO_FANTASMA, BOTAO_FECHAR, BOTAO_NEGAR, BOTAO_PEQUENO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CLASSE_LISTA,
  CLASSE_TEXTAREA,
} from '../comum/classes.js'

const LIMITE_RECADO = 4000
// Estados em que o agente está com uma ordem do humano: a sessão dele é de verdade e a reunião não a interrompe.
const COM_ORDEM = ['na_fila', 'trabalhando', 'aguardando']

export const temOrdemDoHumano = (agente) => COM_ORDEM.includes(agente.estado)

function LinhaDoAgente({ agente, acao, Icone, rotulo, desabilitado, onAcao }) {
  const estado = ESTADOS_AGENTE[agente.estado] ?? ESTADOS_AGENTE.livre
  return (
    <li className="flex items-center gap-3 px-3.5 py-2.5">
      <AvatarAgente agente={agente} tamanho="sm" estado={agente.estado} fundo="#111111" />
      <span className="flex flex-col min-w-0 flex-1">
        <span className="text-[12.5px] font-medium text-neutral-100 truncate">{agente.apelido}</span>
        <span className="text-[11.5px] truncate" style={{ color: estado.urgente ? estado.cor : '#737373' }}>{rotulo}</span>
      </span>
      <button
        type="button"
        onClick={() => onAcao(agente.id)}
        disabled={desabilitado}
        aria-label={`${acao} ${agente.apelido}`}
        className={`${BOTAO_PEQUENO} inline-flex items-center gap-1.5 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed`}
      >
        <Icone className="w-3.5 h-3.5" strokeWidth={2.4} aria-hidden="true" />
        {acao}
      </button>
    </li>
  )
}

// Gaveta da sala de reunião: quem está na mesa, quem dá para chamar, o recado que vai na próxima ordem de cada um e o
// botão de encerrar. `erro` vem da página, para o clique num boneco da cena ser recusado aqui também. Retorna o JSX.
export default function DrawerReuniao({ reuniao, agentes, erro, onErro, onFechar }) {
  const idTitulo = useId()
  const idRecado = useId()
  const idAjudaRecado = useId()
  const campoRecado = useRef(null)
  const [recado, setRecado] = useState('')
  const [ocupada, setOcupada] = useState(null)

  const naMesa = (reuniao?.convocados ?? [])
    .map(({ agenteId }) => agentes.find((a) => a.id === agenteId))
    .filter((agente) => agente !== undefined)
  const chamaveis = agentes.filter((agente) => !temOrdemDoHumano(agente) && !naMesa.some((a) => a.id === agente.id))
  const comOrdem = agentes.filter((agente) => temOrdemDoHumano(agente))
  const recados = [...(reuniao?.recados ?? [])].reverse()

  // Toda ação passa por aqui: trava a gaveta enquanto o servidor responde e mostra a recusa dele como está escrita.
  const fazer = async (qual, acao, padrao) => {
    if (ocupada) return
    setOcupada(qual)
    onErro(null)
    try {
      await acao()
    } catch (problema) {
      onErro(mensagemDoErro(problema, padrao))
    } finally {
      setOcupada(null)
    }
  }

  const deixarRecado = () => fazer('recado', async () => {
    await api.darRecado(recado.trim())
    setRecado('')
  }, 'Não foi possível deixar o recado.')

  const encerrar = () => fazer('encerrar', async () => {
    await api.encerrarReuniao()
    onFechar()
  }, 'Não foi possível encerrar a reunião.')

  const recadoValido = recado.trim().length > 0 && recado.trim().length <= LIMITE_RECADO && naMesa.length > 0

  const rodape = (
    <>
      {erro && (
        <p role="alert" className="w-full m-0 text-[11.5px] font-medium" style={{ color: COR.vermelho }}>{erro}</p>
      )}
      <button type="button" onClick={encerrar} disabled={Boolean(ocupada)} aria-busy={ocupada === 'encerrar'} className={BOTAO_NEGAR}>
        <DoorOpen className="w-4 h-4" aria-hidden="true" />
        {ocupada === 'encerrar' ? 'Encerrando…' : 'Encerrar a reunião'}
      </button>
      <button type="button" onClick={onFechar} className={BOTAO_FANTASMA}>
        Fechar
      </button>
    </>
  )

  return (
    <Gaveta idTitulo={idTitulo} onFechar={onFechar} refFocoInicial={campoRecado} rodape={rodape}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <span id={idTitulo} className="font-mono text-[10.5px] font-medium uppercase tracking-[.06em] text-neutral-500">
            SALA DE REUNIÃO
          </span>
          <h2 className="m-0 inline-flex items-center gap-2 text-[19px] font-semibold leading-[1.3] tracking-[-.015em] text-neutral-50">
            <Presentation className="w-[18px] h-[18px] shrink-0 text-neutral-400" aria-hidden="true" />
            {naMesa.length === 0 ? 'Mesa vazia' : `${plural(naMesa.length, 'agente', 'agentes')} na mesa`}
          </h2>
          <p className="m-0 text-[12px] leading-[1.5] text-neutral-500">
            Chame quem está livre, deixe um recado e encerre. O recado não dá ordem a ninguém: ele entra no começo da
            próxima ordem de cada um que estava na sala.
          </p>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar" className={BOTAO_FECHAR}>
          <X className="w-4 h-4 fino:sm:w-3.5 fino:sm:h-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <RotuloSecao>NA MESA</RotuloSecao>
          {chamaveis.length > 0 && (
            <button
              type="button"
              onClick={() => fazer('todos', () => api.convocarLivres(), 'Não foi possível chamar todos.')}
              disabled={Boolean(ocupada)}
              aria-busy={ocupada === 'todos'}
              className={`${BOTAO_SECUNDARIO} -my-1`}
            >
              <Users className="w-4 h-4" aria-hidden="true" />
              {ocupada === 'todos' ? 'Chamando…' : 'Chamar todos os livres'}
            </button>
          )}
        </div>
        {naMesa.length === 0 ? (
          <p className="m-0 px-3.5 py-3 rounded-lg border border-dashed border-linha-forte text-[12px] text-neutral-500">
            Ninguém sentou ainda. Chame alguém aqui ou clique nos bonecos no escritório.
          </p>
        ) : (
          <ul className={CLASSE_LISTA}>
            {naMesa.map((agente) => (
              <LinhaDoAgente
                key={agente.id}
                agente={agente}
                acao="Dispensar"
                Icone={UserMinus}
                rotulo={`sentado ${tempoRelativo(reuniao.convocados.find((c) => c.agenteId === agente.id)?.desde)}`}
                desabilitado={Boolean(ocupada)}
                onAcao={(id) => fazer(`dispensar-${id}`, () => api.dispensarDaReuniao(id), 'Não foi possível dispensar.')}
              />
            ))}
          </ul>
        )}
      </div>

      {chamaveis.length > 0 && (
        <div className="flex flex-col gap-2">
          <RotuloSecao>LIVRES PARA CHAMAR</RotuloSecao>
          <ul className={CLASSE_LISTA}>
            {chamaveis.map((agente) => (
              <LinhaDoAgente
                key={agente.id}
                agente={agente}
                acao="Chamar"
                Icone={UserPlus}
                rotulo={(ESTADOS_AGENTE[agente.estado] ?? ESTADOS_AGENTE.livre).curto}
                desabilitado={Boolean(ocupada)}
                onAcao={(id) => fazer(`convocar-${id}`, () => api.convocar(id), 'Não foi possível chamar esse agente.')}
              />
            ))}
          </ul>
        </div>
      )}

      {comOrdem.length > 0 && (
        <p className="m-0 text-[11.5px] leading-[1.45] text-neutral-500">
          {comOrdem.map((a) => a.apelido).join(', ')} {comOrdem.length === 1 ? 'está' : 'estão'} com uma ordem sua e
          {comOrdem.length === 1 ? ' fica' : ' ficam'} na mesa de trabalho: a reunião não interrompe sessão nenhuma.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <RotuloSecao htmlFor={idRecado}>RECADO</RotuloSecao>
        <textarea
          id={idRecado}
          ref={campoRecado}
          rows={4}
          value={recado}
          maxLength={LIMITE_RECADO}
          onChange={(e) => setRecado(e.target.value)}
          placeholder="O que eles precisam saber na próxima tarefa…"
          aria-describedby={idAjudaRecado}
          className={CLASSE_TEXTAREA}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span id={idAjudaRecado} className="text-[11.5px] leading-[1.45] text-neutral-500">
            {naMesa.length === 0
              ? 'Chame alguém para a mesa antes de deixar o recado.'
              : `Vai para ${plural(naMesa.length, 'agente', 'agentes')}, na próxima ordem de cada um.`}
          </span>
          <button
            type="button"
            onClick={deixarRecado}
            disabled={!recadoValido || Boolean(ocupada)}
            aria-busy={ocupada === 'recado'}
            className={BOTAO_PRIMARIO}
          >
            <MessageSquarePlus className="w-4 h-4" aria-hidden="true" />
            {ocupada === 'recado' ? 'Guardando…' : 'Deixar recado'}
          </button>
        </div>
      </div>

      {recados.length > 0 && (
        <div className="flex flex-col gap-2">
          <RotuloSecao>RECADOS DESTA REUNIÃO</RotuloSecao>
          <ul className="flex flex-col gap-2.5 m-0 p-0 list-none">
            {recados.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 pl-3.5 border-l-2 border-neutral-700">
                <span className="text-[11px] text-neutral-500">
                  {tempoRelativo(item.criadoEm)} · {plural(item.paraIds.length, 'agente', 'agentes')}
                </span>
                <p className="m-0 text-[12.5px] leading-[1.5] text-neutral-200 whitespace-pre-wrap break-words">{item.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {agentes.length === 0 && (
        <p className="m-0 text-[12px] text-neutral-500">Nenhum agente no escritório para chamar.</p>
      )}
    </Gaveta>
  )
}
