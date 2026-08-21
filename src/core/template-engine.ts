import { detectLanguage, formatNotificationContent } from '../i18n/index.js';
import type { BarkPushPayload } from '../types/bark.js';
import { DEFAULT_ICONS, type TakeFiveConfig } from '../types/config.js';
import type { UnifiedEvent } from '../types/event.js';

export interface TemplateEngineOptions {
  env?: Record<string, string | undefined>;
}

/**
 * Renders UnifiedEvents and TakeFiveConfig into a localized BarkPushPayload.
 */
export class TemplateEngine {
  private env: Record<string, string | undefined>;

  constructor(options: TemplateEngineOptions = {}) {
    this.env = options.env ?? process.env;
  }

  /**
   * Translates a UnifiedEvent into a fully formatted BarkPushPayload.
   */
  render(event: UnifiedEvent, config: TakeFiveConfig): BarkPushPayload {
    const language = detectLanguage(config.language, this.env);
    const rule = config.events[event.type];

    const content = formatNotificationContent({
      type: event.type,
      agent: event.agent,
      project: event.project,
      reason: event.reason,
      language,
      ruleTitle: rule?.title,
      ruleBody: rule?.body,
    });

    const icon = config.icons[event.agent] || DEFAULT_ICONS[event.agent];
    const level = rule?.level ?? 'active';

    return {
      title: content.title,
      subtitle: content.subtitle,
      body: content.body,
      group: event.project,
      level,
      icon,
      isArchive: 1,
    };
  }
}
