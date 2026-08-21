import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      cli: 'src/bin.ts',
    },
    format: ['esm'],
    dts: false,
    clean: true,
    sourcemap: true,
    target: 'node18',
    shims: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    entry: {
      index: 'src/index.ts',
      testing: 'src/testing/index.ts',
    },
    format: ['esm'],
    dts: true,
    clean: false,
    sourcemap: true,
    target: 'node18',
    shims: true,
  },
]);
