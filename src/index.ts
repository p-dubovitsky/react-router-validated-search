/**
 * Public runtime, React, and type-level API for validated route search.
 * This entry is the interface consumers write against. Symbols used only by
 * generated code live in `./internal`.
 *
 * Generated registry declarations augment {@link SearchRouteRegistry} and
 * {@link SearchCodecRegister}; keep those interfaces exported from this entry.
 *
 * @module
 */

/** Maps registered URL patterns to their inherited validator chains. */
// oxlint-disable-next-line typescript/no-empty-interface
export interface SearchRouteRegistry {}

/** Records the codec selected by Vite/CLI type generation. */
// oxlint-disable-next-line typescript/no-empty-interface
export interface SearchCodecRegister {}

export type {
  FlatSearch,
  RawSearch,
  SearchInputValue,
  SearchPrimitive,
} from './runtime/flat-search-codec';
export type { JsonPrimitive, JsonSearch, JsonValue } from './runtime/json-search-codec';
export type { SearchCodec, SearchCodecName } from './runtime/search-codec';
export type {
  InferSearchInput,
  InferValidatedSearch,
  SearchValidator,
} from './runtime/validate-search';
export { useValidatedSearch } from './react/component';
export { ValidatedSearchProvider } from './react/provider';
export { Link } from './react/link';
export type { LinkProps, TypedLinkTo } from './react/link';
export type {
  ParamsFor,
  SearchInputFor,
  SearchOutputFor,
  SearchRoutePattern,
  SearchValidatorChainFor,
  SerializableSearchFor,
} from './react/route-types';
export { useNavigate } from './react/navigate';
export type { NavigateFunction, SearchUpdater, TypedNavigateTo } from './react/navigate';
