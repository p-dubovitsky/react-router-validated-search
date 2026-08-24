import type { Route } from './+types/product-reviews';

export function loader({ search }: Route.LoaderArgs) {
  return search;
}

export default function ProductReviews({ search }: Route.ComponentProps) {
  return <div>{`${search.page}:${search.sort}:${search.tab}`}</div>;
}
