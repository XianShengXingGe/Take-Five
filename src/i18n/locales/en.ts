import type { LocaleDictionary } from './zh-CN.js';

export const en: LocaleDictionary = {
  events: {
    task_completed: {
      title: '✅ Task Completed',
      body: 'Task has finished successfully',
    },
    waiting_input: {
      title: '⏳ Awaiting Input',
      body: 'Coding Agent is waiting for your input',
    },
    waiting_permission: {
      title: '🔐 Awaiting Approval',
      body: 'Coding Agent requests permission to execute an operation',
    },
    task_failed: {
      title: '❌ Task Failed',
      body: 'Coding Agent encountered an error, please check terminal',
    },
  },
  agents: {
    claude: 'Claude Code',
    codex: 'Codex',
    opencode: 'OpenCode',
    antigravity: 'Antigravity',
  },
};
