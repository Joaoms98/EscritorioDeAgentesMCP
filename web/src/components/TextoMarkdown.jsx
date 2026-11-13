import { Suspense, lazy } from 'react'
import './textoMarkdown.css'

const MarkdownRenderizado = lazy(() => import('./MarkdownRenderizado.jsx'))

// Markdown do agente no tema escuro (GFM; HTML cru vira texto; links em outra aba). Retorna o JSX.
export default function TextoMarkdown({ texto, compacto = false, className = '' }) {
  return (
    <div className={`texto-md ${compacto ? 'texto-md-compacto' : ''} ${className}`}>
      <Suspense fallback={<p className="whitespace-pre-wrap">{texto ?? ''}</p>}>
        <MarkdownRenderizado texto={texto ?? ''} />
      </Suspense>
    </div>
  )
}
