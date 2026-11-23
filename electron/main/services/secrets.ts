import { safeStorage } from 'electron';
import type { SettingsRepo } from '../store/repositories';

/** Minimal surface of Electron's safeStorage, so tests can pass a fake. */
export interface Cipher {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/**
 * API keys, encrypted with Electron safeStorage and stored as base64 in settings.
 * Keys never leave the main process and are never logged.
 */
export class SecretStore {
  constructor(
    private readonly settings: SettingsRepo,
    private readonly cipher: Cipher = safeStorage,
  ) {}

  private key(name: string) {
    return `secret:${name}`;
  }

  has(name: string): boolean {
    return typeof this.settings.all()[this.key(name)] === 'string';
  }

  get(name: string): string | null {
    const blob = this.settings.all()[this.key(name)];
    if (typeof blob !== 'string') return null;
    try {
      return this.cipher.decryptString(Buffer.from(blob, 'base64'));
    } catch {
      return null;
    }
  }

  set(name: string, value: string | null): void {
    if (value === null || value === '') {
      this.settings.set(this.key(name), undefined);
      return;
    }
    if (!this.cipher.isEncryptionAvailable()) {
      throw new Error('Secure storage is not available on this system.');
    }
    this.settings.set(this.key(name), this.cipher.encryptString(value).toString('base64'));
  }
}
