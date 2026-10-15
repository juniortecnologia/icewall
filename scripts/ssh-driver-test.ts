#!/usr/bin/env -S node --import tsx/esm
/**
 * Teste rápido do SshDriver contra um host real.
 * Execução: npx tsx testers/ssh-driver.test.ts
 */

import { SshDriver } from "@/lib/servers/driver-ssh-base";

const cfg = {
  host: process.env.SSH_TEST_HOST ?? "localhost",
  port: Number(process.env.SSH_TEST_PORT) || 22,
  user: process.env.SSH_TEST_USER ?? process.env.USER ?? "junior",
  keyPath: process.env.SSH_TEST_KEY_PATH ?? `${process.env.HOME}/.ssh/id_ed25519`,
};

const driver = new SshDriver(cfg);

console.log("[ssh-driver-test] executando...");

// ping
try {
  const ok = await driver.ping(3_000);
  console.log(`  ping: ${ok ? "✅" : "❌"}`);
} catch (e) {
  console.log(`  ping: ⏭️  (${e instanceof Error ? e.message : String(e)})`);
}

// exec simples
try {
  const r = await driver.exec("uname -s", 5_000);
  console.log(`  "uname -s": ${r.code === 0 ? "✅" : "❌"} → ${r.stdout.trim().slice(0, 60)}`);
} catch (e) {
  console.log(`  exec: ⏭️  (${e instanceof Error ? e.message : String(e)})`);
}

console.log("[ssh-driver-test] fim");
