/**
 * Vite integration for route discovery, transformation, virtual modules, HMR,
 * and search-aware type generation.
 *
 * @module
 */
import path from 'node:path';

import { loadConfigFromFile, type Plugin, type PluginOption, type ResolvedConfig } from 'vite';

import { DEFAULT_SEARCH_CODEC, type SearchCodecName } from '../runtime/search-codec';
import { renderRuntimeRegistry } from './registry';
import {
  prepareSearchRoutes,
  loadRouteConfig,
  resolveAppDirectory,
  type RouteRecord,
  type PreparedSearchRoute,
} from './route-config';
import { collectValidatorRouteIds, rescanRouteFile } from './scan-routes';
import { transformRouteModule } from './transform-route';
import { generateSearchTypes } from './typegen';

/** Name of the plugin instance, also how the CLI recognizes it in a config. */
export const PLUGIN_NAME = 'react-router-validated-search';
/** Public id of the lazy validator registry virtual module. */
export const REGISTRY_MODULE_ID = 'virtual:react-router-validated-search/registry';
/** Internal Vite-resolved id of the validator registry. */
export const RESOLVED_REGISTRY_MODULE_ID = `\0${REGISTRY_MODULE_ID}`;
/** Public id of the configured search codec virtual module. */
export const CODEC_MODULE_ID = 'virtual:react-router-validated-search/codec';
/** Internal Vite-resolved id of the configured codec module. */
export const RESOLVED_CODEC_MODULE_ID = `\0${CODEC_MODULE_ID}`;

/** Configuration accepted by {@link typedSearch}. */
export type TypedSearchOptions = {
  /** Override React Router's resolved application directory. */
  appDirectory?: string;
  /** Select the runtime and generated typing codec. Defaults to `flat`. */
  codec?: SearchCodecName;
  /** Disable route scanning/transformation/typegen while retaining plugin shape. */
  scan?: boolean;
};

/** What {@link typedSearch} publishes on the plugin instance. */
export type TypedSearchPluginApi = {
  codec: SearchCodecName;
};

async function findPlugin(option: PluginOption): Promise<Plugin | undefined> {
  const resolved = await option;
  if (!resolved) return undefined;

  if (Array.isArray(resolved)) {
    for (const nested of resolved) {
      const found = await findPlugin(nested);
      if (found) return found;
    }

    return undefined;
  }

  return resolved.name === PLUGIN_NAME ? resolved : undefined;
}

/**
 * Read the codec an application's Vite configuration selects.
 *
 * The codec has one owner — the plugin option — because generated input types
 * and runtime serialization have to describe the same format, and a second
 * place to name it is a second answer to keep in sync. The CLI therefore asks
 * the configuration instead of taking a flag.
 *
 * Loading the config file only evaluates it; no plugin hook runs, so this
 * cannot re-enter the type generation it is called from.
 *
 * Not finding the plugin throws rather than falling back to the default: the
 * default belongs to `typedSearch()`, and answering it from here would generate
 * `flat` types for an application serializing as `json` — the mismatch this
 * single owner exists to prevent, without so much as a message. A wrong
 * `--root`, a config file Vite does not pick up by name, a plugin added
 * conditionally or by another plugin all land here.
 */
export async function loadConfiguredCodec(root: string): Promise<SearchCodecName> {
  const loaded = await loadConfigFromFile(
    { command: 'build', mode: 'production' },
    undefined,
    root,
  );

  if (!loaded) {
    throw new Error(
      `[react-router-validated-search] No Vite configuration found in ${root}. The codec comes from typedSearch({ codec }), so generation needs the configuration that names it.`,
    );
  }

  const plugin = await findPlugin(loaded.config.plugins);
  const codec = (plugin?.api as TypedSearchPluginApi | undefined)?.codec;

  if (!codec) {
    throw new Error(
      `[react-router-validated-search] ${path.relative(root, loaded.path) || loaded.path} does not list the ${PLUGIN_NAME} plugin. Add typedSearch() to it — a plugin added conditionally or by another plugin is invisible here, because loading the configuration runs no hooks.`,
    );
  }

  return codec;
}

/**
 * In a client build React Router asks for a route module several times behind
 * its own queries: once per chunk under `?route-chunk=<name>`, and once under
 * `?__react-router-build-client-route` to work out which exports the route entry
 * needs. Vite loads the file from disk for all of them, so skipping those ids
 * would let React Router decide which exports are chunkable from the
 * untransformed source while splitting the transformed one. The two answers
 * disagree, and an export that is chunkable in one pass and not the other is
 * dropped from the build. Every other query is a generated module (`?raw`,
 * `?url`) and must be left alone.
 */
const ROUTE_MODULE_QUERY = /\?(?:route-chunk=[^&?]+|__react-router-build-client-route)$/;

/**
 * Resolve a Vite id to a configured route file, including React Router queries.
 */
export function routeModuleFile(id: string, routeFiles: ReadonlySet<string>): string | null {
  const file = id.replace(ROUTE_MODULE_QUERY, '');
  if (file.includes('?')) return null;

  const normalized = path.normalize(file);
  return routeFiles.has(normalized) ? normalized : null;
}

/**
 * Create the pre-enforced Vite plugin that installs validated route search.
 *
 * Place it immediately before React Router's Vite plugin so React Router sees
 * the transformed export graph during route chunk analysis.
 */
