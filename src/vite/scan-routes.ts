/**
 * Concurrent scanning of configured route modules for `validateSearch`.
 *
 * @module
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import { analyzeRouteModule } from './analyze-route';
import { prepareSearchRoutes, type RouteRecord, type PreparedSearchRoute } from './route-config';

/** Return whether one configured route module exports `validateSearch`. */
export async function routeExportsValidateSearch(route: RouteRecord): Promise<boolean> {
  const source = await fs.readFile(route.file, 'utf8');

  return Boolean(analyzeRouteModule(source, route.file).validateSearch);
}

/** Collect ids of routes whose own module exports `validateSearch`. */
export async function collectValidatorRouteIds(
  routes: ReadonlyArray<RouteRecord>,
): Promise<Set<string>> {
  const scanned = await Promise.all(
    routes.map(async (route) => ({
      route,
      hasValidator: await routeExportsValidateSearch(route),
    })),
  );

  return new Set(scanned.flatMap(({ route, hasValidator }) => (hasValidator ? [route.id] : [])));
}

/**
 * Re-scan the routes declared from one file and fold the answer into the known
 * validator ids.
 *
 * Editing a route module can only change whether that module exports
 * `validateSearch`; the route tree itself comes from the route config. So one
 * file is read instead of the whole app, and an edit that left the answer alone
 * is reported as such.
 *
 * @returns Updated ids, or `null` when the file's routes still answer the same
 *   and the caller can keep its current set.
 */
export async function rescanRouteFile(
  routes: ReadonlyArray<RouteRecord>,
  file: string,
  validatorRouteIds: ReadonlySet<string>,
): Promise<Set<string> | null> {
  const declared = routes.filter((route) => path.normalize(route.file) === file);
  const scanned = await Promise.all(
    declared.map(async (route) => ({
      route,
      hasValidator: await routeExportsValidateSearch(route),
    })),
  );
  const flipped = scanned.filter(
    ({ route, hasValidator }) => hasValidator !== validatorRouteIds.has(route.id),
  );

  if (flipped.length === 0) return null;

  const next = new Set(validatorRouteIds);
  for (const { route, hasValidator } of flipped) {
    if (hasValidator) next.add(route.id);
    else next.delete(route.id);
  }

  return next;
}

/** Scan routes and prepare every local or inherited search-aware route. */
export async function collectPreparedSearchRoutes(
  routes: ReadonlyArray<RouteRecord>,
): Promise<Array<PreparedSearchRoute>> {
  return prepareSearchRoutes(routes, await collectValidatorRouteIds(routes));
}
