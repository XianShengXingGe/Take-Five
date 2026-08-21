# 片刻 (Take Five) · 项目交接文档 (Project Handoff)

> **版本**：v1.0.0 (MVP Complete)  
> **更新时间**：2026-08-21  
> **文档目标**：为在其他设备/新会话中继续开发、维护或发布本项目的开发者与 Coding Agent 提供完整上下文与操作指南。

---

## 1. 项目简介 (Project Overview)

**片刻 (Take Five)** 是一款面向 Coding Agent（Codex、Claude Code、OpenCode、Antigravity）的智能通知工具。当 AI Agent 在后台执行长任务时，开发者无需持续盯盘；在任务完成、等待输入、等待权限确认或发生异常停止时，系统会自动通过 iOS **Bark** 向开发者的移动设备推送通知。

### 核心设计原则
1. **无感与非破坏性**：Hook 注入遵循非破坏性原则（增量合并、自动 `.takefive.bak` 备份），卸载时 100% 干净还原。
2. **轻量 Adapter + 统一 Core**：Adapter 只负责生命周期事件翻译；通知等级、防抖（2s 冷却）、多语言、文案模板与 Bark 推送全部由 Core 处理。
3. **敏感凭据隔离**：Bark URL 仅保存在 OS 安全存储（macOS Keychain / Windows Credential Manager / Linux 隔离存储），不入 Agent 上下文，不入 Git，不落明文日志。
4. **无守护进程 (Stateless)**：由 Agent 生命周期钩子直接唤起轻量 CLI (`takefive notify`)，毫秒级分发后立即退出，零常驻内存开销。

---

## 2. 代码仓库结构与核心模块 (Repository Map)

```text
.
├── src/
│   ├── adapters/            # 各 Coding Agent 的适配器与 Hook 注入管理
│   │   ├── antigravity-adapter.ts   # Antigravity (hooks.json) 适配器
│   │   ├── backup-manager.ts        # 配置文件备份与原子还原
│   │   ├── base-adapter.ts          # AgentAdapter 抽象基类
│   │   ├── claude-adapter.ts        # Claude Code (~/.claude/config.json) 适配器
│   │   ├── codex-adapter.ts         # OpenAI Codex 适配器
│   │   ├── hook-utils.ts            # Hook 命令构建与 JSON 解析工具
│   │   ├── index.ts                 # Adapter 注册表 (AdapterRegistry)
│   │   └── opencode-adapter.ts      # OpenCode 适配器
│   ├── cli/                 # CLI 交互界面与各子命令实现
│   │   ├── commands/
│   │   │   ├── config.ts            # takefive config (交互式配置编辑)
│   │   │   ├── install.ts           # takefive install (一键初始化向导)
│   │   │   ├── notify.ts            # takefive notify (无状态事件派发)
│   │   │   ├── repair.ts            # takefive repair (Hook 损坏扫描与自愈)
│   │   │   ├── status.ts            # takefive status (状态与规则总览)
│   │   │   ├── test.ts              # takefive test (推送链路测试)
│   │   │   └── uninstall.ts         # takefive uninstall (彻底卸载与还原)
│   │   ├── prompt-driver.ts         # 基于 @clack/prompts 的交互驱动
│   │   └── index.ts                 # Commander CLI 组装
│   ├── core/                # 通知核心引擎
│   │   ├── agent-detector.ts        # 本地已安装 Agent 检测
│   │   ├── bark-client.ts           # Bark HTTP API 客户端 (含 URL 格式归一化)
│   │   ├── config-manager.ts        # ~/.takefive/config.json 读写管理
│   │   ├── credential-store.ts      # OS 级安全凭据存储
│   │   ├── debouncer.ts             # 2秒窗口防抖与抑制逻辑
│   │   ├── notification-dispatcher.ts # 核心派发管道 (事件->模板->Bark)
│   │   ├── paths.ts                 # 全局路径配置常量
│   │   ├── project-detector.ts      # 工作区/Git 项目名提取
│   │   └── template-engine.ts       # 消息模板渲染与图标解析
│   ├── i18n/                # 国际化支持 (zh-CN, en，自动跟随系统或手动切换)
│   ├── testing/             # 模拟测试工具 (MockBarkDispatcher, MockCredentialStore)
│   ├── types/               # 全局 TypeScript 领域类型定义
│   └── bin.ts               # CLI 可执行文件入口
├── tests/                   # 26 个测试套件，179 个单元/集成测试
├── assets/                  # Agent 图标等静态资源 (提供本地与 jsDelivr CDN)
├── docs/                    # 架构决策记录 (ADRs) 与 Agent 协作规范
│   ├── adr/                 # 0001 ~ 0007 架构决策记录
│   └── agents/              # 领域模型、Issue 规范、Triage 标签
├── scripts/                 # 构建与打包脚本 (如 build-dmg.sh)
├── skills/takefive/         # Take Five 的 Agent Skill 定义
└── package.json             # 项目配置与构建脚本
```

