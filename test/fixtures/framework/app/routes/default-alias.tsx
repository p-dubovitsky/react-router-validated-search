import type { RawSearch } from 'react-router-validated-search';

import type { Route } from './+types/default-alias';

/**
 * The component is exported through an identifier instead of being declared in
 * the `export default` statement. React Router splits `HydrateFallback` off into
 * its own chunk only while the component is declared inside an export statement,
 * so this route guards the second form the transform has to rewrite.
 */
export function validateSearch(raw: RawSearch) {
  return { page: Number(raw.page ?? 1) };
}

export function HydrateFallback() {
  return <p>alias loading</p>;
}

const DefaultAlias = ({ search }: Route.ComponentProps) => <h1>{`alias:${search.page}`}</h1>;

export default DefaultAlias;
