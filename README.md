# react-router-validated-search

Typed and validated URL search parameters for React Router Framework Mode.

## Why use it?

React Router can read and write a query string, but it does not define what that query string means. Without a route-level contract, applications commonly parse the same parameters in loaders and components, maintain separate TypeScript types, and serialize values by hand.

`react-router-validated-search` makes `validateSearch` part of the route module. The route defines parsing once; loaders, actions, components, links, and navigation then share its input and output types.

### At a glance

Without this package, even a loader must connect the URL, validation, and error response manually:

```ts
export async function loader({ request }: Route.LoaderArgs) {
  const params = new URL(request.url).searchParams;
  const result = productsSearchSchema.safeParse({
    page: params.get('page') ?? undefined,
    sort: params.get('sort') ?? undefined,
  });

  if (!result.success) {
    throw new Response(null, { status: 400 });
  }

  return getProducts(result.data);
}
```

With this package, the same schema is the route contract. Invalid Standard Schema input still produces HTTP 400:

```ts
export const validateSearch = productsSearchSchema;

export async function loader({ search }: Route.LoaderArgs) {
  return getProducts(search);
}
```

The same validated `search` is also available in the route component, and the schema input type is used when creating links or navigating.

## Installation

Requirements: React `>=19.2.7 <20`, React Router `>=8.2.0 <9` Framework Mode, Vite 8, TypeScript, and either a Standard Schema v1-compatible validator or a custom validation function. `react-router-validated-search` is ESM-only and must be imported by ESM-aware tooling. Data and Declarative modes are not supported. React Router 8.2 corrected dynamic-param URL encoding in `href()` for typed `Link`/`useNavigate`, and added the adapter-neutral default server entry this package uses for zero-config Framework Mode.

Each search-aware route record must use its own route module. React Router permits multiple route records to reference one file, but this package rejects that configuration when validation metadata would belong to multiple route IDs.

```ts
// Not supported: both records would need different route-specific metadata
// injected into the same module.
route('/products', './shared-list.tsx', { id: 'products' });
route('/archive', './shared-list.tsx', { id: 'archive' });
```

Keep the shared implementation separate and give each route its own thin module:

```tsx
// products.tsx
import SharedList, { validateSearch as sharedValidateSearch } from './shared-list';

export const validateSearch = sharedValidateSearch;

export default function Products() {
  return <SharedList />;
}

// archive.tsx follows the same local-binding pattern.
```

```ts
route('/products', './products.tsx', { id: 'products' });
route('/archive', './archive.tsx', { id: 'archive' });
```

Install the package:

```sh
pnpm add react-router-validated-search
```

Place its Vite plugin immediately before React Router:

```ts
import { reactRouter } from '@react-router/dev/vite';
import { typedSearch } from 'react-router-validated-search/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [typedSearch(), reactRouter()],
});
```

Add the generated search types before React Router's generated types:

```json
{
  "compilerOptions": {
    "rootDirs": [".", "./.react-router-validated-search/types", "./.react-router/types"]
  },
  "include": [".react-router-validated-search/types/**/*"]
}
```

Run both generators before TypeScript:

```json
{
  "scripts": {
    "typegen": "react-router typegen && react-router-validated-search typegen",
    "typecheck": "pnpm typegen && tsc --noEmit"
  }
}
```

Add `.react-router-validated-search/` to `.gitignore`. React Router typegen must run first.

### Optional: reuse server validation in the render

React Router gives `handleRequest` the same context object its middleware wrote to. Pass it to the render and route components take the search their middleware already validated, instead of validating the same string a second time:

```tsx
import { ValidatedSearchProvider } from 'react-router-validated-search';

export default function handleRequest(request, status, headers, routerContext, loadContext) {
  const app = (
    <ValidatedSearchProvider context={loadContext}>
      <ServerRouter context={routerContext} url={request.url} />
    </ValidatedSearchProvider>
  );
  // ...
}
```

Everything works without this — a component that finds nothing there validates as before. It saves the most on deep route trees, where each component otherwise runs its whole inherited chain. Server entry only: the browser has no such context, and there client middleware already fills the cache the render reads.

## How it works

```text
URL query string
  -> unvalidated search input
  -> route validateSearch contracts, parent first
  -> validated search
  -> loaders, actions, components, and navigation updaters
```

