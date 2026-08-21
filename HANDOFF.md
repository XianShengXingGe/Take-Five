# HANDOFF.md — 片刻 (Take Five)

> **生成时间**：2026-08-21 17:57 CST  
> **当前分支**：`main`（比 origin/main 领先 1 个 commit，尚未 push）  
> **GitHub 仓库**：https://github.com/XianShengXingGe/Take-Five  

---

## 1. 项目简介 (Project Overview)

**片刻 (Take Five)** 是一款面向 Coding Agents 的智能手机推送通知工具。  
当 Agent 任务完成、暂停等待输入或失败时，通过 [Bark](https://github.com/Finb/Bark) 向 iOS 设备发送推送通知，让开发者能及时知晓任务状态，不必盯屏等待。

### 核心设计原则

1. **轻量无守护进程 (Stateless)**：由 Agent 生命周期钩子直接调用 `takefive notify`，完成推送后立即退出，零常驻开销。
2. **轻量 Adapter + 统一 Core**：Adapter 只负责翻译生命周期事件；通知等级、防抖（2s 冷却）、多语言、模板与 Bark 推送全部由 Core 处理。
3. **敏感凭据隔离**：Bark URL 仅存入 OS 安全存储（macOS Keychain），不入 Git，不入 Agent 上下文，不落明文日志。

---

## 2. 当前开发状态 (Current Status)

| 项目 | 状态 |
|------|------|
| **MVP 功能完成度** | ✅ 100% — 所有计划中的 v1.0 功能已实现 |
| **测试套件** | ✅ 26 个测试文件，179 个用例，全部通过（`vitest run` 1.88s） |
| **TypeScript 类型检查** | ✅ 0 错误 |
| **Git 状态** | ⚠️ 本地比 origin 领先 1 commit（`cb3f5a2`），需要 `git push` |

### 已关闭的 GitHub Issues（全部完成）

| Issue | 标题 |
|-------|------|
| #1 | Spec: Take Five MVP |
| #2 | Project Scaffold, Domain Types, and Mock Test Harness |
| #3 | Core Notification Engine, Bark Client, and CLI Dispatch Pipeline |
| #4 | Interactive CLI Setup Wizard and Push Testing |
| #5 | Claude Code and OpenCode Adapters with Non-Destructive Hook Injection |
| #6 | OpenAI Codex and Antigravity Adapters Integration |
| #7 | System Management CLI (status, config, repair, uninstall) |

---

## 3. 代码仓库结构 (Repository Map)

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
│   │   ├── bark-client.ts           # Bark HTTP API 客户端
│   │   ├── config-manager.ts        # ~/.takefive/config.json 读写管理
│   │   ├── credential-store.ts      # OS 级安全凭据存储
│   │   ├── debouncer.ts             # 2s 窗口防抖与抑制逻辑
│   │   ├── notification-dispatcher.ts # 核心派发管道 (事件→模板→Bark)
│   │   ├── paths.ts                 # 全局路径配置常量
│   │   ├── project-detector.ts      # 工作区/Git 项目名提取
│   │   └── template-engine.ts       # 消息模板渲染与图标解析
│   ├── i18n/                # 国际化支持 (zh-CN, en)
│   ├── testing/             # 模拟测试工具 (MockBarkDispatcher, MockCredentialStore)
│   ├── types/               # 全局 TypeScript 领域类型定义
│   └── bin.ts               # CLI 可执行文件入口
├── tests/                   # 26 个测试套件，179 个单元/集成测试
├── assets/                  # Agent 图标等静态资源 (本地 + jsDelivr CDN)
├── docs/                    # 架构决策记录 (ADRs) 与 Agent 协作规范
│   ├── adr/                 # 0001 ~ 0007 架构决策记录
│   └── agents/              # 领域模型、Issue 规范、Triage 标签
├── scripts/                 # 构建与打包脚本 (build-dmg.sh)
├── skills/takefive/         # Take Five 的 Agent Skill 定义
├── AGENTS.md                # Agent 协作规范
├── CONTEXT.md               # 领域词汇表
└── package.json             # 项目配置
```

---

## 4. 新设备环境配置 (Setup on a New Machine)

### 4.1 环境依赖

- **Node.js**：`>= 18.0.0`（推荐 20.x 或 22.x）
- **pnpm**：`>= 9.0.0`
- **平台**：macOS 或 Windows（Linux 回退为 Mock 安全存储模式）

### 4.2 安装与构建

```bash
# 1. 克隆仓库（如果是新设备）
git clone https://github.com/XianShengXingGe/Take-Five.git
cd Take-Five

# 2. 安装依赖
pnpm install

# 3. 运行完整测试套件（验证环境）
pnpm test

# 4. 类型检查
pnpm typecheck

# 5. 构建发布产物（生成 dist/）
pnpm run build

# 6. （可选）全局软链接以使用 takefive 命令
pnpm link --global
takefive --help
```

> ⚠️ **注意**：在新设备首次 `takefive install` 时，向导会引导您输入 Bark URL，
> 安全地存入 macOS Keychain。**不要**手动硬编码 Bark URL 到任何配置文件中。

### 4.3 常用开发命令

| 命令 | 功能 |
|------|------|
| `pnpm dev` | 监听源码变更，自动重新编译 |
| `pnpm test:watch` | Vitest 监听模式 |
| `pnpm run package:dmg` | (macOS) 打包生成 `TakeFive-1.0.0-macOS.dmg` |

---

## 5. 关键架构决策 (ADR 索引)

继续开发前请阅读已有 ADR，避免违反核心原则：

- [ADR-0001: 无状态 CLI 唤起](docs/adr/0001-stateless-cli-invocation.md)
- [ADR-0002: 凭据与配置隔离存储](docs/adr/0002-credential-and-config-storage.md)
- [ADR-0003: 非破坏性 Hook 注入与备份](docs/adr/0003-non-destructive-hook-injection.md)
- [ADR-0004: 事件防抖与空闲抑制](docs/adr/0004-event-debouncing-and-suppression.md)
- [ADR-0005: 彻底卸载与零残留](docs/adr/0005-total-purge-uninstall.md)
- [ADR-0006: 通知分组与多语言](docs/adr/0006-notification-grouping-and-i18n.md)
- [ADR-0007: 代码库架构与工具链](docs/adr/0007-codebase-structure-and-toolchain.md)
- [产品需求文档 (PRD)](片刻_Take_Five_PRD.md)
- [领域词汇表](CONTEXT.md)

---

## 6. 待办事项与后续工作 (Next Steps)

MVP v1.0 已全部实现，建议后续按以下优先级推进：

### 🔴 立即处理
- [ ] **`git push` 到 origin**：本地 `main` 比远端领先 1 个 commit（`cb3f5a2 docs: add project handoff document`），需要 push 同步。

### 🟡 近期推进
- [ ] **CI/CD 自动化**：配置 GitHub Actions（`.github/workflows/ci.yml`），实现 PR 自动测试 + 跨平台构建 + Release 自动发版。
- [ ] **npm 发布**：发布到 npm 官方仓库（`npx takefive` / `npm install -g takefive`）。
- [ ] **Homebrew Formula**：编写 `brew install takefive` 支持。

### 🟢 中长期演进
- [ ] **多通知渠道（PRD Phase 2）**：Telegram Bot、Discord Webhook、飞书/企微 Webhook、系统原生桌面通知。
- [ ] **Windows 安装包**：NSIS 或 MSI 安装脚本。
- [ ] **多 Agent 端到端验证**：同时运行 2~3 个不同 Coding Agent，验证图标区分、分组折叠与防抖效果。

---

## 7. 建议调用的 Agent 技能 (Suggested Skills)

| 技能 | 适用场景 |
|------|----------|
| `tdd` | 新增 Adapter 或通知渠道时，坚持红-绿-重构 |
| `codebase-design` | 重构深层模块边界，保持 Adapter 与 Core 低耦合 |
| `code-review` | 提交 PR 或合并分支前进行规范与 Spec 双轴审查 |
| `diagnosing-bugs` | 排查特定 OS 环境下 Hook 未触发或 Bark 凭据异常 |
| `writing-for-agents` | 更新 `AGENTS.md`、`CONTEXT.md` 或扩展 Agent Skill |
| `wizard` | 为用户构建新平台（Windows/Linux）的安装引导脚本 |
