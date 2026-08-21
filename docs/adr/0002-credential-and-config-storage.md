# Credential and Configuration Storage Strategy

User configurations and notification rules are stored in plaintext JSON at `~/.takefive/config.json`, while sensitive Bark server URLs and push keys are exclusively stored in OS-level secure credential stores (macOS Keychain and Windows Credential Manager under service `com.takefive.cli`). This guarantees that sensitive push keys are never exposed in Git, process environment logs, or Agent LLM context windows.
