import { useId, useMemo, useRef, useState } from 'react'
import { Ban, Check, ChevronDown, FileText, Pencil, Play, ShieldCheck, TriangleAlert, Zap } from 'lucide-react'
import { COR, TIPOS_PENDENCIA } from '../../constants/estados.js'
import { api } from '../../services/api.js'
import useAgora from '../../hooks/useAgora.js'
import { mensagemDoErro } from '../../utils/erros.js'
import { plural, tempoRelativo } from '../../utils/formatacao.js'
import {
  cortarLinhas, foraDaPasta, nomeDaFerramenta, perguntasDaEntrada, textoDaResposta, textoJson,
} from '../../utils/pendencias.js'
import TextoMarkdown from '../TextoMarkdown.jsx'
import Recolhivel from '../comum/Recolhivel.jsx'
import {
  BOTAO_FANTASMA, BOTAO_LINK, BOTAO_NEGAR, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CLASSE_ROTULO, CLASSE_TEXTAREA, FOCO, TOM,
} from '../comum/classes.js'

const LINHAS_PREVIA = 20
const LINHAS_TROCA = 12
const EDICOES_PREVIA = 3

// Sem altura máxima com rolagem interna: no celular a barra não aparece e o fim do comando sumiria sem aviso.
const CLASSE_BLOCO = 'm-0 overflow-x-auto px-3.5 py-2.5 rounded-lg border font-mono text-[12px] leading-[1.6]'

function BotaoVerTudo({ aberto, rotulo, onAlternar }) {
  return (
    <button type="button" onClick={onAlternar} aria-expanded={aberto} className={BOTAO_LINK}>
      {aberto ? 'Recolher' : rotulo}
      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
  )
}

function BlocoCodigo({ texto, quebrar = false, tom = 'neutro', linhas = LINHAS_PREVIA }) {
  const [inteiro, setInteiro] = useState(false)
  const { texto: previa, sobra } = cortarLinhas(texto, linhas)
  const visivel = inteiro ? cortarLinhas(texto, Infinity).texto : previa
  const cores = {
    neutro: 'bg-fundo border-linha text-neutral-200',
    antes: 'bg-[#f87171]/[.05] border-[#f87171]/20 text-[#fecaca]',
    depois: 'bg-[#34d399]/[.05] border-[#34d399]/20 text-[#bbf7d0]',
  }
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <pre className={`${CLASSE_BLOCO} ${cores[tom]} ${quebrar ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'whitespace-pre'}`}>
        <code>{visivel}</code>
      </pre>
      {sobra > 0 && (
        <BotaoVerTudo aberto={inteiro} rotulo={`Ver tudo (+ ${plural(sobra, 'linha', 'linhas')})`} onAlternar={() => setInteiro((a) => !a)} />
      )}
    </div>
  )
}

function CaminhoArquivo({ caminho }) {
  if (!caminho) return null
  return (
    <span className="inline-flex items-start gap-1.5 max-w-full self-start px-2 py-1 rounded-md border border-linha-forte font-mono text-[11.5px] leading-[1.45] text-neutral-200 [overflow-wrap:anywhere]">
      <FileText className="w-3.5 h-3.5 mt-px shrink-0 text-neutral-500" aria-hidden="true" />
      {caminho}
    </span>
  )
}

function Troca({ antes, depois, todas }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className={CLASSE_ROTULO} style={{ color: COR.vermelho }}>{todas ? 'TROCAR (TODAS AS OCORRÊNCIAS)' : 'TROCAR'}</span>
      <BlocoCodigo texto={antes ?? ''} tom="antes" linhas={LINHAS_TROCA} />
      <span className={CLASSE_ROTULO} style={{ color: COR.verde }}>POR</span>
      <BlocoCodigo texto={depois ?? ''} tom="depois" linhas={LINHAS_TROCA} />
    </div>
  )
}

