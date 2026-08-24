/**
 * Loading and flattening of the application's real React Router route tree.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';

import type { RouteConfigEntry } from '@react-router/dev/routes';
import { runnerImport } from 'vite';
import type { InlineConfig } from 'vite';

/** Flattened route information needed by scanning, registries, and transforms. */
export type RouteRecord = {
  id: string;
  file: string;
  path: string;
  parentId?: string;
  index: boolean;
};

/** Route-owned identities consumed by the source transform. */
export type SearchRouteTransform = {
  routeId: string;
  validatedSearchRouteId: string;
  parentValidatedSearchRouteId?: string;
};

/** A search-aware route prepared for registries, typegen, and transforms. */
export type PreparedSearchRoute = {
  route: RouteRecord;
  validators: Array<RouteRecord>;
  transform: SearchRouteTransform;
};

/** Route records plus files imported while evaluating `routes.*`. */
export type LoadedRouteConfig = {
  routes: Array<RouteRecord>;
  dependencies: Array<string>;
};

/**
 * Build inherited validator chains for every search-aware route.
 *
 * Routes without a local validator are included when an ancestor validates.
 */
export function prepareSearchRoutes(
  routes: ReadonlyArray<RouteRecord>,
  validatorRouteIds: ReadonlySet<string>,
): Array<PreparedSearchRoute> {
  const routesById = new Map(routes.map((route) => [route.id, route]));
  const validatorsByRouteId = new Map<string, Array<RouteRecord>>();

  function getValidators(route: RouteRecord): Array<RouteRecord> {
    const cached = validatorsByRouteId.get(route.id);
    if (cached) return cached;

    const parent = route.parentId ? routesById.get(route.parentId) : undefined;
    const validators = parent ? [...getValidators(parent)] : [];
    if (validatorRouteIds.has(route.id)) validators.push(route);
    validatorsByRouteId.set(route.id, validators);
    return validators;
  }

  const preparedRoutes = routes.flatMap((route) => {
    const validators = getValidators(route);
    const resultRoute = validators.at(-1);
    if (!resultRoute) return [];

    const hasOwnValidator = resultRoute.id === route.id;
    const parentResult = hasOwnValidator ? validators.at(-2) : undefined;
    return [
      {
        route,
        validators,
        transform: {
          routeId: route.id,
          validatedSearchRouteId: resultRoute.id,
          ...(parentResult ? { parentValidatedSearchRouteId: parentResult.id } : {}),
        },
      },
    ];
  });
  const routeIdsByFile = new Map<string, Array<string>>();

  for (const { route } of preparedRoutes) {
    const routeIds = routeIdsByFile.get(route.file);
    if (routeIds) routeIds.push(route.id);
    else routeIdsByFile.set(route.file, [route.id]);
  }

  for (const [file, routeIds] of routeIdsByFile) {
    if (routeIds.length > 1) {
      throw new Error(
        `[react-router-validated-search] Route module ${JSON.stringify(file)} is used by multiple search-aware routes: ${routeIds.map((routeId) => JSON.stringify(routeId)).join(', ')}. Use a separate route module for each route.`,
      );
    }
  }

  return preparedRoutes;
}

function createRouteId(file: string): string {
  return file
    .replace(/^\.\//, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .split(path.sep)
    .join('/');
}

function normalizeRoutePath(value: string): string {
  const normalized = value.replace(/^\/+|\/+$/g, '');

  return normalized ? `/${normalized}` : '/';
}

function joinRoutePath(parentPath: string, routePath?: string): string {
  if (!routePath) return parentPath;
  if (routePath.startsWith('/')) return normalizeRoutePath(routePath);

  return normalizeRoutePath([parentPath === '/' ? '' : parentPath, routePath].join('/'));
}

/** Flatten nested React Router configuration while preserving parent ids. */
export function flattenRouteConfig(
  appDirectory: string,
  routes: ReadonlyArray<RouteConfigEntry>,
): Array<RouteRecord> {
  const records: Array<RouteRecord> = [];

  const walk = (route: RouteConfigEntry, parentId?: string, parentPath = '/'): void => {
    const id = route.id ?? createRouteId(route.file);
    const fullPath = route.index ? parentPath : joinRoutePath(parentPath, route.path);

    records.push({
      id,
      file: path.resolve(appDirectory, route.file),
      path: fullPath,
      parentId,
      index: Boolean(route.index),
    });

    for (const child of route.children ?? []) {
      walk(child, id, fullPath);
    }
  };

  for (const route of routes) walk(route);

  return records;
}

function findFile(directory: string, baseName: string): string {
  for (const extension of ['ts', 'tsx', 'js', 'jsx', 'mjs', 'mts']) {
    const file = path.join(directory, `${baseName}.${extension}`);

    if (fs.existsSync(file)) return file;
  }

  throw new Error(`[react-router-validated-search] Could not find ${baseName} in ${directory}`);
}

/** Resolve `appDirectory` from `react-router.config.*`, defaulting to `app`. */
export async function resolveAppDirectory(
  root: string,
  inlineConfig: InlineConfig = {},
): Promise<string> {
  for (const extension of ['ts', 'js', 'mts', 'mjs']) {
    const configFile = path.join(root, `react-router.config.${extension}`);

    if (!fs.existsSync(configFile)) continue;

    const { module } = await runnerImport<{
      default?: { appDirectory?: string };
    }>(configFile, inlineConfig);

    return path.resolve(root, module.default?.appDirectory ?? 'app');
  }

  return path.resolve(root, 'app');
}

/** Import and flatten the configured `routes.*` module through Vite. */
export async function loadRouteConfig(
  appDirectory: string,
  inlineConfig: InlineConfig = {},
): Promise<LoadedRouteConfig> {
  const routesFile = findFile(appDirectory, 'routes');
  const { module, dependencies } = await runnerImport<{
    default: ReadonlyArray<RouteConfigEntry> | Promise<ReadonlyArray<RouteConfigEntry>>;
  }>(routesFile, inlineConfig);
  const routeConfig = await module.default;

  return {
    routes: flattenRouteConfig(appDirectory, routeConfig),
    dependencies: [routesFile, ...dependencies],
  };
}
