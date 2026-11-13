# Projetos dos agentes

Esta pasta é o único lugar do computador onde os agentes do escritório podem criar e mexer
em arquivos por vontade própria, no modo Vida. Uma subpasta por agente.

O que vale aqui:

- Nada que está aqui é projeto de verdade. Pode apagar a pasta inteira a qualquer momento:
  o escritório recria o que precisar.
- Esta pasta fica dentro de `servidor/` de propósito, e nunca em `~/projects`. Se ela
  estivesse em `~/projects`, o escritório a ofereceria como projeto na hora de criar uma
  ordem, e pior: a varredura de agentes de projeto
  (`<projetos>/*/.claude/agents/*.md`) deixaria um agente escrever a própria definição de
  agente e nascer no escritório. Aqui, nada que um agente escreve vira agente, projeto ou
  skill.
- Ela também não fica dentro de `dados/`, que é onde vivem o banco e a chave de acesso.
- No modo Vida o agente roda com a pasta de trabalho travada nesta subpasta dele, sem
  acesso de leitura a `~/.claude`, a `dados/` nem aos seus projetos, sem rede, sem as
  credenciais do ambiente e sem poder pedir permissão a você. Quatro camadas independentes
  garantem isso, e a de baixo é o sandbox de kernel (bubblewrap), não um `if` do servidor.
- Ela está no `.gitignore`.

Para ver ou limpar o que eles fizeram, sem sair do terminal, use as ferramentas MCP do
escritório: `ler_oficina` e `limpar_oficina`.
