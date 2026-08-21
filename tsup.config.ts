import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/index.ts',
    testing: 'src/testing/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node18',
  shims: true,
  banner: ({ entry }) => {
    if (entry === 'src/cli/index.ts') {
      return {
        js: '#!/usr/bin/env node',
      };
    }
    return {};
  },
});
