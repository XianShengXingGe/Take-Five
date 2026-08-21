import { describe, expect, it } from 'vitest';
import { createCli } from '../src/cli/index.js';

describe('CLI Base Program', () => {
  it('creates commander instance with correct name and description', () => {
    const cli = createCli();
    expect(cli.name()).toBe('takefive');
    expect(cli.description()).toContain('Smart notification tool');
    expect(cli.version()).toBe('1.0.0');
  });
});
