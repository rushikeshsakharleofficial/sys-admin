import fs from 'fs';
import path from 'path';
import { Page, BrowserContext } from '@playwright/test';

const SENSITIVE_STORAGE_PATTERNS: RegExp[] = [
  /password/i, /passwd/i, /plain.?text/i, /raw.?password/i,
  /credit.?card/i, /cvv/i, /card.?number/i,
  /ghp_[a-zA-Z0-9]{36}/, /sk-[a-zA-Z0-9]{20,}/,
  /AIza[a-zA-Z0-9_-]{35}/, /AKIA[A-Z0-9]{16}/,
  /ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
];

export type StorageFinding = {
  storageType: 'localStorage' | 'sessionStorage' | 'cookie' | 'indexedDB' | 'cacheAPI';
  key: string;
  hint: string;
  severity: 'critical' | 'high' | 'medium';
};

export async function collectStorageState(page: Page, context: BrowserContext): Promise<unknown> {
  const rawCookies = await context.cookies();
  const storage = await page.evaluate(async () => {
    const localStorageData: Record<string, string> = {};
    const sessionStorageData: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) localStorageData[key] = localStorage.getItem(key) || '';
    }
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) sessionStorageData[key] = sessionStorage.getItem(key) || '';
    }
    const cacheKeys = 'caches' in window ? await caches.keys().catch(() => []) : [];
    const indexedDbDatabases = 'indexedDB' in window && typeof indexedDB.databases === 'function'
      ? await indexedDB.databases().catch(() => []) : [];
    return { localStorage: localStorageData, sessionStorage: sessionStorageData, cacheKeys, indexedDbDatabases };
  });

  const findings: StorageFinding[] = [];

  for (const [key, value] of Object.entries(storage.localStorage)) {
    for (const pattern of SENSITIVE_STORAGE_PATTERNS) {
      if (pattern.test(value) || pattern.test(key)) {
        findings.push({ storageType: 'localStorage', key, hint: `Matches sensitive pattern: ${pattern}`, severity: /token|jwt/i.test(key) ? 'high' : 'critical' });
        break;
      }
    }
    if (value.length > 10000) {
      findings.push({ storageType: 'localStorage', key, hint: `Large value (${value.length} chars) — review for PII`, severity: 'medium' });
    }
  }

  for (const [key, value] of Object.entries(storage.sessionStorage)) {
    for (const pattern of SENSITIVE_STORAGE_PATTERNS) {
      if (pattern.test(value) || pattern.test(key)) {
        findings.push({ storageType: 'sessionStorage', key, hint: `Matches sensitive pattern: ${pattern}`, severity: 'high' });
        break;
      }
    }
  }

  for (const cookie of rawCookies) {
    const c = cookie as { name: string; value: string; secure?: boolean; sameSite?: string; httpOnly?: boolean };
    if (!c.secure && page.url().startsWith('https')) {
      findings.push({ storageType: 'cookie', key: c.name, hint: 'Cookie missing Secure flag on HTTPS page', severity: 'high' });
    }
    if (!c.httpOnly && /auth|session|token|jwt|sid/i.test(c.name)) {
      findings.push({ storageType: 'cookie', key: c.name, hint: 'Auth/session cookie missing HttpOnly flag', severity: 'high' });
    }
    if (!c.sameSite || c.sameSite === 'None') {
      if (/auth|session|token|csrf/i.test(c.name)) {
        findings.push({ storageType: 'cookie', key: c.name, hint: `Cookie SameSite=${c.sameSite || 'unset'} — CSRF risk`, severity: c.sameSite === 'None' ? 'high' : 'medium' });
      }
    }
    for (const pattern of SENSITIVE_STORAGE_PATTERNS) {
      if (pattern.test(c.value)) {
        findings.push({ storageType: 'cookie', key: c.name, hint: `Cookie value matches sensitive pattern: ${pattern}`, severity: 'critical' });
        break;
      }
    }
  }

  return { cookies: rawCookies, ...storage, findings };
}

export async function writeStorageReport(routeName: string, phase: string, data: unknown): Promise<void> {
  const dir = path.join('qa-artifacts', 'storage');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${routeName}-storage-${phase}.json`), JSON.stringify(data, null, 2));
}
