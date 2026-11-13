import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SERVIDOR = `http://localhost:${process.env.ESCRITORIO_PORTA ?? 41793}`
const RAIZ = resolve(import.meta.dirname, '..')

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Sem isto o Vite serve a raiz do workspace inteira pelo /@fs/, inclusive dados/chave e o banco, para qualquer um na rede.
    fs: {
      allow: [import.meta.dirname, resolve(RAIZ, 'node_modules')],
      deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', `${resolve(RAIZ, 'dados')}/**`],
    },
    proxy: {
      '/api': {
        target: SERVIDOR,
        changeOrigin: false,
        // Se o servidor cair no meio do SSE, o proxy não fecha a conexão do navegador e o EventSource fica mudo.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            proxyRes.on('close', () => {
              if (!res.writableEnded) res.destroy()
            })
          })
        },
      },
      '/mcp': { target: SERVIDOR, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
