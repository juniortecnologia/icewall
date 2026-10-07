# Crivo — etapa 2: ligar os portões no Claude Code (sem IA)

Data: 2026-10-06 · Status: aprovado em conversa, aguardando revisão da spec · Etapa anterior: `2026-10-06-crivo-painel-design.md`

## Objetivo

Ligar o Crivo no Claude Code de verdade, só no projeto happy-team-chat (`/home/junior/Projects/happy-team-chat`):

- Toda vez que o usuário manda um prompt, antes de o Claude ler, o Crivo recebe o prompt e responde.
- Antes de cada comando de terminal e de cada criação ou edição de arquivo, o Crivo recebe o que vai acontecer e responde.

Nesta etapa o Crivo **só registra e deixa tudo passar**. Não há IA. Os dados de mentira somem, e as duas colunas mostram só o que chega de verdade, sem recarregar a página. Se o Crivo estiver desligado, o Claude Code não trava.

## Critérios de sucesso

- Um prompt mandado no Claude Code dentro do happy-team-chat aparece no topo da coluna de entrada em até ~1 s, com o Crivo aberto.
- Um comando `Bash`, ou um `Write`/`Edit`/`MultiEdit`/`NotebookEdit`, aparece na coluna de saída em até ~1 s.
- Com o Crivo desligado, o Claude Code segue normal: cada gancho termina em no máximo 2 s, com sucesso e sem mensagem na conversa.
- O sinal "conectado" no topo acende no primeiro prompt recebido desde que o Crivo ligou.
- O painel só é acessível por `127.0.0.1`.
- Nenhum dado de mentira na tela, e não existe mais botão "Simular".

## Fora do escopo

- IA, nota de verdade, bloqueio de prompts ou comandos, regras da casa aplicadas.
- Ganchos em outros projetos ou globais.
- Streaming (SSE): a atualização continua por consulta automática.
- Mostrar a origem (nome do projeto) na tela: ela é gravada, mas ainda não é exibida.

## Decisões tomadas na conversa

1. Os exemplos e o "Simular" somem. As colunas começam vazias, com uma mensagem de espera.
2. Prompt real sem nota: semáforo **verde** ("Passou"), nota exibida como "—". Ao abrir, aparece "Ainda sem avaliação: a nota chega quando a IA for ligada." Conta em "passaram" no placar.
3. Os ganchos ficam em `happy-team-chat/.claude/settings.local.json`, e esse caminho entra no `.gitignore` do happy-team-chat.
4. "Conectado" fica só na memória do Crivo: acende no primeiro prompt desde que o Crivo ligou e só apaga quando ele é desligado. Ao lado aparece a hora do último sinal.
5. Transporte: gancho do tipo `command` com `curl` silencioso. O tipo `http` nativo foi descartado porque deixaria um aviso de "erro de gancho" na conversa sempre que o Crivo estivesse desligado.
6. Atualização: consulta automática a cada **1 s** (antes era 2 s).
7. Segurança: `dev` e `start` escutam só em `127.0.0.1`.

## Contrato com o Claude Code

O formato vem da documentação oficial dos hooks (consultada em 2026-10-06).

**UserPromptSubmit** (stdin do gancho, repassado como corpo do POST):

```json
{ "session_id": "…", "prompt_id": "…", "transcript_path": "…", "cwd": "/home/junior/Projects/happy-team-chat",
  "permission_mode": "default", "hook_event_name": "UserPromptSubmit", "prompt": "texto do usuário" }
```

**PreToolUse**:

```json
{ "session_id": "…", "cwd": "…", "hook_event_name": "PreToolUse", "tool_name": "Bash",
  "tool_input": { "command": "pnpm test", "description": "…" }, "tool_use_id": "…" }
```

Campos de `tool_input` usados por ferramenta:

