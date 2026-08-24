import { Link } from 'react-router-validated-search';
// oxlint-disable-next-line eslint/no-restricted-imports -- standalone React Router fixture
import { Outlet } from 'react-router';
import { z } from 'zod';

import type { Route } from './+types/products';

export const validateSearch = z.object({
  page: z.coerce.number().default(1),
  sort: z.enum(['popular', 'newest']).default('popular'),
});

export function loader({ search }: Route.LoaderArgs) {
  return search;
}

export default function Products({ search }: Route.ComponentProps) {
  return (
    <>
      <Link
        to={{
          pathname: '/products',
          search: { page: search.page + 1, sort: search.sort },
        }}
      >
        Next
      </Link>
      <Outlet />
    </>
  );
}
