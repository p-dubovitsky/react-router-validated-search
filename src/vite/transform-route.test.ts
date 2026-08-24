import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSync } from 'oxc-parser';
// oxlint-disable-next-line eslint/no-restricted-imports -- package integration tests require the framework context implementation
import { RouterContextProvider } from 'react-router';
import { createServer } from 'vite';
import { afterEach, describe, expect, test } from 'vite-plus/test';

import { typedSearch } from './plugin';
import { transformRouteModule } from './transform-route';

const temporaryDirectories: Array<string> = [];

type TestRouteArgs = {
  context: RouterContextProvider;
  params: Record<string, string>;
  request: Request;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

function routeArgs(): TestRouteArgs {
  return {
    context: new RouterContextProvider(),
    params: {},
    request: new Request('https://example.test/products?page=2'),
  };
}

async function withRouteModule<T>(
  source: string,
  read: (route: Record<string, any>) => Promise<T> | T,
): Promise<T> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rr-search-'));
  temporaryDirectories.push(directory);
  const routeFile = path.join(directory, 'route.ts');
  await fs.writeFile(routeFile, source);

  const server = await createServer({
    configFile: false,
    root: directory,
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: {
      // Deepest subpath first: every key also matches everything under it.
      alias: {
        'react-router-validated-search/internal/codec': fileURLToPath(
          new URL('../internal/codec.ts', import.meta.url),
        ),
        'react-router-validated-search/internal': fileURLToPath(
          new URL('../internal/index.ts', import.meta.url),
        ),
        'react-router-validated-search': fileURLToPath(new URL('../index.ts', import.meta.url)),
      },
    },
    plugins: [
      typedSearch({ scan: false }),
      {
        name: 'test-search-transform',
        enforce: 'pre',
        transform(code, id) {
          if (!id.endsWith('/route.ts')) return undefined;
          return transformRouteModule(code, id);
        },
      },
    ],
  });

  try {
    return await read(await server.ssrLoadModule(routeFile));
  } finally {
    await server.close();
  }
}

function executeRoute(source: string, exportName: string): Promise<unknown> {
  return withRouteModule(source, (route) => {
    const args = routeArgs();
    const middleware = (
      exportName === 'loader' || exportName === 'action' ? route.middleware : route.clientMiddleware
    ) as Array<(args: TestRouteArgs, next: () => Promise<unknown>) => Promise<unknown>> | undefined;

    if (middleware) {
      let index = 0;
      const next = (): Promise<unknown> => {
        const current = middleware[index++];
        return current ? current(args, next) : route[exportName](args);
      };

      return next();
    }

    return route[exportName](args);
  });
}

