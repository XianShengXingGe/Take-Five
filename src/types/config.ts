import type { NotificationLevel, SupportedAgent, UnifiedEventType } from './event.js';

export type ConfigLanguage = 'system' | 'zh-CN' | 'en';

export const CONFIG_LANGUAGES = ['system', 'zh-CN', 'en'] as const;

/**
 * Per-event notification rule.
 */
export interface EventRule {
  /** Whether notifications are enabled for this event */
  enabled: boolean;
  /** Urgency level mapped to APNs / Bark push priority */
  level: NotificationLevel;
  /** Optional custom title override (1-12 chars) */
  title?: string;
  /** Optional custom body override (0-32 chars) */
  body?: string;
}

/**
 * Persisted configuration schema for Take Five stored at ~/.takefive/config.json.
 */
export interface TakeFiveConfig {
  /** Configuration schema version */
  version: '1.0.0';
  /** Active display and notification language */
  language: ConfigLanguage;
  /** Cooldown window in seconds per agent/project to prevent duplicate pushes */
  debounceSeconds: number;
  /** Mapping of agent identifier to CDN icon URL */
  icons: Record<string, string>;
  /** Notification rules per unified event type */
  events: Record<UnifiedEventType, EventRule>;
  /** Enabled status per supported agent */
  enabledAgents: Record<SupportedAgent, boolean>;
}

/**
 * Default CDN URLs for high-resolution transparent agent icons.
 */
export const DEFAULT_ICONS: Record<SupportedAgent, string> = {
  claude:
    'https://raw.githubusercontent.com/XianShengXingGe/Take-Five/main/assets/icons/claude.png',
  codex:
    'https://raw.githubusercontent.com/XianShengXingGe/Take-Five/main/assets/icons/codex.png',
  opencode:
    'https://raw.githubusercontent.com/XianShengXingGe/Take-Five/main/assets/icons/opencode.png',
  antigravity:
    'https://raw.githubusercontent.com/XianShengXingGe/Take-Five/main/assets/icons/antigravity.png',
};

/**
 * Default event notification rules matching PRD defaults.
 */
export const DEFAULT_EVENT_RULES: Record<UnifiedEventType, EventRule> = {
  task_completed: {
    enabled: true,
    level: 'active',
  },
  waiting_input: {
    enabled: true,
    level: 'timeSensitive',
  },
  waiting_permission: {
    enabled: true,
    level: 'timeSensitive',
  },
  task_failed: {
    enabled: true,
    level: 'timeSensitive',
  },
};

/**
 * Default agent enablement flags.
 */
export const DEFAULT_ENABLED_AGENTS: Record<SupportedAgent, boolean> = {
  claude: true,
  codex: true,
  opencode: true,
  antigravity: true,
};

/**
 * Default Take Five configuration.
 */
export const DEFAULT_CONFIG: TakeFiveConfig = {
  version: '1.0.0',
  language: 'system',
  debounceSeconds: 2,
  icons: { ...DEFAULT_ICONS },
  events: { ...DEFAULT_EVENT_RULES },
  enabledAgents: { ...DEFAULT_ENABLED_AGENTS },
};
