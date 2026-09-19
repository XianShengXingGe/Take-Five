import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AdapterInstallOptions,
  AdapterInstallResult,
  AdapterUninstallOptions,
  AdapterUninstallResult,
  HookStatus,
} from '../types/adapter.js';
import type { SupportedAgent, UnifiedEventType } from '../types/event.js';
import { BaseAdapter } from './base-adapter.js';

const OPENCODE_EVENTS: UnifiedEventType[] = [
  'task_completed',
  'waiting_input',
  'waiting_permission',
  'task_failed',
];

const PLUGIN_MARKER = 'Take Five OpenCode adapter v2';

/** OpenCode's supported integration is a global local plugin, not config hooks. */
export class OpenCodeAdapter extends BaseAdapter {
  readonly id: SupportedAgent = 'opencode';
  readonly displayName = 'OpenCode';

  getOpenCodeDir(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    return (
      resolved.OPENCODE_CONFIG_DIR?.trim() ||
      resolved.OPENCODE_HOME?.trim() ||
      join(this.getHomeDir(env), '.config', 'opencode')
    );
  }

  getConfigPath(env?: Record<string, string | undefined>): string {
    const resolved = this.resolveEnv(env);
    return (
      resolved.OPENCODE_PLUGIN_PATH?.trim() ||
      resolved.OPENCODE_CONFIG_PATH?.trim() ||
      join(this.getOpenCodeDir(env), 'plugins', 'takefive.js')
    );
  }

  async detectEnvironment(env?: Record<string, string | undefined>): Promise<boolean> {
    const home = this.getHomeDir(env);
    const candidates = [
      this.getOpenCodeDir(env),
      join(home, '.opencode'),
      join(home, '.config', 'opencode'),
      join(home, 'Applications', 'OpenCode.app'),
      join(home, 'Library', 'Application Support', 'opencode'),
      join(home, 'Library', 'Application Support', 'ai.opencode.desktop'),
    ];
    if (!env?.HOME) {
      candidates.push('/Applications/OpenCode.app');
    }
    for (const candidate of candidates) {
      try {
        if ((await stat(candidate)).isDirectory()) return true;
      } catch {
        // Keep scanning known macOS and Windows locations.
      }
    }
    return false;
  }

  async getHookStatus(env?: Record<string, string | undefined>): Promise<HookStatus> {
    const configPath = this.getConfigPath(env);
    const source = await this.backupManager.readText(configPath);
    const installed = Boolean(source?.includes(PLUGIN_MARKER));
    const hooks: HookStatus['hooks'] = {};
    if (installed) {
      for (const event of OPENCODE_EVENTS) hooks[event] = `OpenCode plugin: ${event}`;
    }
    return {
      detected: await this.detectEnvironment(env),
      installed,
      configPath,
      backupExists: await this.backupManager.hasBackup(configPath),
      hooks,
    };
  }

  async install(options: AdapterInstallOptions = {}): Promise<AdapterInstallResult> {
    const configPath = options.configPath ?? this.getConfigPath(options.env);
    try {
      const existing = await this.backupManager.readText(configPath);
      if (existing?.includes(PLUGIN_MARKER) && !options.force) {
        return {
          agent: this.id,
          success: true,
          configPath,
          backupPath: (await this.backupManager.hasBackup(configPath))
            ? this.backupManager.getBackupPath(configPath)
            : undefined,
          hooksInjected: [...OPENCODE_EVENTS],
          alreadyInstalled: true,
        };
      }
      const backupPath = (await this.backupManager.createBackup(configPath)) ?? undefined;
      await this.backupManager.atomicWriteText(configPath, this.buildPluginSource(options.env));

      try {
        const pkgJsonPath = join(this.getOpenCodeDir(options.env), 'package.json');
        const pkg = await this.backupManager.readJson<Record<string, unknown>>(pkgJsonPath);
        if (pkg && typeof pkg === 'object' && pkg.type !== 'module') {
          await this.backupManager.atomicWriteJson(pkgJsonPath, { ...pkg, type: 'module' });
        }
      } catch {
        // package.json adjustment is best-effort
      }
      return {
        agent: this.id,
        success: true,
        configPath,
        backupPath,
        hooksInjected: [...OPENCODE_EVENTS],
        alreadyInstalled: false,
      };
    } catch (error: unknown) {
      return this.makeInstallFailure(configPath, error);
    }
  }

  async uninstall(options: AdapterUninstallOptions = {}): Promise<AdapterUninstallResult> {
    const configPath = options.configPath ?? this.getConfigPath(options.env);
    try {
      const restored = await this.backupManager.restoreBackup(configPath);
      if (!restored) await this.backupManager.removeFile(configPath);
      return {
        agent: this.id,
        success: true,
        configPath,
        restoredFromBackup: restored,
        hooksRemoved: [...OPENCODE_EVENTS],
      };
    } catch (error: unknown) {
      return this.makeUninstallFailure(configPath, error);
    }
  }

