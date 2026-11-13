import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

// Servidor MCP em processo que cada sessão de agente recebe. Retorna a config para options.mcpServers.
export function criarFerramentas(aoStatus: (texto: string) => void, versao = '1.0.0'): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: 'escritorio',
    version: versao,
    alwaysLoad: true,
    tools: [
      tool(
        'informar_status',
        'Mostra no painel do Escritório de Agentes, em uma frase curta, o que você está fazendo agora. Use nas etapas importantes.',
        { texto: z.string().min(1).max(200).describe('O que você está fazendo agora, em uma frase curta') },
        async ({ texto }) => {
          aoStatus(texto)
          return { content: [{ type: 'text', text: 'Status mostrado no painel.' }] }
        },
      ),
    ],
  })
}
