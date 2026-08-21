import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  DEFAULT_CONFIG,
  DEFAULT_ENABLED_AGENTS,
  DEFAULT_EVENT_RULES,
  DEFAULT_ICONS,
  type TakeFiveConfig,
} from '../types/config.js';
import { getConfigPath } from './paths.js';

export interface ConfigManagerOptions {
  configPath?: string;
}

/**
 * Loads, validates, and persists user configuration from ~/.takefive/config.json.
 */
export class ConfigManager {
  private configPath: string;

  constructor(options: ConfigManagerOptions = {}) {
    this.configPath = options.configPath ?? getConfigPath();
  }

  /**
   * Loads the current TakeFiveConfig from disk, filling in default values if file is missing or partial.
   */
  async loadConfig(): Promise<TakeFiveConfig> {
    if (!existsSync(this.configPath)) {
      return this.cloneDefaultConfig();
    }

    try {
      const raw = readFileSync(this.configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return this.mergeWithDefaults(parsed);
    } catch {
      return this.cloneDefaultConfig();
    }
  }

  /**
   * Persists the given TakeFiveConfig to disk.
   */
  async saveConfig(config: TakeFiveConfig): Promise<void> {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const payload = JSON.stringify(config, null, 2);
    writeFileSync(this.configPath, payload, 'utf-8');
  }

  private cloneDefaultConfig(): TakeFiveConfig {
    return {
      version: DEFAULT_CONFIG.version,
      language: DEFAULT_CONFIG.language,
      debounceSeconds: DEFAULT_CONFIG.debounceSeconds,
      icons: { ...DEFAULT_ICONS },
      events: {
        task_completed: { ...DEFAULT_EVENT_RULES.task_completed },
        waiting_input: { ...DEFAULT_EVENT_RULES.waiting_input },
        waiting_permission: { ...DEFAULT_EVENT_RULES.waiting_permission },
        task_failed: { ...DEFAULT_EVENT_RULES.task_failed },
      },
      enabledAgents: { ...DEFAULT_ENABLED_AGENTS },
    };
  }

  private mergeWithDefaults(raw: Partial<TakeFiveConfig>): TakeFiveConfig {
    const defaults = this.cloneDefaultConfig();

    return {
      version: '1.0.0',
      language: raw.language ?? defaults.language,
      debounceSeconds:
        typeof raw.debounceSeconds === 'number' && raw.debounceSeconds >= 0
          ? raw.debounceSeconds
          : defaults.debounceSeconds,
      icons: {
        ...defaults.icons,
        ...(raw.icons ?? {}),
      },
      events: {
        task_completed: {
          ...defaults.events.task_completed,
          ...(raw.events?.task_completed ?? {}),
        },
        waiting_input: {
          ...defaults.events.waiting_input,
          ...(raw.events?.waiting_input ?? {}),
        },
        waiting_permission: {
          ...defaults.events.waiting_permission,
          ...(raw.events?.waiting_permission ?? {}),
        },
        task_failed: {
          ...defaults.events.task_failed,
          ...(raw.events?.task_failed ?? {}),
        },
      },
      enabledAgents: {
        ...defaults.enabledAgents,
        ...(raw.enabledAgents ?? {}),
      },
    };
  }
}
