import { CLASSE_ROTULO } from './classes.js'

// Rótulo em versalete das seções (vira <label> quando aponta para um campo). Retorna o JSX.
export default function RotuloSecao({ children, htmlFor, id }) {
  const Tag = htmlFor ? 'label' : 'span'
  return (
    <Tag htmlFor={htmlFor} id={id} className={CLASSE_ROTULO}>
      {children}
    </Tag>
  )
}
