import type { Route } from './+types/searchless';

export function loader(args: Route.LoaderArgs) {
  // @ts-expect-error Searchless routes retain the native React Router args.
  return args.search;
}

export default function Searchless() {
  return <h1>Searchless</h1>;
}
