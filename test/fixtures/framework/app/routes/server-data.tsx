import { z } from 'zod';

import type { Route } from './+types/server-data';
import { readStock } from './server-data.server';

export const validateSearch = z.object({
  page: z.coerce.number().default(1),
});

/**
 * The route reads server-only code from its loader and still runs a
 * `clientLoader` on hydration, which is where the transform has to keep its
 * wrapper for `loader` from referencing anything the client build removes.
 */
export function loader({ search }: Route.LoaderArgs) {
  return readStock(search.page);
}

export async function clientLoader({ search, serverLoader }: Route.ClientLoaderArgs) {
  const { secret } = await serverLoader();

  return { page: search.page, secret };
}

// React Router reads `hydrate` off the exported handler — the wrapper, here.
clientLoader.hydrate = true as const;

export default function ServerData({ loaderData }: Route.ComponentProps) {
  return <h1>{`stock:${loaderData.page}:${loaderData.secret}`}</h1>;
}
