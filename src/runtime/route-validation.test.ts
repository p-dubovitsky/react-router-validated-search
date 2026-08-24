import { describe, expect, test, vi } from 'vite-plus/test';

import type { RawSearch } from './flat-search-codec';
import { jsonSearchCodec } from './json-search-codec';
import { mergeValidatedSearch, validateSearchSource } from './route-validation';

// Node environment on purpose: this is the server, where module scope is
// process scope.
describe('validateSearchSource', () => {
  test('keeps no successful result between server calls', () => {
    const validator = vi.fn((raw: RawSearch) => ({
      page: Number(raw.page),
    }));

    expect(validateSearchSource(validator, '?page=2')).toEqual({ page: 2 });
    expect(validateSearchSource(validator, '?page=2')).toEqual({ page: 2 });

    expect(validator).toHaveBeenCalledTimes(2);
  });

  test('keeps no error between server calls', () => {
    const error = new Error('invalid search');
    const validator = vi.fn(() => {
      throw error;
    });

    expect(() => validateSearchSource(validator, '?page=bad')).toThrow(error);
    expect(() => validateSearchSource(validator, '?page=bad')).toThrow(error);

    expect(validator).toHaveBeenCalledTimes(2);
  });
});

describe('mergeValidatedSearch', () => {
  test('keeps a decoded __proto__ key as data', () => {
    const local = jsonSearchCodec.parse('?__proto__=%7B%22admin%22%3Atrue%7D');
    const result = mergeValidatedSearch({}, local);

    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect((result as { admin?: boolean }).admin).toBeUndefined();
  });
});
