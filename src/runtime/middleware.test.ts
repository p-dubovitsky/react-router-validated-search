// oxlint-disable eslint/no-restricted-imports -- package-level React Router integration test
import { redirect, RouterContextProvider } from 'react-router';
import { describe, expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';

import type { RawSearch } from './flat-search-codec';
import {
  createClientSearchValidationMiddleware,
  createSearchValidationMiddleware,
  requireValidatedSearch,
  findValidatedSearch,
} from './middleware';

describe('search validation middleware', () => {
  test('client middleware validates before next and exposes the result through context', async () => {
    const validateSearch = vi.fn((raw: RawSearch) => ({
      page: Number(raw.page),
    }));
    const context = new RouterContextProvider();
    const middleware = createClientSearchValidationMiddleware(
      'products',
      undefined,
      validateSearch,
    );

    const result = await middleware(
      {
        context,
        params: {},
        pattern: '/products',
        request: new Request('https://example.test/products?page=2'),
        url: new URL('https://example.test/products?page=2'),
      },
      () => Promise.resolve(requireValidatedSearch(context, 'products')),
    );

    expect(result).toEqual({ page: 2 });
    expect(validateSearch).toHaveBeenCalledTimes(1);
  });

  test('validates once before next and exposes the result through context', async () => {
    const validateSearch = vi.fn((raw: RawSearch) => ({
      page: Number(raw.page),
    }));
    const context = new RouterContextProvider();
    const middleware = createSearchValidationMiddleware('products', undefined, validateSearch);

    const result = await middleware(
      {
        context,
        params: {},
        pattern: '/products',
        request: new Request('https://example.test/products?page=2'),
        url: new URL('https://example.test/products?page=2'),
      },
      () => Promise.resolve(requireValidatedSearch(context, 'products')),
    );

    expect(result).toEqual({ page: 2 });
    expect(validateSearch).toHaveBeenCalledTimes(1);
  });

  test('isolates cumulative parent and child results while reusing parsed search', async () => {
    const rawInputs: Array<RawSearch> = [];
    const parentValidator = vi.fn((raw: RawSearch) => {
      rawInputs.push(raw);
      return { page: Number(raw.page), scope: 'parent' as const };
    });
    const childValidator = vi.fn((raw: RawSearch) => {
      rawInputs.push(raw);
      return { filter: String(raw.filter), scope: 'child' as const };
    });
    const context = new RouterContextProvider();
    const request = new Request('https://example.test/products?page=2&filter=new');
    const args = {
      context,
      params: {},
      pattern: '/products',
      request,
      url: new URL('https://example.test/products?page=2&filter=new'),
    };
    const parentMiddleware = createSearchValidationMiddleware('parent', undefined, parentValidator);
    const childMiddleware = createSearchValidationMiddleware('child', 'parent', childValidator);

    await parentMiddleware(
      args,
      async () => (await childMiddleware(args, () => Promise.resolve(new Response()))) as Response,
    );

    expect(requireValidatedSearch(context, 'parent')).toEqual({
      page: 2,
      scope: 'parent',
    });
    expect(requireValidatedSearch(context, 'child')).toEqual({
      page: 2,
      filter: 'new',
      scope: 'child',
    });
    expect(rawInputs).toHaveLength(2);
    expect(rawInputs[0]).toBe(rawInputs[1]);
  });

  test('lets child keys override inherited keys without changing the parent result', async () => {
    const context = new RouterContextProvider();
    const request = new Request('https://example.test/products?page=2');
    const args = {
      context,
      params: {},
      pattern: '/products',
      request,
      url: new URL('https://example.test/products?page=2'),
    };
    const parentMiddleware = createSearchValidationMiddleware('parent', undefined, () => ({
      page: 2,
    }));
    const childMiddleware = createSearchValidationMiddleware('child', 'parent', () => ({
      page: 3,
    }));

    await parentMiddleware(
      args,
      async () => (await childMiddleware(args, () => Promise.resolve(new Response()))) as Response,
    );

    expect(requireValidatedSearch(context, 'parent')).toEqual({ page: 2 });
    expect(requireValidatedSearch(context, 'child')).toEqual({ page: 3 });
  });

  test('answers a render only for the location the middleware validated', async () => {
    const context = new RouterContextProvider();
    const middleware = createSearchValidationMiddleware(
      'products',
      undefined,
      (raw: RawSearch) => ({ page: Number(raw.page) }),
    );

    await middleware(
      {
        context,
        params: {},
        pattern: '/products',
        request: new Request('https://example.test/products?page=2'),
        url: new URL('https://example.test/products?page=2'),
      },
      () => Promise.resolve(new Response()),
    );

    expect(findValidatedSearch(context, 'products', '?page=2')).toEqual({
      page: 2,
    });
    expect(findValidatedSearch(context, 'products', '?page=3')).toBeUndefined();
    expect(findValidatedSearch(context, 'other', '?page=2')).toBeUndefined();
    expect(findValidatedSearch(new RouterContextProvider(), 'products', '')).toBeUndefined();
  });

  test('maps Standard Schema issues to HTTP 400', async () => {
    const middleware = createClientSearchValidationMiddleware(
      'products',
      undefined,
      z.object({ page: z.coerce.number() }),
    );

    await expect(
      middleware(
        {
          context: new RouterContextProvider(),
          params: {},
          pattern: '/products',
          request: new Request('https://example.test/products?page=invalid'),
          url: new URL('https://example.test/products?page=invalid'),
        },
        () => Promise.resolve(new Response()),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  test('preserves a functional validator redirect by identity', async () => {
    const response = redirect('/products?page=1');
    const middleware = createSearchValidationMiddleware('products', undefined, () => {
      throw response;
    });

    await expect(
      middleware(
        {
          context: new RouterContextProvider(),
          params: {},
          pattern: '/products',
          request: new Request('https://example.test/products?page=invalid'),
          url: new URL('https://example.test/products?page=invalid'),
        },
        () => Promise.resolve(new Response()),
      ),
    ).rejects.toBe(response);
  });
});
