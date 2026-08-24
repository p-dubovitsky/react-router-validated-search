// @vitest-environment happy-dom
// oxlint-disable eslint/no-restricted-imports -- package-level React Router integration test

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, test } from 'vite-plus/test';
import { z } from 'zod';

import { Link } from './link';

const productSearch = z.object({
  tag: z.array(z.string()).optional(),
});

declare module '../index' {
  interface SearchRouteRegistry {
    '/products/:productId': typeof productSearch;
  }
}

declare module 'react-router' {
  interface Register {
    pages: {
      '/products/:productId': { params: { productId: string } };
    };
  }
}

afterEach(cleanup);

describe('Link', () => {
  test('uses React Router href params and repeated search values', () => {
    render(
      <MemoryRouter>
        <Link
          to={{
            pathname: '/products/:productId',
            params: { productId: 'a/b' },
            search: { tag: ['a', 'b'] },
          }}
          state={{ source: 'test' }}
        >
          Product
        </Link>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Product' }).getAttribute('href')).toBe(
      '/products/a%2Fb?tag=a&tag=b',
    );
  });
});
