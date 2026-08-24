/**
 * Types derived from the generated search registry and React Router register.
 *
 * @module
 */
// oxlint-disable eslint/no-restricted-imports -- this package integrates with React Router types directly
import type { Register } from 'react-router';

import type { SearchCodecRegister, SearchRouteRegistry } from '../index';
import type { SearchInputValue } from '../runtime/flat-search-codec';
import type { JsonValue } from '../runtime/json-search-codec';
import type { SearchCodecName } from '../runtime/search-codec';
import type {
  InferSearchInputChain,
  InferValidatedSearchChain,
  SearchValidator,
} from '../runtime/validate-search';

/** Literal URL patterns that export or inherit `validateSearch`. */
export type SearchRoutePattern = Extract<keyof SearchRouteRegistry, string>;

/** Ordered outermost-to-local validator tuple for a registered route. */
export type SearchValidatorChainFor<RoutePattern extends SearchRoutePattern> =
  SearchRouteRegistry[RoutePattern] extends ReadonlyArray<SearchValidator>
    ? SearchRouteRegistry[RoutePattern]
    : SearchRouteRegistry[RoutePattern] extends SearchValidator
      ? readonly [SearchRouteRegistry[RoutePattern]]
      : never;

type RegisteredSearchCodec = SearchCodecRegister extends {
  codec: infer Codec extends SearchCodecName;
}
  ? Codec
  : 'flat';

type CodecValue<Codec extends SearchCodecName> = Codec extends 'json'
  ? JsonValue | undefined
  : SearchInputValue;

/**
 * Restrict every search field to values supported by the selected codec.
 * Unsupported fields become `never` and fail at typed Link/navigation sites.
 */
export type SerializableSearchFor<Codec extends SearchCodecName, Search> = Search extends object
  ? {
      [Key in keyof Search]: Search[Key] extends CodecValue<Codec> ? Search[Key] : never;
    }
  : never;

/** Search values accepted when constructing a URL for a route. */
export type SearchInputFor<RoutePattern extends SearchRoutePattern> = SerializableSearchFor<
  RegisteredSearchCodec,
  InferSearchInputChain<SearchValidatorChainFor<RoutePattern>>
>;

/** Parsed, inherited search supplied to route handlers and components. */
export type SearchOutputFor<RoutePattern extends SearchRoutePattern> = InferValidatedSearchChain<
  SearchValidatorChainFor<RoutePattern>
>;

type RegisteredPages = Register extends {
  pages: infer Pages extends Record<string, { params: Record<string, string | undefined> }>;
}
  ? Pages
  : Record<string, { params: Record<string, string | undefined> }>;

/** Path parameters registered by React Router for a URL pattern. */
export type ParamsFor<Path extends string> = Path extends keyof RegisteredPages
  ? RegisteredPages[Path]['params']
  : Record<string, string | undefined>;

type RequiredKeys<T> = {
  [Key in keyof T]-?: undefined extends T[Key] ? never : Key;
}[keyof T];

/** Makes `params` required only when the route has required path parameters. */
export type ParamsProp<Path extends string> = keyof ParamsFor<Path> extends never
  ? { params?: never }
  : RequiredKeys<ParamsFor<Path>> extends never
    ? { params?: ParamsFor<Path> }
    : { params: ParamsFor<Path> };
