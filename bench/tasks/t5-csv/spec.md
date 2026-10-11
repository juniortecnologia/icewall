Crie `src/csv.js` (JavaScript ESM, sem dependências) exportando:

```js
export function parseCsv(text, { delimiter = ",", header = true } = {})
```

Regras (RFC 4180):
- Registros separados por `\n` ou `\r\n`. Uma quebra de linha no fim do texto não gera registro vazio. Texto vazio → `[]`.
- Campo entre aspas duplas pode conter o delimitador, quebras de linha (preservadas exatamente como estão, inclusive `\r\n`) e aspas escapadas como `""` (viram uma `"`). Fora de aspas, o campo é o texto literal (sem trim). Campo vazio → `""`.
- Aspas abertas e nunca fechadas → `throw new Error("UNTERMINATED_QUOTE")`.
- `header: true`: o primeiro registro são os nomes das colunas; devolve um array de objetos. `header: false`: devolve array de arrays.
- Todo registro deve ter o mesmo número de campos do primeiro; senão `throw new Error("ROW_LENGTH:" + linha)`, onde `linha` é o número (começando em 1) da linha física do texto onde esse registro começa.
