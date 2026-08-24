// @vitest-environment happy-dom
// oxlint-disable eslint/no-restricted-imports -- package-level React Router integration test

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { MemoryRouter, RouterContextProvider, useNavigate } from 'react-router';
import { validatorImportsByRouteId } from 'virtual:react-router-validated-search/registry';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import type { RawSearch } from '../runtime/flat-search-codec';
import {
  createClientSearchValidationMiddleware,
  createSearchValidationMiddleware,
} from '../runtime/middleware';
import { withValidatedSearch } from './component';
import { ValidatedSearchProvider } from './provider';

const catalogSearch = vi.fn((raw: RawSearch) => {
  return { page: Number(raw.page) };
});

function gamesSearch(raw: RawSearch) {
  return { filter: String(raw.filter) };
}

function librarySearch(raw: RawSearch) {
  return { page: Number(raw.page) };
}

declare module '../index' {
  interface SearchRouteRegistry {
    '/catalog': readonly [typeof catalogSearch];
    '/catalog/games': readonly [typeof catalogSearch, typeof gamesSearch];
    '/library': readonly [typeof librarySearch];
  }
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  for (const key of Object.keys(validatorImportsByRouteId)) {
    Reflect.deleteProperty(validatorImportsByRouteId, key);
  }
});

function NavigationButton() {
  const navigate = useNavigate();

  return <button onClick={() => navigate('/?page=3')}>next</button>;
}

describe('withValidatedSearch', () => {
  test('reuses validation performed by client middleware', async () => {
    const validateSearch = vi.fn((raw: RawSearch) => ({
      page: Number(raw.page),
    }));
    const context = new RouterContextProvider();
    const middleware = createClientSearchValidationMiddleware(
      'products',
      undefined,
      validateSearch,
    );
    const url = new URL('https://example.test/products?page=2');

    await middleware(
      {
        context,
        params: {},
        pattern: '/products',
        request: new Request(url),
        url,
      },
      () => Promise.resolve(),
    );

    const Page = withValidatedSearch(
      ({ search }: { search: { page: number } }) => <div>{search.page}</div>,
      validateSearch,
    );
    render(
      <MemoryRouter initialEntries={['/products?page=2']}>
        <Page />
      </MemoryRouter>,
    );

    expect(screen.getByText('2')).toBeTruthy();
    expect(validateSearch).toHaveBeenCalledTimes(1);
  });

  test('takes the middleware result from the provider instead of validating', async () => {
    const validateSearch = vi.fn((raw: RawSearch) => ({
      page: Number(raw.page),
    }));
    const context = new RouterContextProvider();
    const url = new URL('https://example.test/library?page=2');

    await createSearchValidationMiddleware(
      'library',
      undefined,
      validateSearch,
    )(
      {
        context,
        params: {},
        pattern: '/library',
        request: new Request(url),
        url,
      },
      () => Promise.resolve(new Response()),
    );

    // The registry has no `/library` chain here, so falling back would throw.
    const Page = withValidatedSearch(
      ({ search }: { search: { page: number } }) => <div>{search.page}</div>,
      { registryRouteId: '/library', validatedSearchRouteId: 'library' },
    );

    render(
      <MemoryRouter initialEntries={['/library?page=2']}>
        <ValidatedSearchProvider context={context}>
          <Page />
        </ValidatedSearchProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('2')).toBeTruthy();
    expect(validateSearch).toHaveBeenCalledTimes(1);
  });

  test('merges a generated parent-to-child validator chain', async () => {
    validatorImportsByRouteId['/catalog'] = [async () => catalogSearch];
    validatorImportsByRouteId['/catalog/games'] = [
      async () => catalogSearch,
      async () => gamesSearch,
    ];
    const Parent = withValidatedSearch(
      ({ search }: { search: { page: number } }) => <div>{`parent:${search.page}`}</div>,
      { registryRouteId: '/catalog', validatedSearchRouteId: 'catalog' },
    );
    const Child = withValidatedSearch(
      ({ search }: { search: { page: number; filter: string } }) => (
        <div>{`${search.page}:${search.filter}`}</div>
      ),
      {
        registryRouteId: '/catalog/games',
        validatedSearchRouteId: 'catalog/games',
      },
    );

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/?page=2&filter=new']}>
          <Suspense fallback={<div>validating</div>}>
            <Parent />
            <Child />
          </Suspense>
        </MemoryRouter>,
      );
    });

    expect(await screen.findByText('parent:2')).toBeTruthy();
    expect(await screen.findByText('2:new')).toBeTruthy();
    expect(catalogSearch).toHaveBeenCalledTimes(1);
  });

  test('updates validated search after React Router navigation', async () => {
    const validateSearch = vi.fn((raw: RawSearch) => ({
      page: Number(raw.page),
    }));
    const Page = withValidatedSearch(
      ({ search }: { search: { page: number } }) => <div>{search.page}</div>,
      validateSearch,
    );

    render(
      <MemoryRouter initialEntries={['/?page=2']}>
        <Page />
        <NavigationButton />
      </MemoryRouter>,
    );

    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'next' }));
    expect(await screen.findByText('3')).toBeTruthy();
    expect(validateSearch).toHaveBeenCalledTimes(2);
  });

  // The route form suspends while the registry imports validator modules, and
  // nothing else: validation itself cannot suspend a render.
  test('renders without a fallback once validator modules are loaded', async () => {
    validatorImportsByRouteId['/library'] = [async () => librarySearch];
    const Page = withValidatedSearch(
      ({ search }: { search: { page: number } }) => <div>{search.page}</div>,
      { registryRouteId: '/library', validatedSearchRouteId: 'library' },
    );
    const tree = (
      <MemoryRouter initialEntries={['/?page=2']}>
        <Suspense fallback={<div>loading</div>}>
          <Page />
        </Suspense>
      </MemoryRouter>
    );

    await act(async () => {
      render(tree);
    });
    expect(await screen.findByText('2')).toBeTruthy();

    cleanup();
    render(tree);
    expect(screen.queryByText('loading')).toBeNull();
    expect(screen.getByText('2')).toBeTruthy();
  });
});
