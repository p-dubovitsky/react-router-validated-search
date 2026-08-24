import { describe, expect, test } from 'vite-plus/test';

import { jsonSearchCodec } from './json-search-codec';

describe('jsonSearchCodec', () => {
  test('round-trips JSON-first search state without changing ambiguous strings', () => {
    const search = {
      page: 2,
      numericString: '2',
      enabled: false,
      booleanString: 'true',
      word: 'popular',
      empty: null,
      filters: {
        providers: ['a', 'b'],
        range: { min: 10, max: 20 },
      },
    };

    expect(jsonSearchCodec.parse(jsonSearchCodec.stringify(search))).toEqual(search);
  });

  test('preserves keys inherited by ordinary objects as own properties', () => {
    const parsed = jsonSearchCodec.parse(
      '?__proto__=%7B%22polluted%22%3Atrue%7D&constructor=1&toString=value',
    );

    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(Object.entries(parsed)).toEqual([
      ['__proto__', { polluted: true }],
      ['constructor', 1],
      ['toString', 'value'],
    ]);
  });

  test('keeps ordinary strings readable and quotes JSON-like strings', () => {
    expect(jsonSearchCodec.stringify({ word: 'popular', number: '2', bool: 'true' })).toBe(
      '?word=popular&number=%222%22&bool=%22true%22',
    );
  });

  test('round-trips shared non-cyclic object references', () => {
    const shared = { value: 1 };
    const search = { container: { first: shared, second: shared } };

    expect(jsonSearchCodec.parse(jsonSearchCodec.stringify(search))).toEqual(search);
  });

  test('keeps repeated JSON arrays as separate values', () => {
    expect(jsonSearchCodec.parse('?filter=%5B%22a%22%5D&filter=%5B%22b%22%5D')).toEqual({
      filter: [['a'], ['b']],
    });
  });

  test('rejects unsupported JSON values with the offending key', () => {
    expect(() => jsonSearchCodec.stringify({ page: Number.NaN })).toThrow(
      'Cannot serialize search key "page"',
    );
    expect(() => jsonSearchCodec.stringify({ createdAt: new Date(0) })).toThrow(
      'Cannot serialize search key "createdAt"',
    );
  });
});