function Edicoes({ edicoes }) {
  const [todas, setTodas] = useState(false)
  const visiveis = todas ? edicoes : edicoes.slice(0, EDICOES_PREVIA)
  return (
    <>
      {visiveis.map((edicao, i) => (
        <Troca key={i} antes={edicao.old_string} depois={edicao.new_string} todas={edicao.replace_all} />
      ))}
      {edicoes.length > EDICOES_PREVIA && (
        <BotaoVerTudo
          aberto={todas}
          rotulo={`Ver as ${edicoes.length} edições no mesmo arquivo`}
          onAlternar={() => setTodas((a) => !a)}
        />
      )}
    </>
  )
}

function PreviaPermissao({ ferramenta, entrada, descricao }) {
  const e = entrada ?? {}
  if (ferramenta === 'Bash' && typeof e.command === 'string') {
    const explicacao = typeof e.description === 'string' && e.description.trim() !== (descricao ?? '').trim() ? e.description : null
    return (
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className={CLASSE_ROTULO}>COMANDO</span>
        <BlocoCodigo texto={e.command} quebrar linhas={Infinity} />
        {explicacao && <span className="text-[12.5px] leading-[1.45] text-neutral-400">{explicacao}</span>}
      </div>
    )
  }
  if (ferramenta === 'Write') {
    return (
      <div className="flex flex-col gap-2 min-w-0">
        <CaminhoArquivo caminho={e.file_path} />
        <BlocoCodigo texto={String(e.content ?? '')} />
      </div>
    )
  }
  if (ferramenta === 'Edit') {
    return (
      <div className="flex flex-col gap-2 min-w-0">
        <CaminhoArquivo caminho={e.file_path} />
        <Troca antes={e.old_string} depois={e.new_string} todas={e.replace_all} />
      </div>
    )
  }
  if (ferramenta === 'MultiEdit' && Array.isArray(e.edits)) {
    return (
      <div className="flex flex-col gap-2 min-w-0">
        <CaminhoArquivo caminho={e.file_path} />
        <Edicoes edicoes={e.edits} />
      </div>
    )
  }
  if (ferramenta === 'NotebookEdit') {
    return (
      <div className="flex flex-col gap-2 min-w-0">
        <CaminhoArquivo caminho={e.notebook_path} />
        <BlocoCodigo texto={String(e.new_source ?? '')} />
      </div>
    )
  }
  if (ferramenta === 'WebFetch' && e.url) {
    return (
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className={CLASSE_ROTULO}>ENDEREÇO</span>
        <BlocoCodigo texto={String(e.url)} quebrar linhas={Infinity} />
        {e.prompt && <span className="text-[12.5px] leading-[1.45] text-neutral-400">{e.prompt}</span>}
      </div>
    )
  }
  if (ferramenta === 'WebSearch' && e.query) {
    return (
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className={CLASSE_ROTULO}>PESQUISA</span>
        <BlocoCodigo texto={String(e.query)} quebrar />
      </div>
    )
  }
  // Os argumentos (de uma ferramenta MCP, por exemplo) são o que se aprova: quebram a linha em vez de sumir pela direita.
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className={CLASSE_ROTULO}>DADOS DA CHAMADA</span>
      <BlocoCodigo texto={textoJson(e)} quebrar />
    </div>
  )
}

function Motivo({ rotulo, placeholder, botao, obrigatorio = false, perigo = false, enviando, onEnviar, onVoltar }) {
  const [texto, setTexto] = useState('')
  const id = useId()
  const pode = !enviando && (!obrigatorio || texto.trim())
  const enviar = () => {
    if (pode) onEnviar(texto.trim())
  }
  return (
    <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-fundo border border-linha">
      <label htmlFor={id} className={CLASSE_ROTULO}>{rotulo}</label>
      <textarea
        id={id}
        autoFocus
        rows={2}
        maxLength={2000}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            enviar()
          }
        }}
        placeholder={placeholder}
        className={CLASSE_TEXTAREA}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={enviar} disabled={!pode} className={perigo ? BOTAO_NEGAR : BOTAO_PRIMARIO}>
          {enviando ? 'Enviando…' : botao}
        </button>
        <button type="button" onClick={onVoltar} disabled={enviando} className={BOTAO_FANTASMA}>
          Voltar
        </button>
      </div>
    </div>
  )
}

