// @vitest-environment happy-dom

import { describe, expect, test, vi } from 'vite-plus/test';

import type { RawSearch } from './flat-search-codec';
import { validateSearchSource } from './route-validation';

describe('validateSearchSource in the browser', () => {
  test('reuses a result only for the exact validator and search string', () => {
    const first = vi.fn((raw: RawSearch) => ({ page: Number(raw.page) }));
    const second = vi.fn((raw: RawSearch) => ({ page: Number(raw.page) }));

    const result = validateSearchSource(first, '?page=2');

    expect(validateSearchSource(first, '?page=2')).toBe(result);
    expect(validateSearchSource(first, '?page=3')).toEqual({ page: 3 });
    expect(validateSearchSource(second, '?page=2')).toEqual({ page: 2 });
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);
  });

  test('shares one codec and key between request and location sources', () => {
    const validator = vi.fn((raw: RawSearch) => ({ tags: raw.tag }));
    const request = new Request('https://example.test/products?tag=a&tag=b');

    expect(validateSearchSource(validator, request)).toEqual({
      tags: ['a', 'b'],
    });
    expect(validateSearchSource(validator, '?tag=a&tag=b')).toEqual({
      tags: ['a', 'b'],
    });
    expect(validator).toHaveBeenCalledTimes(1);
  });

  test('rejects and does not cache a non-object result', () => {
    const validator = vi.fn(() => null);

    expect(() => validateSearchSource(validator, '?optional=')).toThrow(
      /validateSearch must return an object/,
    );
    expect(() => validateSearchSource(validator, '?optional=')).toThrow(
      /validateSearch must return an object/,
    );
    expect(validator).toHaveBeenCalledTimes(2);
  });

  test('does not cache validator errors', () => {
    const error = new Error('invalid search');
    const validator = vi.fn(() => {
      throw error;
    });

    expect(() => validateSearchSource(validator, '?page=bad')).toThrow(error);
    expect(() => validateSearchSource(validator, '?page=bad')).toThrow(error);
    expect(validator).toHaveBeenCalledTimes(2);
  });
});
