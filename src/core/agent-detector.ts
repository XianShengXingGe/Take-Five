import { existsSync } from 'node:fs';
import { homedir as defaultHomedir } from 'node:os';
import { join } from 'node:path';
import { SUPPORTED_AGENTS, type SupportedAgent } from '../types/event.js';

export interface AgentDetectionStatus {
  installed: boolean;
  path?: string;
}

export type DetectedAgents = Record<SupportedAgent, AgentDetectionStatus>;

export interface DetectedAgentsResult extends DetectedAgents {
  installedAgents: SupportedAgent[];
  hasAnyInstalled: boolean;
}

export interface AgentDetectorOptions {
  homedir?: string;
}

/**
 * Known configuration candidate paths for each supported agent relative to user home directory.
 */
const AGENT_PATH_CANDIDATES: Record<SupportedAgent, string[]> = {
  claude: ['.claude', '.claude.json'],
  codex: ['.codex'],
  opencode: ['.opencode', join('.config', 'opencode')],
  antigravity: [join('.gemini', 'antigravity'), '.antigravity'],
};

/**
 * Detects presence of supported coding agents in the user's environment.
 */
export function detectInstalledAgents(options: AgentDetectorOptions = {}): DetectedAgentsResult {
  const home = options.homedir ?? defaultHomedir();

  const detectedMap = {} as DetectedAgents;
  const installedAgents: SupportedAgent[] = [];

  for (const agent of SUPPORTED_AGENTS) {
    const candidates = AGENT_PATH_CANDIDATES[agent];
    let foundPath: string | undefined;

    for (const candidate of candidates) {
      const fullPath = join(home, candidate);
      if (existsSync(fullPath)) {
        foundPath = fullPath;
        break;
      }
    }

    if (foundPath) {
      detectedMap[agent] = { installed: true, path: foundPath };
      installedAgents.push(agent);
    } else {
      detectedMap[agent] = { installed: false };
    }
  }

  return {
    ...detectedMap,
    installedAgents,
    hasAnyInstalled: installedAgents.length > 0,
  };
}
