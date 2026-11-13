// Clareia (k > 1) ou escurece (k < 1) uma cor hex. Retorna a cor em rgb().
export function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const r = n >> 16
  const g = (n >> 8) & 255
  const b = n & 255
  const m = k > 1 ? (c) => Math.round(c + (255 - c) * (k - 1)) : (c) => Math.round(c * k)
  return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')'
}

// Projeta um ponto 3D (X, Y no chão, Z altura) a partir da origem o. Retorna "x,y" pronto para o points do SVG.
export function P3(o, X, Y, Z) {
  return (o[0] + (X - Y) * 0.866).toFixed(1) + ',' + (o[1] + (X + Y) * 0.5 - Z).toFixed(1)
}

// Projeta um ponto do chão a partir da origem o. Retorna [x, y] em pixels do palco.
export function isoPt(o, X, Y) {
  return [o[0] + (X - Y) * 0.866, o[1] + (X + Y) * 0.5]
}

// Origem de um cômodo cujo canto (0, 0) fica em (X, Y) do mundo. Retorna a nova origem [x, y].
export function deslocar(o, X, Y) {
  return [o[0] + (X - Y) * 0.866, o[1] + (X + Y) * 0.5]
}

// Monta um bloco de w x d x h com a cor c. Retorna os 3 polígonos visíveis (topo, frente e lateral).
export function cub(o, X, Y, Z, w, d, h, c) {
  const T = Z + h
  return [
    { pontos: [P3(o, X, Y, T), P3(o, X + w, Y, T), P3(o, X + w, Y + d, T), P3(o, X, Y + d, T)].join(' '), cor: shadeHex(c, 1.18) },
    { pontos: [P3(o, X, Y + d, Z), P3(o, X + w, Y + d, Z), P3(o, X + w, Y + d, T), P3(o, X, Y + d, T)].join(' '), cor: shadeHex(c, 0.82) },
    { pontos: [P3(o, X + w, Y, Z), P3(o, X + w, Y + d, Z), P3(o, X + w, Y + d, T), P3(o, X + w, Y, T)].join(' '), cor: shadeHex(c, 0.6) },
  ]
}

// Face vertical na profundidade Y, de X1 a X2. Retorna 1 polígono.
export function faceY(o, X1, X2, Y, Z1, Z2, c) {
  return { pontos: [P3(o, X1, Y, Z1), P3(o, X2, Y, Z1), P3(o, X2, Y, Z2), P3(o, X1, Y, Z2)].join(' '), cor: c }
}

// Face vertical na posição X, de Y1 a Y2. Retorna 1 polígono.
export function faceX(o, X, Y1, Y2, Z1, Z2, c) {
  return { pontos: [P3(o, X, Y1, Z1), P3(o, X, Y2, Z1), P3(o, X, Y2, Z2), P3(o, X, Y1, Z2)].join(' '), cor: c }
}

// Retângulo deitado no chão (ou numa altura Z). Retorna 1 polígono.
export function chao(o, X1, Y1, X2, Y2, c, Z = 0) {
  return { pontos: [P3(o, X1, Y1, Z), P3(o, X2, Y1, Z), P3(o, X2, Y2, Z), P3(o, X1, Y2, Z)].join(' '), cor: c }
}

// Junta o estilo de animação a uma lista de polígonos. Retorna a lista nova.
export function animar(poligonos, animacao, atraso = '0s') {
  return poligonos.map((p) => ({ ...p, animacao, atraso }))
}