describe('transformRouteModule', () => {
  test.each([
    ['function declaration', `export async function loader({ search }) { return search.page; }`],
    ['const arrow', `export const loader = ({ search }) => search.page;`],
    [
      'local export',
      `const userLoader = ({ search }) => search.page; export { userLoader as loader };`,
    ],
  ])('injects runtime search into a %s', async (_name, handler) => {
    const result = await executeRoute(
      `
        export function validateSearch(raw) {
          return { page: Number(raw.page) };
        }
        ${handler}
      `,
      'loader',
    );

    expect(result).toBe(2);
  });

  test.each(['loader', 'action', 'clientLoader', 'clientAction'] as const)(
    'wraps the %s export',
    async (handlerName) => {
      const result = await executeRoute(
        `
          export const validateSearch = raw => ({ page: Number(raw.page) });
          export const ${handlerName} = ({ search }) => search.page;
        `,
        handlerName,
      );

      expect(result).toBe(2);
    },
  );

  test('keeps clientLoader.hydrate on the wrapper next to a server loader', async () => {
    const hydrated = await withRouteModule(
      `
        export const validateSearch = raw => ({ page: Number(raw.page) });
        export const loader = ({ search }) => search.page;
        export const clientLoader = ({ search }) => search.page;
        clientLoader.hydrate = true;
      `,
      async (route) => {
        const args = routeArgs();
        const [validate] = route.clientMiddleware;

        return {
          // React Router reads `hydrate` off the exported handler, and with a
          // server loader present it is the only reason the route runs its
          // `clientLoader` on hydration at all.
          hydrate: route.clientLoader.hydrate,
          // Client middleware populates the context before the wrapper runs.
          result: await validate(args, () => route.clientLoader(args)),
        };
      },
    );

    expect(hydrated).toEqual({ hydrate: true, result: 2 });
  });

  test('leaves no top-level statement referencing a server handler', () => {
    const transformed = transformRouteModule(
      `
        import { fetchPage } from './services.server';

        export const validateSearch = raw => ({ page: Number(raw.page) });
        export const loader = ({ search }) => fetchPage(search.page);
        export const clientLoader = ({ search }) => search.page;
        export default function Page() { return null; }
      `,
      'route.tsx',
    );
    const body = parseSync('route.tsx', transformed?.code ?? '', {
      astType: 'ts',
      sourceType: 'module',
    }).program.body;

    // React Router builds the client bundle by dropping the `loader` export and
    // everything only it referenced — that is what keeps `./services.server` out
    // of the client graph. A top-level statement mentioning the route's own
    // handler would survive that removal, hold the server import, and fail the
    // client build.
    expect(body.filter((node) => node.type === 'ExpressionStatement')).toEqual([]);
  });

  test('redirects from middleware validation before invoking a server loader', async () => {
    await expect(
      executeRoute(
        `
          export const validateSearch = () => {
            throw new Response(null, { status: 302, headers: { Location: '/products?page=1' } });
          };
          export const loader = () => { throw new Error('loader must not run'); };
        `,
        'loader',
      ),
    ).rejects.toMatchObject({
      status: 302,
    });
  });

  test('redirects from validation before invoking a client handler', async () => {
    await expect(
      executeRoute(
        `
          export const validateSearch = () => {
            throw new Response(null, { status: 302, headers: { Location: '/products?page=1' } });
          };
          export const clientLoader = () => { throw new Error('clientLoader must not run'); };
        `,
        'clientLoader',
      ),
    ).rejects.toMatchObject({ status: 302 });
  });

  test('returns no transform for a searchless route', () => {
    expect(transformRouteModule('export const loader = () => 1;', 'route.ts')).toBeNull();
  });

  test('wraps an inheriting route without adding validation middleware', () => {
    const result = transformRouteModule(
      `
        export const loader = ({ search }) => search.page;
        export default function Games() { return null; }
      `,
      '/project/routes/games.tsx',
      {
        routeId: 'games',
        validatedSearchRouteId: 'catalog',
      },
    );

    expect(result?.code).not.toContain('createSearchValidationMiddleware as');
    expect(result?.code).not.toContain('export const middleware');
    expect(result?.code).toContain(`GetContextSearch(args.context, "catalog")`);
    expect(result?.code).toContain(
      `WithValidatedSearch(Games, { registryRouteId: "games", validatedSearchRouteId: "catalog" })`,
    );
  });

  test('passes route identity and parent validator identity to middleware', () => {
    const result = transformRouteModule(
      `
        export const validateSearch = raw => raw;
        export const loader = ({ search }) => search;
      `,
      '/project/routes/game.tsx',
      {
        routeId: 'game',
        validatedSearchRouteId: 'game',
        parentValidatedSearchRouteId: 'catalog',
      },
    );

    expect(result?.code).toContain(`CreateMiddleware("game", "catalog", validateSearch)`);
    expect(result?.code).toContain(`CreateClientMiddleware("game", "catalog", validateSearch)`);
    expect(result?.code).toContain(`GetContextSearch(args.context, "game")`);
  });

  test.each([
    'export default function Page() { return null; }',
    'const Page = () => null; export default Page;',
    'export default () => null;',
  ])('wraps the default component: %s', (component) => {
    const result = transformRouteModule(
      `export const validateSearch = raw => raw;\n${component}`,
      '/project/routes/products.tsx',
    );

    expect(result?.code).toContain('withValidatedSearch as');
    expect(result?.code).toContain('export default');
    expect(result?.code).toContain('validateSearch');
  });

  test.each([
    ['export default function Page() { return null; }', 'export function Page'],
    ['const Page = () => null; export default Page;', 'export const Page'],
    ['function Page() { return null; } export default Page;', 'export function Page'],
    ['export default () => null;', 'export const __reactRouterSearchComponent'],
  ])('keeps the wrapped component an export declaration: %s', (component, expected) => {
    const result = transformRouteModule(
      `export const validateSearch = raw => raw;\n${component}`,
      '/project/routes/products.tsx',
    );

    // React Router refuses to split an export whose statements are shared with
    // another export, and a plain top-level declaration counts as shared
    // through the JSX runtime import. Keeping the declaration itself exported
    // is what leaves `HydrateFallback` in its own chunk — an
    // `export { Page }` specifier next to a bare declaration does not.
    expect(result?.code).toContain(expected);
    expect(result?.code).toContain('export default');
  });

  test('prepends validation middleware and preserves existing middleware', () => {
    const result = transformRouteModule(
      `
        export const validateSearch = raw => raw;
        const existingMiddleware = async (_args, next) => next();
        export const middleware = [existingMiddleware];
        export const loader = () => null;
      `,
      '/project/routes/products.ts',
    );

    expect(result?.code).toContain('createSearchValidationMiddleware as');
    expect(result?.code).toContain('...middleware');
  });

  test('prepends client validation middleware and preserves existing client middleware', () => {
    const result = transformRouteModule(
      `
        export const validateSearch = raw => raw;
        const existingMiddleware = async (_args, next) => next();
        export const clientMiddleware = [existingMiddleware];
        export const clientLoader = () => null;
      `,
      '/project/routes/products.ts',
    );

    expect(result?.code).toContain('createClientSearchValidationMiddleware as');
    expect(result?.code).toContain('...clientMiddleware');
  });

  test('does not generate a loader for a component-only route', () => {
    const result = transformRouteModule(
      `
        export const validateSearch = raw => raw;
        export default function Page() { return null; }
      `,
      '/project/routes/products.tsx',
    );

    expect(result?.code).not.toContain('export const loader');
    expect(result?.code).toContain('createClientSearchValidationMiddleware as');
  });

  test('reads clientLoader search from client middleware context', () => {
    const result = transformRouteModule(
      `
        export const validateSearch = raw => raw;
        export const clientLoader = ({ search }) => search;
        export default function Page() { return null; }
      `,
      '/project/routes/products.tsx',
    );

    expect(result?.code).not.toContain('export const loader');
    expect(result?.code).toContain('requireValidatedSearch as');
  });

  test('rejects non-local client middleware re-exports with a focused diagnostic', () => {
    expect(() =>
      transformRouteModule(
        `
          export const validateSearch = raw => raw;
          export { clientMiddleware } from './middleware';
        `,
        '/project/routes/products.ts',
      ),
    ).toThrow(
      '[react-router-validated-search] Route "/project/routes/products.ts" re-exports `clientMiddleware` from another module',
    );
  });

  test('rejects non-local handler re-exports with a focused diagnostic', () => {
    expect(() =>
      transformRouteModule(
        `
          export { validateSearch } from './contract';
          export { loader } from './handler';
        `,
        '/project/routes/products.ts',
      ),
    ).toThrow(
      '[react-router-validated-search] Route "/project/routes/products.ts" re-exports `validateSearch` from another module',
    );
  });

  test('emits a source map pointing at the user route', () => {
    const result = transformRouteModule(
      `export const validateSearch = raw => raw;\nexport const loader = () => 1;`,
      '/project/routes/products.ts',
    );

    expect(result?.map.sources).toEqual(['/project/routes/products.ts']);
    expect(result?.map.sourcesContent).toEqual([
      `export const validateSearch = raw => raw;\nexport const loader = () => 1;`,
    ]);
  });
});
