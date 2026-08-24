/**
 * Entry point for the code this package generates.
 *
 * The route transform and the shadow `+types` emit imports from here, so the
 * root entry stays the interface a consumer writes against. Nothing here is
 * covered by the public contract; it changes whenever the generators change.
 *
 * The codecs are served from `./internal/codec` instead. The middleware and the
 * component wrapper exported here import the generated virtual codec module,
 * which re-exports a codec, so answering both from one entry would make that
 * module import itself back through this one.
 *
 * @module
 */
export {
  createClientSearchValidationMiddleware,
  createSearchValidationMiddleware,
  requireValidatedSearch,
} from '../runtime/middleware';
export type { InferValidatedSearchChain } from '../runtime/validate-search';
export { withValidatedSearch } from '../react/component';
