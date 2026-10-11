import { CODES } from "../codes.js";
import { asText, err, isBlank, isInt, isIsoDate, itemField, result } from "./_util.js";

/**
 * Valida um(a) course. Nunca lança: entrada nula ou de tipo errado vira erros REQUIRED.
 * Os erros saem na ordem em que os campos são checados (a ordem abaixo).
 */
export function validateCourse(input) {
  const v = input ?? {};
  const errors = [];
  if (isBlank(v.code)) errors.push(err("code", CODES.REQUIRED));
  else if (!/^[A-Z]{3}-\d{4}$/.test(asText(v.code))) errors.push(err("code", CODES.INVALID_FORMAT));
  if (!isBlank(v.description) && asText(v.description).length > 500) errors.push(err("description", CODES.TOO_LONG));
  if (isBlank(v.email)) errors.push(err("email", CODES.REQUIRED));
  else if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(asText(v.email))) errors.push(err("email", CODES.INVALID_FORMAT));
  if (isBlank(v.quantity)) errors.push(err("quantity", CODES.REQUIRED));
  else if (!isInt(v.quantity)) errors.push(err("quantity", CODES.NOT_INTEGER));
  else if (v.quantity < 1 || v.quantity > 9999) errors.push(err("quantity", CODES.OUT_OF_RANGE));
  if (isBlank(v.status)) errors.push(err("status", CODES.REQUIRED));
  else if (!["draft","active","archived"].includes(v.status)) errors.push(err("status", CODES.NOT_ALLOWED));
  if (isBlank(v.ownerId)) errors.push(err("ownerId", CODES.REQUIRED));
  else if (asText(v.ownerId).length > 36) errors.push(err("ownerId", CODES.TOO_LONG));
  else if (asText(v.ownerId).length < 1) errors.push(err("ownerId", CODES.TOO_SHORT));
  if (isBlank(v.country)) errors.push(err("country", CODES.REQUIRED));
  else if (!["BR","PT","US"].includes(v.country)) errors.push(err("country", CODES.NOT_ALLOWED));
  return result(errors);
}
