# Prompt para execução da Etapa 02 — Executor por servidor

---

Executar a **Etapa 02** do plano multi-servidor do icewall.

---

## 0. Checagem de pré-requisito (obrigatória)
A **Etapa 01** precisa estar **concluída**:
- Registro central `servers` com Station (local) + Spark (ssh) e seed no boot.
- `driver-local.ts` com o mesmo contrato de `ServerDriver`/`SshDriver` (exec, put, get, ping).
- Chave SSH e chave vLLM fora de todo `GET`.

**Se não estiver, pare e avise — não siga sem ela.**

---

## 1. Leitura obrigatória (ordem)
1. `docs/plano-multi-servidor/02-executor-por-servidor.md` → sua tarefa
2. `docs/plano-multi-servidor/01-registro-e-drivers.md` → o que a Etapa 01 entregou (contexto)
3. `AGENTS.md` → e, **conforme ele manda**, leia o doc relevante em `node_modules/next/dist/docs/` **antes** de escrever código (Next 16 tem breaking changes).

---

## 2. Exploração do estado atual
- Onde `sparkExec` e `SPARK_SSH_HOST` são usados (coletores, rotas de API).
- Como o registro `servers` + drivers criados na Etapa 01 estão organizados em `src/lib/servers/`.

---

## 3. Implementação exata (item 3 da Fase 1)

### Item 3 — Executor por servidor
- Criar `execOnServer(serverId, cmd)` que resolve o servidor pelo registro e usa o driver correspondente (`local` ou `ssh`).
- `sparkExec` vira **fachada** sobre o servidor "Spark" do registro (resolvido por nome/id no registro, **não por constante**).
- **Migração incremental** dos coletores para `execOnServer`, um a um, sem big-bang — **ao menos um coletor migrado como prova de conceito**, mantendo o painel funcionando em cada passo.

---

## 4. Checklist de validação

- [ ] `execOnServer(serverId, cmd)` executa na Station (local) e no Spark (ssh) pelo mesmo contrato.
- [ ] `sparkExec` delega ao servidor "Spark" do registro (nenhuma constante `SPARK_SSH_HOST` restante na via nova).
- [ ] Ao menos um coletor migrado sem quebrar o monitoramento existente.
- [ ] Comandos em servidor inexistente/indisponível retornam erro claro (não lista vazia).
- [ ] Typecheck + lint limpos.

---

## 5. Convenções (obrigatórias, iguais em todas as etapas)

- **UI em pt-BR.**
- **Commits**:
  `git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit ...`
  com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Nunca** imprimir `.env.local` nem chaves.
- **Sem derrubar servidor que não se iniciou.**
- **Escopo restrito a esta etapa**: não mexer na área de treino nem em vLLM além do que o arquivo pede (coletores vLLM/snapshots = Etapa 03).

---

## 6. Entrega ao final

1. Atualize o status de `"pendente"` para `"concluída"` em `docs/plano-multi-servidor/02-executor-por-servidor.md`.
2. Resumo do que foi feito:
   - Arquivos alterados/criados (execOnServer, fachada sparkExec, coletor migrado).
   - Qual coletor foi migrado como prova de conceito.
   - Testes realizados.
   - Decisões relevantes.