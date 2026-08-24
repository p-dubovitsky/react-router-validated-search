/// <reference path="../virtual-modules.d.ts" />

/**
 * React Router-compatible navigation with route-aware search typing.
 *
 * @module
 */
// oxlint-disable eslint/no-restricted-imports -- this package integrates with React Router directly
import { useCallback } from 'react';
import {
  useLocation,
  useNavigate as useReactRouterNavigate,
  type NavigateOptions,
  type Path as ReactRouterPath,
} from 'react-router';

import { validateRouteSearch } from '../runtime/route-validation';
import { buildRouteDestination } from './href';
import type {
  ParamsProp,
  SearchInputFor,
  SearchOutputFor,
  SearchRoutePattern,
} from './route-types';

/** Computes typed URL input from the target route's current parsed output. */
export type SearchUpdater<RoutePattern extends SearchRoutePattern> = (
  previous: SearchOutputFor<RoutePattern>,
) => SearchInputFor<RoutePattern>;

/** React Router's object `To` shape extended with typed params and search. */
export type TypedNavigateTo<RoutePattern extends SearchRoutePattern> = Omit<
  Partial<ReactRouterPath>,
  'pathname' | 'search'
> &
  ParamsProp<RoutePattern> & {
    pathname: RoutePattern;
    search: SearchInputFor<RoutePattern> | SearchUpdater<RoutePattern>;
  };

/** Strict route-aware navigation function. */
export interface NavigateFunction {
  (delta: number): Promise<void>;
  <RoutePattern extends SearchRoutePattern>(
    to: TypedNavigateTo<RoutePattern>,
    options?: NavigateOptions,
  ): Promise<void>;
}

/**
 * Return a navigate function for registered routes with typed search.
 *
 * Typed updater navigation validates the current location against the target
 * route chain before invoking the updater, then delegates to React Router.
 */
export function useNavigate(): NavigateFunction {
  const navigate = useReactRouterNavigate();
  const { search: locationSearch } = useLocation();

  return useCallback(
    async <RoutePattern extends SearchRoutePattern>(
      target: number | TypedNavigateTo<RoutePattern>,
      options?: NavigateOptions,
    ) => {
      if (typeof target === 'number') {
        await navigate(target);
        return;
      }

      const { pathname: pattern, params, search: searchOrUpdater, ...destination } = target;
      const search: SearchInputFor<RoutePattern> =
        typeof searchOrUpdater === 'function'
          ? searchOrUpdater(await validateRouteSearch(pattern, locationSearch))
          : searchOrUpdater;

      await navigate(
        buildRouteDestination({
          ...destination,
          pattern,
          params,
          search,
        }),
        options,
      );
    },
    // The search string is a dependency on purpose: the updater form reads it
    // when called, and a call right after a navigation must see the new one.
    [navigate, locationSearch],
  );
}
