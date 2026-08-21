# Take Five (片刻) · 项目交接文档 (HANDOFF)

> **文档目的**：供开发者或 AI Agent 在更换开发机器、拉取代码后快速熟悉项目全貌、架构设计、当前开发进度与后续待办事项，实现无缝接力开发。

---

## 1. 项目定位与核心概念

### 1.1 产品简介
**片刻（Take Five）** 是一款面向 Coding Agent（如 Claude Code, OpenAI Codex, OpenCode, Google Antigravity）的轻量级智能生命周期手机推送通知工具。通过 Apple APNs / Bark 服务，在 AI Agent 完成长任务、等待输入、等待权限授权或异常退出时，主动将状态推送到开发者手机上，消除等待焦虑。

- **核心原则**：让 AI 工作，用户获得片刻自由。
- **支持平台**：macOS、Windows（MVP 阶段优先）。
- **支持 Agent**：Anthropic Claude Code、OpenAI Codex、OpenCode、Google Antigravity。

### 1.2 关键领域词汇（参考 [CONTEXT.md](file:///Users/xreal/Library/Mobile%20Documents/com~apple~CloudDocs/04%20%E5%B7%A5%E4%BD%9C%E5%AE%A4/%E7%89%87%E5%88%BB/CONTEXT.md)）
- **Notification Core**: 核心业务引擎，负责事件校验、通知等级映射、模板渲染、图标解析与 Bark API 调度（**无后台常驻守护进程**）。
- **Agent Adapter**: 各 Agent 的轻量级适配层（Hook 注入与清理），将 Agent 原生生命周期事件翻译为统一事件。
- **Unified Event**: 4 类标准事件：`task_completed`（任务完成）、`waiting_input`（等待输入）、`waiting_permission`（等待授权）、`task_failed`（异常停止）。
- **Notification Level**: 4 级紧急程度：`passive`（静默）、`active`（普通）、`timeSensitive`（重要，突破专注模式）、`critical`（强提醒）。
- **Project Name**: 工作区名称，优先从 Git 根目录解析，次选当前工作目录。
- **Debounce Window**: 防抖窗口（默认 2 秒），防止短时间内同一 Agent + 同一 Project 的连续重复推送轰炸。
- **Hook Manifest / Backup**: 智能体配置修改前的自动备份机制（`*.takefive.bak`），确保安全幂等与干净回滚。

---

## 2. 核心架构与 ADR 设计决策

