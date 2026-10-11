# Changelog

## v1.2.0 (2026-10-10)

- **O Crivo vale para todos os projetos:** os ganchos saíram do `.claude/settings.local.json` do happy-team-chat e foram para o `~/.claude/settings.json`.
  - A aba filtra por projeto e mostra o projeto de cada prompt e comando.
  - Painel "Projetos": cada projeto aparece no primeiro gancho, e lá dá para desligar o Crivo nele (os ganchos respondem `{}` e não gravam nada).
  - A descrição que a Jev recebe vem do README do projeto (título e primeiro parágrafo, ignorando README de template). Dá para escrever outra na aba; sem README, vai o nome da pasta.
  - A área de teste escolhe o projeto e julga com a mesma descrição do gancho.
  - Nova rota `POST /api/crivo/projetos` e filtro `GET /api/crivo?origem=`.
- **Notificações do Claude Code:** `<task-notification>` (comando em segundo plano terminou) e `<agent-message` (relatório de subagente) chegam ao gancho como se fossem prompts. Agora passam sem a Jev, como "notificação", e não quebram a regra da resposta ao Claude. Antes, dois relatórios de subagente tinham sido barrados.

## v1.1.0 (2026-10-10)

- **Aba Crivo:** o Crivo deixou de ser um app separado (`~/Projects/crivo`, porta 4000) e virou uma aba do ICEWALL, com o histórico git das etapas 1–3.
  - Portão de entrada com a Jev (passa, pede para o Claude perguntar antes ou barra) e portão de saída que registra comandos e arquivos.
  - Ganchos em `/api/crivo/hooks/{prompt,tool}`, protegidos pelo header `x-icewall` e pela checagem de origem.
  - Dados no `icewall.db` (31 prompts e 285 comandos importados do `crivo.db`).
  - Custo da Jev do Crivo somado no Auditor.
  - Guia em `docs/crivo/README.md`.

## v1.0.1 (2026-10-10)

- **Recomendações que não saíam do painel:** "Verificar o Spark agora" (Auditor) relê segurança, updates e SO antes de auditar; antes só refazia as recomendações com o retrato antigo. A coleta de segurança passou de 1 h para 15 min, e o Auditor mostra quando o Spark foi lido.
- **Login por senha no SSH:** passa a ser medido por uma tentativa de login sem chave a partir desta máquina (sem enviar senha), não só pelo grep nos arquivos do sshd. Isso pega configuração sem reload.
- **Portas de container:** a recomendação não sugere mais o ufw, que o Docker ignora. Ela traz a regra na chain `DOCKER-USER` liberando só o IP desta máquina, ou a publicação em 127.0.0.1.
- **Serviço do systemd:** `deploy/icewall.service`, unidade de usuário que sobe no boot (com linger) e reinicia se cair. O guia de operação está em `deploy/README.md`.

## v1.0.0 (2026-10-10)

Primeira versão do painel.

- **Spark:** saúde a cada 15 s via `ssh spark` (GPU, memória unificada por consumidor, CPU, disco), com séries de 1 h a 7 dias.
- **Modelos:** inventário e modelos carregados do Ollama, níveis do `models.json` e ações de carregar, descarregar, atualizar e remover.
- **Containers:** estado, consumo, logs e ações de iniciar, parar e reiniciar.
- **Sistema:** SO, kernel, driver/CUDA, runtimes (Docker, vLLM, container toolkit), updates do apt, portas, sshd, ufw e falhas de login SSH.
- **Delegações:** cada `ollama-delegate run` e o veredito da revisão (`ollama-delegate review`), com acerto por modelo, nível, tipo de tarefa e projeto, causas de falha e gargalos.
- **Tokens:** uso do Claude lido dos transcripts do Claude Code, taxa de cache e tokens escritos no Spark.
- **Auditor:** a Jev (TypeSafe) julga delegações, pacotes e portas expostas; regras em código geram as recomendações. Julgamentos ficam em cache, com custo visível.
- **Benchmarks:** suíte de qualidade com 7 tarefas e soluções de referência validadas, rodando no pipeline real do delegate-local; performance (carga, 1º token, tok/s com 1k/8k/32k e memória pelo nvidia-smi); score com pesos ajustáveis e aplicação no `models.json`.
- **Segurança do painel:** só em 127.0.0.1, header `x-icewall` com checagem de origem nas rotas que alteram estado, ações por allowlist e registro em `action_log`.
