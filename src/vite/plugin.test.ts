import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, test, vi } from 'vite-plus/test';

import {
  loadConfiguredCodec,
  RESOLVED_REGISTRY_MODULE_ID,
  routeModuleFile,
  typedSearch,
} from './plugin';

const temporaryDirectories: Array<string> = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function writeConfigProject(config: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rr-search-config-'));
  temporaryDirectories.push(root);
  await fs.writeFile(path.join(root, 'vite.config.ts'), config);

  return root;
}

type WatchedProject = {
  routeFile: (name: string) => string;
  change: (name: string) => void;
  reloads: Array<unknown>;
  invalidated: Array<string>;
  errors: Array<string>;
};

/**
 * Run the plugin's dev-server hooks against a project on disk.
 *
 * The route config is a plain array rather than `route()` calls so that loading
 * it needs no `@react-router/dev` resolution, which a temporary project outside
 * this repository does not have.
 */
async function startWatchedProject(files: Record<string, string>): Promise<WatchedProject> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rr-search-watch-'));
  temporaryDirectories.push(root);
  const appDirectory = path.join(root, 'app');
  await fs.mkdir(appDirectory);
  await fs.writeFile(
    path.join(appDirectory, 'routes.ts'),
    `export default ${JSON.stringify(
      Object.keys(files).map((file) => ({
        id: path.parse(file).name,
        file,
        path: `/${path.parse(file).name}`,
      })),
    )};\n`,
  );
  await Promise.all(
    Object.entries(files).map(([file, source]) =>
      fs.writeFile(path.join(appDirectory, file), source),
    ),
  );

  const reloads: Array<unknown> = [];
  const invalidated: Array<string> = [];
  const errors: Array<string> = [];
  const listeners = new Map<string, (file: string) => void>();
  const registryModule = { id: RESOLVED_REGISTRY_MODULE_ID };

  const plugin = typedSearch({ appDirectory: 'app' });
  const configResolved = plugin.configResolved as Exclude<
    typeof plugin.configResolved,
    { handler: unknown } | undefined
  >;
  await configResolved.call(
    {} as never,
    {
      root,
      resolve: { alias: [] },
    } as never,
  );

  const configureServer = plugin.configureServer as Exclude<
    typeof plugin.configureServer,
    { handler: unknown } | undefined
  >;
  configureServer.call(
    {} as never,
    {
      environments: {
        ssr: {
          moduleGraph: {
            getModuleById: (id: string) =>
              id === RESOLVED_REGISTRY_MODULE_ID ? registryModule : undefined,
            invalidateModule: (module: { id: string }) => invalidated.push(module.id),
          },
        },
      },
      config: { logger: { error: (message: string) => errors.push(message) } },
      ws: { send: (payload: unknown) => reloads.push(payload) },
      watcher: {
        on: (event: string, listener: (file: string) => void) => {
          listeners.set(event, listener);
        },
      },
    } as never,
  );

  return {
    routeFile: (name) => path.join(appDirectory, name),
    change: (name) => listeners.get('change')?.(path.join(appDirectory, name)),
    reloads,
    invalidated,
    errors,
  };
}

const pluginModule = JSON.stringify(fileURLToPath(new URL('./plugin.ts', import.meta.url)));

