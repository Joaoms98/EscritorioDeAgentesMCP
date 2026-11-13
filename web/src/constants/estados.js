import {
  Activity, Ban, Check, CircleAlert, CircleX, ClipboardList, Coffee, FilePen, Flag, Hourglass, ListChecks,
  LoaderCircle, MessageCircleQuestion, MessageSquare, Power, PowerOff, Reply, ShieldCheck, ShieldQuestion, Square,
  TriangleAlert, Users, Wrench, X, Zap,
} from 'lucide-react'

export const COR = {
  verde: '#34d399',
  ambar: '#fbbf24',
  vermelho: '#f87171',
  azul: '#60a5fa',
  violeta: '#a78bfa',
  cinza: '#71717a',
  inativo: '#3f3f46',
  tinta: '#0b0b0c',
}

// Tons de cinza do resto da tela. Fora da cena só o que pede atenção (âmbar) e o erro (vermelho) têm cor.
export const CINZA = {
  forte: '#fafafa',
  claro: '#d4d4d4',
  medio: '#a3a3a3',
  apagado: '#737373',
  escuro: '#525252',
}

// Estado do agente na cena e na equipe, na ordem de prioridade do servidor. urgente = pede a atenção do humano.
// As cores são as da cena do escritório (balões e legenda): mudar aqui muda a cena.
export const ESTADOS_AGENTE = {
  aguardando: { rotulo: 'Precisa de você', curto: 'Precisa de você', cor: COR.ambar, Icone: CircleAlert, urgente: true },
  trabalhando: { rotulo: 'Trabalhando', curto: 'Trabalhando', cor: COR.azul, Icone: LoaderCircle, urgente: false },
  na_fila: { rotulo: 'Na fila', curto: 'Na fila', cor: COR.violeta, Icone: Hourglass, urgente: false },
  erro: { rotulo: 'Terminou com erro', curto: 'Com erro', cor: COR.vermelho, Icone: X, urgente: true },
  interrompida: { rotulo: 'Ordem interrompida', curto: 'Interrompido', cor: COR.cinza, Icone: PowerOff, urgente: false },
  concluiu: { rotulo: 'Concluiu a ordem', curto: 'Concluiu', cor: COR.verde, Icone: Check, urgente: false },
  livre: { rotulo: 'Livre', curto: 'Livre', cor: COR.cinza, Icone: Coffee, urgente: false },
}

export const ORDEM_DOS_ESTADOS = ['aguardando', 'trabalhando', 'na_fila', 'erro', 'interrompida', 'concluiu', 'livre']

export const STATUS_ORDEM = {
  na_fila: { rotulo: 'Na fila', cor: CINZA.medio, Icone: Hourglass, rodando: false, final: false },
  trabalhando: { rotulo: 'Trabalhando', cor: CINZA.forte, Icone: LoaderCircle, rodando: true, final: false },
  aguardando: { rotulo: 'Aguardando você', cor: COR.ambar, Icone: CircleAlert, rodando: true, final: false },
  concluida: { rotulo: 'Concluída', cor: CINZA.claro, Icone: Check, rodando: false, final: true },
  erro: { rotulo: 'Erro', cor: COR.vermelho, Icone: X, rodando: false, final: true },
  parada: { rotulo: 'Parada por você', cor: CINZA.apagado, Icone: Square, rodando: false, final: true },
  interrompida: { rotulo: 'Interrompida', cor: CINZA.apagado, Icone: PowerOff, rodando: false, final: true },
  cancelada: { rotulo: 'Cancelada', cor: CINZA.escuro, Icone: Ban, rodando: false, final: true },
}

// Modos de permissão que o painel oferece (o servidor aceita só estes três).
export const MODOS = [
  {
    id: 'default',
    rotulo: 'Pedir confirmação',
    descricao: 'Comandos e edições esperam seu ok aqui no painel',
    Icone: ShieldCheck,
  },
  {
    id: 'bypassPermissions',
    rotulo: 'Automático',
    descricao: 'Edita arquivos e roda comandos no terminal sem pedir; perguntas dele continuam chegando aqui',
    Icone: Zap,
  },
  {
    id: 'plan',
    rotulo: 'Só planejar',
    descricao: 'Investiga e apresenta um plano para você aprovar antes de mexer',
    Icone: ClipboardList,
  },
]

// Fora da escolha de novas ordens, mas as ordens antigas (e as do MCP) ainda podem ter este modo.
const MODO_ACEITAR_EDICOES = {
  id: 'acceptEdits',
  rotulo: 'Aceitar edições',
  descricao: 'Edita arquivos sem perguntar; comandos ainda pedem ok',
  Icone: FilePen,
}

export const MODO_POR_ID = Object.fromEntries([...MODOS, MODO_ACEITAR_EDICOES].map((m) => [m.id, m]))

export const TIPOS_PENDENCIA = {
  permissao: { rotulo: 'Confirmação', Icone: ShieldQuestion },
  pergunta: { rotulo: 'Pergunta', Icone: MessageCircleQuestion },
  plano: { rotulo: 'Plano para aprovar', Icone: ClipboardList },
}

export const TIPOS_EVENTO = {
  sistema: { rotulo: 'Sistema', Icone: Power, cor: CINZA.escuro },
  texto: { rotulo: 'Mensagem', Icone: MessageSquare, cor: CINZA.medio },
  ferramenta: { rotulo: 'Ferramenta', Icone: Wrench, cor: CINZA.apagado },
  resultado_ferramenta: { rotulo: 'Falha de ferramenta', Icone: TriangleAlert, cor: COR.vermelho },
  status: { rotulo: 'Status', Icone: Activity, cor: CINZA.apagado },
  todos: { rotulo: 'Tarefas', Icone: ListChecks, cor: CINZA.apagado },
  subagente: { rotulo: 'Subagente', Icone: Users, cor: CINZA.apagado },
  pendencia: { rotulo: 'Pedido ao humano', Icone: CircleAlert, cor: COR.ambar },
  resposta: { rotulo: 'Sua resposta', Icone: Reply, cor: CINZA.claro },
  erro: { rotulo: 'Erro', Icone: CircleX, cor: COR.vermelho },
  resultado: { rotulo: 'Resultado', Icone: Flag, cor: CINZA.forte },
}

export const STATUS_TODO = {
  pendente: { rotulo: 'Pendente', cor: CINZA.escuro },
  andamento: { rotulo: 'Em andamento', cor: CINZA.forte },
  feito: { rotulo: 'Feito', cor: CINZA.medio },
}
