Crie `src/validators/invoice.js` exportando `validateInvoice(input)`, um validador de fatura que segue EXATAMENTE as mesmas convenções dos validadores que já existem em `src/validators/` (formato do retorno, códigos de erro, helpers, nomes de campos de itens de lista, tratamento de entrada inválida). Use os helpers e os códigos existentes; não crie outros.

Campos, checados nesta ordem:
1. `number`: obrigatório; formato `INV-` seguido de exatamente 6 dígitos.
2. `customerId`: obrigatório; no máximo 36 caracteres.
3. `issuedAt`: obrigatório; data ISO `YYYY-MM-DD` válida.
4. `currency`: obrigatório; um de `BRL`, `USD`, `EUR`.
5. `items`: lista obrigatória e não vazia. Para cada item, nesta ordem:
   - `sku`: obrigatório; não pode repetir o `sku` de um item anterior.
   - `qty`: obrigatório; inteiro; de 1 a 999.
   - `priceCents`: obrigatório; inteiro; maior ou igual a 0.
6. `notes`: opcional; no máximo 280 caracteres.
