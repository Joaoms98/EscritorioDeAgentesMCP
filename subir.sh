#!/usr/bin/env bash
# Sobe o Escritório de Agentes neste computador e deixa o celular entrar pela rede local.
#
#   ./subir.sh                  monta a tela, libera o celular no firewall, liga o servidor e abre o navegador
#                               (fica rodando neste terminal; Ctrl+C desliga)
#   ./subir.sh --fundo          o mesmo, com o servidor em segundo plano (log em dados/servidor.log)
#   ./subir.sh --parar          desliga o escritório que estiver no ar
#   ./subir.sh --sem-navegador  não abre o navegador (combina com as outras)
#
# O QR para o celular aparece aqui no terminal e no botão "Celular" da tela. Se o escritório já estiver no ar,
# o script só mostra os links e o QR de novo. Aceita as mesmas variáveis ESCRITORIO_* do servidor (porta, dados...).
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
set -euo pipefail

RAIZ="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
cd "$RAIZ"

if [ "${ESCRITORIO_SIMULADO:-}" = 1 ]; then DADOS="${ESCRITORIO_DADOS:-$RAIZ/dados/simulado}"; else DADOS="${ESCRITORIO_DADOS:-$RAIZ/dados}"; fi
LOG="$DADOS/servidor.log"
TRAVA="$DADOS/servidor.trava"
# Lembra a rede e a porta já liberadas no firewall, para não pedir a senha toda vez.
LIBERADO="$DADOS/.celular-liberado"
MODO=aqui
NAVEGADOR=1
PORTA=""

if [ -t 1 ]; then NEGRITO=$'\033[1m'; NORMAL=$'\033[0m'; else NEGRITO=''; NORMAL=''; fi
falar() { printf '%s%s%s\n' "$NEGRITO" "$*" "$NORMAL"; }
morrer() { printf 'Erro: %s\n' "$*" >&2; exit 1; }

# O texto de ajuda é o próprio cabeçalho deste arquivo: tudo que vem depois do shebang até a primeira linha de código.
ajuda() {
  sed -n '2,/^[^#]/p' "$RAIZ/subir.sh" | sed '$d; s/^# \{0,1\}//'
}

conferir_node() {
  command -v node >/dev/null 2>&1 || morrer "não achei o Node. Instale o Node 24 ou mais novo (https://nodejs.org) e rode de novo."
  command -v npm >/dev/null 2>&1 || morrer "não achei o npm (ele vem junto com o Node)."
  local versao
  versao="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$versao" -ge 24 ] || morrer "o escritório precisa do Node 24 ou mais novo, e este é o $(node -v)."
}

instalar_dependencias() {
  if [ -f node_modules/.package-lock.json ] && [ ! package-lock.json -nt node_modules/.package-lock.json ]; then return 0; fi
  falar "Instalando as dependências (só na primeira vez ou quando elas mudam)…"
  npm install --no-audit --no-fund
  touch node_modules/.package-lock.json
}

# Lê a porta e confere a configuração (chave, caminhos) antes de montar a tela, para falhar cedo e com mensagem clara.
conferir_config() {
  PORTA="$(node scripts/links.mjs porta)" || exit 1
  [ "$PORTA" != 0 ] || morrer "ESCRITORIO_PORTA=0 pede ao sistema uma porta qualquer, e aí este script não sabe onde achar o escritório. Escolha uma porta fixa, por exemplo 41793."
  node scripts/links.mjs local >/dev/null || exit 1
}

# Quem está atendendo na porta: nosso, outra-chave, ocupada ou livre.
quem_esta_na_porta() {
  node scripts/links.mjs sondar 2>/dev/null || echo livre
}

# Espera a porta responder (até 30 s). Com um PID, desiste antes se esse processo morrer.
esperar_no_ar() {
  local pid="${1:-}" vez
  for vez in $(seq 1 120); do
    [ "$(quem_esta_na_porta)" = livre ] || return 0
    if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then return 1; fi
    sleep 0.25
  done
  return 1
}

# Com o ufw ligado, libera a porta só para a rede local do celular (pede a senha do sudo uma vez por rede).
liberar_celular() {
  command -v ufw >/dev/null 2>&1 || return 0
  grep -qs '^ENABLED=yes' /etc/ufw/ufw.conf || return 0
  local rede resposta
  rede="$(node scripts/links.mjs rede)"
  [ -n "$rede" ] || return 0
  [ "$(cat "$LIBERADO" 2>/dev/null)" = "$rede $PORTA" ] && return 0
  local comando="sudo ufw allow from $rede to any port $PORTA proto tcp"
  echo
  falar "O firewall deste computador (ufw) está ligado e pode barrar o celular."
  echo "Vou liberar a porta $PORTA só para a sua rede local ($rede): quem está fora dela continua sem entrar."
  if [ ! -t 0 ]; then
    echo "Para liberar, rode: $comando"
    return 0
  fi
  read -r -p "Liberar agora? Vai pedir a sua senha do sudo. [S/n] " resposta || resposta=n
  case "${resposta,,}" in
    n | nao | não)
      echo "Tudo bem. Para liberar depois: $comando"
      return 0
      ;;
  esac
  if sudo ufw allow from "$rede" to any port "$PORTA" proto tcp comment 'Escritorio de Agentes'; then
    ( umask 077; mkdir -p "$DADOS" )
    printf '%s %s\n' "$rede" "$PORTA" >"$LIBERADO"
    falar "Pronto: o celular já pode entrar."
  else
    echo "Não consegui liberar no firewall. O escritório sobe mesmo assim; para tentar de novo: $comando" >&2
  fi
}

