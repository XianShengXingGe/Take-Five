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
    ? params.ruleTitle
    : eventTemplate.title;

  const subtitle = `${agentDisplayName} · ${params.project}`;

  const body = params.reason && params.reason.trim().length > 0
    ? params.reason
    : params.ruleBody && params.ruleBody.trim().length > 0
      ? params.ruleBody
      : eventTemplate.body;

  return {
    title,
    subtitle,
    body,
  };
}
