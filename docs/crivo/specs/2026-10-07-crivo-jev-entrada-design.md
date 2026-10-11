# Crivo — etapa 3: o Jev no portão de entrada

Data: 2026-10-07 · Status: aprovado em conversa, aguardando revisão da spec · Etapas anteriores: `2026-10-06-crivo-painel-design.md`, `2026-10-06-crivo-ganchos-design.md`

## Objetivo

Cada prompt mandado ao Claude Code no happy-team-chat passa a ser avaliado pelo **Jev** (modelo System One da TypeSafe) antes de o Claude ler. O Jev só responde probabilidades. **A decisão fica no código** do Crivo:

- **verde:** o prompt passa em silêncio;
- **amarelo:** o prompt passa e o Claude recebe um aviso do que faltou, com o pedido de perguntar antes de começar;
- **vermelho:** o prompt é barrado, e o terminal mostra o que faltou.

O painel mostra a nota, os critérios e quanto tempo o Jev levou, e ganha uma **área de teste** para avaliar um prompt sem mandá-lo ao Claude Code. O portão de saída não muda nesta etapa: continua só registrando.

## Critérios de sucesso

- Um prompt vago de funcionalidade (por exemplo "faz uns relatórios aí… e muda o login") é barrado. O terminal do Claude Code mostra o que faltou.
- Um pedido detalhado passa em silêncio (verde).
- Um pedido com 1 ou 2 critérios faltando passa, e o Claude recebe o aviso e pergunta antes de começar.
- Um prompt começando com `>>` passa sem chamar o Jev.
- Um prompt de até 4 palavras passa sem chamar o Jev.
- Se o Jev ou o Crivo falhar, o prompt passa e o Claude Code nunca trava. O pior caso é ~10 s de espera.
- A área de teste mostra o resultado e o que aconteceria no Claude Code, sem gravar nada.

## Fora do escopo

- Avaliar comandos e arquivos com o Jev (portão de saída): fica para a próxima etapa.
- Calibrar os limites com dados rotulados: os limites de 50% e 60% são do usuário e ficam em constantes fáceis de mudar.
- Editar a descrição do projeto pela tela: ela fica numa constante.

## Decisões tomadas na conversa

1. **Marca de pressa: `>>` no começo** (depois de espaços). O `!` foi descartado porque no Claude Code do terminal ele abre o modo shell e o prompt nem chega ao Claude.
   - O gancho não consegue alterar o texto do prompt. O Claude recebe junto uma linha curta: "o `>>` no começo é só a marca de pressa do usuário para o Crivo; ignore."
2. **Ajuste pequeno:** passa (verde), a não ser que falte o objetivo claro; aí é **amarelo**. Os outros critérios não contam para ajuste.
3. **Nota:** média de objetivo, onde, pronto e (1 − mistura), em 0–100. O tamanho fica de fora. **A cor vem das regras de critérios faltando, não da nota.** Isso substitui, para prompts avaliados, a régua da etapa 1 (≥ 70 / 40–69 / < 40).
4. **Jev falhou** (sem chave, chave recusada, limite, fora do ar, > 8 s): o prompt passa como **"não avaliado"**, verde, com o motivo guardado e mostrado. O Claude não recebe aviso.
5. **Área de teste:** um painel por cima da tela, aberto por "Testar um prompt". Não grava, não entra no placar e não acende o "conectado". O `>>` e a regra de resposta curta também valem nela.
6. **Transporte até o Jev:** SDK oficial `@typesafe-ai/sdk`, só no servidor, com limite de 8 s e sem nova tentativa.
7. **Resposta ao Claude Code:** o gancho de prompt troca `-s -o /dev/null` por `curl -sf -m 10`, para a resposta do Crivo virar a saída do gancho. Com o Crivo desligado ou com erro HTTP, o `curl` não imprime nada e o prompt segue.
8. **Resposta curta:** até **4 palavras** passa direto, sem chamar o Jev, marcada "resposta curta". Assim as respostas de conversa ("sim", "aprovado", "pode continuar") não são barradas.
9. **Resposta às perguntas do Claude** (decidido depois da revisão final, opção A): se o último prompt da mesma sessão foi amarelo, o Claude recebeu o pedido de perguntar antes; o prompt seguinte é a resposta do usuário e passa sem chamar o Jev, marcado `avaliacao: "resposta"`, verde, saída `{}`. O seguinte a ele volta a ser avaliado. Vermelho não libera nada, porque o prompt barrado nem chegou ao Claude. Sem sessão (área de teste), a regra não vale.