| tool_name | tipo | alvo |
|---|---|---|
| `Bash` | `comando` | `tool_input.command` |
| `Write`, `Edit`, `MultiEdit` | `arquivo` | `tool_input.file_path` |
| `NotebookEdit` | `arquivo` | `tool_input.notebook_path` |

Deixar passar = terminar com sucesso sem saída. A resposta `{}` do Crivo é descartada pelo gancho nesta etapa.

## Configuração no happy-team-chat

Arquivo `.claude/settings.local.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -m 2 -o /dev/null -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:4000/api/ganchos/prompt || true",
            "timeout": 5
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash|Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -m 2 -o /dev/null -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:4000/api/ganchos/ferramenta || true",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

- `-m 2` limita o tempo do `curl`, e `timeout: 5` é a rede de segurança do próprio Claude Code.
- `-o /dev/null` impede que qualquer texto chegue ao Claude.
- `|| true` garante saída 0 mesmo com o Crivo desligado.
- Nada depende de `jq`.
- A linha `.claude/settings.local.json` é acrescentada ao `.gitignore` do happy-team-chat, em commit próprio na branch `developer` de lá. O `CLAUDE.md` sem commit do usuário não é tocado.

## Crivo: mudanças

### Banco (`src/lib/db.ts`)

- **Versão de esquema** via `PRAGMA user_version`. A versão nova é 2. Ao abrir um banco com versão < 2, as tabelas `prompts` e `comandos` são apagadas e recriadas (elas só têm dados de mentira), e a versão passa a 2. Um banco já na versão 2 nunca é apagado.
- **`prompts`:**
  - `nota`, `tamanho` e os cinco `*_pct` passam a aceitar nulo.
  - Os CHECKs continuam valendo quando o valor existe.
  - Entram as colunas `origem TEXT NOT NULL` e `sessao TEXT`.
- **`comandos`:** entram `origem TEXT NOT NULL` e `sessao TEXT`.
- A semeadura, o arquivo `exemplos.ts` e o `simulador.ts` saem, junto com os testes deles.
- As regras da casa voltam numa etapa futura.

### Tipos (`src/lib/tipos.ts`)

- `Prompt.nota: number | null`, `Prompt.criterios: Criterios | null`.
- `Prompt.origem: string`, `Prompt.sessao: string | null`; `Comando.origem`, `Comando.sessao` iguais.
- `Feed` ganha `conexao: { conectado: boolean; ultimoSinal: string | null }`.

### Avaliação (`src/lib/avaliacao.ts`)

- `semaforoDoPrompt(nota: number | null)`: com nota nula devolve `verde`; com nota, o mesmo que `semaforoDaNota`.

### Tradução dos ganchos (`src/lib/ganchos.ts`, funções puras)

- `lerGanchoPrompt(corpo: unknown): NovoPrompt | null` exige `prompt` string não vazia (depois de `trim`) e `cwd` string. Monta:
  - `origem` = último segmento de `cwd`
  - `sessao` = `session_id` ou nulo
  - `nota` e `criterios` nulos
  - `criadoEm` = agora
- `lerGanchoFerramenta(corpo: unknown): NovoComando | null | "ignorar"`:
  - `null` quando falta `tool_name`, `cwd` ou o campo de alvo esperado.
  - `"ignorar"` quando a ferramenta não está na tabela.
  - Caso contrário, o comando com `regra: null`.

### Conexão (`src/lib/conexao.ts`)

- Estado em `globalThis`, para sobreviver ao recarregamento do `next dev`: `{ conectadoEm: string | null; ultimoSinal: string | null }`.
- `registrarSinal(tipo: "prompt" | "ferramenta", quando)`: sempre atualiza `ultimoSinal`. Só um `prompt` define `conectadoEm`, e só se ainda estiver nulo.
- `lerConexao(): { conectado, ultimoSinal }`.

### Rotas

- `POST /api/ganchos/prompt` e `POST /api/ganchos/ferramenta`, com o corpo em `src/lib/respostas.ts` (mesmo padrão testável da etapa 1).
- Respostas:
  - JSON inválido ou pacote incompleto → **400** `{ "erro": "…" }`, sem gravar.
  - Ferramenta fora da tabela → **200** `{}`, sem gravar.
  - Sucesso → grava, chama `registrarSinal` e responde **200** `{}`.
  - Erro no banco → **500**, com log no console.
- `POST /api/simular` sai. `GET /api/feed` passa a incluir `conexao`.

### Scripts

- `"dev": "next dev -p 4000 -H 127.0.0.1"`, `"start": "next start -p 4000 -H 127.0.0.1"`.

### Tela

- **Topo:** ao lado de "Ao vivo / Sem sinal" fica o indicador do happy-team-chat.
  - Apagado: "Esperando o happy-team-chat".
  - Aceso, em azul (`info`): "happy-team-chat conectado" e, embaixo, "último sinal às HH:MM:SS".
  - O horário usa `formatarHora`, com fuso fixo, para não dar erro de hidratação.
- **Colunas vazias:**
  - Entrada: "Esperando o primeiro prompt do happy-team-chat. Mande algo para o Claude Code lá."
  - Saída: "Nenhum comando ainda. Aparece aqui quando o Claude for rodar um comando ou mexer num arquivo."
- **Item de prompt sem nota:**
  - Fechado: nota "—" em tom apagado.
  - Aberto: texto inteiro com as quebras de linha preservadas (`whitespace-pre-wrap`) e a frase "Ainda sem avaliação: a nota chega quando a IA for ligada." no lugar das barrinhas.
  - Com nota, continua igual à etapa 1.
- **Rodapé:** sai o "Simular" e fica o indicador TypeSafe.
- **Consulta:** `INTERVALO_MS = 1000`.

## Erros

| Situação | Comportamento |
|---|---|
| Crivo desligado | O `curl` falha e o `|| true` dá saída 0. O Claude segue sem aviso. |
| Crivo lento | O `curl` desiste em 2 s e o Claude segue. |
| Pacote inválido | 400, nada gravado, aviso no console do Crivo. |
| Ferramenta desconhecida | 200 `{}`, nada gravado. |
| Erro de banco ao gravar | 500 e log. O gancho ignora a resposta. |
| Banco da etapa 1 | Tabelas recriadas uma vez (versão 2). |

## Testes

- **Vitest:**
  - `lerGanchoPrompt`: válido; sem prompt; prompt só de espaços; sem cwd; JSON não-objeto.
  - `lerGanchoFerramenta`: Bash, Write, Edit, MultiEdit, NotebookEdit; desconhecida → `"ignorar"`; sem alvo → `null`.
  - `semaforoDoPrompt(null)` → verde.
  - Banco: prompt sem nota grava e lê igual; conta em "passaram". O banco começa vazio. A migração apaga um banco da versão antiga e preserva um banco da versão 2 ao reabrir.
  - Conexão: só um prompt acende; uma ferramenta só atualiza o último sinal.
  - Respostas das duas rotas: `{}` + gravado; 400 com corpo inválido; 200 sem gravar com ferramenta desconhecida.
- **Verificação estática:** typecheck, lint, test, build.
- **De verdade:**
  - Executar o comando exato do `settings.local.json` com pacotes de exemplo. Com o Crivo ligado, o item aparece no navegador em até 1 s. Com o Crivo desligado, termina com código 0, sem saída e em menos de 2 s.
  - Navegador: as colunas vazias, a lâmpada acendendo no primeiro prompt.
  - Rede: `curl` pelo IP da rede local não conecta.
- **Teste final do usuário:** mandar um prompt no Claude Code dentro do happy-team-chat. Não abrimos sessão do Claude Code lá por conta própria.

## Git

- **Crivo:** branch `developer`.
- **happy-team-chat:** só o `.gitignore`, num commit na `developer`.
- Nada é mesclado na `main` nem enviado com push sem pedido.
