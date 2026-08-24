import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vite-plus/test';

import type { RouteRecord } from './route-config';
import { rescanRouteFile } from './scan-routes';

const temporaryDirectories: Array<string> = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function writeRoute(source: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rr-search-scan-'));
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'route.tsx');
  await fs.writeFile(file, source);

  return file;
}

function route(id: string, file: string): RouteRecord {
  return { id, file, path: `/${id}`, index: false };
}

describe('rescanRouteFile', () => {
  test('reports an appeared validator', async () => {
    const file = await writeRoute(`export const validateSearch = schema;`);

    expect(await rescanRouteFile([route('a', file)], file, new Set())).toEqual(new Set(['a']));
  });

  test('reports a disappeared validator', async () => {
    const file = await writeRoute(`export const loader = () => null;`);

    expect(await rescanRouteFile([route('a', file)], file, new Set(['a', 'b']))).toEqual(
      new Set(['b']),
    );
  });

  test('reports no change when the answer is the same', async () => {
    const file = await writeRoute(`export const validateSearch = schema;`);

    expect(await rescanRouteFile([route('a', file)], file, new Set(['a']))).toBeNull();
  });

  test('ignores routes declared from other files', async () => {
    const file = await writeRoute(`export const validateSearch = schema;`);
    const other = route('other', path.join(path.dirname(file), 'missing.tsx'));

    expect(await rescanRouteFile([route('a', file), other], file, new Set())).toEqual(
      new Set(['a']),
    );
  });

  test('covers every route declared from the same file', async () => {
    const file = await writeRoute(`export const validateSearch = schema;`);

    expect(await rescanRouteFile([route('a', file), route('b', file)], file, new Set())).toEqual(
      new Set(['a', 'b']),
    );
  });
});
