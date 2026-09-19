/**
 * Secure credential storage interface for managing Bark server URLs and push keys.
 */

export const KEYCHAIN_SERVICE_NAME = 'com.takefive.cli';
export const KEYCHAIN_BARK_URL_ACCOUNT = 'bark_url';

/**
 * Abstraction for OS-level secure credential storage (macOS Keychain / Windows Credential Manager).
 */
export interface CredentialStore {
  /**
   * Retrieves the stored Bark server push URL if present.
   * Returns null if no credential exists.
   */
  getBarkUrl(env?: Record<string, string | undefined>): Promise<string | null>;

  /**
   * Securely saves or updates the Bark server push URL.
   * @param url The full Bark push endpoint URL including device token
   */
  setBarkUrl(url: string, env?: Record<string, string | undefined>): Promise<void>;

  /**
   * Deletes the Bark server push URL from secure storage.
   */
  deleteBarkUrl(env?: Record<string, string | undefined>): Promise<void>;

  /**
   * Checks whether the current operating system platform supports secure credential storage.
   */
  isSupported(): boolean;

  /**
   * Returns the underlying OS platform.
   */
  getPlatform(): NodeJS.Platform | string;
}
