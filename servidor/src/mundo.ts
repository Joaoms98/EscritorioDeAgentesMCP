import type { Decisao, Mundo, Objeto, SituacaoDoEscritorio, Vaga, Verbo } from './tipos.ts'

// O catálogo do escritório: que cômodos existem, que objetos têm neles, onde cabe uma pessoa (vaga) e o que dá para
// querer fazer (verbo). É só dado: o motor da vida nunca cita um móvel pelo nome, então cômodo, objeto ou verbo novo
// entra aqui e funciona sozinho.
//
// O id de uma vaga é, de propósito, a mesma chave de posto que a cena usa para achar o lugar no desenho
// ('mesa:3:sentado', 'lazer:7'): assim o servidor manda o lugar e o navegador já sabe levar o boneco até lá.

// Espelham a arte da cena (web/src/components/escritorio): 4 mesas por fileira, no mínimo 8 mesas,
// 8 lugares sentados no lazer e 6 lugares em pé na copa.
export const MUNDO_COLUNAS = 4
export const MUNDO_MESAS_MINIMAS = 8
export const MUNDO_VAGAS_LAZER = 8
export const MUNDO_VAGAS_COPA = 6
// Sete cadeiras para agentes em volta da mesa de reunião: a oitava, a cabeceira esquerda, é a do humano.
export const MUNDO_VAGAS_REUNIAO = 7
// Onde a sala de reunião começa em x, no referencial do escritório (espelha REUNIAO_X da cena).
const REUNIAO_X = 201
// Mesmos números de caminhos.js: a pessoa anda VELOCIDADE unidades por segundo e leva TEMPO_DE_SENTAR para sentar.
const VELOCIDADE = 55
const TEMPO_DE_SENTAR = 240
const CAMINHADA_MINIMA_MS = 900
const CAMINHADA_MAXIMA_MS = 9000
const LIMITE_DE_FALAS = 4
const LIMITE_DA_FALA = 90

const COMODOS = [
  { id: 'escritorio', nome: 'Escritório', descricao: 'As mesas de trabalho, com monitor, cadeira e o quadro branco.', andavel: true },
  { id: 'lazer', nome: 'Área de lazer', descricao: 'Sofá de frente para a TV, pufes e almofada com videogame, poltrona, fliperama e a copa.', andavel: true },
  { id: 'reuniao', nome: 'Sala de reunião', descricao: 'Mesa comprida de oito lugares, tela de apresentação e flipchart.', andavel: true },
] as const

// Cada lugar do lazer, na ordem em que a cena os numera (lazer:0 é o primeiro).
const LAZER = [
  { objetoId: 'tv', nome: 'Sofá, lugar da ponta esquerda', pose: 'sentado' },
  { objetoId: 'videogame', nome: 'Pufe roxo', pose: 'sentado' },
  { objetoId: 'videogame', nome: 'Pufe verde', pose: 'sentado' },
  { objetoId: 'tv', nome: 'Sofá, lugar da ponta direita', pose: 'sentado' },
  { objetoId: 'tv', nome: 'Poltrona', pose: 'sentado' },
  { objetoId: 'tv', nome: 'Sofá, lugar do meio', pose: 'sentado' },
  { objetoId: 'videogame', nome: 'Almofada no chão', pose: 'sentado' },
  { objetoId: 'fliperama', nome: 'Fliperama', pose: 'costas' },
] as const