function Opcao({ rotulo, descricao, multipla, ativo, desabilitado, onClick }) {
  return (
    <button
      type="button"
      role={multipla ? 'checkbox' : 'radio'}
      aria-checked={ativo}
      disabled={desabilitado}
      onClick={onClick}
      className={`flex items-start gap-2.5 min-h-[44px] px-3 py-2.5 rounded-lg border text-left transition-colors disabled:opacity-60 ${FOCO} ${
        ativo ? 'bg-white/[.06] border-neutral-400' : 'bg-fundo border-linha-forte hover:border-neutral-600'
      }`}
    >
      <span
        className={`grid place-items-center w-4 h-4 mt-px shrink-0 border transition-colors ${multipla ? 'rounded' : 'rounded-full'} ${
          ativo ? 'bg-neutral-50 border-neutral-50' : 'border-neutral-600'
        }`}
        aria-hidden="true"
      >
        {ativo && (multipla
          ? <Check className="w-3 h-3 text-neutral-950" strokeWidth={3} />
          : <span className="w-1.5 h-1.5 rounded-full bg-neutral-950" />)}
      </span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className={`text-[12.5px] font-medium leading-[1.35] break-words ${ativo ? 'text-neutral-50' : 'text-neutral-200'}`}>{rotulo}</span>
        {descricao && <span className="text-[11.5px] leading-[1.4] text-neutral-500 break-words">{descricao}</span>}
      </span>
    </button>
  )
}

function Pergunta({ pergunta, indice, escolha, desabilitado, onAlterar }) {
  const idBase = useId()
  const idTexto = `${idBase}-texto`
  const alternar = (rotulo) => {
    if (!pergunta.multipla) {
      onAlterar({ rotulos: [rotulo], outro: false })
      return
    }
    const marcados = escolha.rotulos.includes(rotulo) ? escolha.rotulos.filter((r) => r !== rotulo) : [...escolha.rotulos, rotulo]
    onAlterar({ rotulos: pergunta.opcoes.map((o) => o.rotulo).filter((r) => marcados.includes(r)) })
  }
  const alternarOutro = () => {
    if (pergunta.multipla) onAlterar({ outro: !escolha.outro })
    else onAlterar({ outro: true, rotulos: [] })
  }
  return (
    <div className="flex flex-col gap-2 min-w-0">
      {(pergunta.cabecalho || pergunta.multipla) && (
        <div className="flex flex-wrap items-center gap-2">
          {pergunta.cabecalho && (
            <span className="px-1.5 py-[2px] rounded border border-linha-forte font-mono text-[10.5px] font-medium uppercase tracking-[.04em] text-neutral-300">
              {pergunta.cabecalho}
            </span>
          )}
          {pergunta.multipla && <span className="text-[11.5px] text-neutral-500">pode marcar mais de uma</span>}
        </div>
      )}
      <p id={`${idBase}-pergunta`} className="m-0 text-[14px] font-medium leading-[1.45] text-neutral-50 break-words">
        <span className="sr-only">Pergunta {indice + 1}: </span>
        {pergunta.pergunta}
      </p>
      <div
        role={pergunta.multipla ? 'group' : 'radiogroup'}
        aria-labelledby={`${idBase}-pergunta`}
        className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      >
        {pergunta.opcoes.map((opcao) => (
          <Opcao
            key={opcao.rotulo}
            rotulo={opcao.rotulo}
            descricao={opcao.descricao}
            multipla={pergunta.multipla}
            ativo={escolha.rotulos.includes(opcao.rotulo)}
            desabilitado={desabilitado}
            onClick={() => alternar(opcao.rotulo)}
          />
        ))}
        <Opcao
          rotulo="Outro"
          descricao="Escrever a minha resposta"
          multipla={pergunta.multipla}
          ativo={escolha.outro}
          desabilitado={desabilitado}
          onClick={alternarOutro}
        />
      </div>
      {escolha.outro && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idTexto} className="sr-only">Sua resposta para: {pergunta.pergunta}</label>
          <textarea
            id={idTexto}
            autoFocus
            rows={2}
            maxLength={4000}
            value={escolha.texto}
            disabled={desabilitado}
            onChange={(e) => onAlterar({ texto: e.target.value })}
            placeholder="Escreva sua resposta"
            className={CLASSE_TEXTAREA}
          />
        </div>
      )}
    </div>
  )
}

