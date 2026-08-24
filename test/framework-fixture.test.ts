import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// oxlint-disable-next-line eslint/no-restricted-imports -- this package integrates with React Router directly
import { createRequestHandler } from 'react-router';
import { afterAll, expect, test } from 'vite-plus/test';

import { main } from '../src/cli/index';

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const fixtureRoot = path.join(packageRoot, 'test/fixtures/framework');
// Keep typegen output available to the editor after the fixture tests finish.
const buildDirectories = ['.build', 'build'];

afterAll(async () => {
  await Promise.all(
    buildDirectories.map((directory) =>
      fs.rm(path.join(fixtureRoot, directory), {
        recursive: true,
        force: true,
      }),
    ),
  );
});

function run(binary: string, args: Array<string>) {
  return spawnSync(path.join(packageRoot, 'node_modules/.bin', binary), args, {
    cwd: fixtureRoot,
    encoding: 'utf8',
  });
}

test('the Framework Mode fixture passes native and search typegen', async () => {
  const reactRouterTypegen = run('react-router', ['typegen']);
  expect(reactRouterTypegen.status, reactRouterTypegen.stderr).toBe(0);

  await expect(main(['typegen', '--root', fixtureRoot])).resolves.toBe(0);

  const typecheck = run('tsc', ['--noEmit', '--project', 'tsconfig.json']);
  expect(typecheck.status, typecheck.stdout + typecheck.stderr).toBe(0);
}, 10_000);

async function readClientChunks(): Promise<{
  names: Array<string>;
  code: string;
}> {
  const assets = path.join(fixtureRoot, '.build/client/assets');
  const names = (await fs.readdir(assets)).filter((name) => name.endsWith('.js'));
  const chunks = await Promise.all(
    names.map((name) => fs.readFile(path.join(assets, name), 'utf8')),
  );

  return { names, code: chunks.join('\n') };
}

/**
 * `client-only.tsx` exports `clientLoader` and no server loader, so on the
 * server that route is reached through the injected middleware alone: a rejected
 * search must come back as a redirect from the data phase, and an accepted one
 * must render the fallback React Router uses for such a route instead of an
 * error. In the client build the same route is split into chunks, which is where
 * the transform has to keep client validation middleware, the handler wrapper,
 * and React Router's own splitting intact.
 */
test('the Framework Mode fixture builds and serves transformed route modules', async () => {
  const build = run('vp', ['build']);

  expect(build.status, build.stdout + build.stderr).toBe(0);

  const serverBuild = await import(
    pathToFileURL(path.join(fixtureRoot, '.build/server/index.js')).href
  );
  const handleRequest = createRequestHandler(serverBuild);

  const redirected = await handleRequest(new Request('https://fixture.test/client-only?page=2'));

  expect(redirected.status).toBe(302);
  expect(redirected.headers.get('Location')).toBe('/client-only?page=1');

  const rendered = await handleRequest(new Request('https://fixture.test/client-only?page=1'));

  expect(rendered.status).toBe(200);
  await expect(rendered.text()).resolves.toContain('loading');

  const serverData = await handleRequest(new Request('https://fixture.test/server-data?page=2'));

  expect(serverData.status).toBe(200);
  await expect(serverData.text()).resolves.toContain('stock:2:server-only-stock-secret');

  const clientChunks = await readClientChunks();

  // `server-data.tsx` reads a `.server` module from its loader, so the build
  // above only succeeded because nothing in the transformed module still
  // referenced that loader once React Router removed the export: the plugin
  // fails the client build on a surviving `.server` import. The value itself
  // must be gone from the chunks too.
  expect(clientChunks.code).not.toContain('server-only-stock-secret');

  // Client validation survives React Router's route export splitting, while the
  // split `clientLoader` exports the context-reading wrapper.
  expect(clientChunks.code).toContain(
    'createClientSearchValidationMiddleware("routes/client-only"',
  );
  expect(clientChunks.code).toContain('__reactRouterSearch_clientLoader as clientLoader');
  // Wrapping the component must not cost React Router the chunks it wanted to
  // split off, in either form of the default export: `client-only` declares its
  // component in the `export default` statement, `default-alias` exports an
  // identifier. Both routes must get a real `HydrateFallback` chunk — when an
  // export React Router expected to split turns out to share code with another
  // one, it emits a placeholder chunk under the same name and drops the export.
  expect(clientChunks.names).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^client-only-hydrate-fallback-/),
      expect.stringMatching(/^default-alias-hydrate-fallback-/),
    ]),
  );
  expect(clientChunks.code).toContain('withHydrateFallbackProps');
}, 60_000);
