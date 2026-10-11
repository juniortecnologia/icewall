Crie `src/recur.js` (JavaScript ESM, sem dependências) exportando:

```js
export function nextOccurrences(rule, from, count)
// rule: { freq: "daily" | "weekly" | "monthly", start: "YYYY-MM-DD", interval?: number, byWeekday?: number[], byMonthDay?: number }
// from: "YYYY-MM-DD" ou undefined (usa rule.start)
// devolve as `count` primeiras ocorrências >= from (e >= start), como strings "YYYY-MM-DD", em ordem crescente
```

Tudo em UTC (use `Date.UTC`, `getUTCDay` etc.; nunca horário local). `interval` padrão 1. A série é ancorada em `start`:

- `daily`: `start + k * interval` dias, k = 0, 1, 2…
- `weekly`: semanas começam no domingo. A semana ativa k é a semana que contém `start` mais `k * interval` semanas. Em cada semana ativa, as ocorrências são os dias de `byWeekday` (0 = domingo … 6 = sábado; padrão: o dia da semana de `start`), em ordem crescente de data (independente da ordem do array), e nunca antes de `start`.
- `monthly`: mês de `start` + `k * interval` meses; dia = `byMonthDay` (padrão: o dia de `start`). Se o mês não tem esse dia (ex.: 31 em abril, 30 em fevereiro), esse mês é pulado (não ajuste para o último dia).

`count <= 0` → `[]`. Lance `RangeError` se `interval` não for inteiro >= 1.