const VERBOS: Verbo[] = [
  {
    id: 'ir_para',
    rotulo: 'indo para outro lugar',
    descricao: 'Levantar e ir até um lugar, sem fazer nada especial lá.',
    alvo: 'vaga',
    duracaoMs: [30_000, 180_000],
    reservaAlvo: true,
    precisaAgente: false,
    precisaSandbox: false,
  },
  {
    id: 'usar',
    rotulo: 'usando',
    descricao: 'Ir até um objeto e ficar usando ele: ver TV, jogar videogame ou fliperama, tomar um café na copa.',
    alvo: 'objeto',
    duracaoMs: [90_000, 420_000],
    reservaAlvo: true,
    precisaAgente: false,
    precisaSandbox: false,
  },
  {
    id: 'conversar',
    rotulo: 'conversando',
    descricao: 'Chamar outro agente que esteja livre para uma conversa curta, com as falas já escritas.',
    alvo: 'agente',
    duracaoMs: [60_000, 240_000],
    reservaAlvo: true,
    precisaAgente: false,
    precisaSandbox: false,
  },
  {
    id: 'programar',
    rotulo: 'programando por conta própria',
    descricao: 'Sentar numa mesa e criar algo de verdade na pasta isolada do próprio agente. Só aqui ele mexe em arquivos.',
    alvo: 'objeto',
    duracaoMs: [300_000, 1_200_000],
    reservaAlvo: true,
    precisaAgente: true,
    precisaSandbox: true,
  },
  {
    id: 'nada',
    rotulo: 'parado, pensando',
    descricao: 'Ficar onde está sem fazer nada por um tempo.',
    alvo: 'nenhum',
    duracaoMs: [45_000, 180_000],
    reservaAlvo: false,
    precisaAgente: false,
    precisaSandbox: false,
  },
]

const OBJETOS: Array<Omit<Objeto, 'vagas'>> = [
  { id: 'tv', comodoId: 'lazer', nome: 'TV', descricao: 'Televisão grande na parede; vê-se do sofá e da poltrona.', acao: 'vendo TV', verbos: ['usar', 'ir_para', 'conversar'] },
  { id: 'videogame', comodoId: 'lazer', nome: 'Videogame', descricao: 'Controles nos pufes e na almofada, de frente para a TV.', acao: 'jogando videogame', verbos: ['usar', 'ir_para', 'conversar'] },
  { id: 'fliperama', comodoId: 'lazer', nome: 'Fliperama', descricao: 'Máquina de fliperama; joga-se em pé, um de cada vez.', acao: 'jogando fliperama', verbos: ['usar', 'ir_para'] },
  { id: 'copa', comodoId: 'lazer', nome: 'Copa', descricao: 'Cafeteira e geladeira de bebidas; fica-se em pé por perto.', acao: 'tomando um café', verbos: ['usar', 'ir_para', 'conversar'] },
  { id: 'mesa', comodoId: 'escritorio', nome: 'Mesa de trabalho', descricao: 'Mesa com monitor e cadeira; é onde se programa.', acao: 'na mesa, mexendo em alguma coisa', verbos: ['usar', 'ir_para', 'programar', 'conversar'] },
  { id: 'mesaDeReuniao', comodoId: 'reuniao', nome: 'Mesa de reunião', descricao: 'Mesa comprida de oito lugares.', acao: 'na sala de reunião', verbos: ['usar', 'ir_para', 'conversar'] },
]

// Quantas mesas o escritório tem para essa quantidade de agentes (espelha fileirasPara da cena). Retorna o número.
export function mesasDoMundo(qtdAgentes: number): number {
  const fileiras = Math.max(MUNDO_MESAS_MINIMAS / MUNDO_COLUNAS, Math.ceil(Math.max(0, qtdAgentes) / MUNDO_COLUNAS))
  return fileiras * MUNDO_COLUNAS
}

