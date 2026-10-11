function parsePath(path) {
  if (Array.isArray(path)) {
    return [...path];
  }
  if (typeof path !== 'string' || path === '') return [];

  const segments = [];
  const regex = /([^.[\]]+)|\[(\d+)\]/g;
  let match;
  while ((match = regex.exec(path)) !== null) {
    if (match[1] !== undefined) {
      const val = match[1];
      segments.push(/^\d+$/.test(val) ? parseInt(val, 10) : val);
    } else if (match[2] !== undefined) {
      segments.push(parseInt(match[2], 10));
    }
  }
  return segments;
}

export function get(obj, path, defaultValue) {
  const segments = parsePath(path);
  if (segments.length === 0) return obj;

  let current = obj;
  for (const key of segments) {
    if (current === null || current === undefined) return defaultValue;
    current = current[key];
  }

  return current === undefined ? defaultValue : current;
}

export function set(obj, path, value) {
  const segments = parsePath(path);
  if (segments.length === 0) return obj;

  let current = obj;
  for (let i = 0; i < segments.length; i++) {
    const key = segments[i];
    const isLast = i === segments.length - 1;

    if (isLast) {
      current[key] = value;
      break;
    }

    const nextKey = segments[i + 1];
    const nextIsIndex = typeof nextKey === 'number';

    if (current[key] === null || typeof current[key] !== 'object') {
      current[key] = nextIsIndex ? [] : {};
    }

    current = current[key];
  }

  return obj;
}

export function unset(obj, path) {
  const segments = parsePath(path);
  if (segments.length === 0) return false;

  let current = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    if (current === null || current === undefined || typeof current !== 'object') return false;
    current = current[key];
  }

  const lastKey = segments[segments.length - 1];
  if (current === null || current === undefined || typeof current !== 'object') return false;

  if (Array.isArray(current) && typeof lastKey === 'number') {
    if (lastKey < 0 || lastKey >= current.length) return false;
    current.splice(lastKey, 1);
    return true;
  } else {
    if (!(lastKey in current)) return false;
    delete current[lastKey];
    return true;
  }
}
