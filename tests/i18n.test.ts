import { describe, expect, it } from 'vitest';
import {
  detectLanguage,
  getLocaleStrings,
  formatNotificationContent,
} from '../src/i18n/index.js';
import { VERSION } from '../src/version.js';
import type { SupportedAgent, UnifiedEventType } from '../src/types/event.js';

describe('i18n localization', () => {
  it('exports version 0.6.0', () => {
    expect(VERSION).toBe('0.6.0');
  });
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

    it('enforces strict Chinese branding with no Take Five mixed in user-facing texts', () => {
      const strings = getLocaleStrings('zh-CN');
      const json = JSON.stringify(strings);
      // Remove any URL occurrences if any exist (e.g. github URL), then check no "Take Five"
      const nonUrlJson = json.replace(/https?:\/\/[^\s"']+/g, '');
      expect(nonUrlJson).not.toContain('Take Five');
      expect(nonUrlJson).not.toContain('take five');
      expect(strings.cli.status.title).toBe('片刻 · 系统状态');
      expect(strings.cli.install.intro).toContain('片刻 · 安装向导');
      expect(strings.cli.config.intro).toContain('片刻 · 偏好设置');
      expect(strings.cli.uninstall.intro).toContain('片刻 · 卸载程序');
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

    it('enforces strict English branding with zero Chinese characters in en dictionary', () => {
      const strings = getLocaleStrings('en');
      const json = JSON.stringify(strings);
      const chineseChars = json.match(/[\u4e00-\u9fa5]/g);
      expect(chineseChars).toBeNull();
      expect(strings.cli.status.title).toBe('Take Five · System Status');
      expect(strings.cli.install.intro).toContain('Take Five - Setup Wizard');
      expect(strings.cli.config.intro).toContain('Take Five · Configuration');
    });

    it('includes all PRD §5 dictionary definitions in both languages', () => {
      const zh = getLocaleStrings('zh-CN');
      const en = getLocaleStrings('en');

      expect(zh.app.name).toBe('片刻');
      expect(en.app.name).toBe('Take Five');

      expect(zh.header.visitGithub).toBe('访问 GitHub 开源项目');
      expect(en.header.visitGithub).toBe('Visit GitHub Repository');

      expect(zh.agentsUI.title).toBe('🤖 Agent 平台');
      expect(en.agentsUI.title).toBe('🤖 Agent Platform');

      expect(zh.rules.title).toBe('🔔 通知规则');
      expect(en.rules.title).toBe('🔔 Notification Rules');
      expect(zh.rules.levelActive).toBe('普通');
      expect(en.rules.levelActive).toBe('Active');
      expect(zh.rules.levelTimeSensitive).toBe('重要');
      expect(en.rules.levelTimeSensitive).toBe('Time-Sensitive');

      expect(zh.preferences.title).toBe('⚙️ 通用设置');
      expect(en.preferences.title).toBe('⚙️ General Settings');
      expect(zh.preferences.langZh).toBe('简体中文 (片刻)');
      expect(en.preferences.langZh).toBe('Simplified Chinese');
      expect(zh.preferences.langEn).toBe('English');
      expect(en.preferences.langEn).toBe('English');

      expect(zh.support.title).toBe('❤️ 支持与赞赏');
      expect(en.support.title).toBe('❤️ Support & Sponsor');
      expect(zh.support.donateButton).toBe('赞赏支持');
      expect(en.support.donateButton).toBe('Sponsor');
      expect(zh.support.channelXiaohongshu).toBe('小红书');
      expect(en.support.channelXiaohongshu).toBe('Xiaohongshu');

      expect(zh.donation.modalTitle).toBe('赞赏支持开发者');
      expect(en.donation.modalTitle).toBe('Support the Developer');
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

    it('safely truncates body strings longer than 1000 characters with ellipsis', () => {
      const longReason = 'A'.repeat(1500);
      const content = formatNotificationContent({
        type: 'task_failed',
        agent: 'claude',
        project: 'Take-Five',
        reason: longReason,
        language: 'en',
      });

      expect(content.body.length).toBe(1000); // 997 chars + '...' (strict 1000 character ceiling)
      expect(content.body.startsWith('A'.repeat(997))).toBe(true);
      expect(content.body.endsWith('...')).toBe(true);
    });

    it('does not truncate body strings with 1000 or fewer characters', () => {
      const exact1000 = 'B'.repeat(1000);
      const content = formatNotificationContent({
        type: 'task_completed',
        agent: 'codex',
        project: 'Take-Five',
        reason: exact1000,
        language: 'en',
      });

      expect(content.body.length).toBe(1000);
      expect(content.body).toBe(exact1000);
    });
  });
});
