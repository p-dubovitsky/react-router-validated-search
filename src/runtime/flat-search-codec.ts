/**
 * Flat query-string parsing and serialization.
 *
 * @module
 */
import type { SearchCodec } from './search-codec';

/** Raw flat-codec input, preserving repeated keys as ordered arrays. */
export type RawSearch = Record<string, string | Array<string>>;
/** Primitive values supported by the flat codec. */
export type SearchPrimitive = string | number | boolean | bigint | undefined;
/** A single flat value or repeated values for one query key. */
export type SearchInputValue = SearchPrimitive | ReadonlyArray<SearchPrimitive>;
/** Object accepted by the flat codec. */
export type FlatSearch = Record<string, SearchInputValue>;

function parseFlatSearch(search: string): RawSearch {
  const output: RawSearch = Object.create(null);

  for (const [key, value] of new URLSearchParams(search)) {
    const current = output[key];

    if (current === undefined) output[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else output[key] = [current, value];
  }

  return output;
}

function appendFlatValue(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined) return;

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    params.append(key, String(value));
    return;
  }

  throw new TypeError(`Cannot serialize search key "${key}": nested objects are not supported`);
}

function stringifyFlatSearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) {
      for (const item of value) appendFlatValue(params, key, item);
    } else {
      appendFlatValue(params, key, value);
    }
  }

  const output = params.toString();
  return output ? `?${output}` : '';
}

/** Default codec preserving ordinary repeated-key query-string semantics. */
export const flatSearchCodec: SearchCodec = {
  parse: parseFlatSearch,
  stringify: stringifyFlatSearch,
};