// Todas as vagas do escritório para essa quantidade de agentes: as duas de cada mesa, as do lazer e as da copa.
// Retorna a lista, com o id igual à chave de posto da cena.
export function vagasDoMundo(qtdAgentes: number): Vaga[] {
  const vagas: Vaga[] = []
  for (let i = 0; i < mesasDoMundo(qtdAgentes); i++) {
    vagas.push({ id: `mesa:${i}:sentado`, comodoId: 'escritorio', objetoId: 'mesa', nome: `Mesa ${i + 1}, na cadeira`, pose: 'sentado' })
    vagas.push({ id: `mesa:${i}:empe`, comodoId: 'escritorio', objetoId: 'mesa', nome: `Mesa ${i + 1}, em pé ao lado`, pose: 'empe' })
  }
  LAZER.forEach((lugar, i) => {
    vagas.push({ id: `lazer:${i}`, comodoId: 'lazer', objetoId: lugar.objetoId, nome: lugar.nome, pose: lugar.pose })
  })
  for (let i = 0; i < MUNDO_VAGAS_COPA; i++) {
    vagas.push({ id: `lazer:${MUNDO_VAGAS_LAZER + i}`, comodoId: 'lazer', objetoId: 'copa', nome: 'Copa, em pé', pose: 'empe' })
  }
  // As cadeiras da reunião existem no catálogo (a cena sabe desenhá-las e a vida sabe medir a caminhada até lá), mas
  // ficam reservadas à convocação do humano: vagasLivres nunca as oferece.
  for (let i = 0; i < MUNDO_VAGAS_REUNIAO; i++) {
    vagas.push({
      id: `reuniao:${i}`,
      comodoId: 'reuniao',
      objetoId: 'mesaDeReuniao',
      nome: `Mesa de reunião, cadeira ${i + 1}`,
      pose: 'sentado',
      soPorConvocacao: true,
    })
  }
  return vagas
}

// O catálogo inteiro para essa quantidade de agentes. Retorna o Mundo.
export function montarMundo(qtdAgentes: number): Mundo {
  const vagas = vagasDoMundo(qtdAgentes)
  const objetos = OBJETOS.map((objeto) => ({ ...objeto, vagas: vagas.filter((vaga) => vaga.objetoId === objeto.id).map((vaga) => vaga.id) }))
  return { comodos: COMODOS.map((comodo) => ({ ...comodo })), objetos, vagas, verbos: VERBOS.map((verbo) => ({ ...verbo })) }
}

export function verboDoMundo(mundo: Mundo, id: string): Verbo | null {
  return mundo.verbos.find((verbo) => verbo.id === id) ?? null
}

export function objetoDoMundo(mundo: Mundo, id: string): Objeto | null {
  return mundo.objetos.find((objeto) => objeto.id === id) ?? null
}

export function vagaDoMundo(mundo: Mundo, id: string): Vaga | null {
  return mundo.vagas.find((vaga) => vaga.id === id) ?? null
}

export function objetoDaVaga(mundo: Mundo, vagaId: string): Objeto | null {
  const vaga = vagaDoMundo(mundo, vagaId)
  return vaga ? objetoDoMundo(mundo, vaga.objetoId) : null
}

export function comodoAndavel(mundo: Mundo, comodoId: string): boolean {
  return mundo.comodos.find((comodo) => comodo.id === comodoId)?.andavel === true
}

// Vagas em que dá para pôr alguém agora: livres, de cômodo andável e, com filtro, que sirvam ao verbo ou ao cômodo.
// Retorna a lista.
export function vagasLivres(mundo: Mundo, ocupadas: ReadonlySet<string>, filtro: { verbo?: string; comodoId?: string; objetoId?: string } = {}): Vaga[] {
  return mundo.vagas.filter((vaga) => {
    if (vaga.soPorConvocacao || ocupadas.has(vaga.id) || !comodoAndavel(mundo, vaga.comodoId)) return false
    if (filtro.comodoId && vaga.comodoId !== filtro.comodoId) return false
    if (filtro.objetoId && vaga.objetoId !== filtro.objetoId) return false
    if (!filtro.verbo) return true
    return objetoDoMundo(mundo, vaga.objetoId)?.verbos.includes(filtro.verbo) === true
  })
}