describe('typedSearch', () => {
  test('is a pre plugin and exposes the generated runtime registry', () => {
    const plugin = typedSearch({ scan: false });

    expect(plugin.name).toBe('react-router-validated-search');
    expect(plugin.enforce).toBe('pre');
    const resolveId = plugin.resolveId as Exclude<
      typeof plugin.resolveId,
      { handler: unknown } | undefined
    >;
    expect(
      resolveId.call(
        {} as never,
        'virtual:react-router-validated-search/registry',
        undefined,
        {} as never,
      ),
    ).toBe('\0virtual:react-router-validated-search/registry');
    expect(
      resolveId.call(
        {} as never,
        'virtual:react-router-validated-search/codec',
        undefined,
        {} as never,
      ),
    ).toBe('\0virtual:react-router-validated-search/codec');
  });

  test('renders the configured built-in codec', () => {
    const plugin = typedSearch({ scan: false, codec: 'json' });
    const load = plugin.load as Exclude<typeof plugin.load, { handler: unknown } | undefined>;

    expect(
      load.call({} as never, '\0virtual:react-router-validated-search/codec', {} as never),
    ).toBe(
      `export { jsonSearchCodec as searchCodec } from 'react-router-validated-search/internal/codec';\n`,
    );

    expect(
      load.call({} as never, '\0virtual:react-router-validated-search/codec', {} as never),
    ).toContain("from 'react-router-validated-search/internal/codec'");
  });

  test('answers the CLI with the codec its configuration selects', async () => {
    const root = await writeConfigProject(
      `import { typedSearch } from ${pluginModule};\n` +
        `export default { plugins: [[typedSearch({ codec: 'json' })]] };\n`,
    );

    await expect(loadConfiguredCodec(root)).resolves.toBe('json');
  });

  // Falling back to the default here would generate `flat` types for an
  // application serializing as `json`, silently.
  test('refuses to guess a codec when the configuration does not list the plugin', async () => {
    const root = await writeConfigProject(`export default { plugins: [] };\n`);

    await expect(loadConfiguredCodec(root)).rejects.toThrow(
      /vite\.config\.ts does not list the react-router-validated-search plugin/,
    );
  });

  test('refuses to guess a codec without a Vite configuration', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rr-search-config-'));
    temporaryDirectories.push(root);

    await expect(loadConfiguredCodec(root)).rejects.toThrow(/No Vite configuration found/);
  });

  test('transforms a route module behind React Router build queries', () => {
    const routeFiles = new Set(['/project/src/routes/products.tsx']);
    const transforms = (id: string): boolean => routeModuleFile(id, routeFiles) !== null;

    expect(transforms('/project/src/routes/products.tsx')).toBe(true);
    // React Router splits and analyses the route module behind these queries, so
    // they have to see the same code as the module itself.
    expect(transforms('/project/src/routes/products.tsx?route-chunk=main')).toBe(true);
    expect(transforms('/project/src/routes/products.tsx?route-chunk=clientLoader')).toBe(true);
    expect(transforms('/project/src/routes/products.tsx?__react-router-build-client-route')).toBe(
      true,
    );

    // Anything else behind a query is a generated module, not the route.
    expect(transforms('/project/src/routes/products.tsx?raw')).toBe(false);
    expect(transforms('/project/src/routes/other.tsx?route-chunk=main')).toBe(false);
  });

  test('transforms discovered parent and local validator inheritance', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rr-search-transform-'));
    temporaryDirectories.push(root);
    const appDirectory = path.join(root, 'app');
    await fs.mkdir(appDirectory);

    const sources = {
      'catalog.tsx': `export const validateSearch = raw => raw;\nexport default function Catalog() { return null; }\n`,
      'games.tsx': `export const loader = ({ search }) => search.page;\nexport default function Games() { return null; }\n`,
      'game.tsx': `export const validateSearch = raw => raw;\nexport const loader = ({ search }) => search.game;\n`,
    };
    await fs.writeFile(
      path.join(appDirectory, 'routes.ts'),
      `export default ${JSON.stringify([
        {
          id: 'catalog',
          file: 'catalog.tsx',
          path: 'catalog',
          children: [
            {
              id: 'games',
              file: 'games.tsx',
              path: 'games',
              children: [{ id: 'game', file: 'game.tsx', path: ':gameId' }],
            },
          ],
        },
      ])};\n`,
    );
    await Promise.all(
      Object.entries(sources).map(([file, source]) =>
        fs.writeFile(path.join(appDirectory, file), source),
      ),
    );

    const plugin = typedSearch({ appDirectory: 'app' });
    const configResolved = plugin.configResolved as Exclude<
      typeof plugin.configResolved,
      { handler: unknown } | undefined
    >;
    await configResolved.call({} as never, { root, resolve: { alias: [] } } as never);
    const transform = plugin.transform as Exclude<
      typeof plugin.transform,
      { handler: unknown } | undefined
    >;

    const inherited = await transform.call(
      {} as never,
      sources['games.tsx'],
      path.join(appDirectory, 'games.tsx'),
      {} as never,
    );
    expect(inherited).toMatchObject({
      code: expect.stringContaining(`GetContextSearch(args.context, "catalog")`),
    });
    expect(inherited).toMatchObject({
      code: expect.stringContaining(
        `WithValidatedSearch(Games, { registryRouteId: "games", validatedSearchRouteId: "catalog" })`,
      ),
    });

    const local = await transform.call(
      {} as never,
      sources['game.tsx'],
      path.join(appDirectory, 'game.tsx'),
      {} as never,
    );
    expect(local).toMatchObject({
      code: expect.stringContaining(`CreateMiddleware("game", "catalog", validateSearch)`),
    });
    expect(local).toMatchObject({
      code: expect.stringContaining(`GetContextSearch(args.context, "game")`),
    });
  });

  // The runtime keeps a route's resolved validator chain for the lifetime of the
  // page, so an edited validator body has to drop that chain: otherwise
  // middleware runs the new function while a component runs the old one.
  //
  // Both changes go through one test because the plugin handles them in order,
  // so the second reload proves the first change was already processed — no
  // waiting on a timer to decide that nothing happened.
  test('reloads when a validator body changes and leaves other routes alone', async () => {
    const project = await startWatchedProject({
      'plain.tsx': `export default function Plain() { return null; }\n`,
      'products.tsx':
        `export const validateSearch = (raw) => ({ page: Number(raw.page) });\n` +
        `export default function Products() { return null; }\n`,
    });

    await fs.writeFile(
      project.routeFile('plain.tsx'),
      `export default function Plain() { return "edited"; }\n`,
    );
    project.change('plain.tsx');

    await fs.writeFile(
      project.routeFile('products.tsx'),
      `export const validateSearch = (raw) => ({ page: Number(raw.page) + 1 });\n` +
        `export default function Products() { return null; }\n`,
    );
    project.change('products.tsx');

    await vi.waitFor(() => expect(project.reloads).toHaveLength(1));
    expect(project.reloads).toEqual([{ type: 'full-reload' }]);
    expect(project.invalidated).toEqual([RESOLVED_REGISTRY_MODULE_ID]);
  });

  test('continues rebuilding after a route scan fails', async () => {
    const project = await startWatchedProject({
      'products.tsx':
        `export const validateSearch = (raw) => raw;\n` +
        `export default function Products() { return null; }\n`,
    });

    await fs.writeFile(project.routeFile('products.tsx'), 'export const =');
    project.change('products.tsx');
    await vi.waitFor(() => expect(project.errors).toHaveLength(1));

    await fs.writeFile(
      project.routeFile('products.tsx'),
      `export const validateSearch = (raw) => ({ ...raw, fixed: true });\n` +
        `export default function Products() { return null; }\n`,
    );
    project.change('products.tsx');

    await vi.waitFor(() => expect(project.reloads).toHaveLength(1));
    expect(project.invalidated).toEqual([RESOLVED_REGISTRY_MODULE_ID]);
  });
});
