// Caixa no mundo: x e y no chão, z para cima. Retorna { x1, y1, z1, x2, y2, z2 }.
export const caixa = (x1, y1, z1, x2, y2, z2) => ({ x1, y1, z1, x2, y2, z2 })

export const deslocarCaixa = (c, dx, dy) => caixa(c.x1 + dx, c.y1 + dy, c.z1, c.x2 + dx, c.y2 + dy, c.z2)

// Retângulo que a caixa ocupa na tela do palco de origem o (a mesma projeção de P3). Retorna { x1, y1, x2, y2 }.
export function caixaNaTela(o, c) {
  return {
    x1: o[0] + (c.x1 - c.y2) * 0.866,
    x2: o[0] + (c.x2 - c.y1) * 0.866,
    y1: o[1] + (c.x1 + c.y1) * 0.5 - c.z2,
    y2: o[1] + (c.x2 + c.y2) * 0.5 - c.z1,
  }
}

const FOLGA = 0.01
// Peças até esta altura são do chão (tapete, soleira): quem anda pisa nelas.
const ALTURA_DO_CHAO = 1

// Quem vem antes na pintura: -1 = a fica atrás de b, 1 = a fica na frente, 0 = as caixas se cruzam, null = separadas em
// sentidos opostos no chão (uma mais para +x, a outra mais para +y): na tela uma nunca cobre a outra, então tanto faz.
// Vale o plano que separa as duas: quem olha está do lado de +x, +y e +z.
export function relacao(a, b) {
  const aAtras = a.x2 <= b.x1 + FOLGA || a.y2 <= b.y1 + FOLGA
  const bAtras = b.x2 <= a.x1 + FOLGA || b.y2 <= a.y1 + FOLGA
  if (aAtras && bAtras) return null
  if (aAtras || a.z2 <= b.z1 + FOLGA) return -1
  if (bAtras || b.z2 <= a.z1 + FOLGA) return 1
  return 0
}

const sobrepoem = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2
const fundo = (c) => c.x1 + c.x2 + c.y1 + c.y2

function posicaoEntrePecas(pecas, andante) {
  let atras = -1
  for (let j = 0; j < pecas.length; j++) {
    const peca = pecas[j]
    if (!peca.caixa || !sobrepoem(peca.tela, andante.tela)) continue
    const r = relacao(peca.caixa, andante.caixa)
    if (r === null) continue
    if (r === 0 && peca.assento) return j + 1
    const ficaAtras = r < 0 || (r === 0 && (peca.caixa.z2 <= ALTURA_DO_CHAO || fundo(peca.caixa) <= fundo(andante.caixa)))
    if (ficaAtras) atras = j
  }
  return atras + 1
}

// Encaixa quem anda entre as peças fixas, que já vêm na ordem do pintor (de trás para a frente).
// pecas: [{ caixa, tela, assento? }]; andantes: [{ caixa, tela }], todos com caixas do mesmo tamanho e tela = caixaNaTela
// do corpo inteiro. Só contam as peças que dividem a tela com o andante; dentro de uma cadeira, a pessoa fica logo depois
// do assento. Entre dois andantes que dividem a tela, o de trás (menor x + y) nunca fica numa posição depois da do outro.
// Retorna, para cada andante, o índice da peça antes da qual ele é desenhado (pecas.length = por cima de tudo); na mesma
// posição, quem desenha deve ir do menor para o maior x + y.
export function encaixarAndantes(pecas, andantes) {
  const posicoes = andantes.map((andante) => posicaoEntrePecas(pecas, andante))
  const ordem = andantes.map((_, i) => i).sort((a, b) => fundo(andantes[a].caixa) - fundo(andantes[b].caixa))
  for (let k = 1; k < ordem.length; k++) {
    const i = ordem[k]
    for (let m = 0; m < k; m++) {
      const j = ordem[m]
      if (posicoes[j] > posicoes[i] && sobrepoem(andantes[i].tela, andantes[j].tela)) posicoes[i] = posicoes[j]
    }
  }
  return posicoes
}