function CorpoPergunta({ pendencia, envio, onEnviar }) {
  const perguntas = useMemo(() => perguntasDaEntrada(pendencia.entrada), [pendencia.entrada])
  const [escolhas, setEscolhas] = useState(() => perguntas.map(() => ({ rotulos: [], outro: false, texto: '' })))
  const [recusando, setRecusando] = useState(false)
  const ocupado = Boolean(envio.decisao)
  const respostas = perguntas.map((p, i) => textoDaResposta(p, escolhas[i]))
  const completo = perguntas.length > 0 && respostas.every(Boolean)

  const alterar = (indice, mudanca) => {
    setEscolhas((lista) => lista.map((e, i) => (i === indice ? { ...e, ...mudanca } : e)))
  }

  const responder = () => {
    if (!completo || ocupado) return
    onEnviar({ decisao: 'responder', respostas: Object.fromEntries(perguntas.map((p, i) => [p.pergunta, respostas[i]])) })
  }

  return (
    <>
      {perguntas.length === 0 ? (
        <BlocoCodigo texto={textoJson(pendencia.entrada)} />
      ) : (
        <div className="flex flex-col gap-5">
          {perguntas.map((pergunta, i) => (
            <Pergunta
              key={`${i}-${pergunta.pergunta}`}
              pergunta={pergunta}
              indice={i}
              escolha={escolhas[i]}
              desabilitado={ocupado}
              onAlterar={(mudanca) => alterar(i, mudanca)}
            />
          ))}
        </div>
      )}
      {!recusando && (
        <div className="flex flex-wrap items-center gap-2">
          {perguntas.length > 0 && (
            <button type="button" onClick={responder} disabled={!completo || ocupado} className={BOTAO_PRIMARIO}>
              <Check className="w-4 h-4" aria-hidden="true" />
              {envio.decisao === 'responder' ? 'Enviando…' : 'Responder'}
            </button>
          )}
          <button type="button" onClick={() => setRecusando(true)} disabled={ocupado} className={BOTAO_FANTASMA}>
            Não responder
          </button>
          {perguntas.length > 0 && !completo && (
            <span className="text-[11.5px] text-neutral-500">
              {perguntas.length === 1 ? 'Escolha uma opção para responder.' : 'Responda todas as perguntas para enviar.'}
            </span>
          )}
        </div>
      )}
      {recusando && (
        <Motivo
          rotulo="QUER EXPLICAR? (OPCIONAL)"
          placeholder="Ex.: decida você, siga o padrão do projeto"
          botao="Enviar sem responder"
          enviando={envio.decisao === 'recusar'}
          onEnviar={(mensagem) => onEnviar({ decisao: 'recusar', ...(mensagem ? { mensagem } : {}) })}
          onVoltar={() => setRecusando(false)}
        />
      )}
    </>
  )
}

