import { RotateCw, TriangleAlert, WifiOff } from 'lucide-react'
import useEscritorio from './hooks/useEscritorio.js'
import Entrar from './pages/Entrar.jsx'
import Escritorio from './pages/Escritorio.jsx'
import LimiteDeErro from './components/comum/LimiteDeErro.jsx'
import Marca from './components/comum/Marca.jsx'
import { BOTAO_PRIMARIO } from './components/comum/classes.js'

function Abrindo() {
  return (
    <div className="grid h-full place-items-center bg-fundo" aria-busy="true">
      <div className="flex items-center gap-3" style={{ animation: 'ctrl-overlay-in .3s ease-out .4s both' }}>
        <Marca className="w-7 h-7" />
        <span className="text-[13px] font-medium text-neutral-400">Abrindo o escritório…</span>
      </div>
    </div>
  )
}

function Aviso({ Icone, titulo, texto, botao, onClick }) {
  return (
    <main className="grid h-full place-items-center overflow-y-auto bg-fundo px-4 py-10">
      <section className="flex flex-col items-start gap-3 w-full max-w-[420px] px-6 py-7 rounded-xl bg-superficie border border-linha">
        <Icone className="w-5 h-5 text-[#f87171]" aria-hidden="true" />
        <h1 className="text-[16px] font-semibold tracking-[-.01em] text-neutral-50 [text-wrap:balance]">{titulo}</h1>
        <p className="m-0 text-[13px] leading-[1.55] text-neutral-400">{texto}</p>
        <button type="button" onClick={onClick} className={`${BOTAO_PRIMARIO} mt-2`}>
          <RotateCw className="w-4 h-4" aria-hidden="true" />
          {botao}
        </button>
      </section>
    </main>
  )
}

// Raiz do app: decide entre entrada, carregamento, falta de conexão e o escritório. Retorna o JSX.
export default function App() {
  const { fase, aviso, estado, conexao, assinar, entrar, sair, tentarDeNovo } = useEscritorio()
  if (fase === 'entrar') return <Entrar aviso={aviso} onEntrar={entrar} />
  if (fase === 'sem_conexao') {
    return (
      <Aviso
        Icone={WifiOff}
        titulo="Sem conexão com o servidor do escritório"
        texto="Confira se o servidor está rodando no computador e, no celular, se você está no mesmo Wi-Fi."
        botao="Tentar de novo"
        onClick={tentarDeNovo}
      />
    )
  }
  if (fase !== 'pronto' || !estado) return <Abrindo />
  return (
    <LimiteDeErro
      alternativa={() => (
        <Aviso
          Icone={TriangleAlert}
          titulo="Algo deu errado nesta tela"
          texto="Os agentes continuam trabalhando no servidor. Recarregue a página para voltar ao escritório."
          botao="Recarregar"
          onClick={() => window.location.reload()}
        />
      )}
    >
      <Escritorio estado={estado} conexao={conexao} assinar={assinar} sair={sair} />
    </LimiteDeErro>
  )
}
