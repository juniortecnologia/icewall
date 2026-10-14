# Etapa 02 — Executor por servidor

**Plano:** multi-servidor (extraído de `docs/plano-multi-servidor-treino-vllm.md`, Fase 1)
**Pré-requisito:** Etapa 01 concluída (registro `servers` + drivers `local`/`ssh` com o mesmo contrato)
**Status:** concluída (2026-10-14)

## Contexto (leitura obrigatória antes de executar)

### Premissas
- Servidores iniciais: **Station (local)** + **Spark (SSH, `spark-facini`/10.0.5.18)**; o icewall roda na Station e a trata como driver `local`.

### Estado que a Etapa 01 entrega
- Tabela `servers` (migração de `train_servers`), com seed Station (local) + Spark (ssh).
- `ServerDriver`/`SshDriver` e `driver-local.ts` com o mesmo contrato (exec, put, get, ping).
- Chave SSH e chave vLLM fora de todo `GET`.

### Ponto de partida (diagnóstico 2026-10-14)
- Todo o monitoramento usa `sparkExec` com `SPARK_SSH_HOST` fixo → o painel depende do Spark.

## Objetivo
Centralizar a execução de comandos por servidor: qualquer comando roda em qualquer servidor registrado, e `sparkExec` vira apenas uma fachada compatível — migração incremental dos coletores, sem big-bang.

## Tarefas

### 3. Executor por servidor
- Criar `execOnServer(serverId, cmd)`: resolve o servidor pelo registro e usa o driver correspondente (`local` ou `ssh`).
- `sparkExec` vira fachada sobre o servidor "Spark" do registro (resolvido por nome/id no registro, não por constante).
- Migração incremental dos coletores para o novo executor — sem big-bang: os coletores passam a usar `execOnServer` um a um, mantendo o painel funcionando em cada passo.

## Validação da etapa
- [x] `execOnServer(serverId, cmd)` executa na Station (local) e no Spark (ssh) pelo mesmo contrato.
- [x] `sparkExec` delega ao servidor "Spark" do registro (nenhuma constante `SPARK_SSH_HOST` restante na via nova).
- [x] Ao menos um coletor migrado como prova de conceito, sem quebrar o monitoramento existente (migrados: docker, health e system/os/updates/security).
- [x] Comandos em servidor inexistente/indisponível retornam erro claro (não lista vazia).
- [x] Typecheck + lint limpos.

## Notas de implementação (2026-10-14)

- **Executor** `src/server/executor.ts` (server-only): `serverIdByName(nome)` resolve por nome no registro `servers`; `execOnServer(serverId, cmd, timeoutMs)` devolve o `ExecResult` do driver (`local` ou `ssh`) do servidor. Falhas — servidor inexistente, campos SSH incompletos, tipo desconhecido — viram `ExecResult` com `code: -1` e mensagem clara em `stderr` (nunca lista vazia/silêncio).
- **Fachada** `sparkExec` (src/server/spark/ssh.ts): agora resolve o servidor "Spark" por nome no registro e delega ao `execOnServer` — nenhuma constante `SPARK_SSH_HOST` na via nova. Mantém o prefixo `export LC_ALL=C; ` (só no driver ssh) e o timeout padrão de 20 s da antiga implementação. A constante `SPARK_HOST` ficou apenas fora da via nova: `sparkAuthMethods` e a área de bench (`spark-run.ts`) ainda a usam — migração para etapa seguinte.
- **Migração incremental dos coletores** (um commit por coletor, painel intacto em cada passo): `collectDocker`, `collectHealth` e `collectOs`/`collectUpdates`/`collectSecurity` (system) agora resolvem o Spark por nome e usam `execOnServer`; servidor fora do registro vira snapshot `null` com mensagem clara. Os demais chamantes (`allowlist`, bench, fine-tune) seguem usando `sparkExec`, que já é a fachada — sem big-bang.
- **Testes**: `src/server/executor.test.ts` (vitest, banco `:memory:` com seed): mesmo contrato Station/Spark, inexistente → erro claro, SSH incompleto → erro claro sem conectar, SSH fora do ar → erro no stderr, fachada delega por nome do registro e Spark fora do registro → erro claro. 283 testes passam; typecheck limpo; lint sem novos erros (6 erros pré-existentes em arquivos fora do escopo, da Etapa 01).
- **Next 16**: executor só é chamado em contexto de requisição/scheduler (POST e server-only) — sem novos GET que exijam `await connection()`; confirmado no doc de route handlers que GETs pré-renderáveis seriam o caso.

## Convenções da etapa
- **Next 16:** começar a sessão lendo o doc relevante em `node_modules/next/dist/docs/`.
- **Segurança:** chave SSH nunca em respostas de GET; ações mutating exigem `x-icewall` + confirmação.
- **UI em pt-BR.** Commits: `git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit ...` com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca imprimir `.env.local` nem chaves; sem derrubar servidor que não se iniciou.
