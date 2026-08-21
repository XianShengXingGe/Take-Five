import { describe, expect, it } from 'vitest';
import {
  detectLanguage,
  getLocaleStrings,
  formatNotificationContent,
} from '../src/i18n/index.js';
import type { SupportedAgent, UnifiedEventType } from '../src/types/event.js';

describe('i18n localization', () => {
  describe('detectLanguage', () => {
    it('returns explicit language when config specifies zh-CN or en', () => {
      expect(detectLanguage('zh-CN')).toBe('zh-CN');
      expect(detectLanguage('en')).toBe('en');
    });

    it('detects zh-CN from system environment when config is system', () => {
      expect(detectLanguage('system', { LANG: 'zh_CN.UTF-8' })).toBe('zh-CN');
      expect(detectLanguage('system', { LC_ALL: 'zh_CN' })).toBe('zh-CN');
      expect(detectLanguage('system', { LC_MESSAGES: 'zh_HK.UTF-8' })).toBe('zh-CN');
    });

    it('detects en from system environment when config is system', () => {
      expect(detectLanguage('system', { LANG: 'en_US.UTF-8' })).toBe('en');
      expect(detectLanguage('system', { LANG: 'C' })).toBe('en');
    });

    it('defaults to en when environment variables are empty', () => {
      expect(detectLanguage('system', {})).toBe('en');
    });
  });

  describe('getLocaleStrings', () => {
    it('returns Simplified Chinese strings for zh-CN', () => {
      const strings = getLocaleStrings('zh-CN');
      expect(strings.events.task_completed.title).toBe('✅ 任务完成');
      expect(strings.events.task_completed.body).toBe('恭喜！任务已完成');
      expect(strings.events.waiting_input.title).toBe('⏳ 等待输入');
      expect(strings.events.waiting_permission.title).toBe('🔐 等待授权');
      expect(strings.events.task_failed.title).toBe('❌ 任务失败');
      expect(strings.agents.claude).toBe('Claude Code');
      expect(strings.agents.codex).toBe('Codex');
      expect(strings.agents.opencode).toBe('OpenCode');
      expect(strings.agents.antigravity).toBe('Antigravity');
      expect(strings.cli.status.title).toContain('系统状态');
      expect(strings.cli.commands.notify).toBeDefined();
      expect(strings.cli.install.intro).toContain('安装向导');
    });

    it('returns English strings for en', () => {
      const strings = getLocaleStrings('en');
      expect(strings.events.task_completed.title).toBe('✅ Task Completed');
      expect(strings.events.task_completed.body).toBe('Task has finished successfully');
      expect(strings.events.waiting_input.title).toBe('⏳ Awaiting Input');
      expect(strings.events.waiting_permission.title).toBe('🔐 Awaiting Approval');
      expect(strings.events.task_failed.title).toBe('❌ Task Failed');
      expect(strings.agents.claude).toBe('Claude Code');
      expect(strings.cli.status.title).toContain('System Status');
      expect(strings.cli.commands.notify).toBeDefined();
      expect(strings.cli.install.intro).toContain('Setup Wizard');
    });
  });

  describe('formatNotificationContent', () => {
    it('formats default Chinese notification without reason override', () => {
      const content = formatNotificationContent({
        type: 'task_completed',
        agent: 'claude',
        project: 'Take-Five',
        language: 'zh-CN',
      });

      expect(content.title).toBe('✅ 任务完成');
      expect(content.subtitle).toBe('Claude Code · Take-Five');
      expect(content.body).toBe('恭喜！任务已完成');
    });

    it('formats default English notification with custom reason', () => {
      const content = formatNotificationContent({
        type: 'task_failed',
        agent: 'codex',
        project: 'my-app',
        reason: 'SyntaxError: Unexpected token',
        language: 'en',
      });

      expect(content.title).toBe('❌ Task Failed');
      expect(content.subtitle).toBe('Codex · my-app');
      expect(content.body).toBe('SyntaxError: Unexpected token');
    });

    it('respects rule title and body overrides', () => {
      const content = formatNotificationContent({
        type: 'waiting_input',
        agent: 'antigravity',
        project: 'backend',
        language: 'zh-CN',
        ruleTitle: '🔔 需要确认',
        ruleBody: '等待人工确认方案',
      });

      expect(content.title).toBe('🔔 需要确认');
      expect(content.subtitle).toBe('Antigravity · backend');
      expect(content.body).toBe('等待人工确认方案');
    });
  });
});
