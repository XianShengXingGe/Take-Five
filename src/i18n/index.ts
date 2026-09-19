import type { SupportedAgent, UnifiedEventType } from '../types/event.js';
import { zhCN, type LocaleDictionary } from './locales/zh-CN.js';
import { en } from './locales/en.js';
import { detectLanguage, type ResolvedLanguage } from './detector.js';

export * from './locales/zh-CN.js';
export * from './locales/en.js';
export * from './detector.js';

const DICTIONARIES: Record<ResolvedLanguage, LocaleDictionary> = {
  'zh-CN': zhCN,
  en,
};

/**
 * Retrieves the locale dictionary for the specified language.
 */
export function getLocaleStrings(language: ResolvedLanguage = 'zh-CN'): LocaleDictionary {
  return DICTIONARIES[language] ?? DICTIONARIES['zh-CN'];
}

export interface FormatNotificationParams {
  type: UnifiedEventType;
  agent: SupportedAgent;
  project: string;
  reason?: string;
  language?: ResolvedLanguage;
  ruleTitle?: string;
  ruleBody?: string;
}

export interface FormattedNotificationContent {
  title: string;
  subtitle: string;
  body: string;
}

export const MAX_BODY_LENGTH = 1000;

/**
 * Formats title, subtitle, and body according to language, agent, project, and custom rules.
 */
export function formatNotificationContent(
  params: FormatNotificationParams,
): FormattedNotificationContent {
  const language = params.language ?? 'zh-CN';
  const dict = getLocaleStrings(language);
  const eventTemplate = dict.events[params.type];
  const agentDisplayName = dict.agents[params.agent] ?? params.agent;

  const title = params.ruleTitle && params.ruleTitle.trim().length > 0
    ? params.ruleTitle.trim().slice(0, 12)
    : eventTemplate.title;

  const subtitle = `${agentDisplayName} · ${params.project}`;

  let body = params.reason && params.reason.trim().length > 0
    ? params.reason
    : params.ruleBody && params.ruleBody.trim().length > 0
      ? params.ruleBody.trim().slice(0, 32)
      : eventTemplate.body;

  if (body.length > MAX_BODY_LENGTH) {
    body = `${body.slice(0, MAX_BODY_LENGTH - 3)}...`;
  }

  return {
    title,
    subtitle,
    body,
  };
}
