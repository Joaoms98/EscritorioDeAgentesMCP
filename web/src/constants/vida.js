import { Circle, Coffee, Footprints, Gamepad2, Hammer, MessageSquare, Moon, Sparkles, Tv } from 'lucide-react'

// Ícone de cada vontade. O rótulo do que o agente está fazendo vem pronto do servidor (vida.rotulo), então um verbo
// novo no catálogo já aparece na tela; só o desenho cai no ícone de reserva até alguém escolher um.
export const ICONES_DA_VIDA = {
  ir_para: Footprints,
  usar: Sparkles,
  conversar: MessageSquare,
  programar: Hammer,
  nada: Moon,
}

// Ícone mais específico quando dá para saber pelo objeto: o café da copa, o controle do videogame, a TV.
const ICONES_POR_OBJETO = {
  copa: Coffee,
  videogame: Gamepad2,
  fliperama: Gamepad2,
  tv: Tv,
}

// O ícone que representa o que o agente está fazendo agora. Retorna o componente do ícone (nunca null).
export function iconeDaVida(vida) {
  if (!vida) return Circle
  if (vida.verbo === 'usar' && ICONES_POR_OBJETO[vida.objetoId]) return ICONES_POR_OBJETO[vida.objetoId]
  return ICONES_DA_VIDA[vida.verbo] ?? Circle
}

// A frase que o leitor de tela ouve sobre a vida do agente ('tomando um café na copa'). Retorna o texto, ou ''.
export function fraseDaVida(vida) {
  if (!vida?.rotulo) return ''
  if (vida.estado === 'indo') return `indo ${vida.rotulo}`
  return vida.rotulo
}
