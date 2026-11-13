import { lerConfig } from '../servidor/src/config.ts'
import { linksDoBanner, redeDoCelular, textoDosLinks } from '../servidor/src/links.ts'

// O que o subir.sh precisa saber do escritório sem ligar o servidor (mesmas variáveis ESCRITORIO_* que ele):
//   node scripts/links.mjs links  -> os links e o QR do celular, como no banner
//   node scripts/links.mjs local  -> só o link deste computador (com a chave), para abrir o navegador
//   node scripts/links.mjs rede   -> a rede local do celular (ex.: 192.168.0.0/24), para liberar no firewall; vazio se não houver
//   node scripts/links.mjs porta  -> a porta configurada
//   node scripts/links.mjs sondar -> quem está na porta: nosso (este escritório), outra-chave, ocupada ou livre
const comando = process.argv[2] ?? 'links'

let config
try {
  config = lerConfig()
} catch (erro) {
  console.error(`Erro: ${erro instanceof Error ? erro.message : String(erro)}`)
  process.exit(1)
}

const links = linksDoBanner(config, config.porta, process.env.ESCRITORIO_URL_WEB ?? null)
const LOCAIS = new Set(['0.0.0.0', '::', '127.0.0.1', '::1', 'localhost'])

// Quem está atendendo na porta: o nosso escritório (a chave entra), outro escritório (401 com a nossa chave),
// outro programa qualquer, ou ninguém. Retorna a palavra.
async function sondar() {
  const host = LOCAIS.has(config.host) ? '127.0.0.1' : config.host.includes(':') ? `[${config.host}]` : config.host
  try {
    const resposta = await fetch(`http://${host}:${config.porta}/api/estado`, {
      headers: { authorization: `Bearer ${config.token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
    })
    if (resposta.status === 401) return 'outra-chave'
    if (!resposta.ok) return 'ocupada'
    const dados = await resposta.json().catch(() => null)
    return dados?.servidor?.versao ? 'nosso' : 'ocupada'
  } catch {
    return 'livre'
  }
}

if (comando === 'local') console.log(links.local)
else if (comando === 'rede') console.log(redeDoCelular(config.host) ?? '')
else if (comando === 'porta') console.log(config.porta)
else if (comando === 'links') console.log(textoDosLinks(links))
else if (comando === 'sondar') console.log(await sondar())
else {
  console.error(`Comando desconhecido: ${comando}. Use links, local, rede, porta ou sondar.`)
  process.exit(2)
}
