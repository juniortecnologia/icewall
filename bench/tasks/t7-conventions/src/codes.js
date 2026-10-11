// Códigos de erro estáveis: a interface traduz pelo código, nunca pela mensagem.
export const CODES = Object.freeze({
  REQUIRED: "E_REQUIRED",
  TOO_LONG: "E_TOO_LONG",
  TOO_SHORT: "E_TOO_SHORT",
  INVALID_FORMAT: "E_FORMAT",
  OUT_OF_RANGE: "E_RANGE",
  NOT_ALLOWED: "E_NOT_ALLOWED",
  NOT_INTEGER: "E_NOT_INTEGER",
  DUPLICATE: "E_DUPLICATE",
});
