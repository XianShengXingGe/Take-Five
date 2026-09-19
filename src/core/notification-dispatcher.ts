import type { BarkPushPayload, BarkPushResponse } from '../types/bark.js';
import type { CredentialStore } from '../types/credential.js';
import type { SupportedAgent, UnifiedEvent, UnifiedEventType } from '../types/event.js';
import type { ParsedHookPayload } from '../types/adapter.js';
import { getAdapter } from '../adapters/index.js';
import { BarkClient } from './bark-client.js';
import { ConfigManager } from './config-manager.js';
import { OsCredentialStore } from './credential-store.js';
import { Debouncer } from './debouncer.js';
import { detectProjectName } from './project-detector.js';
import { TemplateEngine } from './template-engine.js';

export type DispatchStatus =
  | 'dispatched'
  | 'debounced'
  | 'agent_disabled'
  | 'event_disabled'
  | 'missing_credential'
  | 'skipped'
  | 'failed';

export interface DispatchResult {
  status: DispatchStatus;
  payload?: BarkPushPayload;
  response?: BarkPushResponse;
  error?: string;
  isPreToolUse?: boolean;
  decision?: 'ask' | 'stop';
}

export interface DispatchInput {
  agent: SupportedAgent;
  type: UnifiedEventType;
  action?: string;
  project?: string;
  cwd?: string;
  reason?: string;
  timestamp?: number;
  threadId?: string;
  turnId?: string;
  fingerprint?: string;
  env?: Record<string, string | undefined>;
}

export interface DispatchOptions {
  barkUrlOverride?: string;
  force?: boolean;
}

export interface NotificationDispatcherOptions {
  configManager?: ConfigManager;
  debouncer?: Debouncer;
  barkClient?: BarkClient;
  credentialStore?: CredentialStore;
  templateEngine?: TemplateEngine;
}

/**
 * Deep orchestrator module that coordinates workspace detection, config rules,
 * agent enablement checks, debounce suppression, credential lookup, template rendering,
 * and Bark HTTP dispatching.
 */
export class NotificationDispatcher {
  private configManager: ConfigManager;
  private debouncer: Debouncer;
  private barkClient: BarkClient;
  private credentialStore: CredentialStore;
  private templateEngine: TemplateEngine;

  constructor(options: NotificationDispatcherOptions = {}) {
    this.configManager = options.configManager ?? new ConfigManager();
    this.debouncer = options.debouncer ?? new Debouncer();
    this.barkClient = options.barkClient ?? new BarkClient();
    this.credentialStore = options.credentialStore ?? new OsCredentialStore();
    this.templateEngine = options.templateEngine ?? new TemplateEngine();
  }

  /**
   * Executes the full notification dispatch pipeline for a unified lifecycle event or input.
   */
  async dispatch(input: UnifiedEvent | DispatchInput, options: DispatchOptions = {}): Promise<DispatchResult> {
    const projectName =
      input.project && input.project.trim().length > 0
        ? input.project.trim()
        : detectProjectName({
            explicitProject: input.project,
            cwd: (input as DispatchInput).cwd,
            env: (input as DispatchInput).env,
          });

    const fallbackFingerprint =
      'threadId' in input && input.threadId && input.turnId
        ? `${input.agent}:${input.threadId}:${input.turnId}`
        : undefined;
    const fingerprint = input.fingerprint || fallbackFingerprint;

    const event: UnifiedEvent = {
      agent: input.agent,
      type: input.type,
      project: projectName,
      reason: input.reason,
      timestamp: input.timestamp ?? Date.now(),
      fingerprint,
    };

    const config = await this.configManager.loadConfig();

    // 1. Check if agent is enabled
    if (config.enabledAgents[event.agent] === false) {
      return { status: 'agent_disabled' };
    }

    // 2. Check if event type is enabled
    const rule = config.events[event.type];
    if (rule && rule.enabled === false) {
      return { status: 'event_disabled' };
    }

    // 3. Debounce check
    if (!options.force) {
      const debounceCheck = await this.debouncer.checkAndRecord(
        event.agent,
        event.project,
        event.timestamp,
        event.fingerprint,
      );
      if (debounceCheck.debounced) {
        return { status: 'debounced' };
      }
    }

    // 4. Resolve Bark push endpoint URL
    const barkUrl = options.barkUrlOverride || (await this.credentialStore.getBarkUrl());
    if (!barkUrl || barkUrl.trim().length === 0) {
      return {
        status: 'missing_credential',
        error: 'Bark URL is not configured in OS Credential Store.',
      };
    }

    // 5. Render notification payload
    const payload = this.templateEngine.render(event, config);

    // 6. Push payload to Bark
    try {
      const response = await this.barkClient.push(barkUrl.trim(), payload);
      return {
        status: 'dispatched',
        payload,
        response,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        status: 'failed',
        payload,
        error: errorMsg,
      };
    }
  }

  /**
   * Parses stdin hook payloads from Coding Agents, applies adapter payload mapping,
   * handles skip checks, and executes end-to-end dispatch.
   */
  async dispatchFromHook(
    rawStdin: string,
    fallback: DispatchInput,
    options: DispatchOptions = {},
  ): Promise<DispatchResult> {
    let eventType: UnifiedEventType = fallback.type;
    let reason: string | undefined = fallback.reason;
    let projectCwd: string | undefined = fallback.cwd;
    let payloadObj: Record<string, unknown> = {
      event: fallback.action,
      type: fallback.action,
      action: fallback.action,
      cwd: fallback.cwd,
      threadId: fallback.threadId,
      turnId: fallback.turnId,
      env: fallback.env,
    };
    let isPreToolUse = false;

    if (rawStdin && rawStdin.trim().length > 0) {
      try {
        const parsedStdin = JSON.parse(rawStdin.trim()) as Record<string, unknown>;
        payloadObj = { ...payloadObj, ...parsedStdin };
      } catch {
        // Fallback to default input on malformed JSON
      }
    }

    let parsed: ParsedHookPayload | undefined;
    const adapter = getAdapter(fallback.agent);
    if (adapter?.parseHookPayload) {
      parsed = await adapter.parseHookPayload(payloadObj, fallback.type, fallback.reason);
      isPreToolUse = parsed.isPreToolUse;
      if (parsed.shouldSkip) {
        return {
          status: 'skipped',
          isPreToolUse,
          decision: isPreToolUse ? 'ask' : 'stop',
        };
      }
      eventType = parsed.eventType;
      if (parsed.reason) {
        reason = parsed.reason;
      }
      if (parsed.projectCwd) {
        projectCwd = parsed.projectCwd;
      }
    }

    const result = await this.dispatch(
      {
        ...fallback,
        type: eventType,
        reason,
        cwd: projectCwd,
        threadId: parsed?.threadId || fallback.threadId,
        turnId: parsed?.turnId || fallback.turnId,
        fingerprint: parsed?.fingerprint || fallback.fingerprint,
      },
      options,
    );

    return {
      ...result,
      isPreToolUse,
      decision: isPreToolUse ? 'ask' : 'stop',
    };
  }
}
