/**
 * Codec implementations behind the generated virtual codec module.
 *
 * This entry imports nothing that reads the virtual module back, so a route can
 * import a codec without waiting for the middleware and component wrapper to
 * initialize.
 *
 * @module
 */
export { flatSearchCodec } from '../runtime/flat-search-codec';
export { jsonSearchCodec } from '../runtime/json-search-codec';
