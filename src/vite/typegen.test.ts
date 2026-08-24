import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vite-plus/test';

import { generateSearchTypes } from './typegen';

const temporaryDirectories: Array<string> = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('generateSearchTypes', () => {
  test('shadows search-aware +types while preserving every React Router alias', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rr-search-types-'));
    temporaryDirectories.push(root);
    const appDirectory = path.join(root, 'src');
    const routeFile = path.join(appDirectory, 'routes/products.tsx');
    const originalTypeFile = path.join(root, '.react-router/types/src/routes/+types/products.ts');
    await fs.mkdir(path.dirname(routeFile), { recursive: true });
    await fs.mkdir(path.dirname(originalTypeFile), { recursive: true });
    await fs.writeFile(
      routeFile,
      `export const validateSearch = schema; export const loader = () => null;`,
    );
    await fs.writeFile(
      originalTypeFile,
      `
        export namespace Route {
          export type LoaderArgs = { request: Request };
          export type ActionArgs = { request: Request };
          export type ClientLoaderArgs = { request: Request };
          export type ClientActionArgs = { request: Request };
          export type ComponentProps = { loaderData: unknown };
          export type MetaFunction = () => void;
          export type FutureAlias = 'preserved';
        }
      `,
    );

    const generated = await generateSearchTypes({
      root,
      appDirectory,
      routes: [
        {
          id: 'routes/products',
          file: routeFile,
          path: '/products',
          index: false,
        },
      ],
    });
    const shadowFile = path.join(
      root,
      '.react-router-validated-search/types/src/routes/+types/products.ts',
    );
    const output = await fs.readFile(shadowFile, 'utf8');
    const registryFile = path.join(root, '.react-router-validated-search/types/registry.d.ts');
    const registry = await fs.readFile(registryFile, 'utf8');

    expect(generated.searchAwareRoutes).toHaveLength(1);
    expect(output).toContain(
      'type Search = InferValidatedSearchChain<readonly [typeof import("../../../../../src/routes/products.js").validateSearch]>;',
    );
    expect(output).toContain(
      'export type LoaderArgs = ReactRouterRoute.LoaderArgs & { search: Search };',
    );
    expect(output).toContain(
      'export type ComponentProps = ReactRouterRoute.ComponentProps & { search: Search };',
    );
    expect(output).toContain('export type FutureAlias = ReactRouterRoute.FutureAlias;');
    expect(await fs.readFile(originalTypeFile, 'utf8')).toContain(
      "export type FutureAlias = 'preserved';",
    );
    expect(registry).toContain(
      '"/products": readonly [typeof import("../../src/routes/products.js").validateSearch];',
    );
    expect(generated.files).toContain('types/registry.d.ts');
  });

  test('generates cumulative search types for validating and inheriting descendants', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rr-search-types-'));
    temporaryDirectories.push(root);
    const appDirectory = path.join(root, 'src');
    const parentFile = path.join(appDirectory, 'routes/catalog.tsx');
    const childFile = path.join(appDirectory, 'routes/games.tsx');
    const gameFile = path.join(appDirectory, 'routes/game.tsx');

    for (const [file, source] of [
      [parentFile, `export const validateSearch = parentSchema;`],
      [childFile, `export const loader = () => null;`],
      [gameFile, `export const validateSearch = gameSchema;`],
    ] as const) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, source);
      const typeFile = path.join(
        root,
        '.react-router/types/src/routes/+types',
        `${path.basename(file, '.tsx')}.ts`,
      );
      await fs.mkdir(path.dirname(typeFile), { recursive: true });
      await fs.writeFile(
        typeFile,
        `export namespace Route { export type LoaderArgs = { request: Request }; export type ComponentProps = {}; }`,
      );
    }

    const generated = await generateSearchTypes({
      root,
      appDirectory,
      routes: [
        {
          id: 'catalog',
          file: parentFile,
          path: '/catalog',
          index: false,
        },
        {
          id: 'games',
          file: childFile,
          path: '/catalog/games',
          parentId: 'catalog',
          index: false,
        },
        {
          id: 'game',
          file: gameFile,
          path: '/catalog/games/:gameId',
          parentId: 'games',
          index: false,
        },
      ],
    });
    const childShadow = await fs.readFile(
      path.join(root, '.react-router-validated-search/types/src/routes/+types/games.ts'),
      'utf8',
    );
    const gameShadow = await fs.readFile(
      path.join(root, '.react-router-validated-search/types/src/routes/+types/game.ts'),
      'utf8',
    );

    expect(generated.searchAwareRoutes.map(({ id }) => id)).toEqual(['catalog', 'games', 'game']);
    expect(childShadow).toContain(
      'type Search = InferValidatedSearchChain<readonly [typeof import("../../../../../src/routes/catalog.js").validateSearch]>;',
    );
    expect(gameShadow).toContain(
      'type Search = InferValidatedSearchChain<readonly [typeof import("../../../../../src/routes/catalog.js").validateSearch, typeof import("../../../../../src/routes/game.js").validateSearch]>;',
    );
  });

  test('does not generate a shadow module for a searchless route', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rr-search-types-'));
    temporaryDirectories.push(root);
    const appDirectory = path.join(root, 'src');
    const routeFile = path.join(appDirectory, 'routes/plain.tsx');
    await fs.mkdir(path.dirname(routeFile), { recursive: true });
    await fs.writeFile(routeFile, `export const loader = () => null;`);
    const staleFile = path.join(
      root,
      '.react-router-validated-search/types/src/routes/+types/removed.ts',
    );
    await fs.mkdir(path.dirname(staleFile), { recursive: true });
    await fs.writeFile(staleFile, 'stale');
    await fs.writeFile(
      path.join(root, '.react-router-validated-search/manifest.json'),
      `${JSON.stringify({ files: ['types/src/routes/+types/removed.ts'] })}\n`,
    );

    const generated = await generateSearchTypes({
      root,
      appDirectory,
      routes: [
        {
          id: 'routes/plain',
          file: routeFile,
          path: '/plain',
          index: false,
        },
      ],
    });

    expect(generated.searchAwareRoutes).toEqual([]);
    await expect(fs.stat(staleFile)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(generated.files).toEqual(['types/registry.d.ts']);
  });

  test('reports a malformed manifest instead of leaving stale files silently', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rr-search-types-'));
    temporaryDirectories.push(root);
    const appDirectory = path.join(root, 'src');
    const generatedRoot = path.join(root, '.react-router-validated-search');
    await fs.mkdir(appDirectory, { recursive: true });
    await fs.mkdir(generatedRoot, { recursive: true });
    await fs.writeFile(path.join(generatedRoot, 'manifest.json'), '{invalid');

    await expect(generateSearchTypes({ root, appDirectory, routes: [] })).rejects.toThrow(
      /Failed to read .*manifest\.json/,
    );
  });
});
