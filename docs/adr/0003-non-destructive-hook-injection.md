# Non-destructive Hook Injection with Automated Backups

To integrate with various Coding Agents (Claude Code, OpenCode, Codex, Antigravity) without disrupting user setups, Take Five modifies existing configuration files in-place using idempotent merging, while creating timestamped backups (`*.takefive.bak`) before any mutation. This avoids invasive binary wrapping and enables exact rollback during repair or uninstallation.
