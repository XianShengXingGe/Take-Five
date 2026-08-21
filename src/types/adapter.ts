import type { SupportedAgent, UnifiedEventType } from './event.js';

/**
 * Status of Take Five hook registration for a specific agent.
 */
export interface HookStatus {
  /** Whether the agent environment/directory was detected on disk */
  detected: boolean;
  /** Whether Take Five hooks are properly installed and valid */
  installed: boolean;
  /** Resolved configuration file path */
  configPath: string;
  /** Whether a pristine backup file (.takefive.bak) exists */
  backupExists: boolean;
  /** Currently registered Take Five hook commands by unified event type */
  hooks: Partial<Record<UnifiedEventType, string>>;
}

/**
 * Options passed when installing an adapter hook.
 */
export interface AdapterInstallOptions {
  /** Custom environment variable overrides (e.g. for testing) */
  env?: Record<string, string | undefined>;
  /** Optional explicit configuration file path override */
  configPath?: string;
  /** Whether to force reinstall */
  force?: boolean;
}

/**
 * Result of an adapter hook installation attempt.
 */
export interface AdapterInstallResult {
  /** Agent identifier */
  agent: SupportedAgent;
  /** Whether installation succeeded */
  success: boolean;
  /** Target configuration file path modified */
  configPath: string;
  /** Path of the backup file created, if any */
  backupPath?: string;
  /** List of unified event types for which hooks were injected */
  hooksInjected: UnifiedEventType[];
  /** Whether the hooks were already present (no drift) */
  alreadyInstalled?: boolean;
  /** Error message if installation failed */
  error?: string;
}

/**
 * Options passed when uninstalling an adapter hook.
 */
export interface AdapterUninstallOptions {
  /** Custom environment variable overrides */
  env?: Record<string, string | undefined>;
  /** Optional explicit configuration file path override */
  configPath?: string;
}

/**
 * Result of an adapter hook removal attempt.
 */
export interface AdapterUninstallResult {
  /** Agent identifier */
  agent: SupportedAgent;
  /** Whether uninstallation succeeded */
  success: boolean;
  /** Target configuration file path */
  configPath: string;
  /** Whether configuration was restored from a .takefive.bak backup */
  restoredFromBackup: boolean;
  /** List of unified event types for which hooks were removed */
  hooksRemoved: UnifiedEventType[];
  /** Error message if uninstallation failed */
  error?: string;
}

/**
 * Contract for all Coding Agent integration adapters.
 */
export interface AgentAdapter {
  /** Unique agent identifier matching SupportedAgent */
  readonly id: SupportedAgent;
  /** Human-readable display name (e.g. "Claude Code", "OpenCode") */
  readonly displayName: string;

  /**
   * Checks whether the agent's installation directory or runtime is present on the machine.
   */
  detectEnvironment(env?: Record<string, string | undefined>): Promise<boolean>;

  /**
   * Resolves the standard configuration file path for the agent.
   */
  getConfigPath(env?: Record<string, string | undefined>): string;

  /**
   * Inspects the agent configuration to check if Take Five hooks are active.
   */
  getHookStatus(env?: Record<string, string | undefined>): Promise<HookStatus>;

  /**
   * Injects Take Five notification hooks non-destructively with automatic backup creation.
   */
  install(options?: AdapterInstallOptions): Promise<AdapterInstallResult>;

  /**
   * Restores original agent configuration from backup or surgically removes Take Five hooks.
   */
  uninstall(options?: AdapterUninstallOptions): Promise<AdapterUninstallResult>;

  /**
   * Maps agent-specific lifecycle event strings or triggers to Take Five unified event types.
   */
  mapLifecycleEvent(rawEvent: string): UnifiedEventType | null;

  /**
   * Generates the standard CLI invocation command for a lifecycle event.
   */
  generateNotifyCommand(
    eventType: UnifiedEventType,
    options?: { project?: string; reason?: string },
  ): string;
}
