import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

import { typedSearch } from 'react-router-validated-search/vite';

export default defineConfig({
  plugins: [typedSearch(), reactRouter()],
});
