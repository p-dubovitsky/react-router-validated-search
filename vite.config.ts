import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite-plus';

import { typedSearch } from './src/vite/plugin';

export default defineConfig({
  fmt: {
    semi: true,
    singleQuote: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      'typescript/triple-slash-reference': 'off',
    },
  },
  plugins: [typedSearch({ scan: false })],
  resolve: {
    alias: {
      'react-router-validated-search/internal/codec': fileURLToPath(
        new URL('./src/internal/codec.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
    environment: 'node',
  },
  staged: {
    '*.{ts,tsx}': 'vp fmt --write',
  },
  pack: {
    entry: [
      'src/index.ts',
      'src/internal/index.ts',
      'src/internal/codec.ts',
      'src/vite/index.ts',
      'src/cli/index.ts',
    ],
    outDir: 'dist',
    format: 'esm',
    platform: 'neutral',
    dts: {
      tsgo: true,
    },
    clean: true,
    deps: {
      neverBundle: [
        /^node:/,
        /^react(?:-router)?(?:\/|$)/,
        /^virtual:react-router-validated-search\/registry$/,
        /^virtual:react-router-validated-search\/codec$/,
      ],
    },
  },
});
