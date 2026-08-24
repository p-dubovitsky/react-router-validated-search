import type { RouteConfigEntry } from '@react-router/dev/routes';
import { describe, expect, test } from 'vite-plus/test';

import { prepareSearchRoutes, flattenRouteConfig } from './route-config';

describe('flattenRouteConfig', () => {
  test('computes full paths for nested, index, pathless, optional, dynamic, and splat routes', () => {
    const routes: Array<RouteConfigEntry> = [
      {
        id: 'locale-layout',
        file: './locale.tsx',
        path: ':lang?',
        children: [
          {
            file: './products-layout.tsx',
            path: 'products',
            children: [
              { file: './products.tsx', index: true },
              { file: './product.tsx', path: ':productId' },
            ],
          },
          {
            file: './layout.tsx',
            children: [{ file: './child.tsx', path: 'layout/child' }],
          },
          { file: './files.tsx', path: 'files/*' },
        ],
      },
    ];

    const records = flattenRouteConfig('/project/src', routes);

    expect(
      records.map(({ id, path, parentId, index }) => ({
        id,
        path,
        parentId,
        index,
      })),
    ).toEqual([
      {
        id: 'locale-layout',
        path: '/:lang?',
        parentId: undefined,
        index: false,
      },
      {
        id: 'products-layout',
        path: '/:lang?/products',
        parentId: 'locale-layout',
        index: false,
      },
      {
        id: 'products',
        path: '/:lang?/products',
        parentId: 'products-layout',
        index: true,
      },
      {
        id: 'product',
        path: '/:lang?/products/:productId',
        parentId: 'products-layout',
        index: false,
      },
      {
        id: 'layout',
        path: '/:lang?',
        parentId: 'locale-layout',
        index: false,
      },
      {
        id: 'child',
        path: '/:lang?/layout/child',
        parentId: 'layout',
        index: false,
      },
      {
        id: 'files',
        path: '/:lang?/files/*',
        parentId: 'locale-layout',
        index: false,
      },
    ]);
  });

  test('uses explicit IDs and extensionless normalized file IDs', () => {
    const records = flattenRouteConfig('/project/src', [
      { id: 'EXPLICIT', file: './one.tsx', path: 'one' },
      { file: './nested/two.page.tsx', path: 'two' },
    ]);

    expect(records.map(({ id }) => id)).toEqual(['EXPLICIT', 'nested/two.page']);
  });
});

test('rejects one route module used by multiple route records', () => {
  expect(() =>
    prepareSearchRoutes(
      [
        {
          id: 'products',
          file: '/project/shared.tsx',
          path: '/products',
          index: false,
        },
        {
          id: 'archive',
          file: '/project/shared.tsx',
          path: '/archive',
          index: false,
        },
      ],
      new Set(['products', 'archive']),
    ),
  ).toThrow(
    '[react-router-validated-search] Route module "/project/shared.tsx" is used by multiple search-aware routes: "products", "archive". Use a separate route module for each route.',
  );
});

describe('prepareSearchRoutes', () => {
  test('builds ordered validator inheritance for every affected descendant', () => {
    const routes = [
      {
        id: 'catalog',
        file: '/project/catalog.tsx',
        path: '/catalog',
        index: false,
      },
      {
        id: 'games',
        file: '/project/games.tsx',
        path: '/catalog/games',
        parentId: 'catalog',
        index: false,
      },
      {
        id: 'game',
        file: '/project/game.tsx',
        path: '/catalog/games/:gameId',
        parentId: 'games',
        index: false,
      },
      {
        id: 'plain',
        file: '/project/plain.tsx',
        path: '/plain',
        index: false,
      },
    ];

    const preparedRoutes = prepareSearchRoutes(routes, new Set(['catalog', 'game']));

    expect(
      preparedRoutes.map(({ route, validators, transform }) => ({
        routeId: route.id,
        validatorIds: validators.map(({ id }) => id),
        transform,
      })),
    ).toEqual([
      {
        routeId: 'catalog',
        validatorIds: ['catalog'],
        transform: { routeId: 'catalog', validatedSearchRouteId: 'catalog' },
      },
      {
        routeId: 'games',
        validatorIds: ['catalog'],
        transform: { routeId: 'games', validatedSearchRouteId: 'catalog' },
      },
      {
        routeId: 'game',
        validatorIds: ['catalog', 'game'],
        transform: {
          routeId: 'game',
          validatedSearchRouteId: 'game',
          parentValidatedSearchRouteId: 'catalog',
        },
      },
    ]);
  });
});
