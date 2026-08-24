/** Search codec contract and built-in codec exports. @module */

/** Names accepted by Vite and CLI configuration. */
export type SearchCodecName = 'flat' | 'json';
/**
 * Codec assumed when neither the Vite plugin nor the CLI names one. Generated
 * types and runtime serialization must agree, so both resolve the default here
 * rather than repeating it.
 */
export const DEFAULT_SEARCH_CODEC: SearchCodecName = 'flat';
/** Runtime contract implemented by every built-in search codec. */
export interface SearchCodec {
  /** Parse a location search string into unvalidated route input. */
  parse(search: string): Record<string, unknown>;
  /** Serialize typed search input into a leading-`?` query string. */
  stringify(search: Record<string, unknown>): string;
}
