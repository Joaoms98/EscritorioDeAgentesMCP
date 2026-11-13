const MINUTO = 60_000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const HORA_MINUTO = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const HORA_SEGUNDO = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const DIA_MES = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const DIA_DA_SEMANA = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })

export const TITULO_CUSTO = 'Estimativa a preço de tabela'

// Número com a palavra no singular ou no plural. Retorna a string ("1 agente", "3 agentes").
export function plural(n, singular, varios) {
  return `${n} ${n === 1 ? singular : varios}`
}

// Instante ISO em milissegundos. Retorna o número ou null.
export function emMs(iso) {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

// Quanto tempo faz: "agora", "há 4 min", "há 2 h", "há 3 dias". Retorna a string.
export function tempoRelativo(iso, agora = Date.now()) {
  const ms = emMs(iso)
  if (ms === null) return '—'
  const passou = Math.max(0, agora - ms)
  if (passou < MINUTO) return 'agora'
  if (passou < HORA) return `há ${Math.floor(passou / MINUTO)} min`
  if (passou < DIA) return `há ${Math.floor(passou / HORA)} h`
  return `há ${plural(Math.floor(passou / DIA), 'dia', 'dias')}`
}

// Tempo curto para chips: "agora", "4m", "2h", "3d". Retorna a string.
export function tempoCurto(iso, agora = Date.now()) {
  const ms = emMs(iso)
  if (ms === null) return '—'
  const passou = Math.max(0, agora - ms)
  if (passou < MINUTO) return 'agora'
  if (passou < HORA) return `${Math.floor(passou / MINUTO)}m`
  if (passou < DIA) return `${Math.floor(passou / HORA)}h`
  return `${Math.floor(passou / DIA)}d`
}

// Duração legível: "45s", "2m 13s", "1h 05m". Retorna a string ou "—".
export function duracao(ms) {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—'
  const segundos = Math.max(0, Math.round(ms / 1000))
  if (segundos < 60) return `${segundos}s`
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `${minutos}m ${String(segundos % 60).padStart(2, '0')}s`
  return `${Math.floor(minutos / 60)}h ${String(minutos % 60).padStart(2, '0')}m`
}

// Custo em dólar no formato brasileiro ("US$ 0,42"). Retorna a string ou "—".
export function custo(usd) {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return '—'
  return MOEDA.format(usd)
}

// Custo estimado pelo SDK, que não é cobrança de verdade ("≈ US$ 0,42"). Retorna a string ou "—".
export function custoAproximado(usd) {
  const valor = custo(usd)
  return valor === '—' ? valor : `≈ ${valor}`
}

// Último pedaço de um caminho ("/home/eu/projects/app" -> "app"). Retorna a string ou "—".
export function nomeDoCaminho(caminho) {
  if (!caminho) return '—'
  const partes = String(caminho).replace(/[\\/]+$/, '').split(/[\\/]/)
  return partes[partes.length - 1] || String(caminho)
}

// Dia e hora: "29/10 às 14:32". Retorna a string ou "—".
export function dataHora(iso) {
  const ms = emMs(iso)
  if (ms === null) return '—'
  return `${DIA_MES.format(ms)} às ${HORA_MINUTO.format(ms)}`
}

// Hora do dia, com ou sem segundos. Retorna a string ou "—".
export function hora(iso, { segundos = false } = {}) {
  const ms = emMs(iso)
  if (ms === null) return '—'
  return (segundos ? HORA_SEGUNDO : HORA_MINUTO).format(ms)
}

function inicioDoDia(ms) {
  const dia = new Date(ms)
  dia.setHours(0, 0, 0, 0)
  return dia.getTime()
}

// Quando o limite renova ("às 14:00", "amanhã às 09:00", "em 02/11 (seg.) às 14:00"). Retorna a string ou null se já passou.
export function quandoRenova(iso, agora = Date.now()) {
  const ms = emMs(iso)
  if (ms === null || ms <= agora) return null
  const dias = Math.round((inicioDoDia(ms) - inicioDoDia(agora)) / DIA)
  if (dias === 0) return `às ${HORA_MINUTO.format(ms)}`
  if (dias === 1) return `amanhã às ${HORA_MINUTO.format(ms)}`
  return `em ${DIA_MES.format(ms)} (${DIA_DA_SEMANA.format(ms)}) às ${HORA_MINUTO.format(ms)}`
}

// Contagem grande em pt-BR ("812", "12,4 mil", "1,2 mi"). Retorna a string ou "—".
export function numeroCompacto(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  if (n < 1000) return String(Math.round(n))
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace('.', ',').replace(',0', '')} mil`
  return `${(n / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} mi`
}

// Fração de uso do servidor (0 a 1; passa de 1 quando a conta estoura o limite) presa entre 0 e 1. Retorna o número ou null.
export function fracaoDeUso(valor) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return null
  return Math.min(1, Math.max(0, valor))
}

// Primeira letra em maiúscula, para avatares. Retorna a string ("?" sem nome).
export function inicialDe(nome) {
  const letra = String(nome ?? '').trim().charAt(0)
  return letra ? letra.toUpperCase() : '?'
}

// Texto com a primeira letra em maiúscula ("max" -> "Max"). Retorna a string.
export function capitalizar(texto) {
  if (!texto) return ''
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}
