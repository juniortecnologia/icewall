// Cada arquivo de teste ganha um banco em memória, já migrado: nada toca o data/icewall.db.
process.env.ICEWALL_DB = ":memory:";
process.env.JWT_SECRET = "test-jwt-secret-for-testing-only-min-32-chars";
Reflect.deleteProperty(globalThis, "__icewallDb");
