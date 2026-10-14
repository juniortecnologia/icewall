# Prompt para execução da Etapa 04 — UI e correções de containers

---

Executar a **Etapa 04** do plano multi-servidor do icewall (fase final do plano multi-servidor).

---

## 0. Checagem de pré-requisito (obrigatória)
A **Etapa 03** precisa estar **concluída**:
- Coletores `health/docker/ollama/os` rodando por servidor via driver.
- Coletor vLLM funcional (modelos, status, métricas, modelos de imagem) com chave do registro.
- `server_id` presente em `metrics`, `container_stats`, `events`, `action_log` (histórico antigo → Spark).
- `execOnServer(serverId, cmd)` e `sparkExec` como fachada operando.

**Se não estiver, pare e avise — não siga sem ela.**

---

## 1. Leitura obrigatória (ordem)
1. `docs/plano-multi-servidor/04-ui-e-correcoes.md` → sua tarefa
2. `docs/plano-multi-servidor/01-registro-e-drivers.md`, `02-executor-por-servidor.md`, `03-coletores-e-dados.md` → contexto do que já existe
3. `AGENTS.md` → e, **conforme ele manda**, leia o doc relevante em `node_modules/next/dist/docs/` **antes** de escrever código (Next 16 tem breaking changes).

---

## 2. Exploração do estado atual
- Página de servidores atual (o que ela mostra hoje, quais endpoints consome).
- Endpoint `/api/terminal/exec` (onde está o hardcode `10.0.5.18`/`facini`).
- Allowlist de ações de container (como está parametrizada hoje).
- Como o snapshot "quente" é usado nas ações de container.

---

## 3. Implementação exata (itens 7 e 8 do plano)

### Item 7 — UI
- Página de servidores vira o **monitor real multi-servidor**: health, containers, modelos e vLLM **por servidor** (Station e Spark em paralelo).
- Ações da allowlist **parametrizadas por servidor** (cada ação recebe `serverId` e usa o driver correspondente).
- Terminal sem `10.0.5.18` hardcoded: `/api/terminal/exec` resolve o servidor pelo registro (ex.: query param `?serverId=` ou header, nunca constante).

### Item 8 — Correções pontuais de containers
- Ações de container (start/stop/restart/logs) **não dependem de snapshot "quente"**: verificam o container na hora via driver.
- Erros claros em vez de lista vazia (ex.: "container não encontrado no servidor X", "servidor Y indisponível").

---

## 4. Checklist de validação (final do plano multi-servidor)

- [ ] Painel mostrando **Spark E Station em paralelo**: GPU, docker, Ollama (offline) e vLLM (autenticado) por servidor.
- [ ] Start/stop/logs de container funcionando nos **dois** servidores.
- [ ] Ações da allowlist parametrizadas por servidor; terminal executa no servidor selecionado (zero `10.0.5.18` hardcoded).
- [ ] Ações de container verificam o container na hora (sem depender de snapshot quente); erros claros em vez de lista vazia.
- [ ] Typecheck + lint limpos.

---

## 5. Convenções (obrigatórias, iguais em todas as etapas)

- **UI em pt-BR.**
- **Commits**:  
  `git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit ...`  
  com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Nunca** imprimir `.env.local` nem chaves (vLLM key e chave SSH ficam só no registro, nunca na UI).
- **Sem derrubar servidor que não se iniciou.**
- **Escopo restrito a esta etapa**: não mexer na área de treino nem em vLLM além do que o arquivo pede (treino = plano separado, vLLM-imagens = plano separado).

---

## 6. Entrega ao final

1. Atualize o status de `"pendente"` para `"concluída"` em `docs/plano-multi-servidor/04-ui-e-correcoes.md`.
2. Resumo do que foi feito:
   - Arquivos alterados/criados (UI, API terminal, allowlist, ações de container).
   - Como a página de servidores consome os coletores por servidor.
   - Testes manuais/automatizados realizados.
   - Decisões relevantes (ex.: como o terminal resolve o servidor, como a allowlist ficou parametrizada).