/**
 * Ambient contracts for Vite-provided codec and validator registry modules.
 *
 * Keep this file free of top-level imports: they would turn the declarations
 * below into augmentations instead of ambient virtual modules.
 *
 * @module
 */
// oxlint-disable typescript/consistent-type-imports -- top-level imports would turn ambient virtual-module declarations into augmentations
declare module 'virtual:react-router-validated-search/codec' {
  /** Codec selected by the Vite plugin for parsing and URL construction. */
  export const searchCodec: import('./runtime/search-codec').SearchCodec;
}

declare module 'virtual:react-router-validated-search/registry' {
  /** Lazy inherited validator chains indexed by public URL pattern. */
  export const validatorImportsByRoutePattern: {
    [Path in import('./react/route-types').SearchRoutePattern]: Array<
      () => Promise<import('./react/route-types').SearchValidatorChainFor<Path>[number]>
    >;
  };
  /** Lazy inherited validator chains indexed by React Router route id. */
  export const validatorImportsByRouteId: Record<
    string,
    Array<() => Promise<import('./runtime/validate-search').SearchValidator>>
  >;
}
