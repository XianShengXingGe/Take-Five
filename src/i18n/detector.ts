import type { ConfigLanguage } from '../types/config.js';

export type ResolvedLanguage = 'zh-CN' | 'en';

/**
 * Detects the effective language ('zh-CN' | 'en') from configuration or system environment.
 */
export function detectLanguage(
  configLanguage: ConfigLanguage = 'system',
  env: Record<string, string | undefined> = process.env,
): ResolvedLanguage {
  if (configLanguage === 'zh-CN' || configLanguage === 'en') {
    return configLanguage;
  }

  const localeEnv = env.LC_ALL || env.LC_MESSAGES || env.LANG || env.LANGUAGE;
  if (localeEnv && typeof localeEnv === 'string') {
    const normalized = localeEnv.toLowerCase();
    if (normalized.startsWith('zh') || normalized.includes('chinese')) {
      return 'zh-CN';
    }
    return 'en';
  }

  try {
    const intlLocale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    if (intlLocale.startsWith('zh')) {
      return 'zh-CN';
    }
  } catch {
    // Fall back to en if Intl is unavailable or throws
  }

  return 'en';
}
