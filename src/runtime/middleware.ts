/**
 * React Router middleware that stores inherited validation in context.
 *
 * @module
 */
// oxlint-disable eslint/no-restricted-imports -- this package integrates with React Router directly
import { createContext, type MiddlewareFunction, type RouterContextProvider } from 'react-router';

import { requestSearchString } from './handler';
import { mergeValidatedSearch, validateSearchSource } from './route-validation';
import { SearchValidationError, type SearchValidator } from './validate-search';

/** Validated search per route id, shared by the whole middleware chain. */
type SearchValidationState = {
  /** The search string every result here was validated from. */
  searchString: string;
  results: Map<string, Record<string, unknown>>;
};

const validatedSearchContext = createContext<SearchValidationState | null>(null);

/** Apply the data-handler HTTP contract around the shared validation pass. */
function validateRequestSearch(
  validator: SearchValidator,
  request: Request,
): Record<string, unknown> {
  try {
    return validateSearchSource(validator, request);
  } catch (error) {
    if (error instanceof SearchValidationError) {
      throw new Response(error.message, { status: 400 });
    }

    throw error;
  }
}

function storeValidatedSearch(
  context: Pick<RouterContextProvider, 'get' | 'set'>,
  routeId: string,
  parentValidatedSearchRouteId: string | undefined,
  routeSearchResult: Record<string, unknown>,
  searchString: string,
): void {
  let state = context.get(validatedSearchContext);

  if (!state) {
    state = { searchString, results: new Map() };
    context.set(validatedSearchContext, state);
  }

  let search = routeSearchResult;

  if (parentValidatedSearchRouteId) {
    const parentSearch = state.results.get(parentValidatedSearchRouteId);

    if (parentSearch === undefined) {
      throw new Error(`Validated parent search is unavailable for route "${routeId}"`);
    }

    search = mergeValidatedSearch(parentSearch, routeSearchResult);
  }

  state.results.set(routeId, search);
}

/**
 * Read the accumulated search result stored for one route id.
 *
 * @throws {Error} If validation middleware did not populate the route result.
 */
export function requireValidatedSearch(context: RouterContextProvider, routeId: string): unknown {
  const result = context.get(validatedSearchContext)?.results.get(routeId);

  if (result === undefined) {
    throw new Error(`Validated search is unavailable for route "${routeId}"`);
  }

  return result;
}

/**
 * Read the accumulated search result for one route id, for a render rather than
 * a handler.
 *
 * Unlike {@link requireValidatedSearch} this returns `undefined` instead of
 * throwing, because the caller has its own way to produce the value, and it
 * answers only for the location the middleware actually validated.
 */
export function findValidatedSearch(
  context: Pick<RouterContextProvider, 'get'>,
  routeId: string,
  searchString: string,
): unknown {
  const state = context.get(validatedSearchContext);

  if (!state || state.searchString !== searchString) return undefined;

  return state.results.get(routeId);
}

// Async, though nothing here awaits: React Router has always received a
// promise from this middleware, and a validator throwing synchronously instead
// would change where that throw surfaces in its pipeline.
function createValidationMiddleware(
  routeId: string,
  parentValidatedSearchRouteId: string | undefined,
  validator: SearchValidator,
): MiddlewareFunction {
  return async ({ context, request }, next) => {
    const searchString = requestSearchString(request);
    const routeSearchResult = validateRequestSearch(validator, request);

    storeValidatedSearch(
      context,
      routeId,
      parentValidatedSearchRouteId,
      routeSearchResult,
      searchString,
    );

    return next();
  };
}

/** Server-side name emitted by the route transform. */
export function createSearchValidationMiddleware(
  routeId: string,
  parentValidatedSearchRouteId: string | undefined,
  validator: SearchValidator,
): MiddlewareFunction {
  return createValidationMiddleware(routeId, parentValidatedSearchRouteId, validator);
}

/** Client-side name emitted by the route transform. */
export function createClientSearchValidationMiddleware(
  routeId: string,
  parentValidatedSearchRouteId: string | undefined,
  validator: SearchValidator,
): MiddlewareFunction {
  return createValidationMiddleware(routeId, parentValidatedSearchRouteId, validator);
}
