/// <reference path="../virtual-modules.d.ts" />

/**
 * Internal bridge to React Router's registered-pattern `href` helper.
 *
 * @module
 */
// oxlint-disable eslint/no-restricted-imports -- this package integrates with React Router directly
import { href } from 'react-router';
import { searchCodec } from 'virtual:react-router-validated-search/codec';

/**
 * `href` is generated against the app's own route registry, which this package
 * cannot see; the callers type-check the path and its params themselves.
 */
const interpolateRoutePattern = href as unknown as (
  path: string,
  params?: Record<string, string | undefined>,
) => string;

type RouteDestinationInput = {
  pattern: string;
  params?: Record<string, string | undefined>;
  search: Record<string, unknown>;
  hash?: string;
};

/** Build a React Router destination from typed route params and search. */
export function buildRouteDestination({
  pattern,
  params,
  search,
  ...destination
}: RouteDestinationInput): {
  pathname: string;
  search: string;
  hash?: string;
} {
  return {
    ...destination,
    pathname: params ? interpolateRoutePattern(pattern, params) : interpolateRoutePattern(pattern),
    search: searchCodec.stringify(search),
  };
}
