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
    platform: 'node',
    shims: true,
    noExternal: ['@clack/prompts', 'commander', 'picocolors'],
    banner: {
      js: '#!/usr/bin/env node\nimport { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);',
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