// Onde a vaga fica no chão, em unidades do mundo, para medir distância. Retorna [x, y].
function pontoDaVaga(mundo: Mundo, vagaId: string): [number, number] | null {
  const mesa = /^mesa:(\d+):/.exec(vagaId)
  if (mesa) {
    const i = Number(mesa[1])
    return [18 + (i % MUNDO_COLUNAS) * 92 + 14, 26 + Math.floor(i / MUNDO_COLUNAS) * 80 + 25]
  }
  const lazer = /^lazer:(\d+)$/.exec(vagaId)
  if (lazer) {
    const i = Number(lazer[1])
    const pontos: Array<[number, number]> = [
      [104, 31], [40, 34], [45, 62], [104, 69], [102, 107], [104, 50], [25, 89], [139, 22],
      [21, 110], [44, 118], [23, 134], [68, 126], [46, 140], [90, 134],
    ]
    const ponto = pontos[Math.min(i, pontos.length - 1)]!
    return [ponto[0], ponto[1] + inicioDaFrente(mundo)]
  }
  const reuniao = /^reuniao:(\d+)$/.exec(vagaId)
  if (reuniao) {
    // Meio do assento de cada cadeira da convocação, no referencial do cômodo (espelha vagaDaReuniao da cena).
    const pontos: Array<[number, number]> = [[58, 39], [90, 39], [122, 39], [58, 108], [90, 108], [122, 108], [148, 73]]
    const ponto = pontos[Math.min(Number(reuniao[1]), pontos.length - 1)]!
    return [ponto[0] + REUNIAO_X, ponto[1] + inicioDaFrente(mundo)]
  }
  return null
}

// Onde a faixa da frente (lazer e sala de reunião) começa, no referencial do escritório: espelha inicioDoLazer da cena.
function inicioDaFrente(mundo: Mundo): number {
  const fileiras = Math.max(2, mundo.vagas.filter((vaga) => vaga.objetoId === 'mesa').length / 2 / MUNDO_COLUNAS)
  return 26 + fileiras * 80 - 10 + 5
}

// Quanto tempo o boneco leva andando de uma vaga até a outra, mais ou menos. Retorna os milissegundos.
export function estimarCaminhadaMs(mundo: Mundo, deVagaId: string | null, paraVagaId: string): number {
  const de = deVagaId ? pontoDaVaga(mundo, deVagaId) : null
  const para = pontoDaVaga(mundo, paraVagaId)
  if (!de || !para) return 3000
  const distancia = Math.abs(para[0] - de[0]) + Math.abs(para[1] - de[1])
  const ms = (distancia / VELOCIDADE) * 1000 + TEMPO_DE_SENTAR * 2
  return Math.round(Math.min(CAMINHADA_MAXIMA_MS, Math.max(CAMINHADA_MINIMA_MS, ms)))
}

// A vaga pode ser escolhida por quem tem vida própria? Só se o cômodo é andável e ela não está reservada ao humano.
export function podeSerEscolhida(mundo: Mundo, vaga: Vaga): boolean {
  return !vaga.soPorConvocacao && comodoAndavel(mundo, vaga.comodoId)
}

// Quantas vagas do objeto o agente pode escolher (0 na mesa de reunião, que é só por convocação do humano).
export function lugaresAbertos(mundo: Mundo, objeto: Pick<Objeto, 'vagas'>): number {
  return objeto.vagas.filter((id) => {
    const vaga = vagaDoMundo(mundo, id)
    return vaga !== null && podeSerEscolhida(mundo, vaga)
  }).length
}

// O objeto está aberto a quem tem vida própria? Só se tem alguma vaga que ele pode escolher.
export function objetoAberto(mundo: Mundo, objeto: Pick<Objeto, 'vagas'>): boolean {
  return lugaresAbertos(mundo, objeto) > 0
}

// O catálogo em texto, do jeito que vai no prompt da rodada: cômodos, objetos e verbos, sem repetir as vagas uma a uma.
// Só entra o que o agente pode escolher: objeto sem nenhuma vaga livre para ele (a mesa de reunião, que é só por
// convocação) fica de fora, e cômodo que sobrou sem objeto nenhum nem aparece. Retorna o texto.
export function catalogoParaPrompt(mundo: Mundo): string {
  const linhas: string[] = ['CÔMODOS E OBJETOS']
  for (const comodo of mundo.comodos) {
    if (!comodo.andavel) continue
    const objetos = mundo.objetos
      .filter((item) => item.comodoId === comodo.id)
      .map((objeto) => ({ objeto, quantas: lugaresAbertos(mundo, objeto) }))
      .filter((item) => item.quantas > 0)
    if (objetos.length === 0) continue
    linhas.push(`- ${comodo.nome} (${comodo.id}): ${comodo.descricao}`)
    for (const { objeto, quantas } of objetos) {
      linhas.push(`  - ${objeto.nome} (${objeto.id}): ${objeto.descricao} Cabem ${quantas} ${quantas === 1 ? 'pessoa' : 'pessoas'}. Verbos: ${objeto.verbos.join(', ')}.`)
    }
  }
  linhas.push('', 'O QUE DÁ PARA QUERER')
  for (const verbo of mundo.verbos) {
    const alvo = { objeto: 'escolha um objeto', vaga: 'escolha uma vaga livre', agente: 'escolha outro agente livre', nenhum: 'sem alvo' }[verbo.alvo]
    linhas.push(`- ${verbo.id}: ${verbo.descricao} (${alvo}; dura de ${Math.round(verbo.duracaoMs[0] / 1000)} a ${Math.round(verbo.duracaoMs[1] / 1000)} segundos)`)
  }
  return linhas.join('\n')
}