montar_tela() {
  falar "Montando a tela…"
  npm run build -w web --silent >/dev/null || morrer "não consegui montar a tela. Rode npm run build -w web para ver o erro."
}

abrir_navegador() {
  [ "$NAVEGADOR" = 1 ] || return 0
  [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] || return 0
  command -v xdg-open >/dev/null 2>&1 || return 0
  nohup xdg-open "$1" >/dev/null 2>&1 </dev/null &
}

mostrar_links() {
  node scripts/links.mjs links
  echo
  echo "  Para desligar: ./subir.sh --parar"
}

subir_aqui() {
  local link
  link="$(node scripts/links.mjs local)"
  # Abre o navegador assim que o servidor responder; o banner dele já mostra os links e o QR. O "$$" vira o node
  # no exec abaixo: se a subida falhar, este acompanhante morre junto em vez de ficar consultando a porta sozinho.
  (esperar_no_ar "$$" && abrir_navegador "$link") &
  exec node servidor/src/index.ts
}

subir_no_fundo() {
  # umask fechado: a pasta de dados nasce 0700 e o log, que leva a chave nos links, 0600.
  ( umask 077; mkdir -p "$DADOS"; : >>"$LOG" )
  falar "Ligando o escritório em segundo plano (log em $LOG)…"
  local antes
  antes="$(stat -c %s "$LOG" 2>/dev/null || echo 0)"
  # setsid: sem uma sessão própria, fechar o terminal (ou o script ser o primeiro processo dele) derruba o servidor junto.
  setsid nohup node servidor/src/index.ts >>"$LOG" 2>&1 </dev/null &
  local pid=$!
  disown "$pid" 2>/dev/null || true
  if ! esperar_no_ar "$pid"; then
    echo "O escritório não subiu. O que ele disse:" >&2
    tail -c "+$((antes + 1))" "$LOG" | tail -n 20 >&2
    exit 1
  fi
  echo
  falar "O escritório está no ar (PID $pid)."
  mostrar_links
  abrir_navegador "$(node scripts/links.mjs local)"
}

# O processo é mesmo este escritório? (a trava pode ser velha e o número ter caído em outro programa)
eh_o_escritorio() {
  local pid="$1" cmd dono
  cmd="$(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null)" || return 1
  case "$cmd" in *index.ts*) ;; *) return 1 ;; esac
  dono="$(readlink -f "/proc/$pid/cwd" 2>/dev/null)" || return 1
  case "$dono" in "$RAIZ" | "$RAIZ"/*) return 0 ;; *) return 1 ;; esac
}

parar() {
  local pid vez
  pid="$( { tr -dc '0-9' <"$TRAVA"; } 2>/dev/null || true)"
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    if [ "$(quem_esta_na_porta)" != livre ]; then
      morrer "tem algo respondendo na porta $PORTA, mas não achei o processo do escritório em $TRAVA."
    fi
    echo "Não tem escritório no ar."
    return 0
  fi
  if ! eh_o_escritorio "$pid"; then
    falar "A trava em $TRAVA ficou de um servidor antigo (o PID $pid hoje é de outro programa). Apaguei a trava e não mexi nesse programa."
    rm -f "$TRAVA"
    return 0
  fi
  falar "Desligando o escritório (PID $pid)…"
  kill -TERM "$pid"
  for vez in $(seq 1 60); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "Desligado."
      return 0
    fi
    sleep 0.25
  done
  morrer "o escritório (PID $pid) não desligou em 15 segundos."
}

for argumento in "$@"; do
  case "$argumento" in
    --fundo) MODO=fundo ;;
    --parar) MODO=parar ;;
    --sem-navegador) NAVEGADOR=0 ;;
    -h | --ajuda | --help)
      ajuda
      exit 0
      ;;
    *) morrer "opção desconhecida: $argumento (veja ./subir.sh --ajuda)." ;;
  esac
done

[ "$(id -u)" -ne 0 ] || morrer "não rode com sudo: o script só pede a senha na hora de liberar o firewall, se precisar."
conferir_node
conferir_config
if [ "$MODO" = parar ]; then
  parar
  exit 0
fi
instalar_dependencias
liberar_celular
case "$(quem_esta_na_porta)" in
  nosso)
    echo
    falar "O escritório já está no ar."
    mostrar_links
    abrir_navegador "$(node scripts/links.mjs local)"
    exit 0
    ;;
  outra-chave)
    morrer "a porta $PORTA já tem um escritório com outra chave (outra pasta de dados). Feche-o, ou escolha outra porta com ESCRITORIO_PORTA."
    ;;
  ocupada)
    morrer "a porta $PORTA já está ocupada por outro programa. Feche-o, ou escolha outra porta com ESCRITORIO_PORTA."
    ;;
esac
montar_tela
if [ "$MODO" = fundo ]; then subir_no_fundo; else subir_aqui; fi
