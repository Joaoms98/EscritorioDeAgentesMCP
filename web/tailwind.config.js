/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Escala monocromática da tela: o texto usa a neutral do Tailwind; estes são o fundo, as superfícies e as linhas.
        fundo: '#0a0a0a',
        superficie: { DEFAULT: '#111111', 2: '#161616', 3: '#1c1c1c' },
        linha: { DEFAULT: '#1f1f1f', forte: '#2c2c2c' },
        // Tokens antigos do Kalfehub: só a cena do escritório (CenaEscritorio) ainda usa, e ela fica como está.
        kalfe: {
          black: '#000000',
          dark: '#1a1a1a',
          'gray-dark': '#2d2d2d',
          gray: '#4a4a4a',
          'gray-light': '#6b6b6b',
          orange: '#60a5fa',
          'orange-dark': '#3b82f6',
          white: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [
    // fino: (mouse) deixa alvos e campos compactos; celular deitado passa de sm. Screen com objeto desligaria o max-[…]:.
    ({ addVariant }) => addVariant('fino', '@media (pointer: fine)'),
  ],
}
