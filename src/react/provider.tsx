/**
 * Hands React Router's request context to the server render.
 *
 * @module
 */
// oxlint-disable eslint/no-restricted-imports -- this package integrates with React Router directly
import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { RouterContextProvider } from 'react-router';

import { findValidatedSearch } from '../runtime/middleware';

const requestContext = createContext<RouterContextProvider | null>(null);

/**
 * Give server-rendered route components the request-scoped result their
 * middleware already validated. Without this provider, components validate
 * the current location themselves.
 */
export function ValidatedSearchProvider({
  context,
  children,
}: {
  context: RouterContextProvider;
  children: ReactNode;
}): ReactElement {
  return <requestContext.Provider value={context}>{children}</requestContext.Provider>;
}

/**
 * Middleware result for one route id, or `undefined` when the render has to
 * produce it itself: no provider, no middleware result for that route, or a
 * location other than the one the middleware validated.
 */
export function useMiddlewareValidatedSearch(
  routeId: string | undefined,
  searchString: string,
): unknown {
  const context = useContext(requestContext);

  if (!context || routeId === undefined) return undefined;

  return findValidatedSearch(context, routeId, searchString);
}
