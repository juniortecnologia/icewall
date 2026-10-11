# Crivo

O Crivo são os dois portões do Claude Code: na entrada, a Jev avalia cada prompt antes de o Claude ler; na saída, cada comando e arquivo fica registrado. Desde 2026-10-10 ele é uma aba do ICEWALL (antes era um app separado em `~/Projects/crivo`, porta 4000).

## Portão de entrada

Cada prompt passa por regras de `decidir` (decisao.ts) na ordem:
1. `>>` no começo (pressa): passa direto.
2. Até 4 palavras (resposta curta): passa direto.
3. Resposta às perguntas do Claude: se o prompt anterior da mesma sessão foi amarelo da Jev, passa direto.
4. Jev falhou (sem chave, chave recusada, limite de uso, fora do ar ou mais de 8 s): o prompt passa como "não avaliado", com o motivo guardado.
5. Avaliação da Jev: verifica critérios de qualidade.

| Cor | Condição | Comportamento |
|---|---|---|
| Verde | 0 critérios faltando | Passa em silêncio. |
| Amarelo | 1 ou 2 critérios faltando | Passa com aviso para o Claude perguntar antes. |
| Vermelho | 3 ou mais critérios faltando | Barrado; terminal mostra o que faltou. |

Critérios e limites: objetivo, onde e pronto faltam quando a chance é < 50%; "mistura" falta quando > 60%. Em "ajustes" pequenos só o objetivo conta. A nota (0–100) é média de objetivo, onde, pronto e (1 − mistura), mas a cor sai dos critérios, não da nota.

**Limitação conhecida:** o Claude Code também dispara o gancho para as notificações que ele mesmo injeta como prompt (`<task-notification>`, `<agent-message>` com o relatório de um subagente). Hoje a Jev avalia essas notificações como pedidos e pode barrá-las.

## Portão de saída

Cada Bash, Write, Edit, MultiEdit e NotebookEdit é registrado (comando ou arquivo). Por enquanto só registra: todos ficam "liberado"; segurar por regras da casa é a próxima etapa.

## Ligar num projeto

Os ganchos ficam no `.claude/settings.local.json` do projeto vigiado (hoje só o happy-team-chat):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "curl -sf -m 10 -H 'Content-Type: application/json' -H 'x-icewall: 1' --data-binary @- http://127.0.0.1:4310/api/crivo/hooks/prompt || true", "timeout": 15 } ] }
    ],
    "PreToolUse": [
      { "matcher": "Bash|Write|Edit|MultiEdit|NotebookEdit", "hooks": [ { "type": "command", "command": "curl -s -m 2 -o /dev/null -H 'Content-Type: application/json' -H 'x-icewall: 1' --data-binary @- http://127.0.0.1:4310/api/crivo/hooks/tool || true", "timeout": 5 } ] }
    ]
  }
}
```

- `-sf` faz a resposta do ICEWALL virar a saída do gancho (é assim que ele bloqueia ou avisa).
- `|| true` e os limites (Jev 8 s, rota 9 s, curl 10 s, gancho 15 s) garantem que o Claude Code nunca trava e o prompt passa se o ICEWALL estiver fora.
- O header `x-icewall: 1` é obrigatório (sem ele, 403).
- A descrição do projeto que a Jev recebe vem de [projetos.ts](../../src/server/crivo/projetos.ts), pela última pasta do `cwd`; projeto sem descrição usa o nome da pasta.

## Rotas

| Rota | Proteção | O que faz |
|---|---|---|
| GET /api/crivo | leitura | feed (50 mais recentes), placar, último gancho, se a chave da Jev está carregada |
| POST /api/crivo/avaliar | header x-icewall + origem local | área de teste: avalia `{ texto, origem? }` sem gravar |
| POST /api/crivo/hooks/prompt | header x-icewall + origem local | gancho UserPromptSubmit: devolve `{}`, `hookSpecificOutput.additionalContext` ou `decision: "block"` |
| POST /api/crivo/hooks/tool | header x-icewall + origem local | gancho PreToolUse: registra e devolve `{}` |

## Dados e custo

Tabelas `crivo_prompts` e `crivo_comandos` no `data/icewall.db` (horários em ms). Os tokens de cada chamada da Jev ficam no prompt e entram nos totais da tela Auditor como "prompt (Crivo)". A Jev do Crivo não usa o cache do auditor: o gancho espera no máximo 10 s e um prompt repetido é avaliado de novo.

## Histórico

As etapas 1–3 foram feitas no repositório próprio do Crivo e vieram para o ICEWALL com o histórico (`git log --follow src/server/crivo/decisao.ts`). Specs e planos originais: [specs](specs/) e [plans](plans/). Os dados antigos (31 prompts, 285 comandos) foram importados uma vez com `node scripts/import-crivo.ts`; o backup do Crivo antigo (git bundle, banco, .env) está em `~/Backups/crivo-2026-10-10/`.

## Código

- [decisao.ts](../../src/server/crivo/decisao.ts) (regras, puro)
- [jev.ts](../../src/server/crivo/jev.ts) (chamada à Jev)
- [ganchos.ts](../../src/server/crivo/ganchos.ts) (lê os pacotes dos ganchos)
- [respostas.ts](../../src/server/crivo/respostas.ts) (handlers das rotas)
- [store.ts](../../src/server/crivo/store.ts) (banco)
- [crivo.tsx](../../src/components/views/crivo.tsx) (a aba)
