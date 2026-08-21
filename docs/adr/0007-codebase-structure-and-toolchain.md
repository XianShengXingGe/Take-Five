# Codebase Structure and Build Toolchain

Take Five is implemented in TypeScript within a modular directory layout (`src/cli`, `src/core`, `src/adapters`, `src/i18n`, `src/types`) and bundled into a standalone Node CLI executable using `tsup`. Testing is driven by `vitest` with end-to-end fixture coverage for agent hook injection, configuration parsing, and notification dispatching.
