/**
 * Standardized unified lifecycle events and agent types for Take Five.
 */

export const SUPPORTED_AGENTS = ['claude', 'codex', 'opencode', 'antigravity'] as const;
export type SupportedAgent = (typeof SUPPORTED_AGENTS)[number];

export const UNIFIED_EVENT_TYPES = [
  'task_completed',
  'waiting_input',
  'waiting_permission',
  'task_failed',
] as const;
export type UnifiedEventType = (typeof UNIFIED_EVENT_TYPES)[number];

/**
 * Urgency level mapped to APNs / Bark push levels:
 * - passive: Silent, delivered to notification center only.
 * - active: Default system notification.
 * - timeSensitive: Breaks through Focus / Do Not Disturb.
 * - critical: High priority emergency notification.
 */
export const NOTIFICATION_LEVELS = ['passive', 'active', 'timeSensitive', 'critical'] as const;
export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];

/**
 * Standardized lifecycle event emitted by an Agent Adapter to the Notification Core.
 */
export interface UnifiedEvent {
  /** Unified event lifecycle state */
  type: UnifiedEventType;
  /** Originating agent identity */
  agent: SupportedAgent;
  /** Project workspace name (derived from Git root or CWD) */
  project: string;
  /** Optional extra reason or context message */
  reason?: string;
  /** Millisecond timestamp when the event was emitted */
  timestamp: number;
}

/**
 * Type guard for SupportedAgent.
 */
export function isSupportedAgent(value: unknown): value is SupportedAgent {
  return typeof value === 'string' && (SUPPORTED_AGENTS as readonly string[]).includes(value);
}

/**
 * Type guard for UnifiedEventType.
 */
export function isUnifiedEventType(value: unknown): value is UnifiedEventType {
  return typeof value === 'string' && (UNIFIED_EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Type guard for NotificationLevel.
 */
export function isNotificationLevel(value: unknown): value is NotificationLevel {
  return typeof value === 'string' && (NOTIFICATION_LEVELS as readonly string[]).includes(value);
}
