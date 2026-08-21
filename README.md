# Take Five (片刻)

> Get a phone notification the moment your AI coding agent finishes — so you can step away and come back at exactly the right time.

**English** · [中文](#中文)

---

## The Problem

You're running an AI coding agent — it might take 2 minutes or 20. So you sit there, staring at the screen, hitting refresh, waiting.

Or you walk away and miss the moment it needs your input. The agent is stuck, burning time. You come back 30 minutes later to find it waited for you the whole time.

**Take Five** solves this: the moment anything important happens, your phone buzzes.

---

## What It Does

Take Five hooks into your AI coding agent. When the agent finishes a task, gets stuck waiting for you, or runs into an error — you get a push notification on your iPhone or iPad **instantly**.

You can step away from your computer with confidence. Take Five will call you back.

---

## Who It's For

Anyone who uses an AI coding agent on their Mac and doesn't want to babysit it.

---

## How to Use

### Step 1 — Get the Bark app

[Bark](https://apps.apple.com/app/bark-custom-notifications/id1403753865) is a free iPhone app that receives push notifications. Install it on your phone.

After opening Bark, you'll see your personal notification URL — it looks like:

```
https://api.day.app/YOUR_KEY/
```

Copy it. You'll need it in Step 3.

### Step 2 — Install Take Five on your Mac

Download `TakeFive-0.1-macOS.dmg` from the [Releases](https://github.com/XianShengXingGe/Take-Five/releases) page. Open the DMG and double-click **一键安装 Take Five**.

> Requires [Node.js](https://nodejs.org) (v18 or later) to already be installed on your Mac.

### Step 3 — Set up

The installer will walk you through two things:

1. **Paste your Bark URL** — Take Five sends a test notification to confirm your phone is connected.
2. **Choose your language** — notifications can be sent in English or Chinese.

That's it. Take Five automatically wires itself into your coding agent.

### Step 4 — Walk away

Your agent runs. You go do something else. When it finishes — or needs you — your phone buzzes.

---

## Commands

Once installed, open any terminal:

| Command | What it does |
|---|---|
| `takefive status` | Check connection and which agents are hooked in |
| `takefive test` | Send a test notification to your phone |
| `takefive config` | Change language, notification rules, and more |
| `takefive repair` | Fix hooks if an agent update broke them |
| `takefive uninstall` | Remove everything cleanly |

---

## Supported Agents

| Agent | Status |
|---|---|
| [Antigravity](https://antigravity.dev) | ✅ Tested |
| Claude Code | ⚠️ Integrated, not fully tested |
| Codex | ⚠️ Integrated, not fully tested |
| OpenCode | ⚠️ Integrated, not fully tested |

> **v0.1 note:** Only Antigravity has been fully tested. Other agents are integrated but may have rough edges. Please open an issue if you run into problems.

---

## Notification Events

Take Five watches for four types of events:

- ✅ **Task completed** — the agent finished its work
- ⌨️ **Waiting for input** — the agent is asking you a question
- 🔐 **Waiting for permission** — the agent needs your approval to proceed
- ❌ **Task failed** — something went wrong

---

## License

MIT

---

---

<a name="中文"></a>

# Take Five（片刻）

> AI 编程助手跑任务的时候，你不用盯着屏幕了——任务完成、卡住、出错，手机立刻收到推送。

---

## 痛点

你挂着 AI 编程助手跑任务，不知道要跑 2 分钟还是 20 分钟。

盯着屏幕等——浪费时间。

走开去做别的——又怕错过它等你回复的那一刻。等你回来，发现 AI 助手已经卡在那儿等了你半小时。

**Take Five** 的解决方案很简单：只要发生任何重要的事，手机立刻震动。

---

## 它做什么

Take Five 接入你的 AI 编程助手。任务完成、等待你输入、遇到错误——**你的 iPhone 或 iPad 会立刻收到推送通知**。

放心离开电脑。Take Five 会叫你回来。

---

## 适合谁用

在 Mac 上使用 AI 编程助手、不想一直盯着屏幕的开发者。

---

## 怎么用

### 第一步 — 装 Bark app

[Bark](https://apps.apple.com/app/bark-custom-notifications/id1403753865) 是一款免费的 iPhone 应用，用来接收推送通知。先在手机上安装好。

打开 Bark 后，你会看到你专属的推送地址，大概长这样：

```
https://api.day.app/YOUR_KEY/
```

复制好，第三步要用。

### 第二步 — 在 Mac 上安装 Take Five

从 [Releases](https://github.com/XianShengXingGe/Take-Five/releases) 页面下载 `TakeFive-0.1-macOS.dmg`，打开 DMG 后双击**一键安装 Take Five**。

> 需要提前安装 [Node.js](https://nodejs.org)（v18 及以上）。

### 第三步 — 配置

安装程序会引导你完成两件事：

1. **粘贴你的 Bark 地址** — Take Five 会发一条测试通知，确认手机连通。
2. **选择通知语言** — 支持中文和英文。

完成后，Take Five 自动接入你的 AI 助手。

### 第四步 — 放心离开

助手在跑，你去干别的。任务完成——或者它需要你——手机自然会提醒你。

---

## 命令列表

安装完成后，在任意终端输入：

| 命令 | 说明 |
|---|---|
| `takefive status` | 查看连接状态和各助手的钩子是否正常 |
| `takefive test` | 向手机发送一条测试推送 |
| `takefive config` | 修改语言、通知规则等配置 |
| `takefive repair` | 修复因助手更新导致的钩子失效 |
| `takefive uninstall` | 完整卸载，清除所有配置和钩子 |

---

## 支持的 AI 助手

| 助手 | 状态 |
|---|---|
| [Antigravity](https://antigravity.dev) | ✅ 已测试 |
| Claude Code | ⚠️ 已接入，未完整测试 |
| Codex | ⚠️ 已接入，未完整测试 |
| OpenCode | ⚠️ 已接入，未完整测试 |

> **v0.1 说明：** 目前只有 Antigravity 经过完整测试。其他助手已接入但可能有问题，欢迎提 issue 反馈。

---

## 推送触发场景

Take Five 监听四类事件：

- ✅ **任务完成** — 助手跑完了
- ⌨️ **等待输入** — 助手在问你问题
- 🔐 **等待授权** — 助手需要你确认才能继续
- ❌ **任务失败** — 出错了

---

## 开源协议

MIT