export function typedSearch(options: TypedSearchOptions = {}): Plugin {
  const codec = options.codec ?? DEFAULT_SEARCH_CODEC;
  let config: ResolvedConfig | undefined;
  let appDirectory = '';
  let routes: Array<RouteRecord> = [];
  let routeFiles = new Set<string>();
  let validatorRouteIds = new Set<string>();
  let preparedRoutes: Array<PreparedSearchRoute> = [];
  let preparedRouteByFile = new Map<string, PreparedSearchRoute>();
  let dependencies = new Set<string>();
  let typegenPromise: Promise<void> | undefined;

  const rebuildPreparedRoutes = (): void => {
    preparedRoutes = prepareSearchRoutes(routes, validatorRouteIds);
    preparedRouteByFile = new Map(
      preparedRoutes.map((preparedRoute) => [
        path.normalize(preparedRoute.route.file),
        preparedRoute,
      ]),
    );
  };

  /** Whether any route declared from this file exports `validateSearch`. */
  const declaresValidator = (file: string): boolean =>
    routes.some((route) => path.normalize(route.file) === file && validatorRouteIds.has(route.id));

  const generateTypes = async (): Promise<void> => {
    if (!config || options.scan === false) return;
    await generateSearchTypes({
      root: config.root,
      appDirectory,
      routes,
      preparedRoutes,
      codec,
      allowMissingReactRouterTypes: true,
    });
  };

  const refresh = async (): Promise<void> => {
    if (!config || options.scan === false) return;

    typegenPromise = undefined;
    const inlineConfig = {
      configFile: false as const,
      root: config.root,
      resolve: { alias: config.resolve.alias },
    };

    // `react-router.config.*` is not among the watched dependencies, so its
    // answer cannot change while the server runs — and importing it drags in
    // the whole config graph, which is far from free.
    appDirectory ||= options.appDirectory
      ? path.resolve(config.root, options.appDirectory)
      : await resolveAppDirectory(config.root, inlineConfig);

    const loaded = await loadRouteConfig(appDirectory, inlineConfig);
    routes = loaded.routes;
    routeFiles = new Set(routes.map((route) => path.normalize(route.file)));
    dependencies = new Set(loaded.dependencies.map((file) => path.normalize(file)));
    validatorRouteIds = await collectValidatorRouteIds(routes);
    rebuildPreparedRoutes();
  };

  return {
    name: PLUGIN_NAME,
    enforce: 'pre',
    api: { codec } satisfies TypedSearchPluginApi,

    async configResolved(resolvedConfig) {
      config = resolvedConfig;
      await refresh();
    },

    async buildStart() {
      // Vite calls buildStart once per environment (client and ssr), and both
      // calls would write the same files.
      typegenPromise ??= generateTypes();
      await typegenPromise;
    },

    configureServer(server) {
      if (options.scan === false) return;

      let queue = Promise.resolve();
      const reloadRegistry = (): void => {
        for (const environment of Object.values(server.environments)) {
          const module = environment.moduleGraph.getModuleById(RESOLVED_REGISTRY_MODULE_ID);
          if (module) environment.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: 'full-reload' });
      };
      const rebuild = (file: string, event: 'change' | 'other'): void => {
        const normalized = path.normalize(file);
        if (!routeFiles.has(normalized) && !dependencies.has(normalized)) return;

        queue = queue
          .then(async () => {
            if (dependencies.has(normalized) || event !== 'change') {
              await refresh();
            } else {
              const rescanned = await rescanRouteFile(routes, normalized, validatorRouteIds);
              if (!rescanned) {
                // The validator modules are memoized by the browser runtime, so
                // an edited validator body still requires a registry reload.
                if (declaresValidator(normalized)) reloadRegistry();
                return;
              }

              validatorRouteIds = rescanned;
              rebuildPreparedRoutes();
            }

            await generateTypes();
            reloadRegistry();
          })
          .catch((error: unknown) => {
            server.config.logger.error(error instanceof Error ? error.message : String(error));
          });
      };

      server.watcher.on('change', (file) => rebuild(file, 'change'));
      server.watcher.on('add', (file) => rebuild(file, 'other'));
      server.watcher.on('unlink', (file) => rebuild(file, 'other'));
    },

    resolveId(id) {
      if (id === REGISTRY_MODULE_ID) return RESOLVED_REGISTRY_MODULE_ID;
      if (id === CODEC_MODULE_ID) return RESOLVED_CODEC_MODULE_ID;
      return undefined;
    },

    load(id) {
      if (id === RESOLVED_REGISTRY_MODULE_ID) {
        return renderRuntimeRegistry(preparedRoutes);
      }
      if (id === RESOLVED_CODEC_MODULE_ID) {
        return `export { ${codec}SearchCodec as searchCodec } from 'react-router-validated-search/internal/codec';\n`;
      }
      return undefined;
    },

    transform(source, id) {
      const file = routeModuleFile(id, routeFiles);
      if (!file) return undefined;

      const preparedRoute = preparedRouteByFile.get(file);
      if (!preparedRoute) return undefined;

      // The file path rather than `id`: the parser infers the language from the
      // extension, which a `?route-chunk=` suffix would hide.
      return transformRouteModule(source, file, preparedRoute.transform);
    },
  };
}
