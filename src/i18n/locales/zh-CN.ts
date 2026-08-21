import type { SupportedAgent, UnifiedEventType } from '../../types/event.js';

export interface LocaleEventTemplate {
  title: string;
  body: string;
}

export interface LocaleDictionary {
  events: Record<UnifiedEventType, LocaleEventTemplate>;
  agents: Record<SupportedAgent, string>;
}

export const zhCN: LocaleDictionary = {
  events: {
    task_completed: {
      title: '✅ 任务完成',
      body: '恭喜！任务已完成',
    },
    waiting_input: {
      title: '⏳ 等待输入',
      body: 'Coding Agent 正在等待您的下一步输入',
    },
    waiting_permission: {
      title: '🔐 等待授权',
      body: 'Coding Agent 请求执行敏感操作，请审批',
    },
    task_failed: {
      title: '❌ 任务失败',
      body: 'Coding Agent 执行出错，请检查终端',
    },
  },
  agents: {
    claude: 'Claude Code',
    codex: 'Codex',
    opencode: 'OpenCode',
    antigravity: 'Antigravity',
  },
};
