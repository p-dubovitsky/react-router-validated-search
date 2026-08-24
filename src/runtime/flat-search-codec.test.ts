import { describe, expect, test } from 'vite-plus/test';

import { flatSearchCodec } from './flat-search-codec';

describe('flatSearchCodec', () => {
  test('preserves single, repeated, empty, and unknown parameters', () => {
    expect(flatSearchCodec.parse('?page=2&tag=a&tag=b&q=&unknown=value')).toEqual({
      page: '2',
      tag: ['a', 'b'],
      q: '',
      unknown: 'value',
    });
  });

  test('preserves keys inherited by ordinary objects as own properties', () => {
    const parsed = flatSearchCodec.parse('?__proto__=proto&constructor=ctor&toString=string');

    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(Object.entries(parsed)).toEqual([
      ['__proto__', 'proto'],
      ['constructor', 'ctor'],
      ['toString', 'string'],
    ]);
  });

  test('serializes flat primitives and omits undefined values', () => {
    expect(
      flatSearchCodec.stringify({
        page: 2,
        enabled: false,
        q: '',
        tags: ['a', 'b'],
        omitted: undefined,
      }),
    ).toBe('?page=2&enabled=false&q=&tags=a&tags=b');
  });

  test('returns an empty string when no values are emitted', () => {
    expect(flatSearchCodec.stringify({ omitted: undefined })).toBe('');
  });

  test('rejects nested objects and null with the offending key', () => {
    expect(() => flatSearchCodec.stringify({ filter: { active: true } })).toThrow(
      'Cannot serialize search key "filter": nested objects are not supported',
    );
    expect(() => flatSearchCodec.stringify({ value: null })).toThrow(
      'Cannot serialize search key "value": nested objects are not supported',
    );
  });
});