项目架构严格遵循 [docs/adr/](file:///Users/xreal/Library/Mobile%20Documents/com~apple~CloudDocs/04%20%E5%B7%A5%E4%BD%9C%E5%AE%A4/%E7%89%87%E5%88%BB/docs/adr) 中的设计决策：

1. **无状态 CLI 调用 ([ADR-0001](file:///Users/xreal/Library/Mobile%20Documents/com~apple~CloudDocs/04%20%E5%B7%A5%E4%BD%9C%E5%AE%A4/%E7%89%87%E5%88%BB/docs/adr/0001-stateless-cli-invocation.md))**:
   - 不跑任何后台服务或本地 HTTP Daemon。
   - Agent Adapter 通过直接调用 `takefive notify --agent <agent> --event <event>` CLI 子命令发送通知。
2. **密钥与配置安全隔离 ([ADR-0002](file:///Users/xreal/Library/Mobile%20Documents/com~apple~CloudDocs/04%20%E5%B7%A5%E4%BD%9C%E5%AE%A4/%E7%89%87%E5%88%BB/docs/adr/0002-credential-and-config-storage.md))**:
   - 规则与开关存放在 `~/.takefive/config.json`。
   - 敏感的 Bark Server URL 与 Push Key 仅存放在系统安全凭据库（macOS Keychain / Windows Credential Manager，服务名 `com.takefive.cli`），防止进入 Git 或 Agent 上下文。
3. **非侵入式配置注入与自动备份 ([ADR-0003](file:///Users/xreal/Library/Mobile%20Documents/com~apple~CloudDocs/04%20%E5%B7%A5%E4%BD%9C%E5%AE%A4/%E7%89%87%E5%88%BB/docs/adr/0003-non-destructive-hook-injection.md))**:
   - 智能合并目标配置文件（如 `~/.claude/config.json`, `~/.codex/config.json`, `~/.gemini/config/hooks.json`）。
   - 修改前自动创建 `*.takefive.bak`，支持精准卸载恢复。
4. **事件防抖与抑制 ([ADR-0004](file:///Users/xreal/Library/Mobile%20Documents/com~apple~CloudDocs/04%20%E5%B7%A5%E4%BD%9C%E5%AE%A4/%E7%89%87%E5%88%BB/docs/adr/0004-event-debouncing-and-suppression.md))**:
   - 使用轻量本地缓存 `~/.takefive/cache.json` 记录时间戳，2 秒内相同 Agent + Project 自动合并不发推送。
5. **彻底卸载与干净清除 ([ADR-0005](file:///Users/xreal/Library/Mobile%20Documents/com~apple~CloudDocs/04%20%E5%B7%A5%E4%BD%9C%E5%AE%A4/%E7%89%87%E5%88%BB/docs/adr/0005-total-purge-uninstall.md))**:
   - `takefive uninstall` 会恢复所有 Agent 配置、删除 `~/.takefive/` 目录并抹除 OS Keychain 密钥，做到零残留。
6. **通知分组与中英双语国际化 ([ADR-0006](file:///Users/xreal/Library/Mobile%20Documents/com~apple~CloudDocs/04%20%E5%B7%A5%E4%BD%9C%E5%AE%A4/%E7%89%87%E5%88%BB/docs/adr/0006-notification-grouping-and-i18n.md))**:
   - Bark 推送按 `group: <Project Name>` 自动归类。
   - 界面与推送模板支持 `zh-CN`、`en` 及自动检测系统语言。

---

## 3. 代码库结构一览

```text
.
├── CONTEXT.md                    # 领域术语表与统一语言契约
├── AGENTS.md                     # Agent 行为准则与工程纪律
├── 片刻_Take_Five_PRD.md          # 完整产品需求文档 (PRD v1.0)
├── package.json / tsup.config.ts # 项目依赖与打包配置 (ESM, Node 18+)
├── assets/icons/                 # 4 款 Agent 的 128x128 高清透明 PNG 图标
│   ├── claude.png
│   ├── codex.png
│   ├── opencode.png
│   └── antigravity.png
├── scripts/
│   └── build-dmg.sh              # macOS DMG 一键安装镜像构建脚本
├── skills/takefive/              # Take Five 专属 Agent 技能描述文件
│   └── SKILL.md
├── src/
│   ├── bin.ts                    # CLI 入口执行包装器
│   ├── index.ts                  # 库主导出入口
│   ├── types/                    # TypeScript 类型契约 (Event, Bark, Config, Credential)
│   ├── core/                     # 核心业务
│   │   ├── bark-client.ts        # Bark HTTP API 请求封装
│   │   ├── config-manager.ts     # ~/.takefive/config.json 读写与校验
│   │   ├── credential-store.ts   # OS Keychain / Credential Manager 桥接
│   │   ├── debouncer.ts          # 基于 ~/.takefive/cache.json 的 2s 防抖器
│   │   ├── template-engine.ts    # 消息模板渲染与表情图标组装
│   │   ├── agent-detector.ts     # 本机安装的 Agent 自动探测
│   │   ├── project-detector.ts   # Git 根目录与工作区名称推导
│   │   ├── paths.ts              # 跨平台路径常量
│   │   └── notification-dispatcher.ts # 核心通知流转分发器
│   ├── adapters/                 # 智能体适配层
│   │   ├── base-adapter.ts       # 适配器基类接口
│   │   ├── claude-adapter.ts     # Claude Code 钩子适配器
│   │   ├── codex-adapter.ts      # OpenAI Codex 钩子适配器
│   │   ├── opencode-adapter.ts   # OpenCode 插件/钩子适配器
│   │   ├── antigravity-adapter.ts# Antigravity 钩子与 stdin 协议适配器
│   │   ├── backup-manager.ts     # *.takefive.bak 备份与恢复管理
│   │   └── hook-utils.ts         # Hook 注入提取通用工具
│   ├── cli/                      # 命令行子命令与交互向导
│   │   ├── index.ts              # Commander 路由总入口
│   │   ├── prompt-driver.ts      # @clack/prompts 交互驱动抽象
│   │   └── commands/
│   │       ├── install.ts        # takefive install (交互式安装配置向导)
│   │       ├── status.ts         # takefive status (健康度与配置状态查看)
│   │       ├── config.ts         # takefive config (交互式配置菜单)
│   │       ├── test.ts           # takefive test (四类事件测试推送)
│   │       ├── repair.ts         # takefive repair (自动扫描与修复 Hooks)
│   │       ├── uninstall.ts      # takefive uninstall (完全卸载与清空)
│   │       └── notify.ts         # takefive notify (供 Hook 回调调用的分发入口)
│   ├── i18n/                     # 国际化语言包与检测
│   │   ├── detector.ts
│   │   └── locales/{zh-CN.ts, en.ts}
│   └── testing/                  # 供测试套件使用的 Mock 辅助组件
└── tests/                        # 26 个单元与端到端测试用例套件
```

---

## 4. 当前完成状态与测试覆盖

- **全量测试状态**：所有 26 个测试文件（178 个用例）全部通过 (`vitest run`)。
- **类型检查状态**：TypeScript 编译零错误 (`tsc --noEmit`)。
- **打包产物**：
  - `pnpm run build` 生成 `dist/` CLI 与库代码。
  - `pnpm run package:dmg` 生成独立安装镜像 `TakeFive-1.0.0-macOS.dmg`。

---

## 5. 新电脑环境准备与接续开发指南

### 5.1 环境需求
- **Node.js**: `>= 18.0.0`
- **pnpm**: `>= 9.0.0` (或使用 `npm` / `corepack enable pnpm`)
- **Git**

### 5.2 常用开发与验证命令
```bash
# 1. 安装依赖
pnpm install

# 2. 运行所有单元测试与 E2E 测试
pnpm test

# 3. 监听模式运行测试
pnpm run test:watch

# 4. TypeScript 静态类型检查
pnpm run typecheck

# 5. 构建 CLI 产物
pnpm run build

# 6. 打包 macOS DMG 发布包 (仅 macOS 环境)
pnpm run package:dmg
```

### 5.3 在新电脑上体验或联调 Take Five
在项目根目录下构建完成后，可直接运行：
```bash
# 查看帮助
node dist/cli.js --help

# 运行交互式安装配置向导（输入你的 Bark URL）
node dist/cli.js install

# 查看状态
node dist/cli.js status

# 测试推送
node dist/cli.js test

# 全局软链接到系统（可选）
npm link
# 之后可直接在全局使用 takefive 命令
```

---

## 6. 后续可扩展方向 (Roadmap)

1. **多推送通道扩展**：当前专注 Bark / APNs，未来可支持 Telegram Bot、Discord Webhook、飞书 / 钉钉自定义机器人等。
2. **Windows Credential Manager 原生适配增强**：针对 Windows 平台提供无依赖的凭据管理与自动化测试验证。
3. **CI/CD 自动化**：配置 GitHub Actions 工作流，在 Tag 发布时自动运行 `vitest`、`build`，并自动构建上传 DMG 到 GitHub Releases。
4. **Agent 二次交互支持**：评估通过 Apple Watch / 手机快捷指令回复 Agent 的可行性。

---

## 7. 推荐 Agent Skills

接下来的开发与维护任务中，建议调用以下 Skill：
- `code-review`: 对新增功能或重构 PR 进行规范与 Spec 双轴审查。
- `tdd`: 使用测试驱动开发为新适配的 Agent 或新增特性编写用例。
- `diagnosing-bugs`: 遇到跨平台凭据存储或异步 Hook 调试问题时进行系统化诊断。
- `writing-for-agents`: 更新 `CONTEXT.md`、`AGENTS.md` 或扩展文档。
