# Prompt para execução da Etapa 01 — Registro central `servers` e drivers

---

Executar a **Etapa 01** do plano multi-servidor do icewall.

---

## 0. Checagem de pré-requisito
Nenhuma — esta é a primeira etapa do plano multi-servidor.

---

## 1. Leitura obrigatória (ordem)
1. `docs/plano-multi-servidor/01-registro-e-drivers.md` → sua tarefa
2. `docs/plano-multi-servidor-treino-vllm.md` → plano original (só contexto da Fase 1)
3. `AGENTS.md` → e, **conforme ele manda**, leia o doc relevante em `node_modules/next/dist/docs/` **antes** de escrever código (Next 16 tem breaking changes).

---

## 2. Exploração do estado atual
- Tabela `train_servers` (schema, dados existentes).
- CRUD em `/api/train/servers`.
- `ServerDriver`/`SshDriver` em `src/lib/servers/` (contrato atual: exec, put, get, ping).
- Como o consumo atual lê esses dados.

---

## 3. Implementação exata (itens 1 e 2 da Fase 1)

### Item 1 — Registro central `servers`
- Renomear `train_servers` → `servers` (migração SQLite, **sem perder histórico**; histórico antigo → servidor Spark).
- Campos: `id, nome, tipo(local|ssh), host, porta, usuario, chaveSshPath, vllmUrl, vllmKey, capacidades(json), ultimoStatus, ultimoCheck`.
- Seed automático no primeiro boot: **Station (local)** + **Spark (ssh, `spark-facini`/10.0.5.18)**.
- **Chave SSH e chave vLLM saem de todo `GET`** (listagem e detalhe).

### Item 2 — Driver `local`
- Criar `src/lib/servers/driver-local.ts` com o **mesmo contrato** de `ServerDriver`/`SshDriver` (exec, put, get, ping).

---

## 4. Checklist de validação

- [ ] Migração `train_servers` → `servers` sem perda de dados; histórico antigo remanejado para o servidor Spark.
- [ ] Seed automático cria Station (local) + Spark (ssh) no primeiro boot.
- [ ] Nenhum `GET` retorna `chaveSshPath`/`vllmKey` (verificar nos endpoints de listagem e detalhe).
- [ ] `driver-local.ts` cumpre o contrato (exec, put, get, ping) coberto por testes (vitest).
- [ ] Typecheck + lint limpos.

---

## 5. Convenções (obrigatórias, iguais em todas as etapas)

- **UI em pt-BR.**
- **Commits**:
  `git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit ...`
  com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Nunca** imprimir `.env.local` nem chaves.
- **Sem derrubar servidor que não se iniciou.**
- **Escopo restrito a esta etapa**: não mexer na área de treino nem em vLLM além do que o arquivo pede.

---

## 6. Entrega ao final

1. Atualize o status de `"pendente"` para `"concluída"` em `docs/plano-multi-servidor/01-registro-e-drivers.md`.
2. Resumo do que foi feito:
   - Arquivos alterados/criados (migração, seed, driver-local, endpoints).
   - Como a migração preservou o histórico.
   - Testes (vitest) do driver-local.
   - Decisões relevantes.