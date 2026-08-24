import { Link, type RawSearch } from 'react-router-validated-search';

import type { Route } from './+types/products';

export function validateSearch(raw: RawSearch) {
  const page = Number(Array.isArray(raw.page) ? raw.page[0] : (raw.page ?? 1));

  return { page };
}

export default function Products({ search }: Route.ComponentProps) {
  return <Link to={{ pathname: '/products', search: { page: search.page + 1 } }}>Next page</Link>;
}
