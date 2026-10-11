import { CODES } from "../codes.js";
import { asText, err, isBlank, isInt, isIsoDate, itemField, result } from "./_util.js";

/**
 * Valida um(a) question. Nunca lança: entrada nula ou de tipo errado vira erros REQUIRED.
 * Os erros saem na ordem em que os campos são checados (a ordem abaixo).
 */
export function validateQuestion(input) {
  const v = input ?? {};
  const errors = [];
  if (isBlank(v.name)) errors.push(err("name", CODES.REQUIRED));
  else if (asText(v.name).length > 80) errors.push(err("name", CODES.TOO_LONG));
  else if (asText(v.name).length < 2) errors.push(err("name", CODES.TOO_SHORT));
  if (!isBlank(v.description) && asText(v.description).length > 500) errors.push(err("description", CODES.TOO_LONG));
  if (isBlank(v.startsAt)) errors.push(err("startsAt", CODES.REQUIRED));
  else if (!isIsoDate(v.startsAt)) errors.push(err("startsAt", CODES.INVALID_FORMAT));
  if (isBlank(v.quantity)) errors.push(err("quantity", CODES.REQUIRED));
  else if (!isInt(v.quantity)) errors.push(err("quantity", CODES.NOT_INTEGER));
  else if (v.quantity < 1 || v.quantity > 9999) errors.push(err("quantity", CODES.OUT_OF_RANGE));
  if (isBlank(v.priority)) errors.push(err("priority", CODES.REQUIRED));
  else if (!isInt(v.priority)) errors.push(err("priority", CODES.NOT_INTEGER));
  else if (v.priority < 1 || v.priority > 5) errors.push(err("priority", CODES.OUT_OF_RANGE));
  if (isBlank(v.ownerId)) errors.push(err("ownerId", CODES.REQUIRED));
  else if (asText(v.ownerId).length > 36) errors.push(err("ownerId", CODES.TOO_LONG));
  else if (asText(v.ownerId).length < 1) errors.push(err("ownerId", CODES.TOO_SHORT));
  return result(errors);
}
