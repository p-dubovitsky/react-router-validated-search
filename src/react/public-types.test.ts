import { assertType, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

import type { SearchRouteRegistry } from '../index';
import type { RawSearch } from '../runtime/flat-search-codec';
import type { LinkProps } from './link';
import type { TypedNavigateTo } from './navigate';
import type { SearchInputFor, SearchOutputFor, SerializableSearchFor } from './route-types';

const productsSearch = z.object({
  page: z.number(),
  sort: z.enum(['popular', 'newest']).optional(),
});
const productDetailsSearch = z.object({
  tab: z.enum(['info', 'reviews']),
});

function functionalSearch(raw: RawSearch) {
  return { count: Number(raw.count) };
}

declare module '../index' {
  interface SearchRouteRegistry {
    '/products': typeof productsSearch;
    '/catalog/:productId': readonly [typeof productsSearch, typeof productDetailsSearch];
    '/functional': typeof functionalSearch;
  }
}

const input: SearchInputFor<'/products'> = { page: 2 };
const output: SearchOutputFor<'/products'> = { page: 2 };
const functionalInput: SearchInputFor<'/functional'> = { count: 2 };
const functionalOutput: SearchOutputFor<'/functional'> = { count: 2 };
const inheritedOutput: SearchOutputFor<'/catalog/:productId'> = {
  page: 2,
  tab: 'reviews',
};
type NestedSearch = { filters: { provider: string; active: boolean } };
const jsonNested: SerializableSearchFor<'json', NestedSearch> = {
  filters: { provider: 'a', active: true },
};

const link: LinkProps<'/products'> = {
  to: {
    pathname: '/products',
    search: { page: 2 },
  },
};

const navigation: TypedNavigateTo<'/products'> = {
  pathname: '/products',
  search: (previous) => ({ page: previous.page + 1 }),
};

const functionalNavigation: TypedNavigateTo<'/functional'> = {
  pathname: '/functional',
  search: (previous) => ({ count: previous.count + 1 }),
};

test('public route registry types compile', () => {
  expectTypeOf<'/products' | '/catalog/:productId' | '/functional'>().toExtend<
    keyof SearchRouteRegistry
  >();
  expectTypeOf(input.page).toEqualTypeOf<number>();
  expectTypeOf(output.page).toEqualTypeOf<number>();
  expectTypeOf(functionalInput).toEqualTypeOf<{ count: number }>();
  expectTypeOf(functionalOutput.count).toEqualTypeOf<number>();
  expectTypeOf(inheritedOutput).toEqualTypeOf<{
    page: number;
    sort?: 'popular' | 'newest' | undefined;
    tab: 'info' | 'reviews';
  }>();
  expectTypeOf(jsonNested.filters.provider).toEqualTypeOf<string>();
  expectTypeOf(link.to.pathname).toEqualTypeOf<'/products'>();
  expectTypeOf(navigation.pathname).toEqualTypeOf<'/products'>();
  expectTypeOf(functionalNavigation.pathname).toEqualTypeOf<'/functional'>();
});

test('invalid public route types fail compilation', () => {
  assertType<SerializableSearchFor<'flat', NestedSearch>>({
    // @ts-expect-error Flat search cannot serialize nested objects.
    filters: { provider: 'a', active: true },
  });
  // @ts-expect-error Standard Schema input must reject a wrong field type.
  assertType<SearchInputFor<'/products'>>({ page: '2' });
  // @ts-expect-error Standard Schema input must reject unknown fields.
  assertType<SearchInputFor<'/products'>>({ page: 2, unknown: true });
  // @ts-expect-error Validated output uses the validator's output type.
  assertType<SearchOutputFor<'/products'>>({ page: '2' });
  // @ts-expect-error Functional validator navigation uses its parsed output type.
  assertType<SearchInputFor<'/functional'>>({ count: '2' });
});
