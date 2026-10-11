Crie `src/paths.js` (JavaScript ESM, sem dependências) exportando `get`, `set` e `unset`.

Caminho: string como `"a.b[0].c"` ou `"items.2.name"`, ou array como `["a", "b", 0, "c"]`. Na string, `[n]` e segmentos só com dígitos são índices numéricos. No array, números são índices e strings são chaves (mesmo `"0"`). Caminho vazio (`""` ou `[]`) se refere ao próprio objeto.

- `get(obj, path, defaultValue)`: valor no caminho; se algum nível INTERMEDIÁRIO for `null`/`undefined` ou o valor final for `undefined`, devolve `defaultValue` (um valor final `null`, `0` ou `false` é devolvido como está).
- `set(obj, path, value)`: grava, criando os níveis que faltam: se a PRÓXIMA chave for índice numérico, cria um array; senão, um objeto. Um nível existente que seja primitivo (número, string, boolean, null) é substituído por um contêiner novo. Muta e devolve `obj`. Caminho vazio: não faz nada e devolve `obj`.
- `unset(obj, path)`: remove a última chave; se o pai for array e a chave um índice, usa `splice` (os seguintes sobem). Devolve `true` se algo foi removido, `false` se o caminho não existia.
