/** KOSIF V5 — deterministic JSON codec for workspace state containing BigInt values. */
const BIGINT_TAG = '$kosifBigInt';
const VERSION = 1;

export function stringifyState(value) {
  return JSON.stringify({ schemaVersion: VERSION, payload: value }, (_key, item) => {
    if (typeof item === 'bigint') return { [BIGINT_TAG]: item.toString() };
    if (item instanceof Map) return { $kosifMap: [...item.entries()] };
    if (item instanceof Set) return { $kosifSet: [...item.values()] };
    return item;
  });
}

export function parseState(text) {
  const decoded = JSON.parse(String(text), (_key, item) => {
    if (item && typeof item === 'object' && Object.keys(item).length === 1 && BIGINT_TAG in item) {
      if (!/^-?\d+$/.test(String(item[BIGINT_TAG]))) throw new TypeError('Invalid encoded BigInt');
      return BigInt(item[BIGINT_TAG]);
    }
    if (item && typeof item === 'object' && Array.isArray(item.$kosifMap)) return new Map(item.$kosifMap);
    if (item && typeof item === 'object' && Array.isArray(item.$kosifSet)) return new Set(item.$kosifSet);
    return item;
  });
  if (!decoded || decoded.schemaVersion !== VERSION || !('payload' in decoded)) throw new RangeError('Unsupported KOSIF state payload');
  return decoded.payload;
}

export function toWireState(value) { return JSON.parse(stringifyState(value)); }
export function fromWireState(value) { return parseState(JSON.stringify(value)); }
export function encodedStateBytes(value) { return new TextEncoder().encode(stringifyState(value)).byteLength; }
