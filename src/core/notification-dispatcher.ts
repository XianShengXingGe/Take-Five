import type { BarkPushPayload, BarkPushResponse } from '../types/bark.js';
import type { CredentialStore } from '../types/credential.js';
import type { UnifiedEvent } from '../types/event.js';
import { BarkClient } from './bark-client.js';
import { ConfigManager } from './config-manager.js';
import { OsCredentialStore } from './credential-store.js';
import { Debouncer } from './debouncer.js';
import { TemplateEngine } from './template-engine.js';

export type DispatchStatus =
  | 'dispatched'
  | 'debounced'
  | 'agent_disabled'
  | 'event_disabled'
  | 'missing_credential'
  | 'failed';

export interface DispatchResult {
  status: DispatchStatus;
  payload?: BarkPushPayload;
  response?: BarkPushResponse;
  error?: string;
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
 * Orchestrator that coordinates config validation, debounce checks, credential lookup,
 * template rendering, and Bark HTTP dispatching.
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
   * Executes the full notification dispatch pipeline for a unified lifecycle event.
   */
  async dispatch(event: UnifiedEvent, options: DispatchOptions = {}): Promise<DispatchResult> {
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
}
