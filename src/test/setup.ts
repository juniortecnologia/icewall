// Cada arquivo de teste ganha um banco em memória, já migrado: nada toca o data/icewall.db.
process.env.ICEWALL_DB = ":memory:";
Reflect.deleteProperty(globalThis, "__icewallDb");
