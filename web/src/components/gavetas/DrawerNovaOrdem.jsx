import { useId, useRef, useState } from 'react'
import { Hourglass, Send, X } from 'lucide-react'
import { COR, MODOS, STATUS_ORDEM } from '../../constants/estados.js'
import { api } from '../../services/api.js'
import { mensagemDoErro } from '../../utils/erros.js'
import { nomeDoCaminho } from '../../utils/formatacao.js'
import Gaveta from '../comum/Gaveta.jsx'
import RotuloSecao from '../comum/RotuloSecao.jsx'
import { BOTAO_FANTASMA, BOTAO_FECHAR, BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_ROTULO, CLASSE_TEXTAREA, FOCO } from '../comum/classes.js'

const OUTRO = '__outro__'
const LIMITE_INSTRUCAO = 20000

function caminhoPadrao(agente, projetos) {
  return agente?.ordemAtual?.projeto ?? agente?.ultimaOrdem?.projeto ?? projetos[0]?.caminho ?? ''
}

function escolhaDoProjeto(caminho, projetos) {
  if (!caminho) return { escolha: projetos.length ? projetos[0].caminho : OUTRO, outro: '' }
  if (projetos.some((p) => p.caminho === caminho)) return { escolha: caminho, outro: '' }
  return { escolha: OUTRO, outro: caminho }
}

