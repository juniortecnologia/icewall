export class LruCache {
  #max;
  #ttlMs;
  #now;
  #map;

  constructor({ max, ttlMs = Infinity, now = () => Date.now() }) {
    if (!Number.isInteger(max) || max < 1) {
      throw new RangeError("max");
    }
    this.#max = max;
    this.#ttlMs = ttlMs;
    this.#now = now;
    this.#map = new Map();
  }

  #isExpired(entry) {
    return this.#now() >= entry.expiresAt;
  }

  #evict() {
    if (this.#map.size <= this.#max) return;
    for (const [key, entry] of this.#map) {
      if (this.#isExpired(entry)) {
        this.#map.delete(key);
      }
    }

    // A primeira chave na ordem do Map é a menos recente.
    while (this.#map.size > this.#max) {
      const firstKey = this.#map.keys().next().value;
      this.#map.delete(firstKey);
    }
  }

  set(key, value) {
    const expiresAt = this.#now() + this.#ttlMs;

    if (this.#map.has(key)) {
      this.#map.delete(key);
    }

    this.#map.set(key, { value, expiresAt });

    this.#evict();
    return this;
  }

  get(key) {
    if (!this.#map.has(key)) {
      return undefined;
    }

    const entry = this.#map.get(key);

    if (this.#isExpired(entry)) {
      this.#map.delete(key);
      return undefined;
    }

    this.#map.delete(key);
    this.#map.set(key, entry);

    return entry.value;
  }

  has(key) {
    if (!this.#map.has(key)) {
      return false;
    }

    const entry = this.#map.get(key);
    return !this.#isExpired(entry);
  }

  delete(key) {
    if (!this.#map.has(key)) {
      return false;
    }
    this.#map.delete(key);
    return true;
  }

  get size() {
    let count = 0;
    for (const entry of this.#map.values()) {
      if (!this.#isExpired(entry)) {
        count++;
      }
    }
    return count;
  }

  keys() {
    const validKeys = [];
    for (const [key, entry] of this.#map) {
      if (!this.#isExpired(entry)) {
        validKeys.push(key);
      }
    }
    return validKeys;
  }
}
