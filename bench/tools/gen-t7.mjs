// Gera o contexto grande da T7: dezenas de validadores que seguem convenções que o pedido NÃO explica.
// Determinístico: rodar de novo produz os mesmos arquivos.  Uso: node bench/tools/gen-t7.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "tasks", "t7-conventions");
const dir = path.join(root, "src", "validators");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

fs.writeFileSync(
  path.join(root, "src", "codes.js"),
  `// Códigos de erro estáveis: a interface traduz pelo código, nunca pela mensagem.
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
`,
);

fs.writeFileSync(
  path.join(dir, "_util.js"),
  `// Helpers compartilhados pelos validadores.
export const err = (field, code) => ({ field, code });
export const isBlank = (v) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");
export const asText = (v) => (typeof v === "string" ? v.trim() : "");
export const isInt = (v) => typeof v === "number" && Number.isInteger(v);
export const isIsoDate = (v) => {
  if (typeof v !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
export const result = (errors) => ({ ok: errors.length === 0, errors });
// Campos de itens de lista: "lista[i].campo"
export const itemField = (list, i, field) => \`\${list}[\${i}].\${field}\`;
`,
);

const ENTITIES = [
  "customer", "supplier", "product", "warehouse", "shipment", "employee", "department", "project", "task", "ticket",
  "contract", "payment", "refund", "coupon", "campaign", "lead", "meeting", "asset", "license", "vehicle",
  "route", "booking", "room", "course", "lesson", "student", "teacher", "exam", "badge", "survey",
  "question", "answer", "review", "category", "tag", "brand", "store", "cart", "wishlist", "address",
  "bankAccount", "card", "subscription", "plan", "feature", "release", "incident", "alert", "report", "dashboard",
  "webhook", "apiKey", "session", "device", "sensor", "reading", "batch", "recipe", "menu", "order",
];
const FIELDS = [
  { name: "code", kind: "pattern", re: String.raw`^[A-Z]{3}-\d{4}$`, sample: "ABC-1234" },
  { name: "name", kind: "text", max: 80, min: 2 },
  { name: "description", kind: "optionalText", max: 500 },
  { name: "email", kind: "pattern", re: String.raw`^[^@\s]+@[^@\s]+\.[a-z]{2,}$`, sample: "a@b.io" },
  { name: "startsAt", kind: "date" },
  { name: "quantity", kind: "int", min: 1, max: 9999 },
  { name: "status", kind: "enum", values: ["draft", "active", "archived"] },
  { name: "priority", kind: "int", min: 1, max: 5 },
  { name: "ownerId", kind: "text", max: 36, min: 1 },
  { name: "country", kind: "enum", values: ["BR", "PT", "US"] },
];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

function fieldCheck(f, access, field) {
  switch (f.kind) {
    case "text":
      return `  if (isBlank(${access})) errors.push(err(${field}, CODES.REQUIRED));
  else if (asText(${access}).length > ${f.max}) errors.push(err(${field}, CODES.TOO_LONG));
  else if (asText(${access}).length < ${f.min}) errors.push(err(${field}, CODES.TOO_SHORT));`;
    case "optionalText":
      return `  if (!isBlank(${access}) && asText(${access}).length > ${f.max}) errors.push(err(${field}, CODES.TOO_LONG));`;
    case "pattern":
      return `  if (isBlank(${access})) errors.push(err(${field}, CODES.REQUIRED));
  else if (!/${f.re}/.test(asText(${access}))) errors.push(err(${field}, CODES.INVALID_FORMAT));`;
    case "date":
      return `  if (isBlank(${access})) errors.push(err(${field}, CODES.REQUIRED));
  else if (!isIsoDate(${access})) errors.push(err(${field}, CODES.INVALID_FORMAT));`;
    case "int":
      return `  if (isBlank(${access})) errors.push(err(${field}, CODES.REQUIRED));
  else if (!isInt(${access})) errors.push(err(${field}, CODES.NOT_INTEGER));
  else if (${access} < ${f.min} || ${access} > ${f.max}) errors.push(err(${field}, CODES.OUT_OF_RANGE));`;
    case "enum":
      return `  if (isBlank(${access})) errors.push(err(${field}, CODES.REQUIRED));
  else if (!${JSON.stringify(f.values)}.includes(${access})) errors.push(err(${field}, CODES.NOT_ALLOWED));`;
    default:
      throw new Error(f.kind);
  }
}

ENTITIES.forEach((entity, i) => {
  // Cada entidade usa um subconjunto rotativo de campos; algumas têm lista de itens (convenção "lista[i].campo").
  const fields = FIELDS.filter((_, j) => (i + j) % 3 !== 0);
  const hasItems = i % 4 === 1;
  const lines = [
    `import { CODES } from "../codes.js";`,
    `import { asText, err, isBlank, isInt, isIsoDate, itemField, result } from "./_util.js";`,
    ``,
    `/**`,
    ` * Valida um(a) ${entity}. Nunca lança: entrada nula ou de tipo errado vira erros REQUIRED.`,
    ` * Os erros saem na ordem em que os campos são checados (a ordem abaixo).`,
    ` */`,
    `export function validate${cap(entity)}(input) {`,
    `  const v = input ?? {};`,
    `  const errors = [];`,
    ...fields.map((f) => fieldCheck(f, `v.${f.name}`, JSON.stringify(f.name))),
  ];
  if (hasItems) {
    lines.push(
      `  if (!Array.isArray(v.lines) || v.lines.length === 0) errors.push(err("lines", CODES.REQUIRED));`,
      `  else {`,
      `    const seen = new Set();`,
      `    v.lines.forEach((line, i) => {`,
      `      const l = line ?? {};`,
      `      if (isBlank(l.ref)) errors.push(err(itemField("lines", i, "ref"), CODES.REQUIRED));`,
      `      else if (seen.has(asText(l.ref))) errors.push(err(itemField("lines", i, "ref"), CODES.DUPLICATE));`,
      `      else seen.add(asText(l.ref));`,
      `      if (isBlank(l.amount)) errors.push(err(itemField("lines", i, "amount"), CODES.REQUIRED));`,
      `      else if (!isInt(l.amount)) errors.push(err(itemField("lines", i, "amount"), CODES.NOT_INTEGER));`,
      `      else if (l.amount < 0) errors.push(err(itemField("lines", i, "amount"), CODES.OUT_OF_RANGE));`,
      `    });`,
      `  }`,
    );
  }
  lines.push(`  return result(errors);`, `}`, ``);
  fs.writeFileSync(path.join(dir, `${entity}.js`), lines.join("\n"));
});

const files = ["src/codes.js", "src/validators/_util.js", ...ENTITIES.map((e) => `src/validators/${e}.js`), "test/invoice.test.js"];
const metaPath = path.join(root, "meta.json");
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
meta.context = files;
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n");
const chars = files.filter((f) => !f.startsWith("test")).reduce((a, f) => a + fs.readFileSync(path.join(root, f), "utf8").length, 0);
console.log(`${ENTITIES.length} validadores, ${chars} caracteres (~${Math.round(chars / 3.5)} tokens)`);