  mapLifecycleEvent(rawEvent: string): UnifiedEventType | null {
    const normalized = rawEvent.trim().toLowerCase();
    if (['session.idle', 'task_completed', 'completed'].includes(normalized)) return 'task_completed';
    if (
      [
        'permission.asked',
        'permission.v2.asked',
        'permission.ask',
        'waiting_permission',
      ].includes(normalized)
    )
      return 'waiting_permission';
    if (['session.error', 'task_failed', 'error'].includes(normalized)) return 'task_failed';
    if (
      [
        'question.asked',
        'question.v2.asked',
        'waiting_input',
        'agent_needs_input',
        'ask_question',
      ].includes(normalized)
    )
      return 'waiting_input';
    return null;
  }

  private buildPluginSource(env?: Record<string, string | undefined>): string {
    const cliArgv = JSON.stringify(this.getCliArgv(env));
    return (
      `// ${PLUGIN_MARKER}\n` +
      `// Generated by Take Five. Re-run \`takefive repair --agent opencode\` to refresh.\n` +
      `import { spawn } from "node:child_process";\n` +
      `import { delimiter } from "node:path";\n\n` +
      `const TAKEFIVE_CLI = ${cliArgv};\n` +
      `const busySessions = new Set();\n\n` +
      `function notify(eventType, directory, reason) {\n` +
      `  if (!Array.isArray(TAKEFIVE_CLI) || TAKEFIVE_CLI.length === 0) return;\n` +
      `  const bin = TAKEFIVE_CLI[0];\n` +
      `  const args = [...TAKEFIVE_CLI.slice(1), \"notify\", \"--agent\", \"opencode\", \"--event\", eventType, \"--hook\", \"--quiet\"];\n` +
      `  if (directory) args.push(\"--project\", String(directory));\n` +
      `  if (reason) args.push(\"--reason\", String(reason).slice(0, 240));\n` +
      `  try {\n` +
      `    const customEnv = { ...process.env };\n` +
      `    const extraPaths = process.platform === \"win32\"\n` +
      `      ? []\n` +
      `      : [\"/opt/homebrew/bin\", \"/usr/local/bin\"];\n` +
      `    const existingPath = customEnv.PATH || (process.platform === \"win32\" ? \"\" : \"/usr/bin:/bin\");\n` +
      `    customEnv.PATH = extraPaths.length > 0 && existingPath\n` +
      `      ? [...extraPaths, existingPath].join(delimiter)\n` +
      `      : existingPath;\n` +
      `    const child = spawn(bin, args, {\n` +
      `      cwd: directory || undefined,\n` +
      `      stdio: \"ignore\",\n` +
      `      detached: true,\n` +
      `      env: customEnv,\n` +
      `    });\n` +
      `    child.on?.(\"error\", () => {});\n` +
      `    child.unref?.();\n` +
      `  } catch { /* Notifications must never interrupt OpenCode. */ }\n` +
      `}\n\n` +
      `export const TakeFivePlugin = async ({ directory } = {}) => ({\n` +
      `  event: async ({ event } = {}) => {\n` +
      `    if (!event || !event.type) return;\n` +
      `    const sessionID = event.properties?.sessionID || event.properties?.session?.id || event.properties?.id || \"root\";\n` +
      `    const isSubagent = Boolean(\n` +
      `      event.properties?.parentID ||\n` +
      `      event.properties?.parentSessionID ||\n` +
      `      event.properties?.session?.parentID\n` +
      `    );\n` +
      `    const status = event.properties?.status;\n` +
      `    const statusType = typeof status === \"object\" && status !== null ? status.type : status;\n` +
      `    if (statusType === \"busy\" || event.type === \"session.busy\" || event.type === \"message.part.added\" || event.type === \"user.prompt\") {\n` +
      `      if (!isSubagent) {\n` +
      `        busySessions.add(sessionID);\n` +
      `      }\n` +
      `    }\n` +
      `    const isIdle = event.type === \"session.idle\" || (\n` +
      `      event.type === \"session.status\" && statusType === \"idle\"\n` +
      `    );\n` +
      `    if (isIdle && !isSubagent) {\n` +
      `      if (busySessions.has(sessionID)) {\n` +
      `        busySessions.delete(sessionID);\n` +
      `        notify(\"task_completed\", directory);\n` +
      `      }\n` +
      `    } else if (event.type === \"question.asked\" || event.type === \"question.v2.asked\") {\n` +
      `      const questionText = event.properties?.questions?.[0]?.question || event.properties?.question || event.properties?.message;\n` +
      `      notify(\"waiting_input\", directory, questionText);\n` +
      `    } else if (event.type === \"permission.asked\" || event.type === \"permission.v2.asked\" || event.type === \"permission.ask\") {\n` +
      `      const permissionReason = event.properties?.permission || event.properties?.action || event.properties?.tool?.callID;\n` +
      `      notify(\"waiting_permission\", directory, permissionReason);\n` +
      `    } else if (event.type === \"session.error\") {\n` +
      `      busySessions.delete(sessionID);\n` +
      `      notify(\"task_failed\", directory, event.properties?.error?.message ?? event.properties?.error ?? event.properties?.message);\n` +
      `    }\n` +
      `  },\n` +
      `  \"permission.ask\": async (input) => {\n` +
      `    notify(\"waiting_permission\", directory, input?.permission || input?.action || input?.tool);\n` +
      `  },\n` +
      `});\n\n` +
      `export default TakeFivePlugin;\n`
    );
  }
}


