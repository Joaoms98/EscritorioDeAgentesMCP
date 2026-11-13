// Tela monocromática: branco para a ação principal e o foco, cinzas para o resto. Cor só para atenção, erro e estado.
export const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70'

// Os mesmos valores dos tokens do Tailwind, para o que precisa da cor em JS (o degradê do Recolhivel, a borda do avatar).
export const TOM = {
  fundo: '#0a0a0a',
  superficie: '#111111',
  superficie2: '#161616',
}

// Campos com 16px no toque (o Safari do iPhone dá zoom ao focar abaixo disso); compactos só com mouse, a partir de sm.
export const CLASSE_CAMPO = 'w-full min-w-0 px-3 py-2 rounded-md bg-fundo border border-linha-forte text-[16px] fino:sm:text-[12.5px] font-medium text-neutral-100 placeholder:text-neutral-600 transition-colors hover:border-neutral-700 focus:outline-none focus:border-neutral-400 focus:ring-2 focus:ring-white/10 disabled:opacity-60'

export const CLASSE_TEXTAREA = `${CLASSE_CAMPO} resize-y leading-[1.5]`

const BASE_BOTAO = 'inline-flex items-center justify-center gap-1.5 min-h-[40px] fino:sm:min-h-[34px] rounded-md text-[12.5px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

export const BOTAO_PRIMARIO = `${BASE_BOTAO} px-3.5 bg-neutral-50 text-neutral-950 font-semibold hover:bg-neutral-200 ctrl-press disabled:hover:bg-neutral-50 ${FOCO} focus-visible:ring-offset-2 focus-visible:ring-offset-fundo`

export const BOTAO_SECUNDARIO = `${BASE_BOTAO} px-3 border border-linha-forte font-medium text-neutral-200 hover:bg-white/[.04] hover:border-neutral-700 ${FOCO}`

export const BOTAO_FANTASMA = `${BASE_BOTAO} px-3 font-medium text-neutral-400 hover:text-neutral-100 hover:bg-white/[.04] ${FOCO}`

export const BOTAO_NEGAR = `${BASE_BOTAO} px-3 border border-[#f87171]/40 font-medium text-[#f87171] hover:bg-[#f87171]/10 hover:border-[#f87171]/60 ${FOCO}`

export const BOTAO_FECHAR = `grid place-items-center w-10 h-10 fino:sm:w-[30px] fino:sm:h-[30px] shrink-0 rounded-md text-neutral-500 transition-colors hover:bg-white/[.06] hover:text-neutral-100 ${FOCO}`

// Link de texto ("Ver tudo", "Mostrar os mais antigos"): branco sublinhado, sem cor de marca.
export const BOTAO_LINK = `self-start inline-flex items-center gap-1 min-h-[32px] px-1 -ml-1 rounded-md text-[12px] font-medium text-neutral-300 underline decoration-neutral-600 underline-offset-[3px] transition-colors hover:text-neutral-50 hover:decoration-neutral-300 ${FOCO}`

export const CLASSE_ROTULO = 'font-mono text-[10.5px] font-medium uppercase tracking-[.06em] text-neutral-500'

export const CLASSE_SECAO = 'flex flex-col gap-4 px-5 pt-[18px] pb-5 rounded-xl bg-superficie border border-linha'

// Linha de lista dentro de um contêiner com divisórias (o contêiner tem a borda; a linha só muda o fundo no hover).
export const CLASSE_LINHA = `flex items-center gap-3 w-full px-3.5 py-3 text-left transition-colors hover:bg-white/[.03] ${FOCO} focus-visible:ring-inset`

export const CLASSE_LISTA = 'flex flex-col rounded-lg border border-linha divide-y divide-linha overflow-hidden'

// Caixa de alerta de erro com "Tentar de novo".
export const CLASSE_ERRO = 'flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-[#f87171]/25 bg-[#f87171]/[.05]'

export const BOTAO_PEQUENO = `px-2.5 py-1 min-h-[32px] rounded-md border border-linha-forte text-[11.5px] font-medium text-neutral-200 transition-colors hover:bg-white/[.04] ${FOCO}`
