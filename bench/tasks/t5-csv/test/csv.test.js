import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "../src/csv.js";

test("cabeçalho vira chaves", () => {
  assert.deepEqual(parseCsv("nome,idade\nAna,31\nBia,27\n"), [
    { nome: "Ana", idade: "31" },
    { nome: "Bia", idade: "27" },
  ]);
});

test("sem cabeçalho e com delimitador ;", () => {
  assert.deepEqual(parseCsv("a;b\n1;2", { delimiter: ";", header: false }), [["a", "b"], ["1", "2"]]);
});

test("aspas, aspas escapadas e delimitador dentro do campo", () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","ele disse ""oi"""\n', { header: false }), [["a", "b"], ["x, y", 'ele disse "oi"']]);
});

test("quebra de linha dentro de aspas é preservada", () => {
  assert.deepEqual(parseCsv('id,obs\n1,"linha 1\r\nlinha 2"\r\n2,ok\r\n'), [
    { id: "1", obs: "linha 1\r\nlinha 2" },
    { id: "2", obs: "ok" },
  ]);
});

test("campos vazios e espaços literais", () => {
  assert.deepEqual(parseCsv("a,b,c\n, x ,\n", { header: false }), [["a", "b", "c"], ["", " x ", ""]]);
  assert.deepEqual(parseCsv('a\n""\n', { header: false }), [["a"], [""]]);
});

test("texto vazio", () => {
  assert.deepEqual(parseCsv(""), []);
});

test("ROW_LENGTH aponta a linha física onde o registro começa", () => {
  assert.throws(() => parseCsv('a,b\n"multi\nlinha",1\n3\n'), { message: "ROW_LENGTH:4" });
  assert.throws(() => parseCsv("a,b\n1,2,3\n"), { message: "ROW_LENGTH:2" });
});

test("CRLF dentro de aspas conta como uma linha física", () => {
  assert.throws(() => parseCsv('a,b\r\n"x\r\ny",1\r\n3\r\n'), { message: "ROW_LENGTH:4" });
});

test("aspas sem fechar", () => {
  assert.throws(() => parseCsv('a\n"aberto\n'), { message: "UNTERMINATED_QUOTE" });
});
