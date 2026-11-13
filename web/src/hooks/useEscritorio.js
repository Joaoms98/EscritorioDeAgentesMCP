import { useCallback, useEffect, useRef, useState } from 'react'
import { abrirEventos, api } from '../services/api.js'
import { EVENTO_SEM_SESSAO } from '../utils/erros.js'

// O token do link (?t=) sai da URL antes do primeiro render, para não ficar no histórico nem em capturas de tela.
const TOKEN_DO_LINK = (() => {
  const url = new URL(window.location.href)
  const token = url.searchParams.get('t')
  if (token === null) return null
  url.searchParams.delete('t')
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  return token.trim() || null
})()

const ENTRADA_PELO_LINK = TOKEN_DO_LINK
  ? api.entrar(TOKEN_DO_LINK).then(() => null, (erro) => erro)
  : Promise.resolve(null)

const ESPERA_MAXIMA_MS = 15_000

const AVISO_SESSAO = 'A sessão terminou. Entre de novo com a chave do escritório.'
const AVISO_LINK = 'A chave do link não confere mais. Use o link ou o QR code mais recente do terminal.'

function comAgente(estado, agente) {
  const indice = estado.agentes.findIndex((a) => a.id === agente.id)
  const agentes = estado.agentes.slice()
  if (indice === -1) agentes.push(agente)
  else agentes[indice] = agente
  return { ...estado, agentes }
}

// Escritório ao vivo (entrada, estado, SSE e assinaturas). Retorna { fase, estado, conexao, assinar, ... }.
export default function useEscritorio() {
  const [fase, setFase] = useState('carregando')
  const [aviso, setAviso] = useState(null)
  const [estado, setEstado] = useState(null)
  const [conexao, setConexao] = useState('conectando')
  const [tentativa, setTentativa] = useState(0)
  const ouvintes = useRef(new Set())

  const perderSessao = useCallback((mensagem) => {
    setEstado(null)
    setAviso(mensagem)
    setFase('entrar')
  }, [])

  useEffect(() => {
    const aoPerder = () => perderSessao(AVISO_SESSAO)
    window.addEventListener(EVENTO_SEM_SESSAO, aoPerder)
    return () => window.removeEventListener(EVENTO_SEM_SESSAO, aoPerder)
  }, [perderSessao])

  useEffect(() => {
    if (fase !== 'carregando') return undefined
    const controle = new AbortController()
    ENTRADA_PELO_LINK.then(async (erroDoLink) => {
      if (controle.signal.aborted) return
      try {
        const novo = await api.estado({ sinal: controle.signal })
        setEstado(novo)
        setConexao('conectando')
        setFase('pronto')
      } catch (erro) {
        if (controle.signal.aborted) return
        if (erro?.status === 401) perderSessao(erroDoLink?.status === 401 ? AVISO_LINK : null)
        else setFase('sem_conexao')
      }
    })
    return () => controle.abort()
  }, [fase, tentativa, perderSessao])

  useEffect(() => {
    if (fase !== 'pronto') return undefined
    let ativo = true
    let fechar = null
    let timer = null
    let falhas = 0

    const aoEvento = (evento) => {
      if (evento.tipo === 'estado') setEstado(evento.dados)
      else if (evento.tipo === 'agente') setEstado((atual) => (atual ? comAgente(atual, evento.dados) : atual))
      else if (evento.tipo === 'conta') setEstado((atual) => (atual ? { ...atual, conta: evento.dados } : atual))
      // A fala não entra no estado: ela é passageira e vai direto para quem assina (a cena).
      else if (evento.tipo === 'vida') setEstado((atual) => (atual ? { ...atual, vida: evento.dados } : atual))
      else if (evento.tipo === 'reuniao') setEstado((atual) => (atual ? { ...atual, reuniao: evento.dados } : atual))
      for (const ouvinte of ouvintes.current) ouvinte(evento)
    }

    const abrir = () => {
      fechar = abrirEventos(aoEvento, (situacao) => {
        if (!ativo) return
        if (situacao === 'aovivo') {
          falhas = 0
          setConexao('aovivo')
          return
        }
        fechar?.()
        fechar = null
        setConexao('reconectando')
        agendar()
      })
    }

    const sondar = async () => {
      timer = null
      try {
        const novo = await api.estado()
        if (!ativo) return
        setEstado(novo)
        abrir()
      } catch (erro) {
        if (!ativo) return
        if (erro?.status === 401) perderSessao(AVISO_SESSAO)
        else agendar()
      }
    }

    // O EventSource desiste de vez numa resposta de erro (502 do proxy, 401): a reconexão fica aqui.
    function agendar() {
      if (timer) return
      timer = setTimeout(sondar, Math.min(1000 * 2 ** falhas, ESPERA_MAXIMA_MS))
      falhas += 1
    }

    const aoVoltar = () => {
      if (document.visibilityState !== 'visible' || fechar || !timer) return
      clearTimeout(timer)
      timer = null
      falhas = 0
      sondar()
    }

    abrir()
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('online', aoVoltar)
    return () => {
      ativo = false
      fechar?.()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('online', aoVoltar)
    }
  }, [fase, perderSessao])

  const assinar = useCallback((ouvinte) => {
    ouvintes.current.add(ouvinte)
    return () => {
      ouvintes.current.delete(ouvinte)
    }
  }, [])

  const entrar = useCallback(async (token) => {
    await api.entrar(token)
    setAviso(null)
    setFase('carregando')
    setTentativa((n) => n + 1)
  }, [])

  const sair = useCallback(async () => {
    try {
      await api.sair()
    } catch (erro) {
      console.warn('Falha ao sair do escritório:', erro)
    }
    perderSessao(null)
  }, [perderSessao])

  const tentarDeNovo = useCallback(() => {
    setFase('carregando')
    setTentativa((n) => n + 1)
  }, [])

  return { fase, aviso, estado, conexao, assinar, entrar, sair, tentarDeNovo }
}
