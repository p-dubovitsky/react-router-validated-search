/// <reference path="../virtual-modules.d.ts" />

/**
 * Request-scoped parsing for route middleware and handlers.
 *
 * @module
 */
import { searchCodec } from 'virtual:react-router-validated-search/codec';

import type { UnvalidatedSearch } from './validate-search';

type RequestSearch = {
  /** The search string, exactly as `location.search` reports it. */
  searchString: string;
  raw: UnvalidatedSearch;
};

const requestSearchCache = new WeakMap<Request, RequestSearch>();

/**
 * Validation needs both the parsed search and its exact string. Caching them
 * together avoids parsing the same request twice.
 */
function parseRequest(request: Request): RequestSearch {
  let parsed = requestSearchCache.get(request);

  if (!parsed) {
    // eslint-disable-next-line no-restricted-syntax -- React Router's public handler contract exposes request, not a parsed URL
    const searchString = new URL(request.url).search;

    parsed = { searchString, raw: searchCodec.parse(searchString) };
    requestSearchCache.set(request, parsed);
  }

  return parsed;
}

/** Parsed but unvalidated search of a request. */
export function parseRequestSearch(request: Request): UnvalidatedSearch {
  return parseRequest(request).raw;
}

/** Search string of a request, in the form `location.search` uses. */
export function requestSearchString(request: Request): string {
  return parseRequest(request).searchString;
}