In the other direction, `Link` and `useNavigate` accept the target route's validator input and serialize it into the URL.

The Vite plugin wires this contract into ordinary React Router route modules. Generated server and client middleware validate before their respective handlers; route components reuse the client result and retain a hydration fallback. Because validation runs in both environments, `validateSearch` and everything it imports must be client-safe.

### Why both sides validate

Each environment validates the search it actually received, rather than trusting a result computed elsewhere:

- The server is a trust boundary. Search arrives from the user, so a handler must never see input nobody checked; this is also where a schema failure becomes HTTP 400 and a `redirect` from `validateSearch` becomes a real document redirect.
- The browser follows the address bar, which the server never sees on a client navigation. A route with no server data makes no request at all, and a `redirect` thrown during render is not a redirect — only middleware turns it into one.
- The validated value cannot be handed over from server to browser. Middleware context is not serialized to the client, and smuggling it through loader data would restrict validator output to serializable values, leave data-less routes uncovered, and let a component show search that no longer matches the URL.

The price is validating the same string more than once per document load. Every pass is synchronous; what one costs depends on the validator, since the route exports it and nothing here bounds what it does. The server render can skip its pass entirely, see [above](#optional-reuse-server-validation-in-the-render). Note that the validator ships to the browser regardless: typed `Link`/`useNavigate` and client navigation need it.

## Define search for a route

Validation is synchronous. A validator that returns a promise throws because route components need its result during render. Do asynchronous work in a loader, `clientLoader`, or middleware.

### Standard Schema

Export any Standard Schema v1-compatible schema. Zod is one option:

```ts
import { z } from 'zod';

export const validateSearch = z.object({
  page: z.coerce.number().int().positive().default(1),
  sort: z.enum(['popular', 'newest']).default('popular'),
  provider: z.string().optional(),
});
```

The schema's input type is used to construct URLs. Its parsed output type is added as `search` to:

- `Route.LoaderArgs`;
- `Route.ActionArgs`;
- `Route.ClientLoaderArgs`;
- `Route.ClientActionArgs`;
- `Route.ComponentProps`.

When a Standard Schema validator returns `issues`, data handlers receive HTTP 400 before user code runs. Component validation reaches the route error boundary.

The package does not invent defaults or redirects. Put recovery policy in the schema when the schema supports it:

```ts
import { redirect } from 'react-router';

export const validateSearch = productsSearchSchema.catch(() => {
  throw redirect('/products?page=1&sort=popular');
});
```

### Custom function and `RawSearch`

Use a function for custom coercion, legacy compatibility, or explicit recovery. With the default URL representation, `RawSearch` contains strings and repeated values exactly as they arrived:

```ts
type RawSearch = Record<string, string | string[]>;
```

```text
?page=2       -> { page: "2" }
?tag=a&tag=b -> { tag: ["a", "b"] }
?query=      -> { query: "" }
```

This matters when a route must distinguish missing and empty values, choose how repeated keys behave, or preserve unknown tracking parameters.

```ts
import type { RawSearch } from 'react-router-validated-search';
import { redirect } from 'react-router';

export function validateSearch(raw: RawSearch) {
  const value = Array.isArray(raw.page) ? raw.page[0] : raw.page;
  const page = Number(value ?? 1);

  if (!Number.isInteger(page) || page < 1) {
    throw redirect('/products?page=1');
  }

  return { page };
}
```

The return type becomes the route's search type. Returned values and thrown redirects, responses, or errors pass through unchanged.

Unknown keys reach validation, but a schema may remove them from its output. Use schema passthrough or return `{ ...raw, ...parsed }` only when those keys must remain in subsequent navigation.

Do not import `.server` modules or server-only helper barrels from `validateSearch`.

## Read validated search

### In the route module

Generated React Router types expose the parsed value directly:

```tsx
export async function loader({ search }: Route.LoaderArgs) {
  return getProducts(search);
}

export async function action({ search }: Route.ActionArgs) {
  return saveProductView(search);
}

export default function Products({ search }: Route.ComponentProps) {
  return <span>Page {search.page}</span>;
}
```

The route component does not need `useSearchParams` or another parsing hook.

### Below the route component

Use `useValidatedSearch` when a descendant does not receive route props. Pass the registered route pattern to include inherited search contracts:

```tsx
import { useValidatedSearch } from 'react-router-validated-search';

function ProductsPagination() {
  const { page } = useValidatedSearch('/products');

  return <span>Page {page}</span>;
}
```

A reusable component can instead depend on a validator directly:

```tsx
function SearchField() {
  const { query } = useValidatedSearch(sharedSearchSchema);

  return <input defaultValue={query} />;
}
```

The route-pattern form loads that route's client-visible validator dependencies. The direct form runs only the supplied validator. Both update with `location.search`. Validation never suspends the render; the route-pattern form suspends once per route while those validator modules are imported, and not afterwards.

## Update search

Import `Link` and `useNavigate` from this package when search should be checked against a target route.

### Link

```tsx
import { Link } from 'react-router-validated-search';

<Link
  to={{
    pathname: '/products',
    search: { page: 1, sort: 'popular' },
  }}
>
  Products
</Link>;
```

The typed destination uses the same `{ pathname, search }` shape as `navigate`. For a dynamic pattern, put required `params` beside `pathname` and `search`. This `Link` accepts only registered routes with typed search. Import `Link` from `react-router` when you intentionally need an untyped string or native `To` destination.

### Navigation

The wrapper keeps React Router's `navigate(to, options?)` shape for typed destinations:

```tsx
import { useNavigate } from 'react-router-validated-search';

const navigate = useNavigate();

await navigate(
  {
    pathname: '/products',
    search: (previous) => ({
      ...previous,
      page: previous.page + 1,
    }),
  },
  { preventScrollReset: true },
);
```

The updater receives the target route's validated current search and returns serializable input. `replace`, `state`, `relative`, and `preventScrollReset` remain in the second argument. `navigate(delta)` is also supported because history movement does not construct an untyped destination. Import `useNavigate` from `react-router` when you intentionally need a string or other native `To` destination.

## Nested routes

Each validator independently receives the original decoded search input. Child route handlers and components receive the accumulated validator results, and a child result field overrides a parent result field with the same name:

```ts
// Parent route -> { page: number }
export const validateSearch = z.object({
  page: z.coerce.number().default(1),
});

// Child route -> { page: number; provider?: string }
export const validateSearch = z.object({
  provider: z.string().optional(),
});
```

Parent route handlers and components never receive child-only fields. A route without a local validator inherits its ancestors' result; a route with no local or inherited validator is unchanged.

## Serialization and codecs

A codec is the pair of operations between the URL query string and validator input:

- parsing converts the URL into unvalidated search;
- serialization converts typed `Link` or `useNavigate` input back into the URL.

The same codec is used on the server, in the browser, and by generated navigation types.

The codec defines the transport format; `validateSearch` defines what a route accepts:

```text
Link/useNavigate input -> codec.stringify -> URL
URL -> codec.parse -> unvalidated input -> validateSearch -> route search
```

### Flat codec

`flat` is the default. Serialization follows ordinary query-string conventions:

```ts
{ page: 2, tags: ['new', 'sale'] }
```

becomes:

```text
?page=2&tags=new&tags=sale
```

Parsing the same query string produces this unvalidated input:

```ts
{ page: '2', tags: ['new', 'sale'] }
```

The URL does not record whether `2` originated as a number or a string, so `flat` never guesses. A schema can restore route types with coercion, for example `z.coerce.number()`.

The codec accepts strings, numbers, booleans, bigint, `undefined`, and arrays of those values when writing. `undefined` is omitted. Nested values and `null` are rejected.

### JSON codec

`json` uses a TanStack Router-style JSON-first format. First-level values stay readable, while nested values use JSON and strings that could be mistaken for another JSON type are quoted.

Serialization:

```ts
{
  page: 2,
  filters: { live: true },
}
```

produces this percent-encoded URL:

```text
?page=2&filters=%7B%22live%22%3Atrue%7D
```

Parsing that URL produces this unvalidated input:

```ts
{
  page: 2,
  filters: { live: true },
}
```

Each top-level value is handled independently. Unlike `flat`, parsing preserves numbers, booleans, arrays, and objects instead of turning them into strings.

Strings need quotes only when their text would otherwise parse as a different type:

| JavaScript value | URL value                 | Parsed value     |
| ---------------- | ------------------------- | ---------------- |
| `'popular'`      | `popular`                 | `'popular'`      |
| `2`              | `2`                       | `2`              |
| `'2'`            | `%222%22`                 | `'2'`            |
| `true`           | `true`                    | `true`           |
| `'true'`         | `%22true%22`              | `'true'`         |
| `{ live: true }` | `%7B%22live%22%3Atrue%7D` | `{ live: true }` |

`%22` is the URL-encoded `"` character. In JSON, `2` is a number while `"2"` is a string. The parser attempts JSON decoding and leaves non-JSON text such as `popular` unchanged. This preserves both readable first-level parameters and `parse(stringify(value))` round trips. See TanStack Router's [JSON-first search params](https://tanstack.com/router/latest/docs/guide/search-params#json-first-search-params) for the same representation model.

The JSON codec rejects bigint, non-finite numbers, class instances, functions, symbols, and cyclic values.

Select it in the Vite plugin:

```ts
typedSearch({ codec: 'json' });
```

The CLI reads the same option out of the application's Vite configuration, so runtime serialization and generated input types always describe the same values.

## Migrating an existing route

Migrate the complete query layer together: handler parsing, component parsing, URL updates, and obsolete types/helpers.

```diff
-import { useSearchParams, redirect } from 'react-router';
+import { redirect } from 'react-router';
+import { useNavigate, type RawSearch } from 'react-router-validated-search';
 import { productsSearchSchema } from './query-params';

-function parseProductsSearch(params: URLSearchParams) {
-  const result = productsSearchSchema.safeParse({
-    page: params.get('page') ?? undefined,
-    sort: params.get('sort') ?? undefined,
-  });
+function first(value: string | string[] | undefined) {
+  return Array.isArray(value) ? value[0] : value;
+}
+
+export function validateSearch(raw: RawSearch) {
+  const result = productsSearchSchema.safeParse({
+    page: first(raw.page),
+    sort: first(raw.sort),
+  });

   if (!result.success) {
     throw redirect('/products?page=1&sort=popular');
   }

   return result.data;
 }

-export async function loader({ request }: Route.LoaderArgs) {
-  const search = parseProductsSearch(new URL(request.url).searchParams);
+export async function loader({ search }: Route.LoaderArgs) {
   return getProducts(search);
 }

-export default function Products() {
-  const [params, setParams] = useSearchParams();
-  const search = parseProductsSearch(params);
+export default function Products({ search }: Route.ComponentProps) {
+  const navigate = useNavigate();

   function showNextPage() {
-    setParams(
-      { page: String(search.page + 1), sort: search.sort },
+    void navigate(
+      {
+        pathname: '/products',
+        search: { ...search, page: search.page + 1 },
+      },
       { preventScrollReset: true },
     );
   }
 }
```

This example keeps the old first-value rule for repeated scalar parameters, redirect target, default 302 status, removal of unknown keys, and scroll behavior. Preserve the corresponding behavior of the route being migrated; do not copy these choices blindly.

Before removing the old query layer, compare:

- missing, empty, invalid, and repeated values;
- defaults and validation strictness;
- redirect target, status, and headers;
- unknown-key behavior;
- optional path parameters and locale segments;
- URL shape and React Router navigation options.

The migration is complete when handlers and components no longer parse search, URL updates no longer serialize it manually, and the old hook, helper, and route-specific types are unused.

## Troubleshooting

### `search` is missing from `Route.*` types

Run `react-router typegen`, then `react-router-validated-search typegen`. Check the `rootDirs` order and `.react-router-validated-search/types/**/*` inclusion.

### A client build imports a `.server` module

Trace imports from `validateSearch`. The validator is client-visible even when the route also exports a server loader.

### CLI typegen cannot find the plugin

`typedSearch({ codec })` is the only place the codec is named, so the CLI loads the Vite configuration to read it and refuses to generate types when it is not there — guessing would describe a codec the application does not serialize with. Check `--root`, and that the config file lists `typedSearch()` directly: loading a configuration runs no plugin hooks, so a plugin added by another plugin is invisible.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for implementation ownership, transforms, runtime invariants, review decisions, and regression checks.
