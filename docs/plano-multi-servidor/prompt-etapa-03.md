# Prompt para execução da Etapa 03 — Coletores e dados por servidor

---

Executar a **Etapa 03** do plano multi-servidor do icewall.

---

## 0. Checagem de pré-requisito (obrigatória)
A **Etapa 02** precisa estar **concluída**:
- `execOnServer(serverId, cmd)` funcional.
- `sparkExec` funcionando como fachada sobre o registro.

**Se não estiver, pare e avise — não siga sem ela.**

---

## 1. Leitura obrigatória (ordem)
1. `docs/plano-multi-servidor/03-coletores-e-dados.md` → sua tarefa
2. `docs/plano-multi-servidor/01-registro-e-drivers.md` e `02-executor-por-servidor.md` → o que as etapas anteriores entregaram (contexto)
3. `AGENTS.md` → e, **conforme ele manda**, leia o doc relevante em `node_modules/next/dist/docs/` **antes** de escrever código (Next 16 tem breaking changes).

---

## 2. Exploração do estado atual
- Os coletores `collectHealth`/`collectDocker`/`collectOllama`/`collectOs` (como recebem dados hoje).
- O scheduler de jobs.
- A estrutura de snapshots.
- As tabelas `metrics`, `container_stats`, `events`, `action_log` (schema atual em `data/icewall.db`).

---

## 3. Implementação exata (itens 4, 5 e 6 da Fase 1)

### Item 4 — Coletores por servidor
- Refatorar `collectHealth`/`collectDocker`/`collectOllama`/`collectOs` para receberem o **driver** (em vez de `sparkExec` direto).
- **Ollama vira capacidade opcional**: serviço inativo = estado legítimo **"offline"** (não erro, não lista vazia).

### Item 5 — Coletor vLLM (novo)
- `/v1/models` + status + métricas usando a **chave por servidor** do registro.
- Detectar modelos de imagem (**Z-Image, Qwen-Image**) pela lista.

### Item 6 — Scheduler e dados por servidor
- Jobs iteram sobre o registro `servers` (não mais sobre uma constante).
- Snapshots com chave `server:{id}:{tipo}`.
- Colunas `server_id` em `metrics`, `container_stats`, `events`, `action_log` (migração + retenção ajustada; **histórico antigo → servidor Spark**).

---

## 4. Checklist de validação

- [ ] Os quatro coletores rodam na Station e no Spark via driver.
- [ ] Ollama inativo aparece como **"offline"** (estado legítimo) em vez de erro/blank.
- [ ] Coletor vLLM retorna modelos, status e métricas do Spark (10.0.5.18:8001) usando a chave do registro, com modelos de imagem (**Z-Image, Qwen-Image**) identificados na lista.
- [ ] Jobs iteram sobre o registro e snapshots com chave `server:{id}:{tipo}`.
- [ ] `server_id` presente nas quatro tabelas com histórico antigo apontando para Spark.
- [ ] Typecheck + lint limpos.

---

## 5. Convenções (obrigatórias, iguais em todas as etapas)

- **UI em pt-BR.**
- **Commits**:
  `git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit ...`
  com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Nunca** imprimir `.env.local` nem chaves (**especialmente a vLLM key, que deve ficar só no registro**).
- **Sem derrubar servidor que não se iniciou.**
- **Escopo restrito a esta etapa**: não mexer na área de treino nem na UI além do que o arquivo pede (UI = Etapa 04).

---

## 6. Entrega ao final

1. Atualize o status de `"pendente"` para `"concluída"` em `docs/plano-multi-servidor/03-coletores-e-dados.md`.
2. Resumo do que foi feito:
   - Arquivos alterados/criados (coletores refatorados, coletor vLLM novo, migração de schema, scheduler).
   - Como a migração de `server_id` preservou o histórico (antigo → Spark).
   - Testes (manuais/automatizados) realizados.
   - Decisões relevantes.