import { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, Smartphone, X } from 'lucide-react'
import { COR } from '../../constants/estados.js'
import useAviso from '../../hooks/useAviso.js'
import { api } from '../../services/api.js'
import { foiCancelado, mensagemDoErro } from '../../utils/erros.js'
import AvisoAoVivo from '../comum/AvisoAoVivo.jsx'
import Gaveta from '../comum/Gaveta.jsx'
import RotuloSecao from '../comum/RotuloSecao.jsx'
import { BOTAO_FECHAR, BOTAO_SECUNDARIO, CLASSE_CAMPO, CLASSE_ROTULO } from '../comum/classes.js'

// Margem branca em volta do QR, em módulos (a câmera precisa dela para achar o código).
const MARGEM = 4

// Por que não há link para o celular, em palavras.
const SEM_LINK = {
  'so-local': 'O escritório está aceitando conexões só deste computador, então o celular não alcança. Suba de novo sem a variável ESCRITORIO_HOST (ou com ESCRITORIO_HOST=0.0.0.0) para liberar a rede local.',
  'sem-rede': 'Este computador não está em nenhuma rede agora: conecte o Wi-Fi (ou o cabo) e abra esta janela de novo.',
}

function CodigoQr({ qr }) {
  const lado = qr.tamanho + MARGEM * 2
  return (
    <svg
      viewBox={`${-MARGEM} ${-MARGEM} ${lado} ${lado}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code com o link do escritório para o celular"
      className="w-[min(240px,70vw)] h-auto rounded-lg"
    >
      <rect x={-MARGEM} y={-MARGEM} width={lado} height={lado} fill="#ffffff" />
      <path d={qr.caminho} fill="#0b0b0c" />
    </svg>
  )
}

// Copia o link: pela área de transferência quando o navegador deixa (localhost ou https), senão selecionando o campo.
async function copiarLink(texto, campo) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(texto)
    return true
  }
  campo?.select()
  return document.execCommand?.('copy') ?? false
}

// Gaveta "Abrir no celular": QR do link do escritório na rede local (já com a chave), o link para copiar
// e o que conferir se o celular não abrir. Retorna o JSX.
export default function DrawerCelular({ onFechar }) {
  const idTitulo = useId()
  const idLink = useId()
  const refFechar = useRef(null)
  const refCampo = useRef(null)
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const [copiado, setCopiado] = useState(false)
  const [aviso, avisar] = useAviso()

  useEffect(() => {
    const controle = new AbortController()
    api.celular({ sinal: controle.signal }).then(setDados, (e) => {
      if (!foiCancelado(e)) setErro(mensagemDoErro(e, 'Não foi possível buscar o link do celular.'))
    })
    return () => controle.abort()
  }, [])

  useEffect(() => {
    if (!copiado) return undefined
    const id = window.setTimeout(() => setCopiado(false), 2000)
    return () => window.clearTimeout(id)
  }, [copiado])

  const copiar = async (evento) => {
    const botao = evento.currentTarget
    try {
      if (await copiarLink(dados.link, refCampo.current)) {
        setCopiado(true)
        avisar('Link copiado.')
      }
      // Copiar pela seleção tira o foco do botão; sem devolver, o leitor de tela fica lendo o campo.
      botao.focus()
    } catch {
      refCampo.current?.select()
    }
  }

  return (
    <Gaveta idTitulo={idTitulo} onFechar={onFechar} refFocoInicial={refFechar}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <span className={CLASSE_ROTULO}>CELULAR</span>
          <h2 id={idTitulo} className="m-0 text-[19px] font-semibold leading-[1.3] tracking-[-.015em] text-neutral-50 [text-wrap:balance]">
            Abrir o escritório no celular
          </h2>
        </div>
        <button ref={refFechar} type="button" onClick={onFechar} aria-label="Fechar" className={BOTAO_FECHAR}>
          <X className="w-4 h-4 fino:sm:w-3.5 fino:sm:h-3.5" aria-hidden="true" />
        </button>
      </div>

      {erro && (
        <p role="alert" className="m-0 text-[12.5px] font-medium" style={{ color: COR.vermelho }}>{erro}</p>
      )}

      {!dados && !erro && (
        <p role="status" className="m-0 text-[12.5px] text-neutral-400">Buscando o link…</p>
      )}

      {dados && !dados.link && (
        <p className="m-0 text-[13px] leading-[1.55] text-neutral-400">{SEM_LINK[dados.motivo] ?? SEM_LINK['sem-rede']}</p>
      )}

      {dados?.link && (
        <>
          <div className="flex flex-col items-center gap-4 px-4 py-6 rounded-xl bg-fundo border border-linha">
            <CodigoQr qr={dados.qr} />
            <p className="m-0 flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-200">
              <Smartphone className="w-4 h-4 shrink-0 text-neutral-500" aria-hidden="true" />
              Aponte a câmera do celular para o código
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <RotuloSecao htmlFor={idLink}>LINK (JÁ COM A CHAVE DE ACESSO)</RotuloSecao>
            <div className="flex items-center gap-2">
              <input
                ref={refCampo}
                id={idLink}
                type="text"
                readOnly
                value={dados.link}
                onFocus={(e) => e.target.select()}
                className={`${CLASSE_CAMPO} font-mono`}
              />
              <button type="button" onClick={copiar} className={`${BOTAO_SECUNDARIO} shrink-0`}>
                {copiado ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <AvisoAoVivo texto={aviso} />
            {dados.outros.length > 0 && (
              <p className="m-0 text-[11.5px] leading-[1.5] text-neutral-500 break-all">
                Outras redes deste computador: {dados.outros.map((url) => new URL(url).host).join(', ')}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-4 border-t border-linha text-[12.5px] leading-[1.55] text-neutral-400">
            <RotuloSecao>NÃO ABRIU NO CELULAR?</RotuloSecao>
            <ul className="m-0 pl-4 flex flex-col gap-1 list-disc marker:text-neutral-600">
              <li>O celular precisa estar no mesmo Wi-Fi deste computador (não nos dados móveis).</li>
              <li>
                Se o firewall deste computador estiver ligado, rode <code className="px-1 py-px rounded bg-white/[.06] font-mono text-[11.5px] text-neutral-200">./subir.sh</code> na
                pasta do escritório: ele libera a porta só para a sua rede.
              </li>
              <li>Wi-Fi de visitante costuma isolar os aparelhos; use a rede principal.</li>
            </ul>
            <p className="m-0 text-[11.5px] text-neutral-500">
              Quem tiver esse link entra no escritório: mostre o código só para os seus aparelhos.
            </p>
          </div>
        </>
      )}
    </Gaveta>
  )
}