## Perguntas ao Jev

Uma chamada só, modelo `jev-latest` (o padrão do SDK).

**Estado:**

```json
{ "projeto": "happy-team-chat: um chat de WhatsApp para equipes", "pedido": "<prompt, no máximo 20.000 caracteres>" }
```

Se o prompt tiver mais de 20.000 caracteres, vão os primeiros 20.000.

| id | tipo | instruções | critérios |
|---|---|---|---|
| `tamanho` | choice | Qual o tamanho do trabalho que o `pedido` pede, considerando o `projeto`? | `ajuste`: Ajuste pequeno: corrigir, trocar ou ajustar algo pontual que já existe (um texto, um botão, um bug). · `funcionalidade`: Funcionalidade nova: uma tela, fluxo ou recurso novo dentro do projeto. · `sistema`: Sistema inteiro: um módulo grande, várias telas ou uma reestruturação do projeto. |
| `objetivo` | noul | Duas pessoas diferentes, lendo o `pedido`, entenderiam a mesma coisa sobre o que deve ser feito? | true: O resultado esperado é específico e só admite uma leitura. · false: É vago, ambíguo ou aberto a interpretações diferentes. |
| `onde` | noul | O `pedido` diz em que tela, arquivo ou parte do `projeto` mexer? | true: Nomeia a tela, o arquivo, o componente ou a área do projeto. · false: Não diz onde a mudança acontece. |
| `pronto` | noul | O `pedido` diz como saber que ficou pronto: o que tem que aparecer, funcionar ou passar? | true: Descreve o resultado verificável ou o critério de aceite. · false: Não diz como conferir que terminou. |
| `mistura` | noul | O `pedido` junta duas ou mais tarefas independentes, que poderiam ser pedidas separadamente? | true: Duas ou mais tarefas sem relação entre si no mesmo pedido. · false: Uma tarefa só, mesmo que tenha vários passos. |

## Decisão (`src/lib/decisao.ts`, funções puras)

Constantes:
- `LIMITE_FALTA = 0.5`: objetivo, onde e pronto contam como faltando quando a chance é **< 0,5**.
- `LIMITE_MISTURA = 0.6`: mistura conta como faltando quando a chance é **> 0,6**.
- `PALAVRAS_RESPOSTA_CURTA = 4`.
- `MARCA_PRESSA = ">>"`.

A decisão segue esta ordem; a primeira regra que vale encerra:

1. **Texto (sem espaços nas pontas) começa com `>>`:**
   - `avaliacao: "pressa"`, verde, nota e critérios nulos;
   - para o Claude Code: `additionalContext` com a linha de ignorar a marca.
2. **Até 4 palavras** (separadas por espaços):
   - `avaliacao: "curta"`, verde, nota e critérios nulos;
   - para o Claude Code: `{}`.
2b. **O último prompt da sessão foi amarelo** (decisão 9): `avaliacao: "resposta"`, verde, nota e critérios nulos; para o Claude Code: `{}`.
3. **O Jev falhou:**
   - `avaliacao: "falhou"`, verde, nota e critérios nulos, `motivo` preenchido;
   - para o Claude Code: `{}`.
