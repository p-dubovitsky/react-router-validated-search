import { describe, expect, test } from 'vite-plus/test';

import { buildRouteDestination } from './href';

describe('buildRouteDestination', () => {
  test('normalizes params and search while preserving other path fields', () => {
    expect(
      buildRouteDestination({
        pattern: '/products/:productId',
        params: { productId: 'a/b' },
        search: { tag: ['a', 'b'] },
        hash: '#details',
      }),
    ).toEqual({
      pathname: '/products/a%2Fb',
      search: '?tag=a&tag=b',
      hash: '#details',
    });
  });
});
