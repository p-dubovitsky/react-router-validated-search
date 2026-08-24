import { describe, expect, test } from 'vite-plus/test';

import { parseRequestSearch, requestSearchString } from './handler';

describe('request search', () => {
  test('parses request search and preserves its location-style string', () => {
    const request = new Request('https://example.test/products?page=2&tag=a&tag=b');

    expect(parseRequestSearch(request)).toEqual({
      page: '2',
      tag: ['a', 'b'],
    });
    expect(requestSearchString(request)).toBe('?page=2&tag=a&tag=b');
  });
});