4. **O Jev respondeu** (`avaliacao: "jev"`):
   - `faltando` = os critérios faltando, na ordem objetivo, onde, pronto, mistura.
   - Se `tamanho == "ajuste"`: amarelo se `objetivo` faltar (e então `faltando = ["objetivo"]`); senão verde e `faltando = []`.
   - Se não: 0 faltando → verde; 1–2 → amarelo; ≥ 3 → vermelho.
   - `nota` = arredondamento de 100 × média(objetivo, onde, pronto, 1 − mistura).
   - `criterios`:
     - `tamanho` = a escolha;
     - `tamanhoPct` = arredondamento de 100 × (0,5·p(funcionalidade) + 1·p(sistema));
     - `objetivoPct`, `ondePct`, `prontoPct` = 100 × chance;
     - `focoPct` = 100 × (1 − mistura).
   - `duracaoMs` = o tempo da chamada.

**Rótulos do que faltou:**
- `objetivo`: "um objetivo claro (duas pessoas poderiam entender coisas diferentes)"
- `onde`: "em que tela ou parte do projeto mexer"
- `pronto`: "como saber que ficou pronto"
- `mistura`: "uma tarefa só (o pedido mistura várias)"

**Mensagens:**
- **Amarelo** (`hookSpecificOutput.additionalContext`):
  > Aviso do Crivo: neste pedido faltou {lista}. O usuário prefere que você pergunte isso antes de começar: faça as perguntas primeiro e só comece depois das respostas.
- **Vermelho** (`{"decision": "block", "reason": …}`):
  > O Crivo barrou este prompt (nota {nota}). Faltou: {lista}. Reescreva incluindo isso, ou comece com >> para passar sem avaliação.
- **Pressa** (`additionalContext`):
  > O ">>" no começo do prompt é só a marca de pressa do usuário para o Crivo; ignore.
- `{lista}` junta os rótulos com "; " no bloqueio e com ", " e " e " no aviso.

## Jev (`src/lib/jev.ts`)

- `avaliarComJev(texto): Promise<RespostaJev | FalhaJev>` monta o estado e as perguntas acima.
- Usa `TypeSafeClient` com `timeout: 8000` e nenhuma nova tentativa (confirmar o nome do campo em `RetryPolicy` no SDK instalado). A chave vem de `TYPESAFE_API_KEY` no servidor.
- Mede o tempo com `performance.now()` em volta da chamada.
- Toda exceção vira `FalhaJev { motivo }`, com motivos em português:
  - sem chave: "sem chave TypeSafe";
  - 401: "TypeSafe recusou a chave";
  - 429: "limite de uso da TypeSafe";
  - 529 ou 5xx: "TypeSafe indisponível";
  - tempo esgotado: "o Jev não respondeu em 8 s";
  - outros: "erro ao falar com a TypeSafe".
- O erro técnico vai para o console do Crivo, **sem a chave**.
- Para testar sem rede: a função aceita a opção `fetch` do SDK.

## Dados (esquema v3)

- **Migração v2 → v3 com `ALTER TABLE prompts ADD COLUMN`**, preservando os dados. A regra de "só a v1 é apagada" continua.
- **Colunas novas em `prompts`:**
  - `avaliacao TEXT CHECK (avaliacao IN ('jev','pressa','curta','falhou'))`, nula nos prompts da etapa 2;
  - `duracao_ms INTEGER`;
  - `faltando TEXT`: um array JSON de chaves, nulo quando não avaliado;
  - `motivo TEXT`.
- **Tipos:** `Prompt` ganha `avaliacao`, `duracaoMs`, `faltando: Criterio[] | null` e `motivo`.
- `semaforo` continua gravado. Para avaliações do Jev ele vem de `decidir`, não de `semaforoDaNota`.

## Rotas

- **`POST /api/ganchos/prompt`:**
  1. lê o pacote e chama `decidir` (com o Jev, quando a regra pedir);
  2. grava, registra o sinal de "conectado";
  3. responde **200** com a saída do gancho: `{}`, o objeto com `additionalContext` ou o objeto com `block`.
  - Pacote inválido → 400 (o `curl -f` não imprime nada, e o prompt segue).
