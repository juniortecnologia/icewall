# /treinar — Visão Geral do Plano

> **⚠ Superado pelo plano da Fase 2:** [2026-10-15-fase2-treinar-lab-producao.md](2026-10-15-fase2-treinar-lab-producao.md) — porta correta 4310 (não 4000), pilha multi-servidor atual, `withAuth` nas rotas. Mantido como contexto histórico.

**Status:** planejamento completo  
**Data:** 2026-10-13  
**Inspiração:** Unsloth Studio (infra de treinamento) mas UI própria Icewall  
**Integração:** Zero dependência do Unsloth UI — tudo na infra da API (chama CLI via exec/SSH)

---

## Visão Geral

O **`/treinar`** é uma aba dentro do Icewall pra treinar, modificar, criar variantes, tunar e ajustar modelos. Começando no **Spark** (sua GPU dedicada), mas arquitetura multi-servidor desde o começo.

### Arquitetura de Alto Nível

```
Frontend (/treinar) → api/train/* (Next.js API routes) → ServerDriver base → SSH/Exec
                                                                          ↓
                                                                     unsloth CLI / ollama API
```

#### Estrutura do plano (arquivos sequenciais):

| # | Arquivo | Fase | O que faz |
|---|---------|------|-----------|
| 1 | `02-fase0-infra-multi-servidor.md` | **Fase 0** | Infra multi-servidor + CRUD de servidores (começar aqui) |
| 2 | `03-fase1-modelos-datasets.md` | **Fase 1A** | Modelos (listar/baixar/excluir) e Datasets (upload/conversao/preview) |
| 3 | `04-fase1b-jobs-monitoramento.md` | **Fase 1B** | Jobs de treino + monitoramento ao vivo (MVP core) |
| 4 | `05-fase2-exports-inference.md` | **Fase 2** | GGUF/export, LoRA merge, inference chat integrado (iterar depois) |

---

### Fluxo do MVP (do zero até um modelo treinado)

```
Selecionar servidor → Gerenciar modelos → Criar/cadastrar dataset → Criar job de treino → Monitorar ao vivo
```

5 passos visuais (stepper component):
1. **Servidor**: seleção entre servidores cadastrados (inicialmente só Spark)
2. **Modelo base**: listar/baixar/excluir modelos no servidor  
3. **Dataset**: upload do seu dataset com conversão automática pros formatos suportados por cada serve, pré-visualizacao e amostragem  
4. **Configurar treino**: hiperparametros (MVP = presets + campos editaveis)
5. **Executars e monitorar**: loss ao vivo, época atual, logs do container

---

## Priorização: MVP vs. Fase 2

### MVP (o que precisa funcionar primeiro):
1. Modelos: listar, baixar, excluir modelos no servidor remoto  
2. Datasets: upload de arquivos + conversão JSONL Unsloth
3. Jobs de treino: criar/train/monitor/stop via unsloth CLI
4. Monitoramento: logs ao vivo (loss, epoch, tempo)

### Fase 2 (features extras — iterar depois):
1. Export GGUF / quantização
2. LoRA merge & comparison
3. Chat/inference integrado pro modelo treinado
4. Playground online pra testar resultados

---

## Convenções técnicas globais

- **pnpm via corepack** sempre: `corepack pnpm ...`
- **Commits**: `git -c user.name="Junior Almeida" -c user.email="junioralmeidatecnologia@gmail.com" commit ...` com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- **Porta fixa 4000, só local**: `next dev -p 4000 -H 127.0.0.1` / `next start -p 4000 -H 127.0.0.1`  
  > Se a porta 4000 estiver ocupada por um processo do usuário, **pare e avise**
- **Textos da interface em português BR**
- **Nunca imprimir `.env.local` nem chaves API**: para conferir se existe, só testar se a variável é non-empty
- **Sem derrubar servidor que você não iniciou**

---

## Como executar este plano (para próxima sessão)

O plano está dividido em **4 fases sequenciais**. Execute cada fase numa sessão diferente:

1. `02-fase0-infra-multi-servidor.md` → Infra base de servidores
2. `03-fase1-modelos-datasets.md` → Modelos + Datasets  
3. `04-fase1b-jobs-monitoramento.md` → Jobs + Monitoramento ao vivo
4. `05-fase2-exports-inference.md` → Exports, LoRA, Inference

**Ao iniciar a próxima sessão**, diga:
> "Executar o plano em `/home/junior/Documentos/Projects/icewall-main/docs/train/plans/XX-nome	do.plano.md`. Siga passo-a-passo. Execute as Tasks indicadas sem re-resumir."
