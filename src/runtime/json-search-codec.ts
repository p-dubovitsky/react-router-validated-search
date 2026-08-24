/**
 * JSON-first query-string parsing and serialization.
 *
 * @module
 */
import type { SearchCodec } from './search-codec';

/** Scalar JSON values accepted by the JSON codec. */
export type JsonPrimitive = string | number | boolean | null;
/** Recursive JSON-compatible value accepted by the JSON codec. */
export type JsonValue =
  | JsonPrimitive
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };
/** Top-level search object accepted by the JSON codec. */
export type JsonSearch = Record<string, JsonValue | undefined>;

function isJsonValue(value: unknown, seen: WeakSet<object>): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);

  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);

  let isValid: boolean;
  if (Array.isArray(value)) {
    isValid = value.every((item) => isJsonValue(item, seen));
  } else {
    isValid =
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.values(value).every((item) => isJsonValue(item, seen));
  }

  seen.delete(value);
  return isValid;
}

/** JSON values can begin with whitespace, a container, a quote, or a literal. */
const JSON_LIKE = /^\s*(?:[[{"\-\d]|true\b|false\b|null\b)/;

function encodeJsonValue(value: JsonValue): string {
  if (typeof value !== 'string') return JSON.stringify(value);
  if (!JSON_LIKE.test(value)) return value;

  try {
    JSON.parse(value);
    return JSON.stringify(value);
  } catch {
    return value;
  }
}

function decodeJsonValue(value: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return value;
  }
}

/**
 * JSON-first codec that keeps ordinary strings readable and protects strings
 * that would otherwise parse as another JSON type.
 */
export const jsonSearchCodec: SearchCodec = {
  parse(search) {
    const entries = new Map<string, Array<JsonValue>>();

    for (const [key, value] of new URLSearchParams(search)) {
      const decoded = decodeJsonValue(value);
      const values = entries.get(key);

      if (values) values.push(decoded);
      else entries.set(key, [decoded]);
    }

    const output: Record<string, JsonValue> = Object.create(null);
    for (const [key, values] of entries) {
      output[key] = values.length === 1 ? values[0] : values;
    }
    return output;
  },
  stringify(search) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(search)) {
      if (value === undefined) continue;
      if (!isJsonValue(value, new WeakSet())) {
        throw new TypeError(`Cannot serialize search key "${key}": value is not JSON-compatible`);
      }
      params.append(key, encodeJsonValue(value));
    }

    const output = params.toString();
    return output ? `?${output}` : '';
  },
};