- **`POST /api/avaliar`** (área de teste), corpo `{ "texto": string }`:
  - responde 200 com `{ semaforo, nota, criterios, faltando, avaliacao, motivo, duracaoMs, saidaGancho }`;
  - **não grava** e não registra sinal;
  - texto vazio → 400.
- O gancho de ferramenta e o feed não mudam.

## Gancho no happy-team-chat

Em `.claude/settings.local.json`, só o comando de `UserPromptSubmit` muda:

```
curl -sf -m 10 -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:4000/api/ganchos/prompt || true
```

com `"timeout": 15`. O de `PreToolUse` continua `-s -m 2 -o /dev/null`.

## Tela

- **Item de prompt fechado:**
  - a nota em número quando `avaliacao = "jev"`, ou "—" nos outros casos;
  - ao lado da hora, "Jev 1,3 s" (vírgula decimal, uma casa).
- **Item de prompt aberto:**
  - `jev`: as 5 barrinhas; "Faltou: …" quando houver; no amarelo, "O Claude recebeu: «aviso»"; no vermelho, "Barrado. No terminal: «motivo do bloqueio»";
  - `pressa`: "Passou direto (pressa, `>>`)";
  - `curta`: "Resposta curta: passou sem avaliação";
  - `falhou`: "Não avaliado: {motivo}";
  - `null` (etapa 2): "Registrado antes da avaliação com IA".
- **Área de teste:**
  - um botão "Testar um prompt" no topo abre um `<dialog>` modal com `<textarea>` e o botão "Avaliar", que enquanto espera mostra "Avaliando…";
  - o resultado usa o mesmo visual do item e acrescenta o bloco "No Claude Code, isto…": passaria em silêncio / passaria com este aviso ao Claude / seria barrado com esta mensagem;
  - erro → uma mensagem curta no próprio painel;
  - Esc fecha, e o foco volta ao botão.
- **Placar:** sem mudança. As cores reais já são contadas.

## Erros

| Situação | Comportamento |
|---|---|
| Crivo desligado | O `curl` falha, `|| true` dá saída vazia e o prompt segue. |
| Crivo com erro (4xx/5xx) | `curl -f` não imprime nada e o prompt segue. |
| Jev falha ou > 8 s | Passa como "não avaliado", com o motivo. |
| Crivo travado | O `curl -m 10` desiste e o prompt segue. |
| Prompt enorme | O Jev recebe os primeiros 20.000 caracteres; o banco guarda tudo. |
| Chave | Só no servidor; nunca na resposta, no log ou na tela. |

## Testes

- **`decisao`:**
  - os limites (0,49 falta e 0,5 não falta; mistura 0,6 não falta e 0,61 falta);
  - ajuste com e sem objetivo;
  - funcionalidade e sistema com 0, 1, 2, 3 e 4 faltando;
  - a nota; o `tamanhoPct`;
  - `>>` com espaços antes;
  - 4 palavras passam e 5 são avaliadas;
  - a falha;
  - o texto exato das mensagens.
- **`jev`:** com um `fetch` falso que confere o estado e as 5 perguntas enviadas e devolve respostas no formato da API; 401 → motivo da chave; tempo esgotado → motivo dos 8 s; sem chave.
- **Rotas:** com um avaliador injetado:
  - o gancho devolve `{}`, aviso ou bloqueio, e grava os campos novos;
  - `/api/avaliar` não grava;
  - pacote inválido → 400.
- **Migração:** um banco v2 com linhas vira v3 e mantém as linhas.
- **Verificação estática:** typecheck, lint, test, build.
- **De verdade:**
  - uma rodada com o Jev real e uns 5 prompts (gasta poucos tokens da conta do usuário);
  - o comando exato do gancho, com o Crivo ligado e desligado;
  - a área de teste no navegador.
- **Teste final do usuário:** mandar prompts no Claude Code.

## Git

- **Crivo:** branch `developer`.
- **happy-team-chat:** só o arquivo ignorado `settings.local.json` muda, sem commit.
- Nada vai para a `main` nem é enviado com push sem pedido.
