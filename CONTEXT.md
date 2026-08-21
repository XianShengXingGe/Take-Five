# Take Five (片刻)

A smart notification tool for Coding Agents that alerts developers via mobile push when tasks complete, pause, or fail.

## Language

**Notification Core**:
The central engine responsible for event evaluation, notification levels, message templating, icon resolution, and Bark API dispatch.
_Avoid_: Backend, server, daemon

**Agent Adapter**:
A lightweight integration layer (hook, plugin, or wrapper) attached to a specific Coding Agent that translates agent lifecycle events into unified Take Five events.
_Avoid_: Client, extension, middleware

**Unified Event**:
A standardized lifecycle event emitted by an Adapter to the Core (`task_completed`, `waiting_input`, `waiting_permission`, `task_failed`).
_Avoid_: Message, payload, notification item

**Notification Level**:
The urgency tier mapped to Apple APNs / Bark push priorities (`passive` / 静默, `active` / 普通, `timeSensitive` / 重要, `critical` / 强提醒).
_Avoid_: Notification channel, importance score

**Project Name**:
The human-readable label identifying the workspace context where an agent is running, derived from the Git root directory or current working directory.
_Avoid_: Workspace ID, repository slug

**Debounce Window**:
The cooldown interval (default 2s) during which duplicate or rapid-fire events for the same agent and project are coalesced to prevent push flooding.
_Avoid_: Throttle delay, sleep timer

**Hook Manifest**:
The backup and tracking record of modifications injected into agent configuration files, used to ensure idempotent updates and clean rollbacks.
_Avoid_: Patch registry, install table

**Notification Template**:
The localized set of emoji, title, and body strings configured for each unified event in a user's active language.
_Avoid_: Text mapping, localization string
