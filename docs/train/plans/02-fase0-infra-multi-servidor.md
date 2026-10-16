# Fase 0: Infra Multi-Servidor + CRUD de Servidores

> **⚠ Superado pelo plano da Fase 2:** [2026-10-15-fase2-treinar-lab-producao.md](2026-10-15-fase2-treinar-lab-producao.md) — a infra desta fase já foi implementada (registro `servers`, drivers, executor). Mantido como contexto histórico.

**Status:** para implementar primeiro  
**Arquivos criados nesta sessão anterior**:  
- `driven-server-driver.test.ts` — teste da interface genérica ServerDriver  
- `src/server/db/servers-crud.ts` — endpoints CRUD completos de servidores remotos  

---

## Fase 0: Infra Multi-Servidor + CRUD de Servidores

### Tasks (em ordem, para implementacao):
1. Add tabela de servidor ao schema Drizzle e DB init
2. Criar módulo de driver (`ServerDriver`) — interface genérica + impl para SSH/SFTP 
3. Implementar endpoint CRUD de servidores na API (`/api/servers`)
4. Atualizar UI de gerenciamento de servidores no app

--- 

### Task 0: Server CRUD
**Objetivo:** criar tabela de servidor na Drizzle schema e endpoints CRUD para gerenciar servidores remotos  
**Arquivos:** `src/server/db/schema-extensions.ts`, `src/server/api/servers.ts`  
**Tasks:**
1. **Schema extension**: criar tabela `servers` com campos:
   - `id` serial principal
   - `nome` varchar (ex: "Spark", "Produção")
   - `tipo` enum (`spark`, `ssh` genérico)
   - `host` varchar  
   - `porta` integer default 22
   - `usuario` varchar  
   - `chaveSshPath` text (caminho para arquivo SSH key no disco local)
   - `createdAt` `dateTime`, `updatedAt` `dateTime`
2. **Schema Drizzle**: registrar a tabela em `server/db/schema-extensions.ts`
3. **Migração Drizzle**: garantir que o schema reflete mudanças pro banco (SQL ou via CLI Drizzle)
4. **Endpoints**: rota `POST /api/servers`, `GET /api/servers`, `PUT /api/servers/:id`, `DELETE /api/servers/:id`
5. **Validação Zod**: adicionar schemas para cada tipo de operação
6. **Testes unitários (opcional)**: testar validação Zod

### Task 1: ServerDriver Interface + SSH Driver Base
**Objetivo:** criar uma interface genérica `ServerDriver` com implementacao base pra SSH/SFTP  
**Arquivos:** `src/lib/servers/server-driver.ts`, `src/lib/servers/driver-ssh-base.ts`, `tests/server-driver.test.ts`, `testers/ssh-driver.test.ts`

#### Task: Interface do ServerDriver — métodos genéricos pra cada operação da plataforma
**Objetivos:** definir contrato de interface `ServerDriver` e suas responsabilidadee responsabilidades  
**Arquivo:** `src/lib/servers/server-driver.ts`, `tests/ssh-driver.test.ts`

```ts
export interface BaseConfig {
  host: string;
  port?: number;         // default: 22
  user: string;
  keyPath: string;       // caminho local pro chave SSH no disco
}
export abstract class ServerInterface {
  // ... métodos para SSH, SFTP e comandos remotos
}
```

### Fase 0 — Tasks (execucao)

1. **Criar schema de servidor**
   ```sql
   CREATE TABLE IF NOT EXISTS train_servers (
     id SERIAL PRIMARY KEY,
     nome TEXT NOT NULL UNIQUE,
     tipo TEXT CHECK (tipo IN ('spark', 'generic')),
     host TEXT NOT NULL,
     porta INTEGER DEFAULT 22,
     usuario TEXT NOT NULL,
     chaveSshPath TEXT NOT NULL,
     criadoEm TEXT NOT NULL,
     atualizadoEm TEXT NOT NULL
   );
   ```

2. **Implementar endpoint `GET /api/train/servers`**
   - Retorna todos os servidores cadastrados
   - Nao retorna a chave SSH (seguranca)

3. **Implementar endpoint `POST /api/train/servers`**
   - Recebe nome, tipo, host, porta, usuario e caminho da chave SSH
   - Salva no banco com datas automaticas
   - Retorna o servidor criado

4. **Implementar endpoints PUT/DELETE `/api/train/servers/:id`**
   - PUT: atualizar dados do servidor (sem exponer a chave)
   - DELETE: remover servidor cadastrado

---

### Fase 1A: Modelos e Datasets (preparamos aqui o que sera necessario depois)

> Deixamos aqui em aberto pra ser detalhado no proximo archivo de plano (`03-fase1-modelos-datasets.md`).  
> Mas ja podemos definir as interfaces minimas para os arquivos do dataset:

- Formato JSONL do unsloth: cada linha é um objeto `{ "prompt": "...", "completion": "..." }` ou formato messages
- Precisanos criar uma API pra upload de arquivo e conversao automatica pro formato certo
- Para listar modelos instalados no servidor remoto, precisaremos usar SSH + `unsloth list-models` ou ollama list

---

### Fase 1B: Jobs + Monitoramento ao vivo

> Sera detalhado em `04-fase2-jobs-monitoramento.md`.  
> Aqui apenas o esqueleto para referencia futura:

- Endpoint pra criar job de treinamento com configuracao de dataset e servidor
- Endpoint pra executar o container do unsloth com os parametros especificados
- Endpoint pra monitorar logs ao vivo durante o training
- UI pro progresso do job visualmente 
