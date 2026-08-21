---
name: takefive
description: Smart mobile push notification tool for Coding Agents (Codex, Claude Code, OpenCode, Antigravity) via Bark. Use when the user asks about notification status, wants to test push alerts, manage notification rules, or repair lifecycle hooks.
---

# Take Five (片刻) · 智能 Coding Agent 手机推送通知

Take Five 是专为 Coding Agent（Codex、Claude Code、OpenCode、Antigravity）设计的智能生命周期手机推送通知工具。通过 Apple APNs / Bark，在 Agent 任务完成、等待用户输入、等待敏感操作授权或发生异常中断时，第一时间将状态推送到开发者手机上。

## 常用命令与交互

### 1. 查看状态
查看当前 Bark 推送配置、各智能体生命周期钩子（Hooks）注册状态以及通知规则：
```bash
takefive status
```

### 2. 发送测试推送
向手机发送测试通知，验证 Bark 连通性与推送样式：
```bash
# 测试当前环境所有 4 类事件通知
takefive test

# 测试指定事件通知
takefive test --event task_completed
takefive test --event waiting_input
takefive test --event waiting_permission
takefive test --event task_failed
```

### 3. 修复与更新 Hooks
当切换了环境或 Agent 配置文件被重置时，自动扫描并重新注入钩子：
```bash
takefive repair
# 或强制重新覆盖注入
takefive repair --force
```

### 4. 偏好设置
交互式修改 Bark URL、通知语言（中/英/跟随系统）、防抖时间及单项事件通知开关与等级：
```bash
takefive config
```

### 5. 重新配置向导
```bash
takefive install
```

## 生命周期事件与默认提醒级别

| 事件类型 | 触发时机 | 默认紧急级别 | 手机表现 |
| :--- | :--- | :--- | :--- |
| `task_completed` | 任务执行完毕 / Agent 停止运行 | `active`（普通通知） | 亮屏推送，正常横幅 |
| `waiting_input` | Agent 需要用户补充信息或回答问题 | `timeSensitive`（重要） | 突破勿扰/专注模式，重要提醒 |
| `waiting_permission` | Agent 请求敏感工具/命令授权 | `timeSensitive`（重要） | 突破勿扰/专注模式，重要提醒 |
| `task_failed` | Agent 遇到未捕获异常或执行失败 | `timeSensitive`（重要） | 突破勿扰/专注模式，重要提醒 |
