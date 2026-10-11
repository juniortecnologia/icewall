// Helpers compartilhados pelos validadores.
export const err = (field, code) => ({ field, code });
export const isBlank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");
export const asText = (v) => (typeof v === "string" ? v.trim() : "");
export const isInt = (v) => typeof v === "number" && Number.isInteger(v);
export const isIsoDate = (v) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
export const result = (errors) => ({ ok: errors.length === 0, errors });
// Campos de itens de lista: "lista[i].campo"
export const itemField = (list, i, field) => `${list}[${i}].${field}`;
