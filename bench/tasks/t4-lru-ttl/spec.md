Crie `src/lru.js` (JavaScript ESM, sem dependências) exportando a classe `LruCache`:

```js
new LruCache({ max, ttlMs = Infinity, now = () => Date.now() })
```

- `max` inteiro >= 1, senão `throw new RangeError("max")`.
- `set(key, value)`: grava (ou regrava) o valor, reinicia o prazo de validade (`now() + ttlMs`) e torna a chave a mais recente. Se depois disso houver mais de `max` entradas, remove primeiro as expiradas e, se ainda passar, a menos recentemente usada. Devolve `this`.
- `get(key)`: valor, tornando a chave a mais recente; se não existe ou expirou, devolve `undefined` (e remove a expirada).
- `has(key)`: `true` se existe e não expirou. NÃO muda a ordem de uso.
- `delete(key)`: remove; devolve `true` se existia (mesmo expirada).
- `size` (getter): quantidade de entradas não expiradas.
- `keys()`: array das chaves não expiradas, da MENOS para a MAIS recentemente usada.

`has`, `size` e `keys()` só leem: não removem entradas (só `get`, `set` e `delete` removem).

Uma entrada está expirada quando `now() >= expiraEm`. Use o `now` injetado (nunca `Date.now()` direto).
