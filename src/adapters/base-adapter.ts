import { homedir } from 'node:os';
import type {
  AdapterInstallOptions,
  AdapterInstallResult,
  AdapterUninstallOptions,
  AdapterUninstallResult,
  AgentAdapter,
  HookStatus,
} from '../types/adapter.js';
import type { SupportedAgent, UnifiedEventType } from '../types/event.js';
import { BackupManager } from './backup-manager.js';

export abstract class BaseAdapter implements AgentAdapter {
  abstract readonly id: SupportedAgent;
  abstract readonly displayName: string;

  protected backupManager: BackupManager;

  constructor(backupManager?: BackupManager) {
    this.backupManager = backupManager ?? new BackupManager();
  }

  abstract detectEnvironment(env?: Record<string, string | undefined>): Promise<boolean>;
  abstract getConfigPath(env?: Record<string, string | undefined>): string;
  abstract getHookStatus(env?: Record<string, string | undefined>): Promise<HookStatus>;
  abstract install(options?: AdapterInstallOptions): Promise<AdapterInstallResult>;
  abstract uninstall(options?: AdapterUninstallOptions): Promise<AdapterUninstallResult>;
  abstract mapLifecycleEvent(rawEvent: string): UnifiedEventType | null;

  generateNotifyCommand(
    eventType: UnifiedEventType,
    options?: { project?: string; reason?: string },
  ): string {
    let cmd = `takefive notify --agent ${this.id} --event ${eventType}`;
    if (options?.project && options.project.trim().length > 0) {
      cmd += ` --project "${options.project.trim()}"`;
    }
    if (options?.reason && options.reason.trim().length > 0) {
      cmd += ` --reason "${options.reason.trim()}"`;
    }
    return cmd;
  }

  protected resolveEnv(
    env?: Record<string, string | undefined>,
  ): Record<string, string | undefined> {
    return env ?? process.env;
  }

  protected getHomeDir(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    if (resolved.HOME && resolved.HOME.trim().length > 0) {
      return resolved.HOME.trim();
    }
    if (resolved.USERPROFILE && resolved.USERPROFILE.trim().length > 0) {
      return resolved.USERPROFILE.trim();
    }
    return homedir();
  }
}
