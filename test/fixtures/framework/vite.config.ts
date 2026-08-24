import { fileURLToPath } from 'node:url';

import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

import { typedSearch } from '../../../src/vite/plugin';

export default defineConfig({
  plugins: [typedSearch(), reactRouter()],
  resolve: {
    // Deepest subpath first: every key also matches everything under it.
    alias: {
      'react-router-validated-search/internal/codec': fileURLToPath(
        new URL('../../../src/internal/codec.ts', import.meta.url),
      ),
      'react-router-validated-search/internal': fileURLToPath(
        new URL('../../../src/internal/index.ts', import.meta.url),
      ),
      'react-router-validated-search': fileURLToPath(
        new URL('../../../src/index.ts', import.meta.url),
      ),
    },
  },
  build: {
    outDir: '.build',
    // The tests read the emitted chunks to check what ended up in each one.
    minify: false,
  },
});
