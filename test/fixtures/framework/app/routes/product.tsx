import { z } from 'zod';
// oxlint-disable-next-line eslint/no-restricted-imports -- standalone React Router fixture
import { Outlet } from 'react-router';

import type { Route } from './+types/product';

export const validateSearch = z.object({
  tab: z.enum(['details', 'reviews']).default('details'),
});

export function loader({ params, search }: Route.LoaderArgs) {
  return { productId: params.productId, search };
}

export default function Product({ params, search }: Route.ComponentProps) {
  return (
    <div>
      {`${params.productId}:${search.page}:${search.tab}`}
      <Outlet />
    </div>
  );
}
