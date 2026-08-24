/// <reference path="../virtual-modules.d.ts" />

/**
 * Registry-backed validator-chain loading, merging, and client-side caching.
 *
 * @module
 */
import { searchCodec } from 'virtual:react-router-validated-search/codec';
import {
  validatorImportsByRouteId,
  validatorImportsByRoutePattern,
} from 'virtual:react-router-validated-search/registry';

import type { SearchOutputFor, SearchRoutePattern } from '../react/route-types';
import { parseRequestSearch, requestSearchString } from './handler';
import type { MaybePromise, SearchValidator } from './validate-search';
import { isPromiseLike, runSearchValidator } from './validate-search';

const MAX_VALIDATION_CACHE_ENTRIES = 50;

const browserValidationCache = new WeakMap<
  object,
  Map<string, { value: Record<string, unknown> }>
>();

const loadedValidatorChains = new Map<string, ReadonlyArray<SearchValidator>>();
const pendingValidatorChains = new Map<string, Promise<ReadonlyArray<SearchValidator>>>();

/** Merge a local validator result over inherited route search. */
export function mergeValidatedSearch(
  inherited: Record<string, unknown>,
  local: Record<string, unknown>,
): Record<string, unknown> {
  return { ...inherited, ...local };
}

/**
 * Parse and validate one search source.
 *
 * Browser callers share successful results for the exact validator and search
 * string. Server callers always validate again: a module cache there would
 * retain one request's input for later requests. The operation owns both forms
 * of parsing: location strings use the configured codec, while middleware
 * requests retain their request-scoped parsed input.
 */
export function validateSearchSource(
  validator: SearchValidator,
  source: string | Request,
): Record<string, unknown> {
  const searchString = typeof source === 'string' ? source : requestSearchString(source);
  const input =
    typeof source === 'string' ? searchCodec.parse(searchString) : parseRequestSearch(source);
  if (typeof document === 'undefined') {
    return runSearchValidator(validator, input);
  }

  let entries = browserValidationCache.get(validator);

  if (!entries) {
    entries = new Map();
    browserValidationCache.set(validator, entries);
  }

  const cached = entries.get(searchString);

  if (cached) {
    entries.delete(searchString);
    entries.set(searchString, cached);
    return cached.value;
  }

  const value = runSearchValidator(validator, input);
  entries.set(searchString, { value });

  if (entries.size > MAX_VALIDATION_CACHE_ENTRIES) {
    const oldest = entries.keys().next();
    if (!oldest.done) entries.delete(oldest.value);
  }

  return value;
}

type ValidatorImport = () => Promise<SearchValidator>;

function loadValidatorChain(
  cacheKey: string,
  validatorImports: ReadonlyArray<ValidatorImport> | undefined,
): MaybePromise<ReadonlyArray<SearchValidator>> {
  const loaded = loadedValidatorChains.get(cacheKey);
  if (loaded) return loaded;

  const pending = pendingValidatorChains.get(cacheKey);
  if (pending) return pending;

  if (!validatorImports) {
    throw new Error(`No validateSearch chain registered for "${cacheKey}"`);
  }

  const chain = Promise.all(validatorImports.map((importValidator) => importValidator())).then(
    (loadedChain: ReadonlyArray<SearchValidator>) => {
      loadedValidatorChains.set(cacheKey, loadedChain);
      pendingValidatorChains.delete(cacheKey);
      return loadedChain;
    },
    (error: unknown) => {
      pendingValidatorChains.delete(cacheKey);
      throw error;
    },
  );

  pendingValidatorChains.set(cacheKey, chain);
  return chain;
}

/** Lazily import the validator chain registered for a React Router route id. */
export function loadValidatorChainByRouteId(
  routeId: string,
): MaybePromise<ReadonlyArray<SearchValidator>> {
  return loadValidatorChain(`route id:${routeId}`, validatorImportsByRouteId[routeId]);
}

/** Lazily import the validator chain registered for a public URL pattern. */
export function loadValidatorChainByRoutePattern(
  routePattern: SearchRoutePattern,
): MaybePromise<ReadonlyArray<SearchValidator>> {
  return loadValidatorChain(
    `route pattern:${routePattern}`,
    validatorImportsByRoutePattern[routePattern],
  );
}
/**
 * Runs a validator chain, from the outermost ancestor to the route itself, and
 * merges the results left to right so a child can narrow what its parent
 * validated.
 */
export function validateSearchChain(
  chain: ReadonlyArray<SearchValidator>,
  searchString: string,
): Record<string, unknown> {
  let search: Record<string, unknown> = {};

  for (const validator of chain) {
    search = mergeValidatedSearch(search, validateSearchSource(validator, searchString));
  }

  return search;
}

/** Load and validate search for one registered URL pattern. */
export function validateRouteSearch<RoutePattern extends SearchRoutePattern>(
  routePattern: RoutePattern,
  searchString: string,
): MaybePromise<SearchOutputFor<RoutePattern>>;
export function validateRouteSearch(
  routePattern: SearchRoutePattern,
  searchString: string,
): MaybePromise<Record<string, unknown>> {
  const chain = loadValidatorChainByRoutePattern(routePattern);

  return isPromiseLike(chain)
    ? Promise.resolve(chain).then((loaded) => validateSearchChain(loaded, searchString))
    : validateSearchChain(chain, searchString);
}
