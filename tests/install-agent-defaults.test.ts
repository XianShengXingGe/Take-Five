import { describe, expect, it } from 'vitest';
import { buildDetectedAgentDefaults } from '../src/cli/commands/install.js';

describe('install agent defaults', () => {
  it('enables only detected agents and never creates four foreign configs when none are found', () => {
    expect(buildDetectedAgentDefaults({ installedAgents: [] })).toEqual({
      claude: false,
      codex: false,
      opencode: false,
      antigravity: false,
    });
    expect(buildDetectedAgentDefaults({ installedAgents: ['codex', 'opencode'] })).toEqual({
      claude: false,
      codex: true,
      opencode: true,
      antigravity: false,
    });
  });
});
