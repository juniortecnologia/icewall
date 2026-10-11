// API antiga: callbacks no estilo (err, result), sempre assíncronos.
// failEvery = N > 0 faz cada N-ésima chamada (de qualquer método) falhar com Error("TRANSIENT").
export function createLegacyStore({ failEvery = 0 } = {}) {
  const data = new Map();
  let calls = 0;
  const run = (cb, fn) =>
    setImmediate(() => {
      calls++;
      if (failEvery > 0 && calls % failEvery === 0) return cb(new Error("TRANSIENT"));
      try {
        cb(null, fn());
      } catch (err) {
        cb(err);
      }
    });
  return {
    get: (key, cb) => run(cb, () => data.get(key)),
    set: (key, value, cb) =>
      run(cb, () => {
        if (typeof key !== "string" || !key) throw new Error("BAD_KEY");
        data.set(key, value);
        return true;
      }),
    del: (key, cb) => run(cb, () => data.delete(key)),
    keys: (prefix, cb) => run(cb, () => [...data.keys()].filter((k) => k.startsWith(prefix)).sort()),
    get calls() {
      return calls;
    },
  };
}
