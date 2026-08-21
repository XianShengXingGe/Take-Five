# Complete Purge on Uninstallation

Running `takefive uninstall` performs a complete purge by default: it reverts all injected agent hooks from backups, removes the `~/.takefive/` configuration and cache directories, and deletes the `com.takefive.cli` entry from the OS secure keychain / credential store. This leaves no orphan files or dangling hooks on the developer's system.
