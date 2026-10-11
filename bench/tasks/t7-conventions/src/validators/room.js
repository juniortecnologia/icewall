import { CODES } from "../codes.js";
import { asText, err, isBlank, isInt, isIsoDate, itemField, result } from "./_util.js";

/**
 * Valida um(a) room. Nunca lança: entrada nula ou de tipo errado vira erros REQUIRED.
 * Os erros saem na ordem em que os campos são checados (a ordem abaixo).
 */
export function validateRoom(input) {
  const v = input ?? {};
  const errors = [];
  if (isBlank(v.code)) errors.push(err("code", CODES.REQUIRED));
  else if (!/^[A-Z]{3}-\d{4}$/.test(asText(v.code))) errors.push(err("code", CODES.INVALID_FORMAT));
  if (isBlank(v.name)) errors.push(err("name", CODES.REQUIRED));
  else if (asText(v.name).length > 80) errors.push(err("name", CODES.TOO_LONG));
  else if (asText(v.name).length < 2) errors.push(err("name", CODES.TOO_SHORT));
  if (isBlank(v.email)) errors.push(err("email", CODES.REQUIRED));
  else if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(asText(v.email))) errors.push(err("email", CODES.INVALID_FORMAT));
  if (isBlank(v.startsAt)) errors.push(err("startsAt", CODES.REQUIRED));
  else if (!isIsoDate(v.startsAt)) errors.push(err("startsAt", CODES.INVALID_FORMAT));
  if (isBlank(v.status)) errors.push(err("status", CODES.REQUIRED));
  else if (!["draft","active","archived"].includes(v.status)) errors.push(err("status", CODES.NOT_ALLOWED));
  if (isBlank(v.priority)) errors.push(err("priority", CODES.REQUIRED));
  else if (!isInt(v.priority)) errors.push(err("priority", CODES.NOT_INTEGER));
  else if (v.priority < 1 || v.priority > 5) errors.push(err("priority", CODES.OUT_OF_RANGE));
  if (isBlank(v.country)) errors.push(err("country", CODES.REQUIRED));
  else if (!["BR","PT","US"].includes(v.country)) errors.push(err("country", CODES.NOT_ALLOWED));
  return result(errors);
}