// O formato exato que a resposta do modelo tem que ter, montado a partir do catálogo: verbo, objeto e vaga só podem
// ser os que existem. Retorna o JSON Schema.
export function esquemaDasDecisoes(mundo: Mundo): Record<string, unknown> {
  const andaveis = mundo.vagas.filter((vaga) => podeSerEscolhida(mundo, vaga)).map((vaga) => vaga.id)
  return {
    type: 'object',
    additionalProperties: false,
    required: ['decisoes'],
    properties: {
      decisoes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['agenteId', 'verbo', 'motivo'],
          properties: {
            agenteId: { type: 'string', description: 'O id do agente que está decidindo, tal como veio na lista.' },
            verbo: { type: 'string', enum: mundo.verbos.map((verbo) => verbo.id) },
            objetoId: { type: ['string', 'null'], enum: [...mundo.objetos.map((objeto) => objeto.id), null] },
            vagaId: { type: ['string', 'null'], enum: [...andaveis, null] },
            comId: { type: ['string', 'null'], description: 'Com quem conversar: o id de um agente livre.' },
            assunto: { type: ['string', 'null'], description: 'Sobre o que é a conversa, em poucas palavras.' },
            duracaoSegundos: { type: ['number', 'null'], description: 'Quanto tempo quer ficar nisso.' },
            motivo: { type: 'string', description: 'Uma frase curta, na primeira pessoa, dizendo por que quer isso.' },
            falas: {
              type: 'array',
              maxItems: LIMITE_DE_FALAS,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['agenteId', 'texto'],
                properties: {
                  agenteId: { type: 'string' },
                  texto: { type: 'string', description: `No máximo ${LIMITE_DA_FALA} caracteres.` },
                },
              },
            },
            tarefa: { type: ['string', 'null'], description: 'Só para programar: o que ele quer criar, em uma ou duas frases.' },
          },
        },
      },
    },
  }
}

type DecisaoBruta = {
  agenteId?: unknown
  verbo?: unknown
  objetoId?: unknown
  vagaId?: unknown
  comId?: unknown
  assunto?: unknown
  duracaoSegundos?: unknown
  motivo?: unknown
  falas?: unknown
  tarefa?: unknown
}

const texto = (valor: unknown, limite: number): string | null => {
  const t = typeof valor === 'string' ? valor.trim() : ''
  return t ? t.slice(0, limite) : null
}

