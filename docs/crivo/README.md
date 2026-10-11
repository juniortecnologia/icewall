# Crivo

O Crivo são os dois portões do Claude Code, em todos os projetos: na entrada, a Jev avalia cada prompt antes de o Claude ler; na saída, cada comando e arquivo fica registrado. Desde 2026-10-10 ele é uma aba do ICEWALL (antes era um app separado em `~/Projects/crivo`, porta 4000, ligado só ao happy-team-chat).

## Portão de entrada

Cada prompt passa por regras de `decidir` (decisao.ts) na ordem:
1. Notificação do próprio Claude Code (começa com `<task-notification>` ou `<agent-message `, como o fim de um comando em segundo plano ou o relatório de um subagente): passa direto. Texto colado (`<pasted_content`) continua sendo avaliado.
2. `>>` no começo (pressa): passa direto.
3. Até 4 palavras (resposta curta): passa direto.
4. Resposta às perguntas do Claude: se o prompt anterior da mesma sessão, sem contar notificações, foi amarelo da Jev, passa direto.
5. Jev falhou (sem chave, chave recusada, limite de uso, fora do ar ou mais de 8 s): o prompt passa como "não avaliado", com o motivo guardado.
6. Avaliação da Jev: verifica critérios de qualidade.

| Cor | Condição | Comportamento |
|---|---|---|
| Verde | 0 critérios faltando | Passa em silêncio. |
| Amarelo | 1 ou 2 critérios faltando | Passa com aviso para o Claude perguntar antes. |
| Vermelho | 3 ou mais critérios faltando | Barrado; terminal mostra o que faltou. |

Critérios e limites: objetivo, onde e pronto faltam quando a chance é < 50%; "mistura" falta quando > 60%. Em "ajustes" pequenos só o objetivo conta. A nota (0–100) é média de objetivo, onde, pronto e (1 − mistura), mas a cor sai dos critérios, não da nota.

## Portão de saída

Cada Bash, Write, Edit, MultiEdit e NotebookEdit é registrado (comando ou arquivo). Por enquanto só registra: todos ficam "liberado"; segurar por regras da casa é a próxima etapa.

## Ganchos (todos os projetos)

Os ganchos ficam no `~/.claude/settings.json`, então valem para toda sessão do Claude Code, em qualquer pasta (as outras chaves do arquivo ficam como estão):

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
- Não repita os ganchos no `.claude/settings.local.json` de um projeto: cada prompt seria gravado duas vezes. Para tirar um projeto do Crivo, desligue-o na aba.

## Projetos

O projeto de um gancho é a última pasta do `cwd` (duas pastas com o mesmo nome contam como o mesmo projeto). Ele aparece no painel "Projetos" da aba no primeiro gancho, e lá dá para:
- **Desligar o Crivo nele:** os dois ganchos respondem `{}` na hora, sem chamar a Jev e sem gravar nada.
- **Mudar a descrição que a Jev recebe** para julgar o tamanho do pedido. A ordem é: a descrição escrita na aba; senão, o título e o primeiro parágrafo do `README.md` do `cwd` ([readme.ts](../../src/server/crivo/readme.ts)), ignorando README de template (create-next-app, Vite); senão, o nome da pasta. O CLAUDE.md fica de fora, porque traz instruções para o Claude, não a descrição do projeto.

## Rotas

| Rota | Proteção | O que faz |
|---|---|---|
| GET /api/crivo | leitura | feed (50 mais recentes), placar, projetos, último gancho, se a chave da Jev está carregada; `?origem=` filtra por projeto |
| POST /api/crivo/avaliar | header x-icewall + origem local | área de teste: avalia `{ texto, origem? }` sem gravar, com a descrição daquele projeto |
| POST /api/crivo/projetos | header x-icewall + origem local | `{ origem, descricao?: texto ou null, desligado?: boolean }`; `descricao: null` volta para a automática |
| POST /api/crivo/hooks/prompt | header x-icewall + origem local | gancho UserPromptSubmit: devolve `{}`, `hookSpecificOutput.additionalContext` ou `decision: "block"` |
| POST /api/crivo/hooks/tool | header x-icewall + origem local | gancho PreToolUse: registra e devolve `{}` |

## Dados e custo

Tabelas `crivo_prompts`, `crivo_comandos` e `crivo_projetos` no `data/icewall.db` (horários em ms). Os tokens de cada chamada da Jev ficam no prompt e entram nos totais da tela Auditor como "prompt (Crivo)". A Jev do Crivo não usa o cache do auditor: o gancho espera no máximo 10 s e um prompt repetido é avaliado de novo.

## Histórico

As etapas 1–3 foram feitas no repositório próprio do Crivo e vieram para o ICEWALL com o histórico (`git log --follow src/server/crivo/decisao.ts`). Specs e planos originais: [specs](specs/) e [plans](plans/). Os dados antigos (31 prompts, 285 comandos) foram importados uma vez com `node scripts/import-crivo.ts`; o backup do Crivo antigo (git bundle, banco, .env) está em `~/Backups/crivo-2026-10-10/`.

## Código

- [decisao.ts](../../src/server/crivo/decisao.ts) (regras, puro)
- [jev.ts](../../src/server/crivo/jev.ts) (chamada à Jev)
- [ganchos.ts](../../src/server/crivo/ganchos.ts) (lê os pacotes dos ganchos)
- [respostas.ts](../../src/server/crivo/respostas.ts) (handlers das rotas)
- [projetos.ts](../../src/server/crivo/projetos.ts) e [readme.ts](../../src/server/crivo/readme.ts) (descrição do projeto)
- [store.ts](../../src/server/crivo/store.ts) (banco)
- [crivo.tsx](../../src/components/views/crivo.tsx) (a aba)
