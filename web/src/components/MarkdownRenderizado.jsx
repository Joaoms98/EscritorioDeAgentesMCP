import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const PLUGINS = [remarkGfm]

const COMPONENTES = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
  table: ({ node: _node, ...props }) => (
    <div className="texto-md-tabela">
      <table {...props} />
    </div>
  ),
  img: ({ src, alt }) => (src ? <a href={src} target="_blank" rel="noreferrer">{alt || 'Imagem'}</a> : null),
}

// react-markdown com GFM, num pedaço separado do bundle (carrega na primeira vez que aparece markdown). Retorna o JSX.
export default function MarkdownRenderizado({ texto }) {
  return (
    <Markdown remarkPlugins={PLUGINS} components={COMPONENTES}>
      {texto}
    </Markdown>
  )
}
