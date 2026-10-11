# ICEWALL

Painel de controle local do DGX Spark (10.0.5.18) e dos modelos que o Claude Code usa pela skill `delegate-local`. Ele mostra a saúde do Spark, os modelos, os containers, o SO e a segurança, as delegações do Claude, o uso de tokens e os benchmarks. A Jev (TypeSafe) atua como auditora. A aba Crivo filtra o próprio Claude Code: avalia cada prompt antes de o Claude ler e registra cada comando.

## Rodar

```bash
cp .env.example .env.local   # preencha TYPESAFE_API_KEY
npm install
npm run build && npm start   # http://127.0.0.1:4310 (só localhost); aqui quem roda é o serviço, veja abaixo
```

Como serviço: veja [Serviço](#serviço-systemd-de-usuário). Desenvolvimento: `npm run dev`, com o serviço parado (a porta é a mesma). Testes: `npm test`, `npm run typecheck`, `npm run lint`, `npm run bench:validate`.

Pré-requisitos nesta máquina:
- `ssh spark` sem senha (alias com ControlMaster no `~/.ssh/config`, usuário `facini`).
- A skill `~/.claude/skills/delegate-local` com o registro em `runs.jsonl`.

Depois de editar código do servidor, reinicie o processo: o agendador sobe uma vez por processo e não recebe hot-reload.

## Como funciona

| Fonte | Como chega | Intervalo |
|---|---|---|
| GPU, memória unificada, CPU, disco | `ssh spark` (nvidia-smi, /proc) | 15 s |
| Modelos carregados/instalados | HTTP no Ollama `:11434` | 30 s |
| Containers, imagens, stats | `ssh spark docker …` | 60 s |
| Delegações do Claude | `~/.cache/delegate-local/runs.jsonl` | 30 s |
| Tokens do Claude | `~/.claude/projects/**/*.jsonl` (`message.usage`) | 5 min |
| Segurança (portas, sshd, ufw, logins) | `ssh spark` + sonda de login sem chave | 15 min |
| SO, runtimes, updates (apt) | `ssh spark` | 6 h |
| Auditor Jev + recomendações | API TypeSafe | 5 min |

Tudo fica em SQLite (`data/icewall.db`, Drizzle). O agendador está em [src/server/scheduler.ts](src/server/scheduler.ts), e os comandos SSH são constantes dos coletores em [src/server/spark/collectors/](src/server/spark/collectors/).

### Auditor (Jev)

A Jev devolve julgamentos tipados (choice/noul/score com probabilidades), não texto. O ICEWALL pergunta e o código decide:
- **Delegação:** causa da falha, tipo de tarefa, melhor rota (fast/quality/Claude direto), se delegar valeu a pena e o gargalo.
- **Pacote com update:** gravidade, se mexe na pilha da GPU e se exige restart.
- **Porta aberta para a rede:** se a exposição é arriscada.

As regras em [src/server/jev/rules.ts](src/server/jev/rules.ts) agregam esses julgamentos e geram as recomendações. Um julgamento só conta com confiança ≥ 0,6 (choice) ou com probabilidade fora de 0,35–0,65 (noul). Cada julgamento fica em cache pelo hash de estado + perguntas, e o custo em tokens aparece na tela Auditor. Antes de sair para a API, o estado passa por um filtro que remove o que parece credencial.

Falhas de infraestrutura (códigos 2, 3 e 4 do `ollama-delegate`) não gastam pergunta: a causa já é conhecida pelo código.

### Benchmarks

- **Qualidade:** as 7 tarefas de [bench/tasks/](bench/tasks/) rodam no pipeline real (`ollama-delegate run --model M --label bench`, até 3 rodadas de teste). Cada tarefa tem uma solução de referência validada (`npm run bench:validate`). O contexto da T7 é gerado por `node bench/tools/gen-t7.mjs`.
- **Performance:** carga a frio, tempo até o 1º token e tok/s com prompts de 1k, 8k e 32k tokens. A memória vem do `nvidia-smi` por processo, porque o `/api/ps` subestima o gemma4. A medição segura o lock do delegate-local.
- **Score:** composto, com pesos ajustáveis na tela. O botão "Aplicar no models.json" troca o modelo de um nível (com backup em `models.json.bak`).

### Crivo

Os dois portões do Claude Code, vindos do antigo app Crivo:
- **Entrada:** pelo gancho `UserPromptSubmit`, a Jev avalia cada prompt. O prompt passa, passa com um aviso para o Claude perguntar antes, ou é barrado.
- **Saída:** pelo gancho `PreToolUse`, cada comando e arquivo é registrado.

Os ganchos chamam `/api/crivo/hooks/*` com o header `x-icewall: 1`, e o prompt sempre passa se o ICEWALL estiver fora. O guia completo, com regras, configuração dos ganchos, rotas e histórico, está em [docs/crivo/README.md](docs/crivo/README.md).

### Ações e segurança do painel

- O servidor escuta só em `127.0.0.1`.
- Rotas que alteram estado exigem o header `x-icewall: 1` e origem local (proteção contra CSRF).
- As ações seguem uma allowlist: start/stop/restart/logs de container; load/unload/pull/delete de modelo; troca de nível no models.json. Tudo fica em `action_log`.
- `apt upgrade` e reboot não são executados (o usuário não tem sudo sem senha). O painel mostra o comando.

## Serviço (systemd de usuário)

Nesta máquina o painel roda como o serviço de usuário `icewall` e sobe no boot. Instalação, operação, desenvolvimento com o serviço no ar e problemas comuns estão em [deploy/README.md](deploy/README.md). O essencial:

```bash
systemctl --user status icewall                      # estado
journalctl --user -u icewall -f                       # logs
npm run build && systemctl --user restart icewall     # aplicar mudança de código
```
