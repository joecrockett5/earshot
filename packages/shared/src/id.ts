const ID_PATTERN = /^[a-f0-9]{32}$/;

/**
 * Random 128-bit identifier as 32 hex characters.
 *
 * Uses `crypto.getRandomValues` rather than `crypto.randomUUID` because the
 * latter is only available in secure contexts, and Earshot is routinely
 * served over plain HTTP on a LAN.
 */
export function newId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export { ID_PATTERN };
