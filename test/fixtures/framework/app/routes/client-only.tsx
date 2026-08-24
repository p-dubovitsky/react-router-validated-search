import type { RawSearch } from 'react-router-validated-search';
// oxlint-disable-next-line eslint/no-restricted-imports -- standalone React Router fixture
import { redirect } from 'react-router';

import type { Route } from './+types/client-only';

/**
 * The route has no server loader on purpose. Server rendering must reach the
 * redirect through server middleware, and client navigation through client
 * middleware before `clientLoader` reads the validated context.
 */
export function validateSearch(raw: RawSearch) {
  if (raw.page !== '1') {
    throw redirect('/client-only?page=1');
  }

  return { page: 1 };
}

export function clientLoader({ search }: Route.ClientLoaderArgs) {
  return { page: search.page };
}

/**
 * React Router only server-renders a route with a `clientLoader` and no server
 * loader up to its fallback, and it splits `clientLoader` and `HydrateFallback`
 * into separate client chunks. Both are here so the build has to agree with the
 * transformed module about which exports are chunkable.
 */
export function HydrateFallback() {
  return <p>loading</p>;
}

export default function ClientOnly({ search }: Route.ComponentProps) {
  return <h1>{`page:${search.page}`}</h1>;
}
