import "server-only";
import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";

const CHUNK = 4 * 1024 * 1024;

/**
 * Lê só as linhas completas novas de um JSONL desde o último offset gravado e chama `onLine`
 * para cada uma. Se o arquivo encolheu (truncado/rotacionado), relê do início.
 * Devolve o número de linhas processadas.
 */
export async function readNewLines(file: string, onLine: (line: string) => void): Promise<number> {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return 0;
  }
  const db = getDb();
  const row = db.select().from(schema.ingestOffsets).where(eq(schema.ingestOffsets.file, file)).get();
  let offset = row && row.offset <= stat.size ? row.offset : 0;
  if (offset === stat.size) return 0;

  const fh = await fs.open(file, "r");
  let count = 0;
  try {
    let carry = "";
    let pos = offset;
    while (pos < stat.size) {
      const buf = Buffer.alloc(Math.min(CHUNK, stat.size - pos));
      const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
      if (bytesRead === 0) break;
      pos += bytesRead;
      const text = carry + buf.subarray(0, bytesRead).toString("utf8");
      const lastNl = text.lastIndexOf("\n");
      if (lastNl === -1) {
        carry = text;
        continue;
      }
      for (const line of text.slice(0, lastNl).split("\n")) {
        if (line.trim()) {
          onLine(line);
          count++;
        }
      }
      carry = text.slice(lastNl + 1);
      offset = pos - Buffer.byteLength(carry, "utf8");
    }
  } finally {
    await fh.close();
  }
  db.insert(schema.ingestOffsets)
    .values({ file, offset, size: stat.size })
    .onConflictDoUpdate({ target: schema.ingestOffsets.file, set: { offset, size: stat.size } })
    .run();
  return count;
}