---

## 3. 当前开发状态 (Current Status)

- **核心功能完成度**：100% (MVP v1.0 全部功能已就绪)。
- **测试覆盖状态**：26 个测试套件，179 个用例全部通过 (`vitest run`)，TypeScript 类型检查 0 错误。
- **已支持 Agent**：
  - `Claude Code` (`~/.claude/config.json`)
  - `OpenCode` (`~/.opencode/config.json`)
  - `OpenAI Codex` (`~/.codex/config.json`)
  - `Antigravity` (`~/.gemini/config/hooks.json`)
- **已实现 CLI 命令**：`install`, `status`, `config`, `test`, `repair`, `uninstall`, `notify`。
- **打包分发**：已实现 macOS 独立 DMG 打包脚本 (`scripts/build-dmg.sh`) 与 npm 打包配置。

---

## 4. 新设备配置与运行指南 (Setup on a New Machine)

在其他电脑上拉取或同步本项目后，执行以下步骤即可快速恢复开发环境：

### 4.1 环境依赖
- **Node.js**：`>= 18.0.0` (推荐 `20.x` 或 `22.x`)
- **pnpm**：`>= 9.0.0`
- **平台**：macOS 或 Windows（Linux 自动回退为安全存储 Mock 模式）

### 4.2 安装与构建
```bash
# 1. 安装依赖
pnpm install

# 2. 运行完整测试套件
pnpm test

# 3. 执行类型检查
pnpm typecheck

# 4. 构建发布产物 (生成 dist/)
pnpm run build

# 5. (可选) 全局软链接以在本地终端使用 takefive 命令
pnpm link --global
takefive --help
```

### 4.3 常用开发命令
- `pnpm dev`：监听源码变更并自动重新编译。
- `pnpm test:watch`：进入 Vitest 监听模式。
- `pnpm run package:dmg`：(macOS) 自动打包生成 `TakeFive-1.0.0-macOS.dmg`。

---

## 5. 关键架构决策与文档索引 (ADR & Docs Reference)

继续开发时请遵循已有 ADR，避免重复设计或违反核心原则：
- [0001: 无状态 CLI 唤起 (Stateless CLI Invocation)](docs/adr/0001-stateless-cli-invocation.md)
- [0002: 凭据与配置隔离存储 (Credential & Config Storage)](docs/adr/0002-credential-and-config-storage.md)
- [0003: 非破坏性 Hook 注入与备份 (Non-destructive Hook Injection)](docs/adr/0003-non-destructive-hook-injection.md)
- [0004: 事件防抖与空闲抑制 (Event Debouncing & Suppression)](docs/adr/0004-event-debouncing-and-suppression.md)
- [0005: 彻底卸载与零残留 (Total Purge Uninstall)](docs/adr/0005-total-purge-uninstall.md)
- [0006: 通知分组与多语言 (Notification Grouping & i18n)](docs/adr/0006-notification-grouping-and-i18n.md)
- [0007: 代码库架构与工具链 (Codebase Structure & Toolchain)](docs/adr/0007-codebase-structure-and-toolchain.md)
- [产品需求文档 (PRD)](片刻_Take_Five_PRD.md)
- [领域模型与术语规范](docs/agents/domain.md)

---

## 6. 后续工作与扩展建议 (Next Steps & Roadmap)

在新电脑上接续工作时，可优先推进以下演进方向：

1. **CI/CD 自动化**：
   - 配置 GitHub Actions 工作流（`.github/workflows/ci.yml`），实现 PR 自动测试、跨平台构建和 Release 自动发版。
2. **多渠道分发机制**：
   - 发布到 npm 官方仓库（`npx takefive` / `npm install -g takefive`）。
   - 编写 Homebrew Formula（`brew install takefive`）。
   - 制作 Windows 安装包（如 NSIS 或 MSI 便捷安装脚本）。
3. **扩展通知后端 (PRD Phase 2)**：
   - 增加 Telegram Bot、Discord Webhook、飞书 / 企微 Webhook、以及系统原生桌面通知推送通道。
4. **多 Agent 实机长任务端到端验证**：
   - 在真实场景下同时运行 2~3 个不同的 Coding Agent，验证图标区分、分组折叠与防抖效果。

---

## 7. 建议技能 (Suggested Skills)

进行后续开发任务时，建议调用的 Agent 技能：
- **`tdd`**：编写新 Adapter 或新增通知渠道时，坚持测试驱动开发（红-绿-重构）。
- **`codebase-design`**：重构深层模块边界、保持 Adapter 与 Core 的低耦合。
- **`code-review`**：提交 PR 或合并分支前进行规范与 Spec 双轴审查。
- **`diagnosing-bugs`**：排查特定操作系统环境下 Hook 未触发或 Bark 凭据写入异常。
- **`writing-for-agents`**：更新 `AGENTS.md`、`CONTEXT.md` 或扩展 Agent Skill。
