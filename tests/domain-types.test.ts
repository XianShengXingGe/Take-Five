import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  DEFAULT_ENABLED_AGENTS,
  DEFAULT_EVENT_RULES,
  DEFAULT_ICONS,
  KEYCHAIN_BARK_URL_ACCOUNT,
  KEYCHAIN_SERVICE_NAME,
  NOTIFICATION_LEVELS,
  SUPPORTED_AGENTS,
  UNIFIED_EVENT_TYPES,
  isNotificationLevel,
  isSupportedAgent,
  isUnifiedEventType,
} from '../src/index.js';

describe('Domain Types and Constants', () => {
  it('defines all supported agent identifiers', () => {
    expect(SUPPORTED_AGENTS).toEqual(['claude', 'codex', 'opencode', 'antigravity']);
    expect(isSupportedAgent('claude')).toBe(true);
    expect(isSupportedAgent('codex')).toBe(true);
    expect(isSupportedAgent('opencode')).toBe(true);
    expect(isSupportedAgent('antigravity')).toBe(true);
    expect(isSupportedAgent('unknown_agent')).toBe(false);
    expect(isSupportedAgent(null)).toBe(false);
    expect(isSupportedAgent(123)).toBe(false);
  });

  it('defines all unified event types', () => {
    expect(UNIFIED_EVENT_TYPES).toEqual([
      'task_completed',
      'waiting_input',
      'waiting_permission',
      'task_failed',
    ]);
    expect(isUnifiedEventType('task_completed')).toBe(true);
    expect(isUnifiedEventType('waiting_input')).toBe(true);
    expect(isUnifiedEventType('waiting_permission')).toBe(true);
    expect(isUnifiedEventType('task_failed')).toBe(true);
    expect(isUnifiedEventType('custom_event')).toBe(false);
    expect(isUnifiedEventType(undefined)).toBe(false);
  });

  it('defines all notification levels', () => {
    expect(NOTIFICATION_LEVELS).toEqual(['passive', 'active', 'timeSensitive', 'critical']);
    expect(isNotificationLevel('passive')).toBe(true);
    expect(isNotificationLevel('active')).toBe(true);
    expect(isNotificationLevel('timeSensitive')).toBe(true);
    expect(isNotificationLevel('critical')).toBe(true);
    expect(isNotificationLevel('urgent')).toBe(false);
  });

  it('provides default icon CDN URLs for each supported agent', () => {
    for (const agent of SUPPORTED_AGENTS) {
      expect(DEFAULT_ICONS[agent]).toBeDefined();
      expect(DEFAULT_ICONS[agent]).toContain('raw.githubusercontent.com');
      expect(DEFAULT_ICONS[agent]).toContain(`${agent}.png`);
    }
  });

  it('provides default notification rules matching PRD defaults', () => {
    expect(DEFAULT_EVENT_RULES.task_completed).toEqual({
      enabled: true,
      level: 'active',
    });
    expect(DEFAULT_EVENT_RULES.waiting_input).toEqual({
      enabled: true,
      level: 'timeSensitive',
    });
    expect(DEFAULT_EVENT_RULES.waiting_permission).toEqual({
      enabled: true,
      level: 'timeSensitive',
    });
    expect(DEFAULT_EVENT_RULES.task_failed).toEqual({
      enabled: true,
      level: 'timeSensitive',
    });
  });

  it('provides default enabled agents status for all supported agents', () => {
    for (const agent of SUPPORTED_AGENTS) {
      expect(DEFAULT_ENABLED_AGENTS[agent]).toBe(true);
    }
  });

  it('constructs a valid default TakeFiveConfig object', () => {
    expect(DEFAULT_CONFIG.version).toBe('1.0.0');
    expect(DEFAULT_CONFIG.language).toBe('system');
    expect(DEFAULT_CONFIG.debounceSeconds).toBe(2);
    expect(DEFAULT_CONFIG.icons).toEqual(DEFAULT_ICONS);
    expect(DEFAULT_CONFIG.events).toEqual(DEFAULT_EVENT_RULES);
    expect(DEFAULT_CONFIG.enabledAgents).toEqual(DEFAULT_ENABLED_AGENTS);
  });

  it('defines keychain service and account constants', () => {
    expect(KEYCHAIN_SERVICE_NAME).toBe('com.takefive.cli');
    expect(KEYCHAIN_BARK_URL_ACCOUNT).toBe('bark_url');
  });
});
