import { Link, useNavigate } from 'react-router-validated-search';

export function TypeContracts() {
  const navigate = useNavigate();

  void navigate(
    {
      pathname: '/products',
      search: (previous) => ({
        page: previous.page + 1,
        sort: previous.sort,
      }),
    },
    { preventScrollReset: true, replace: true },
  );

  void navigate({
    pathname: '/products/:productId/reviews',
    params: { productId: '123' },
    search: (previous) => ({
      page: previous.page + 1,
      sort: previous.sort,
      tab: previous.tab,
    }),
  });

  // @ts-expect-error Native destinations belong to react-router's useNavigate.
  void navigate('/products');
  void navigate(-1);

  return (
    <>
      <Link
        to={{
          pathname: '/products/:productId',
          params: { productId: '123' },
          search: { tab: 'reviews' },
        }}
      />
      <Link
        to={{
          pathname: '/products/:productId/reviews',
          params: { productId: '123' },
          search: { tab: 'reviews' },
        }}
      />
      {/* @ts-expect-error Native destinations belong to react-router's Link. */}
      <Link to="/products" />
      {/* @ts-expect-error Unknown search keys are rejected. */}
      <Link to={{ pathname: '/products', search: { unknown: true } }} />
      <Link
        to={{
          pathname: '/products/:productId',
          params: { productId: '123' },
          // @ts-expect-error Search values follow the route schema input.
          search: { tab: 'unknown' },
        }}
      />
    </>
  );
}