// Confere uma decisão do modelo contra o catálogo e a situação. Retorna a Decisao pronta, ou o motivo da recusa.
export function validarDecisao(
  mundo: Mundo,
  situacao: SituacaoDoEscritorio,
  bruta: DecisaoBruta,
  ocupadas: ReadonlySet<string>,
): Decisao | { recusa: string } {
  const agenteId = texto(bruta.agenteId, 100)
  const naSituacao = situacao.lote.find((item) => item.agenteId === agenteId)
  if (!agenteId || !naSituacao) return { recusa: 'agente_fora_do_lote' }
  const verbo = verboDoMundo(mundo, texto(bruta.verbo, 40) ?? '')
  if (!verbo) return { recusa: 'verbo_desconhecido' }
  if (!naSituacao.verbosPermitidos.includes(verbo.id)) return { recusa: 'verbo_nao_permitido' }
  const motivo = texto(bruta.motivo, 200) ?? verbo.rotulo

  let objetoId: string | null = null
  let vagaId: string | null = null
  if (verbo.alvo !== 'nenhum') {
    const vaga = texto(bruta.vagaId, 60)
    const objeto = texto(bruta.objetoId, 60)
    if (objeto) {
      const encontrado = objetoDoMundo(mundo, objeto)
      if (!encontrado) return { recusa: 'objeto_desconhecido' }
      if (!encontrado.verbos.includes(verbo.id)) return { recusa: 'objeto_nao_aceita_o_verbo' }
      if (!comodoAndavel(mundo, encontrado.comodoId)) return { recusa: 'comodo_fechado' }
      // A mesa de reunião é do humano: ele convoca quem senta nela, ninguém se convida.
      if (!objetoAberto(mundo, encontrado)) return { recusa: 'objeto_so_por_convocacao' }
      objetoId = encontrado.id
    }
    if (vaga) {
      const encontrada = vagaDoMundo(mundo, vaga)
      if (!encontrada) return { recusa: 'vaga_desconhecida' }
      if (encontrada.soPorConvocacao) return { recusa: 'vaga_so_por_convocacao' }
      if (!comodoAndavel(mundo, encontrada.comodoId)) return { recusa: 'comodo_fechado' }
      if (objetoId && encontrada.objetoId !== objetoId) return { recusa: 'vaga_de_outro_objeto' }
      if (ocupadas.has(encontrada.id)) return { recusa: 'vaga_ocupada' }
      vagaId = encontrada.id
      objetoId = objetoId ?? encontrada.objetoId
    } else if (objetoId) {
      const livre = vagasLivres(mundo, ocupadas, { objetoId, verbo: verbo.id })[0]
      if (!livre) return { recusa: 'objeto_lotado' }
      vagaId = livre.id
    } else {
      return { recusa: 'sem_alvo' }
    }
  }

  let comId: string | null = null
  if (verbo.alvo === 'agente') {
    comId = texto(bruta.comId, 100)
    const parceiro = comId ? situacao.lote.find((item) => item.agenteId === comId) : null
    if (!comId || comId === agenteId || !parceiro) return { recusa: 'parceiro_invalido' }
    // Na mesma rodada os dois estão 'escolhendo': quem é chamado para conversar ainda está livre.
    if (parceiro.estado !== 'ocioso' && parceiro.estado !== 'escolhendo') return { recusa: 'parceiro_ocupado' }
  }

  if (verbo.precisaAgente && !texto(bruta.tarefa, 600)) return { recusa: 'sem_tarefa' }

  const pedida = typeof bruta.duracaoSegundos === 'number' && Number.isFinite(bruta.duracaoSegundos) ? bruta.duracaoSegundos * 1000 : null
  const duracaoMs = Math.round(Math.min(verbo.duracaoMs[1], Math.max(verbo.duracaoMs[0], pedida ?? (verbo.duracaoMs[0] + verbo.duracaoMs[1]) / 2)))

  const falas = Array.isArray(bruta.falas) ? bruta.falas.slice(0, LIMITE_DE_FALAS) : []
  const planejadas = falas
    .map((fala, i) => {
      const dona = texto((fala as { agenteId?: unknown })?.agenteId, 100) ?? agenteId
      const conteudo = texto((fala as { texto?: unknown })?.texto, LIMITE_DA_FALA)
      const conhecida = dona === agenteId || dona === comId
      return conteudo && conhecida ? { agenteId: dona, texto: conteudo, emMs: 500 + i * 3500 } : null
    })
    .filter((fala) => fala !== null)

  return {
    agenteId,
    verbo: verbo.id,
    objetoId,
    vagaId,
    comId,
    assunto: texto(bruta.assunto, 120),
    duracaoMs,
    motivo,
    falas: planejadas,
    tarefa: verbo.precisaAgente ? texto(bruta.tarefa, 600) : null,
  }
}
