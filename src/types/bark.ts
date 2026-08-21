import type { NotificationLevel } from './event.js';

/**
 * Payload contract sent via HTTP POST / JSON to the Bark server.
 */
export interface BarkPushPayload {
  /** Notification title (e.g. "✅ 任务完成" or "✅ Task Completed") */
  title: string;
  /** Subtitle displaying agent name and project name (e.g. "Claude Code · Take-Five") */
  subtitle: string;
  /** Notification body message (e.g. "恭喜！任务已完成") */
  body: string;
  /** iOS notification grouping identifier (Project Name) */
  group: string;
  /** Notification urgency level mapped to iOS APNs interruption levels */
  level: NotificationLevel;
  /** URL for the notification icon (displayed on iOS) */
  icon: string;
  /** Optional badge count number */
  badge?: number;
  /** Optional custom notification sound file name */
  sound?: string;
  /** Optional deep-link or website URL opened when notification is tapped */
  url?: string;
  /** Bark archive option: 1 to save to notification history, 0 to skip */
  isArchive?: number;
}

/**
 * Standard HTTP response returned by the Bark server.
 */
export interface BarkPushResponse {
  /** Status code: 200 on success */
  code: number;
  /** Status or error message returned by Bark */
  message: string;
  /** Response timestamp from Bark */
  timestamp?: number;
}
