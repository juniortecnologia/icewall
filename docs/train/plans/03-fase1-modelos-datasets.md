# Fase 1A: Modelos + Datasets

> **⚠ Superado pelo plano da Fase 2:** [2026-10-15-fase2-treinar-lab-producao.md](2026-10-15-fase2-treinar-lab-producao.md) — os datasets agora vivem em `train_datasets` + `/api/train/datasets` (Etapa T1). Mantido como contexto histórico.

**Status:** planejamento  
**Arquivos criados:** 
- `tests/drivers-server.test.ts` — teste da interface genérica ServerDriver  
- `src/server/db/servers-crud.ts` — endpoints CRUD completos de servidores remotos  

---

## Fase 1A: Modelos + Datasets

### Tasks (em ordem, para implementacao):
1. Listar modelos instalados no servidor remoto (via SSH)
2. Criar dataset upload API com conversao automatica formatunsloth
3. Pré-visualização / amostragem de datasets

**Modelo base → escolher modelo no servidor → baixar se necessario**  
**Dataset → upload do proprio Icewall ou colar JSONL na tela**

---

### Task 0: CRUD de Modelos (listar, baixar, exlcuir)

**Objetivo:** criar interface para gerenciar modelos Ollama/Unsloth instalados no Spark (e futuramente outros servidores)  
**Arquivos criados:**
- `src/app/api/train/models/route.ts` — listar/baixar/excluir modelos do servidor remoto  
- `tests/modelos.test.ts` — testar validacoes Zod e respostas API  

#### Task: Listar modelos instalados no Spark (e outros servers)

Implementar rota GET `/api/train/models/`:
1. Recebe como parametro `serverId` na querystring
2. Executa via SSH command remote no servidor: `ollama list | unsloth list-models`  
3. Retorna lista de nomes, tags e tamanhos de modelos disponiveis
```ts
export interface ModeloRemoto {
 id: string;
  nome: string;
   tamanhoMB?: number;
    tag: string;
     criadoAt: number;
 }
```

#### Task: Baixa novo modelo pro Spark

Implementar rota POST `/api/train/models/`:
- Recebe: `serverId`, `nomeModelo` (ex: "qwen2.5:7b") e opcoes  
- Via SSH executa: `ollama pull qwen2.5:7b` no Spark
- Retorno: status do download + progresso
- **Progresso via websocket** ou polling endpoint separado `/api/train/models/:nome/progesso`;

#### Task: Excluir modelo instalado no Spark

Implementar rota DELETE `/api/train/models/[id]`:
- Recebe o ID do servidor e nome/tag do modelo  
- Via SSH executa `ollama rm qwen2.5:7b` no Spark
- Remove registro local tambem se necessario;

---

### Task 1: Upload e conversao de datasets para Unsloth

**Objetivo:** permitir upload de datasets (CSV, JSON, TXT, etc) + conversao automatica pro formato jsonl do unsloth  
**Arquivos criados:**
- `tests/datasets.test.ts` — teste da api de upload e conversao  

#### Task: Upload de dataset no servidor remoto

Implementar rota POST `/api/train/datasets/upload/`:
- Recebe arquivo CSV, JSON ou TXT (via FormData)  
- Salva arquivo temporario no disco local do icewall-server 
- Envia via SFTP pro Spark (`/mnt/data/datasets/nome-do-dataset.jsonl`)

#### Task: Conversao automatica pra formatos Unsloth  

Implementar rota POST `/api/train/datasets/converter/`:
- Recebe caminho remoto do dataset e formato alvo  
- Chama `unsloth format-csv --jsonl` ou conversao customizada  
- Retorna preview da amostragem (pré-visualizar antes de salvar, pra garantir qualidade antes de treinamento)  
- **Opcoes importantes**: validacao automatica do formato — quantos samples faltam / duplicados detectados (se houver);

#### Task: Pré-visualizacao e amostragem do dataset  

Implementar rota GET `/api/train/datasets/preview/[nome]`:
- Retorna 10 amostras aleatorias do arquivo no Spark (`head -n 10`)  
- Para datasets grandes (>5000 samples), pagina para preview (opcional) 

---

### Fluxo da interface de Modelos/Datasets (frontend — a implementar na próxima Fase):
1. Usuario vai pra `/treinar`
2. Seleciona servidor no dropdown (Spark, etc.)
3. **Modelos exibidos**: nome, tamanho, tag, ultimas usado
4. Botao "Baixar novo model" abre modal onde ele coloca o nome e confirma
5. **Datasets existentes**: mostra lista de datasets ja salvos + opcoes deletar
6. Botao "Upload new dataset": modal para upload via drag-and-drop do navegador; arquivo é enviado pro Spark
