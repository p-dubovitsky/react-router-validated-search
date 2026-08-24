import type { RouteConfig } from '@react-router/dev/routes';
import { index, layout, route } from '@react-router/dev/routes';

export default [
  index('./routes/home.tsx'),
  route('products', './routes/products.tsx', [
    route(':productId', './routes/product.tsx', [route('reviews', './routes/product-reviews.tsx')]),
  ]),
  route('searchless', './routes/searchless.tsx'),
  route('client-only', './routes/client-only.tsx'),
  route('server-data', './routes/server-data.tsx'),
  route('default-alias', './routes/default-alias.tsx'),
  layout('./routes/layout.tsx', [route('layout/child', './routes/layout-child.tsx')]),
] satisfies RouteConfig;