function AvisoCaminho({ caminho, entrada, projeto }) {
  if (foraDaPasta(caminho, projeto)) {
    return (
      <p className="flex items-start gap-2 m-0 px-3 py-2 rounded-lg border border-[#fbbf24]/25 bg-[#fbbf24]/[.05] text-[12px] leading-[1.45] text-[#fde68a]">
        <TriangleAlert className="w-3.5 h-3.5 mt-px shrink-0 text-[#fbbf24]" aria-hidden="true" />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          Fora da pasta do projeto: <code className="font-mono text-[11px]">{caminho}</code>
        </span>
      </p>
    )
  }
  if (caminho === entrada?.file_path || caminho === entrada?.notebook_path) return null
  return (
    <p className="flex items-start gap-2 m-0 text-[12px] leading-[1.45] text-neutral-400">
      <FileText className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        Arquivo: <code className="font-mono text-[11px] text-neutral-200">{caminho}</code>
      </span>
    </p>
  )
}

function CorpoPermissao({ pendencia, projeto, envio, onEnviar }) {
  const [negando, setNegando] = useState(false)
  const ocupado = Boolean(envio.decisao)
  return (
    <>
      <PreviaPermissao ferramenta={pendencia.ferramenta} entrada={pendencia.entrada} descricao={pendencia.descricao} />
      {pendencia.caminhoBloqueado && (
        <AvisoCaminho caminho={pendencia.caminhoBloqueado} entrada={pendencia.entrada} projeto={projeto} />
      )}
      {!negando && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onEnviar({ decisao: 'permitir' })} disabled={ocupado} className={BOTAO_PRIMARIO}>
            <Check className="w-4 h-4" aria-hidden="true" />
            {envio.decisao === 'permitir' ? 'Enviando…' : 'Permitir'}
          </button>
          {pendencia.permiteSempre && (
            <button type="button" onClick={() => onEnviar({ decisao: 'permitir_sempre' })} disabled={ocupado} className={BOTAO_SECUNDARIO}>
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              {envio.decisao === 'permitir_sempre' ? 'Enviando…' : 'Permitir sempre nesta sessão'}
            </button>
          )}
          <button type="button" onClick={() => setNegando(true)} disabled={ocupado} className={BOTAO_NEGAR}>
            <Ban className="w-4 h-4" aria-hidden="true" />
            Negar
          </button>
        </div>
      )}
      {negando && (
        <Motivo
          rotulo="MOTIVO (OPCIONAL)"
          placeholder="Ex.: não instale nada novo; use o que já existe"
          botao="Negar"
          perigo
          enviando={envio.decisao === 'negar'}
          onEnviar={(mensagem) => onEnviar({ decisao: 'negar', ...(mensagem ? { mensagem } : {}) })}
          onVoltar={() => setNegando(false)}
        />
      )}
    </>
  )
}

function CorpoPlano({ pendencia, envio, onEnviar }) {
  const [ajustando, setAjustando] = useState(false)
  const ocupado = Boolean(envio.decisao)
  const plano = typeof pendencia.entrada?.plan === 'string' ? pendencia.entrada.plan : textoJson(pendencia.entrada)
  return (
    <>
      <div className="px-4 py-3.5 rounded-lg bg-fundo border border-linha">
        <Recolhivel alturaMaxima={420} corFundo={TOM.fundo}>
          <TextoMarkdown texto={plano} className="max-w-[80ch]" />
        </Recolhivel>
      </div>
      {!ajustando && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onEnviar({ decisao: 'aprovar' })} disabled={ocupado} className={BOTAO_PRIMARIO}>
              <Play className="w-4 h-4" aria-hidden="true" />
              {envio.decisao === 'aprovar' ? 'Enviando…' : 'Aprovar e executar'}
            </button>
            <button type="button" onClick={() => onEnviar({ decisao: 'aprovar_editando' })} disabled={ocupado} className={BOTAO_SECUNDARIO}>
              <Zap className="w-4 h-4" aria-hidden="true" />
              {envio.decisao === 'aprovar_editando' ? 'Enviando…' : 'Aprovar e liberar tudo'}
            </button>
            <button type="button" onClick={() => setAjustando(true)} disabled={ocupado} className={BOTAO_FANTASMA}>
              <Pencil className="w-4 h-4" aria-hidden="true" />
              Pedir ajustes
            </button>
          </div>
          <p className="m-0 text-[11.5px] leading-[1.45] text-neutral-500">
            Aprovando, comandos e edições continuam pedindo seu ok aqui; liberando tudo, ele edita e roda comandos sem pedir.
          </p>
        </>
      )}
      {ajustando && (
        <Motivo
          rotulo="O QUE AJUSTAR NO PLANO?"
          placeholder="Ex.: não mexa no banco; comece pelo relatório de outubro"
          botao="Pedir ajustes"
          obrigatorio
          enviando={envio.decisao === 'ajustar'}
          onEnviar={(mensagem) => onEnviar({ decisao: 'ajustar', mensagem })}
          onVoltar={() => setAjustando(false)}
        />
      )}
    </>
  )
}

