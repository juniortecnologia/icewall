// Confere a suíte: para cada tarefa, aplica solution/ numa cópia e roda os testes. Uso: npm run bench:validate
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tasksDir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "tasks");
let failed = 0;
for (const id of fs.readdirSync(tasksDir).sort()) {
  const src = path.join(tasksDir, id);
  const meta = JSON.parse(fs.readFileSync(path.join(src, "meta.json"), "utf8"));
  const sol = path.join(src, "solution");
  if (!fs.existsSync(sol)) {
    console.log(`✗ ${id}: sem solution/`);
    failed++;
    continue;
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `icewall-validate-${id}-`));
  fs.cpSync(src, work, { recursive: true, filter: (p) => !path.relative(src, p).startsWith("solution") });
  fs.cpSync(sol, work, { recursive: true });
  try {
    execSync(`node --test ${meta.test}`, { cwd: work, stdio: "pipe" });
    console.log(`✓ ${id}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${id}\n${String(e.stdout).split("\n").filter((l) => /not ok|Error|expected|actual/.test(l)).slice(0, 12).join("\n")}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
