/// <reference path="../virtual-modules.d.ts" />

/**
 * Typed search and params adapter over React Router's native `Link`.
 *
 * @module
 */
// oxlint-disable eslint/no-restricted-imports -- this package integrates with React Router directly
import type { ReactElement } from 'react';
import {
  Link as ReactRouterLink,
  type LinkProps as ReactRouterLinkProps,
  type Path as ReactRouterPath,
} from 'react-router';

import { buildRouteDestination } from './href';
import type { ParamsProp, SearchInputFor, SearchRoutePattern } from './route-types';

/** React Router's object `To` shape extended with typed params and search. */
export type TypedLinkTo<RoutePattern extends SearchRoutePattern> = Omit<
  Partial<ReactRouterPath>,
  'pathname' | 'search'
> &
  ParamsProp<RoutePattern> & {
    pathname: RoutePattern;
    search: SearchInputFor<RoutePattern>;
  };

/** Props accepted by the typed {@link Link} for a registered route pattern. */
export type LinkProps<RoutePattern extends SearchRoutePattern> = Omit<
  ReactRouterLinkProps,
  'to'
> & {
  to: TypedLinkTo<RoutePattern>;
};

/** Render a typed link after interpolating params and serializing search. */
export function Link<RoutePattern extends SearchRoutePattern>({
  to,
  ...linkProps
}: LinkProps<RoutePattern>): ReactElement {
  const { pathname: pattern, ...destination } = to;
  return <ReactRouterLink {...linkProps} to={buildRouteDestination({ ...destination, pattern })} />;
}
