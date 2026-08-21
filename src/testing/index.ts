import {
  DEFAULT_CONFIG,
  type TakeFiveConfig,
} from '../types/config.js';
import type { BarkPushPayload } from '../types/bark.js';
import type { SupportedAgent, UnifiedEvent, UnifiedEventType } from '../types/event.js';

export * from './mock-credential-store.js';
export * from './mock-bark-dispatcher.js';

/**
 * Creates a valid fixture UnifiedEvent with sensible defaults.
 */
export function createMockUnifiedEvent(
  overrides?: Partial<UnifiedEvent>,
): UnifiedEvent {
  return {
    type: 'task_completed',
    agent: 'claude',
    project: 'Take-Five',
    reason: undefined,
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Creates a valid fixture BarkPushPayload with sensible defaults.
 */
export function createMockBarkPayload(
  overrides?: Partial<BarkPushPayload>,
): BarkPushPayload {
  return {
    title: '✅ 任务完成',
    subtitle: 'Claude Code · Take-Five',
    body: '恭喜！任务已完成',
    group: 'Take-Five',
    level: 'active',
    icon: 'https://raw.githubusercontent.com/XianShengXingGe/Take-Five/main/assets/icons/claude.png',
    ...overrides,
  };
}

/**
 * Creates a cloned TakeFiveConfig fixture with optional deep/shallow overrides.
 */
export function createMockConfig(
  overrides?: Partial<TakeFiveConfig>,
): TakeFiveConfig {
  return {
    version: DEFAULT_CONFIG.version,
    language: DEFAULT_CONFIG.language,
    debounceSeconds: DEFAULT_CONFIG.debounceSeconds,
    icons: { ...DEFAULT_CONFIG.icons },
    events: {
      task_completed: { ...DEFAULT_CONFIG.events.task_completed },
      waiting_input: { ...DEFAULT_CONFIG.events.waiting_input },
      waiting_permission: { ...DEFAULT_CONFIG.events.waiting_permission },
      task_failed: { ...DEFAULT_CONFIG.events.task_failed },
    },
    enabledAgents: { ...DEFAULT_CONFIG.enabledAgents },
    ...overrides,
  };
}
