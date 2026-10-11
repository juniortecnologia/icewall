import { CODES } from "../codes.js";
import { asText, err, isBlank, isInt, isIsoDate, itemField, result } from "./_util.js";

/**
 * Valida um(a) invoice. Nunca lança: entrada nula ou de tipo errado vira erros REQUIRED.
 * Os erros saem na ordem em que os campos são checados (a ordem abaixo).
 */
export function validateInvoice(input) {
  const v = input ?? {};
  const errors = [];
  if (isBlank(v.number)) errors.push(err("number", CODES.REQUIRED));
  else if (!/^INV-\d{6}$/.test(asText(v.number))) errors.push(err("number", CODES.INVALID_FORMAT));
  if (isBlank(v.customerId)) errors.push(err("customerId", CODES.REQUIRED));
  else if (asText(v.customerId).length > 36) errors.push(err("customerId", CODES.TOO_LONG));
  if (isBlank(v.issuedAt)) errors.push(err("issuedAt", CODES.REQUIRED));
  else if (!isIsoDate(v.issuedAt)) errors.push(err("issuedAt", CODES.INVALID_FORMAT));
  if (isBlank(v.currency)) errors.push(err("currency", CODES.REQUIRED));
  else if (!["BRL", "USD", "EUR"].includes(v.currency)) errors.push(err("currency", CODES.NOT_ALLOWED));
  if (!Array.isArray(v.items) || v.items.length === 0) errors.push(err("items", CODES.REQUIRED));
  else {
    const seen = new Set();
    v.items.forEach((item, i) => {
      const l = item ?? {};
      if (isBlank(l.sku)) errors.push(err(itemField("items", i, "sku"), CODES.REQUIRED));
      else if (seen.has(asText(l.sku))) errors.push(err(itemField("items", i, "sku"), CODES.DUPLICATE));
      else seen.add(asText(l.sku));
      if (isBlank(l.qty)) errors.push(err(itemField("items", i, "qty"), CODES.REQUIRED));
      else if (!isInt(l.qty)) errors.push(err(itemField("items", i, "qty"), CODES.NOT_INTEGER));
      else if (l.qty < 1 || l.qty > 999) errors.push(err(itemField("items", i, "qty"), CODES.OUT_OF_RANGE));
      if (isBlank(l.priceCents)) errors.push(err(itemField("items", i, "priceCents"), CODES.REQUIRED));
      else if (!isInt(l.priceCents)) errors.push(err(itemField("items", i, "priceCents"), CODES.NOT_INTEGER));
      else if (l.priceCents < 0) errors.push(err(itemField("items", i, "priceCents"), CODES.OUT_OF_RANGE));
    });
  }
  if (!isBlank(v.notes) && asText(v.notes).length > 280) errors.push(err("notes", CODES.TOO_LONG));
  return result(errors);
}
