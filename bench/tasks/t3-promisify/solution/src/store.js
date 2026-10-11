export function promisifyStore(legacy) {
  const methods = ["get", "set", "del", "keys"];
  const store = {};
  for (const method of methods) {
    store[method] = (...args) =>
      new Promise((resolve, reject) => {
        legacy[method](...args, (err, result) => {
          if (err) return reject(err);
          resolve(result);
        });
      });
  }
  return store;
}

export async function getMany(store, keys) {
  const result = {};
  for (const key of keys) {
    const value = await store.get(key);
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export async function withRetry(fn, { attempts = 3, retryOn = (err) => err?.message === "TRANSIENT" } = {}) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!retryOn(err)) throw err;
    }
  }
  throw lastError;
}