const CORPOS = { pergunta: CorpoPergunta, permissao: CorpoPermissao, plano: CorpoPlano }

// Pedido aberto do agente (pergunta, confirmação ou plano) com as respostas possíveis. Retorna o <article>.
export default function CartaoPendencia({ pendencia, quem, projeto = null, onRespondida }) {
  const agora = useAgora()
  const idTitulo = useId()
  const titulo = useRef(null)
  const [envio, setEnvio] = useState({ decisao: null, erro: null })
  const tipo = TIPOS_PENDENCIA[pendencia.tipo] ?? TIPOS_PENDENCIA.permissao
  const Corpo = CORPOS[pendencia.tipo] ?? CorpoPermissao
  const { Icone } = tipo

  // Quem chama tira o cartão da tela e cuida do foco e do aviso "Resposta enviada" (onRespondida).
  const enviar = async (resposta) => {
    if (envio.decisao) return
    setEnvio({ decisao: resposta.decisao, erro: null })
    try {
      const atualizada = await api.responderPendencia(pendencia.id, resposta)
      onRespondida?.(atualizada)
    } catch (erro) {
      setEnvio({ decisao: null, erro: mensagemDoErro(erro, 'Não foi possível enviar a resposta.') })
      if (erro?.status === 409 || erro?.status === 404) onRespondida?.(null)
      else titulo.current?.focus()
    }
  }

  return (
    <article
      aria-labelledby={idTitulo}
      data-pendencia={pendencia.id}
      className="flex flex-col gap-4 p-4 sm:p-5 rounded-xl border border-[#fbbf24]/30 bg-superficie-2 min-w-0"
    >
      <div className="flex items-start gap-3">
        <span className="grid place-items-center w-8 h-8 shrink-0 rounded-md" style={{ background: `${COR.ambar}17`, color: COR.ambar }} aria-hidden="true">
          <Icone className="w-4 h-4" />
        </span>
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <h4 ref={titulo} id={idTitulo} tabIndex={-1} className="text-[14px] font-semibold leading-[1.35] text-neutral-50 break-words focus:outline-none">
            {pendencia.titulo}
          </h4>
          <span className="text-[11.5px] text-neutral-400 [overflow-wrap:anywhere]">
            {[quem, tipo.rotulo, pendencia.tipo === 'permissao' ? nomeDaFerramenta(pendencia.ferramenta) : null, tempoRelativo(pendencia.criadaEm, agora)]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
      </div>
      {pendencia.descricao && (
        <p className="m-0 text-[13px] leading-[1.55] text-neutral-300 break-words">{pendencia.descricao}</p>
      )}
      <Corpo pendencia={pendencia} projeto={projeto} envio={envio} onEnviar={enviar} />
      {envio.erro && (
        <p role="alert" className="m-0 text-[11.5px] font-medium" style={{ color: COR.vermelho }}>{envio.erro}</p>
      )}
    </article>
  )
}
