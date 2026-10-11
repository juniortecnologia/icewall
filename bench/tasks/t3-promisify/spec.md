Crie DOIS arquivos (JavaScript ESM, sem dependências):

`src/store.js`, exportando:
- `promisifyStore(legacy)`: recebe o objeto de `createLegacyStore` (veja `src/legacy-store.js`) e devolve `{ get(key), set(key, value), del(key), keys(prefix) }`, cada um devolvendo uma Promise que resolve com o resultado do callback ou rejeita com o erro dele. Não use `util.promisify`.
- `async function getMany(store, keys)`: recebe o store já promisificado e uma lista de chaves; busca as chaves EM SEQUÊNCIA (uma de cada vez, na ordem dada) e devolve um objeto `{ chave: valor }` só com as chaves cujo valor não é `undefined`.
- `async function withRetry(fn, { attempts = 3, retryOn = (err) => err?.message === "TRANSIENT" } = {})`: chama `fn()` até dar certo; se falhar e `retryOn(err)` for verdadeiro e ainda houver tentativas, tenta de novo (sem espera); senão rejeita com o último erro. `attempts` é o total de chamadas.

`src/index.js`: reexporta tudo de `./store.js` e também `createLegacyStore` de `./legacy-store.js`.
