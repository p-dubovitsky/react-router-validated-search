// @vitest-environment happy-dom
// oxlint-disable eslint/no-restricted-imports -- package-level React Router integration test

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { validatorImportsByRoutePattern } from 'virtual:react-router-validated-search/registry';
import { afterEach, describe, expect, test } from 'vite-plus/test';
import { z } from 'zod';

import { useNavigate } from './navigate';

const navigateSearch = z.object({
  page: z.coerce.number(),
  sort: z.string().optional().default('newest'),
});

declare module '../index' {
  interface SearchRouteRegistry {
    '/navigate-products/:productId': typeof navigateSearch;
  }
}

function LocationView() {
  const location = useLocation();
  return <div>{`${location.pathname}${location.search} ${JSON.stringify(location.state)}`}</div>;
}

function NavigationControls() {
  const navigate = useNavigate();

  return (
    <>
      <button
        onClick={() =>
          void navigate(
            {
              pathname: '/navigate-products/:productId',
              params: { productId: '123' },
              search: { page: 2 },
            },
            { state: { source: 'typed' } },
          )
        }
      >
        direct
      </button>
      <button
        onClick={() =>
          void navigate({
            pathname: '/navigate-products/:productId',
            params: { productId: '123' },
            search: (previous) => ({
              page: previous.page + 1,
              sort: previous.sort,
            }),
          })
        }
      >
        update
      </button>
      <button onClick={() => void navigate(-1)}>back</button>
    </>
  );
}

afterEach(() => {
  cleanup();
  for (const key of Object.keys(validatorImportsByRoutePattern)) {
    Reflect.deleteProperty(validatorImportsByRoutePattern, key);
  }
});

describe('useNavigate', () => {
  test('navigates with generated params and serialized search', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavigationControls />
        <LocationView />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'direct' }));

    expect(
      await screen.findByText('/navigate-products/123?page=2 {"source":"typed"}'),
    ).toBeTruthy();
  });

  test('validates current search before invoking an updater', async () => {
    validatorImportsByRoutePattern['/navigate-products/:productId'] = [async () => navigateSearch];
    render(
      <MemoryRouter initialEntries={['/?page=2&sort=newest']}>
        <NavigationControls />
        <LocationView />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'update' }));

    expect(await screen.findByText('/navigate-products/123?page=3&sort=newest null')).toBeTruthy();
  });

  test('delegates history deltas to React Router', async () => {
    render(
      <MemoryRouter initialEntries={['/first', '/second']} initialIndex={1}>
        <NavigationControls />
        <LocationView />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'back' }));

    expect(await screen.findByText('/first null')).toBeTruthy();
  });
});
