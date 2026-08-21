import { describe, expect, it } from 'vitest';
import { TemplateEngine } from '../src/core/template-engine.js';
import { createMockConfig, createMockUnifiedEvent } from '../src/testing/index.js';

describe('TemplateEngine', () => {
  it('renders standard Chinese push payload by default', () => {
    const engine = new TemplateEngine();
    const config = createMockConfig({ language: 'zh-CN' });
    const event = createMockUnifiedEvent({
      type: 'task_completed',
      agent: 'claude',
      project: 'Take-Five',
    });

    const payload = engine.render(event, config);

    expect(payload.title).toBe('✅ 任务完成');
    expect(payload.subtitle).toBe('Claude Code · Take-Five');
    expect(payload.body).toBe('恭喜！任务已完成');
    expect(payload.group).toBe('Take-Five');
    expect(payload.level).toBe('active');
    expect(payload.icon).toBe(config.icons.claude);
  });

  it('renders standard English push payload when configured for en', () => {
    const engine = new TemplateEngine();
    const config = createMockConfig({ language: 'en' });
    const event = createMockUnifiedEvent({
      type: 'waiting_permission',
      agent: 'opencode',
      project: 'my-microservice',
    });

    const payload = engine.render(event, config);

    expect(payload.title).toBe('🔐 Awaiting Approval');
    expect(payload.subtitle).toBe('OpenCode · my-microservice');
    expect(payload.body).toBe('Coding Agent requests permission to execute an operation');
    expect(payload.group).toBe('my-microservice');
    expect(payload.level).toBe('timeSensitive');
    expect(payload.icon).toBe(config.icons.opencode);
  });

  it('uses event reason as body when provided', () => {
    const engine = new TemplateEngine();
    const config = createMockConfig({ language: 'zh-CN' });
    const event = createMockUnifiedEvent({
      type: 'task_failed',
      agent: 'codex',
      project: 'website',
      reason: 'Build failed with 2 errors in src/App.tsx',
    });

    const payload = engine.render(event, config);

    expect(payload.title).toBe('❌ 任务失败');
    expect(payload.subtitle).toBe('Codex · website');
    expect(payload.body).toBe('Build failed with 2 errors in src/App.tsx');
    expect(payload.group).toBe('website');
  });

  it('applies custom title and body overrides from config rules', () => {
    const engine = new TemplateEngine();
    const config = createMockConfig({
      language: 'zh-CN',
      events: {
        ...createMockConfig().events,
        waiting_input: {
          enabled: true,
          level: 'critical',
          title: '🙋‍♂️ 等你回复',
          body: '请去终端敲回车',
        },
      },
    });

    const event = createMockUnifiedEvent({
      type: 'waiting_input',
      agent: 'antigravity',
      project: 'core-infra',
    });

    const payload = engine.render(event, config);

    expect(payload.title).toBe('🙋‍♂️ 等你回复');
    expect(payload.subtitle).toBe('Antigravity · core-infra');
    expect(payload.body).toBe('请去终端敲回车');
    expect(payload.level).toBe('critical');
  });
});