function EscolhaModo({ modo, desabilitado, onEscolher }) {
  return (
    <div role="radiogroup" aria-label="Modo de permissão" className="flex flex-col rounded-lg border border-linha-forte divide-y divide-linha-forte overflow-hidden">
      {MODOS.map(({ id, rotulo, descricao, Icone }) => {
        const ativo = modo === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={ativo}
            disabled={desabilitado}
            onClick={() => onEscolher(id)}
            className={`flex items-start gap-3 min-h-[44px] px-3.5 py-3 text-left transition-colors disabled:opacity-60 ${FOCO} focus-visible:ring-inset ${
              ativo ? 'bg-white/[.05]' : 'hover:bg-white/[.025]'
            }`}
          >
            <span
              className={`grid place-items-center w-4 h-4 mt-px shrink-0 rounded-full border transition-colors ${ativo ? 'bg-neutral-50 border-neutral-50' : 'border-neutral-600'}`}
              aria-hidden="true"
            >
              {ativo && <span className="w-1.5 h-1.5 rounded-full bg-neutral-950" />}
            </span>
            <span className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium ${ativo ? 'text-neutral-50' : 'text-neutral-300'}`}>
                <Icone className={`w-3.5 h-3.5 shrink-0 ${ativo ? 'text-neutral-300' : 'text-neutral-600'}`} aria-hidden="true" />
                {rotulo}
              </span>
              <span className="text-[11.5px] leading-[1.45] text-neutral-500 break-words">{descricao}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Drawer para dar uma ordem (ou continuar a conversa de uma ordem): agente, projeto, instrução e modo. Retorna o JSX.
export default function DrawerNovaOrdem({ estado, inicial, onFechar, onCriada }) {
  const { agentes, projetos } = estado
  const continuacao = inicial?.continuaDe ?? null
  const idTitulo = useId()
  const idAgente = useId()
  const idProjeto = useId()
  const idOutro = useId()
  const idAjudaOutro = useId()
  const idInstrucao = useId()
  const idAjudaInstrucao = useId()
  const campoInstrucao = useRef(null)

  const [agenteId, setAgenteId] = useState(() => continuacao?.agenteId ?? inicial?.agenteId ?? agentes[0]?.id ?? '')
  const [projeto, setProjeto] = useState(() => escolhaDoProjeto(
    continuacao?.projeto ?? caminhoPadrao(agentes.find((a) => a.id === (inicial?.agenteId ?? agentes[0]?.id)), projetos),
    projetos,
  ))
  const [projetoTocado, setProjetoTocado] = useState(false)
  const [instrucao, setInstrucao] = useState('')
  const [modo, setModo] = useState(continuacao?.modo ?? 'default')
  const [envio, setEnvio] = useState({ enviando: false, erro: null })

  const agente = agentes.find((a) => a.id === agenteId) ?? null
  const caminho = projeto.escolha === OUTRO ? projeto.outro.trim() : projeto.escolha
  const caminhoInvalido = projeto.escolha === OUTRO && caminho !== '' && !/^(\/|~)/.test(caminho)
  const ocupado = Boolean(agente && (agente.ordemAtual || agente.fila > 0))
  const valido = Boolean(agenteId && caminho && !caminhoInvalido && instrucao.trim())

  const trocarAgente = (id) => {
    setAgenteId(id)
    if (!projetoTocado) setProjeto(escolhaDoProjeto(caminhoPadrao(agentes.find((a) => a.id === id), projetos), projetos))
  }

  const enviar = async () => {
    if (!valido || envio.enviando) return
    setEnvio({ enviando: true, erro: null })
    try {
      const ordem = await api.criarOrdem({
        agenteId,
        projeto: caminho,
        instrucao: instrucao.trim(),
        modo,
        ...(continuacao ? { continuaDe: continuacao.id } : {}),
      })
      onCriada(ordem)
    } catch (erro) {
      setEnvio({ enviando: false, erro: mensagemDoErro(erro, 'Não foi possível enviar a ordem.') })
    }
  }

  const statusAnterior = continuacao ? STATUS_ORDEM[continuacao.status] ?? STATUS_ORDEM.concluida : null

  const rodape = (
    <>
      {envio.erro && (
        <p role="alert" className="w-full m-0 text-[11.5px] font-medium" style={{ color: COR.vermelho }}>{envio.erro}</p>
      )}
      <button type="button" onClick={onFechar} className={`${BOTAO_FANTASMA} -ml-2`}>
        Cancelar
      </button>
      <div className="flex items-center gap-3">
        <span className="hidden fino:sm:inline font-mono text-[10.5px] text-neutral-600">Ctrl+Enter envia</span>
        <button type="button" onClick={enviar} disabled={!valido || envio.enviando} aria-busy={envio.enviando} className={BOTAO_PRIMARIO}>
          <Send className="w-4 h-4" aria-hidden="true" />
          {envio.enviando ? 'Enviando…' : 'Enviar ordem'}
        </button>
      </div>
    </>
  )

  return (
    <Gaveta idTitulo={idTitulo} onFechar={onFechar} refFocoInicial={campoInstrucao} rodape={rodape}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <span id={idTitulo} className={CLASSE_ROTULO}>
            {continuacao ? 'CONTINUAR CONVERSA' : 'NOVA ORDEM'}
          </span>
          <h2 className="m-0 text-[19px] font-semibold leading-[1.3] tracking-[-.015em] text-neutral-50 [text-wrap:balance]">
            {continuacao ? `Continuar a conversa com ${agente?.apelido ?? 'o agente'}` : 'O que um agente deve fazer?'}
          </h2>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar" className={BOTAO_FECHAR}>
          <X className="w-4 h-4 fino:sm:w-3.5 fino:sm:h-3.5" aria-hidden="true" />
        </button>
      </div>

      {continuacao && (
        <div className="flex flex-col gap-1.5 pl-3.5 border-l-2 border-neutral-600">
          <span className="text-[11.5px] font-medium" style={{ color: statusAnterior.cor }}>
            Ordem anterior · {statusAnterior.rotulo} · {nomeDoCaminho(continuacao.projeto)}
          </span>
          <p className="m-0 text-[13px] leading-[1.5] text-neutral-200 line-clamp-3 break-words">{continuacao.instrucao}</p>
          <span className="text-[11.5px] leading-[1.45] text-neutral-500">
            O agente retoma a mesma sessão, lembrando de tudo o que já fez nessa conversa.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5 min-w-0">
          <RotuloSecao htmlFor={idAgente}>AGENTE</RotuloSecao>
          <select
            id={idAgente}
            value={agenteId}
            disabled={Boolean(continuacao)}
            onChange={(e) => trocarAgente(e.target.value)}
            className={`${CLASSE_CAMPO} [color-scheme:dark]`}
          >
            {!agente && agenteId && <option value={agenteId}>{agenteId}</option>}
            {agentes.map((a) => (
              <option key={a.id} value={a.id}>{a.generalista ? `${a.apelido} (generalista)` : a.apelido}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 min-w-0">
          <RotuloSecao htmlFor={idProjeto}>PROJETO</RotuloSecao>
          <select
            id={idProjeto}
            value={projeto.escolha}
            disabled={Boolean(continuacao)}
            onChange={(e) => {
              setProjetoTocado(true)
              setProjeto((p) => ({ ...p, escolha: e.target.value }))
            }}
            className={`${CLASSE_CAMPO} [color-scheme:dark]`}
          >
            {projetos.map((p) => (
              <option key={p.caminho} value={p.caminho}>{p.nome}</option>
            ))}
            <option value={OUTRO}>Outro caminho…</option>
          </select>
        </div>
      </div>

      {projeto.escolha === OUTRO && (
        <div className="flex flex-col gap-1.5 -mt-1.5">
          <RotuloSecao htmlFor={idOutro}>CAMINHO DA PASTA</RotuloSecao>
          <input
            id={idOutro}
            value={projeto.outro}
            disabled={Boolean(continuacao)}
            onChange={(e) => {
              setProjetoTocado(true)
              setProjeto((p) => ({ ...p, outro: e.target.value }))
            }}
            placeholder={`${estado.servidor?.dirProjetos ?? '~/projects'}/meu-projeto`}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={caminhoInvalido}
            aria-describedby={idAjudaOutro}
            className={`${CLASSE_CAMPO} font-mono`}
            style={caminhoInvalido ? { borderColor: `${COR.vermelho}99` } : undefined}
          />
          {/* aria-live: com o foco no campo, a troca da descrição não é anunciada sozinha */}
          <span id={idAjudaOutro} aria-live="polite" className="text-[11.5px] leading-[1.45]" style={{ color: caminhoInvalido ? COR.vermelho : '#737373' }}>
            {caminhoInvalido ? 'Use o caminho completo, começando com / ou ~.' : 'Pasta neste computador onde o agente vai trabalhar.'}
          </span>
        </div>
      )}

      {ocupado && !continuacao && (
        <p className="flex items-start gap-2 m-0 -mt-1.5 text-[11.5px] leading-[1.45] text-neutral-400">
          <Hourglass className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          {agente.apelido} está ocupado; a ordem entra na fila.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <RotuloSecao htmlFor={idInstrucao}>INSTRUÇÃO</RotuloSecao>
          {instrucao.length > LIMITE_INSTRUCAO * 0.8 && (
            <span className="font-mono text-[10.5px] tabular-nums text-neutral-500">{instrucao.length}/{LIMITE_INSTRUCAO}</span>
          )}
        </div>
        <textarea
          ref={campoInstrucao}
          id={idInstrucao}
          rows={6}
          maxLength={LIMITE_INSTRUCAO}
          value={instrucao}
          onChange={(e) => setInstrucao(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              enviar()
            }
          }}
          aria-describedby={idAjudaInstrucao}
          placeholder={continuacao
            ? 'Responda ou peça o próximo passo'
            : 'Ex.: rode os testes do módulo de frete e corrija o que estiver falhando'}
          className={CLASSE_TEXTAREA}
        />
        <span id={idAjudaInstrucao} className="text-[11.5px] leading-[1.45] text-neutral-500">
          Escreva como falaria com alguém da equipe. O agente pede confirmação aqui no painel quando precisar.
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <RotuloSecao>MODO</RotuloSecao>
        <EscolhaModo modo={modo} desabilitado={envio.enviando} onEscolher={setModo} />
      </div>
    </Gaveta>
  )
}
