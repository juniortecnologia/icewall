# Etapa 04 — UI e correções de containers

**Plano:** multi-servidor (extraído de `docs/plano-multi-servidor-treino-vllm.md`, Fase 1)
**Pré-requisito:** Etapa 03 concluída (coletores por servidor, coletor vLLM, dados com `server_id`)
**Status:** concluída (2026-10-14)

## Contexto (leitura obrigatória antes de executar)

### Premissas
- Servidores iniciais: **Station (local)** + **Spark (SSH, `spark-facini`/10.0.5.18)**; o icewall roda na Station e a trata como driver `local`.

### Estado que as etapas anteriores entregam
- Registro `servers` + drivers `local`/`ssh` com contrato único; `execOnServer(serverId, cmd)`.
- Coletores `health/docker/ollama/os` por servidor; Ollama como capacidade opcional ("offline" legítimo).
- Coletor vLLM (modelos, status, métricas, modelos de imagem) com chave por servidor.
- Jobs/snapshots/tabelas com `server_id`.

### Ponto de partida (diagnóstico 2026-10-14) — relevante para esta etapa
- **No Spark:** Ollama inativo; vLLM na porta 8001 com autenticação.
- **No código:** `/api/terminal/exec` hardcodeia `10.0.5.18`/`facini`.

## Objetivo
A página de servidores vira o monitor real multi-servidor, as ações da allowlist ficam parametrizadas por servidor e o terminal deixa de hardcodear o Spark.

## Tarefas

### 7. UI
- Página de servidores vira o monitor real: health, containers, modelos e vLLM **por servidor** (Station e Spark em paralelo).
- Ações da allowlist parametrizadas por servidor.
- Terminal sem `10.0.5.18` hardcoded (`/api/terminal/exec` resolve o servidor pelo registro).

### 8. Correções pontuais de containers
- Ações não dependem de snapshot "quente" (verificam o container na hora).
- Erros claros em vez de lista vazia.

## Validação da etapa (validação final do plano multi-servidor)
- [x] Painel mostrando Spark **e** Station em paralelo: GPU, docker, Ollama (offline) e vLLM (autenticado) por servidor.
- [x] Start/stop/logs de container funcionando nos dois servidores.
- [x] Ações da allowlist parametrizadas por servidor; terminal executa no servidor selecionado (nada de `10.0.5.18` hardcoded).
- [x] Ações de container verificam o container na hora (sem depender de snapshot quente); erros claros em vez de lista vazia.
- [x] Typecheck + lint limpos.

## Notas de implementação (2026-10-14)

- **Allowlist por servidor** (`src/server/actions/allowlist.ts`): `runAction(id, target, { arg, serverId, exec })` — `resolveServer(serverId)` resolve pelo registro (sem `serverId`, o servidor principal); cada ação recebe o `ServerRef` e roda pelo driver dele via `execOnServer`. Ações de modelo agora falam com o Ollama **do servidor** (`ollamaFetchOn(server, …)` em `collectors/ollama.ts`, base derivada do registro — o `OLLAMA_URL` global legado ficou só para o runner de bench); `model.delete` não usa mais IP fixo. `action_log` e eventos gravam o `server_id` do servidor alvo; evento inclui o nome do servidor (`Parar container (Spark): vllm-code`). `/api/actions` aceita `serverId` (zod, opcional → compatível com a UI antiga); `useAction` e `ActionButton` ganham `serverId` opcional.
- **Item 8 — containers sem snapshot quente**: `verifyContainer(server, name, exec)` confere o container NA HORA pelo driver (`docker inspect --type container`), classificando os erros: `No such object/container` → `container não encontrado no servidor X`; `docker` ausente/daemon parado → `docker indisponível no servidor X: <stderr>`; `code -1` do executor → mensagem clara repassada (servidor inexistente/indisponível). Nome sempre passa por `shellArg` antes de tocar o servidor. Após ação mutating, relê o snapshot **daquele servidor** (`collectDocker(server)`), não só o principal.
- **Terminal sem hardcode** (`/api/terminal/exec`): o alvo é resolvido pelo registro — `POST { command, serverId? }`; sem `serverId`, o padrão é o servidor `tipo=local` (Station; senão, o primeiro do registro). Nenhum IP/usuário constante; servidor inexistente → 404 com erro claro; registro vazio → 400 claro. Resposta inclui `{ server: { id, nome, tipo, host, usuario } }` para o cliente rotular o prompt. A UI de `/terminal` lista os servidores do registro (`/api/train/servers`) como abas, respeita `?serverId=` e removeu `useServer`/constantes do contexto legado.
- **Monitor real** (`/api/servers/monitor` + `queries.serverMonitor()`): GET devolve, por servidor do registro (projeção segura — sem `chaveSshPath`/`vllmKey`), os snapshots `health`/`docker`/`ollama`/`vllm`/`os`. A página `/servers` virou o monitor: cards por servidor (Station e Spark em paralelo, polling 10 s via react-query) com saúde (GPU/CPU/RAM/disco), containers com ações **parametrizadas por servidor** (Iniciar/Parar/Reiniciar/Logs com `serverId`), Ollama (online/offline legítimo), vLLM (online/auth/offline + motivo + modelos com selo "imagem" + métricas), SO e botão "Terminal neste servidor". A seção legada de "clusters" (SaaS mock, status fictício) saiu da página; o CRUD do registro permanece (listagem migrada para react-query).
- **Compatibilidade**: dashboard e views antigas (containers/modelos) seguem lendo o servidor principal (`primarySnapshot`); ações sem `serverId` caem no servidor principal — mesmo comportamento de antes.
- **Testes**: `src/server/actions/allowlist.test.ts` (resolveServer; verifyContainer: existe → shellArg, ausente → "container não encontrado no servidor X", docker ausente → "docker indisponível", executor falha → repasse claro, nome malicioso → "argumento recusado"; runAction: action_log com `server_id`, erro claro em id inexistente) e `src/app/api/terminal/exec/route.test.ts` (serverId da Station com driver local, padrão = local, id inexistente → 404, payload inválido → 400, registro vazio → 400). 299 testes passam; `tsc --noEmit` limpo; lint limpo nos arquivos tocados (5 erros pré-existentes fora do escopo, das etapas 01–02).
- **Validação one-shot** (`/tmp/opencode/val04/`, sobre cópia do banco; script temporário no repo removido após o veredito): monitor com 2 servidores e projeção sem chaves; Ollama do Spark "offline" legítimo; vLLM do Spark **online** (borda aplicada — chave do registro aceita); containers do Spark (`vllm-code`, `vllm-chat`, `vllm-borda`): `container.logs` real via SSH OK (15,6 KB), `container.start` em nome inexistente → erro claro + `action_log` com `server_id` do Spark; `execOnServer(Station)` OK; servidor inexistente → code -1 claro. Nenhum container real foi parado/iniciado na validação (apenas leituras e erros seguros).

## Convenções da etapa
- **Next 16:** começar a sessão lendo o doc relevante em `node_modules/next/dist/docs/`.
- **Segurança:** vLLM key e chave SSH nunca em respostas de GET nem expostas na UI; ações mutating exigem `x-icewall` + confirmação.
- **UI em pt-BR.** Commits: `git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit ...` com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca imprimir `.env.local` nem chaves; sem derrubar servidor que não se iniciou.
