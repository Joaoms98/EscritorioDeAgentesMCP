// Balão com o que o agente acabou de dizer, logo acima da cabeça dele. É enfeite: o texto também vai para a
// lista de falas que o leitor de tela acompanha. Retorna o JSX.
export default function BalaoFala({ texto, ponto }) {
  return (
    <span
      aria-hidden="true"
      className="esc-fala absolute z-[26] -translate-x-1/2 max-w-[190px] px-2.5 py-1.5 rounded-xl bg-neutral-50 text-[11.5px] font-semibold leading-[1.35] text-neutral-900 shadow-[0_8px_20px_rgba(0,0,0,.45)] pointer-events-none"
      style={{ left: ponto.x, top: ponto.y }}
    >
      {texto}
      <span aria-hidden="true" className="absolute left-1/2 -bottom-[3px] w-2.5 h-2.5 -translate-x-1/2 rotate-45 bg-neutral-50" />
    </span>
  )
}
