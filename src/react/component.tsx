/// <reference path="../virtual-modules.d.ts" />

/**
 * React hooks and component wrappers that inject validated location search.
 *
 * @module
 */
// oxlint-disable eslint/no-restricted-imports -- this package integrates with React Router directly
import { type ComponentType, type ReactElement, use } from 'react';
import { useLocation } from 'react-router';

import {
  loadValidatorChainByRouteId,
  validateSearchChain,
  validateSearchSource,
} from '../runtime/route-validation';
import type { InferValidatedSearch, SearchValidator } from '../runtime/validate-search';
import { isPromiseLike } from '../runtime/validate-search';
import { useMiddlewareValidatedSearch } from './provider';
import type { SearchOutputFor, SearchRoutePattern } from './route-types';

type RouteSearchBinding<RoutePattern extends SearchRoutePattern = SearchRoutePattern> = {
  registryRouteId: RoutePattern;
  validatedSearchRouteId?: string;
};

type SearchValidationTarget = SearchValidator | RouteSearchBinding;

function isRouteSearchBinding(source: SearchValidationTarget): source is RouteSearchBinding {
  return 'registryRouteId' in source;
}

/** Validated search for the current location. */
function useSearch(validationTarget: SearchValidationTarget): unknown {
  const { search } = useLocation();
  const validatedSearchRouteId = isRouteSearchBinding(validationTarget)
    ? validationTarget.validatedSearchRouteId
    : undefined;
  const middlewareSearch = useMiddlewareValidatedSearch(validatedSearchRouteId, search);

  if (!isRouteSearchBinding(validationTarget)) {
    return validateSearchSource(validationTarget, search);
  }
  if (middlewareSearch !== undefined) return middlewareSearch;

  const validatorChain = loadValidatorChainByRouteId(validationTarget.registryRouteId);

  // The registry hands back the same promise until the modules are in memory,
  // so `use` resumes that import instead of starting another one.
  return validateSearchChain(
    isPromiseLike(validatorChain) ? use(validatorChain) : validatorChain,
    search,
  );
}

/**
 * Validate the current React Router location with a route chain or validator.
 *
 * Validation itself is synchronous, so this never suspends on a validator. The
 * route-path overload does suspend once per route while its validator modules
 * load, and includes inherited validators; the direct-validator overload only
 * executes the validator it was given.
 */
export function useValidatedSearch<RoutePattern extends SearchRoutePattern>(
  routePattern: RoutePattern,
): SearchOutputFor<RoutePattern>;
export function useValidatedSearch<T extends SearchValidator>(
  validator: T,
): InferValidatedSearch<T>;
export function useValidatedSearch(validatorOrPath: SearchValidator | SearchRoutePattern): unknown {
  return useSearch(
    typeof validatorOrPath === 'string' ? { registryRouteId: validatorOrPath } : validatorOrPath,
  );
}

/**
 * Wrap a route component and inject its validated `search` prop.
 *
 * The Vite transform uses this helper for default route exports, which is why
 * it lives on `./internal` rather than the public entry point. It takes either
 * a registered route path or a validator, and for a route also the route id
 * whose middleware result covers it.
 */
export function withValidatedSearch<
  TProps extends { search: SearchOutputFor<RoutePattern> },
  RoutePattern extends SearchRoutePattern,
>(
  Component: ComponentType<TProps>,
  source: RouteSearchBinding<RoutePattern>,
): ComponentType<Omit<TProps, 'search'>>;
export function withValidatedSearch<
  TProps extends { search: InferValidatedSearch<TValidator> },
  TValidator extends SearchValidator,
>(Component: ComponentType<TProps>, validator: TValidator): ComponentType<Omit<TProps, 'search'>>;
export function withValidatedSearch<TProps extends { search: unknown }>(
  Component: ComponentType<TProps>,
  source: SearchValidationTarget,
): ComponentType<Omit<TProps, 'search'>> {
  function ValidatedSearchComponent(props: Omit<TProps, 'search'>): ReactElement {
    const search = useSearch(source);
    const componentProps = { ...props, search } as TProps;

    return <Component {...componentProps} />;
  }

  ValidatedSearchComponent.displayName = `withValidatedSearch(${Component.displayName ?? Component.name ?? 'Component'})`;

  return ValidatedSearchComponent;
}
