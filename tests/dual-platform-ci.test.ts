import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('dual-platform release validation', () => {
  it('tests and packages on native macOS and Windows runners', () => {
    const workflow = readFileSync(join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf-8');
    expect(workflow).toContain('macos-latest');
    expect(workflow).toContain('windows-latest');
    expect(workflow).toContain('pnpm test');
    expect(workflow).toContain('pnpm typecheck');
    expect(workflow).toContain('pnpm package:dmg');
    expect(workflow).toContain('pnpm package:windows');
  });
});
