Crie `src/cart.js` (JavaScript ESM, sem dependências) exportando:

```js
export function computeTotal(items, couponCode, today = new Date())
// items: [{ sku: string, qty: number }]
// devolve { subtotalCents, discountCents, totalCents, warnings: string[] }
```

Use `PRODUCTS` de `./catalog.js` e `COUPONS` de `./coupons.js` (veja os arquivos de contexto).

Regras, nesta ordem:
1. Para cada item: SKU fora do catálogo → `throw new Error("UNKNOWN_SKU:" + sku)`. `qty` que não seja inteiro positivo → `throw new Error("INVALID_QTY:" + sku)`.
2. Total da linha = `qty * priceCents`. Linhas com `qty >= 10` têm 10% de desconto de volume na própria linha: `linha - Math.round(linha * 0.1)`.
3. `subtotalCents` = soma das linhas já com o desconto de volume.
4. Cupom: `couponCode` nulo/indefinido/string vazia → sem cupom. A busca ignora maiúsculas/minúsculas e espaços nas pontas. Código inexistente → aviso `"UNKNOWN_COUPON"`. Vencido (a data UTC de `today` é posterior a `expires`) → aviso `"EXPIRED_COUPON"`. Subtotal abaixo de `minSubtotalCents` → aviso `"MIN_SUBTOTAL"`. Com aviso, o desconto do cupom é 0.
5. Cupom `percent`: `Math.round(subtotalCents * value / 100)`. Cupom `fixed`: `valueCents`, limitado ao subtotal (o total nunca fica negativo).
6. `discountCents` é só o desconto do cupom; `totalCents = subtotalCents - discountCents`. Sem avisos → `warnings: []`.
