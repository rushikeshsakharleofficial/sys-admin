import fs from 'fs';
import path from 'path';
import { Page, Response, expect } from '@playwright/test';

const sensitivePatterns: RegExp[] = [
  /password/i, /passwd/i, /secret/i, /api[_-]?key/i,
  /access[_-]?token/i, /refresh[_-]?token/i, /id[_-]?token/i,
  /authorization/i, /bearer\s+[a-z0-9._-]+/i, /private[_-]?key/i,
  /client[_-]?secret/i, /aws[_-]?secret/i, /stripe[_-]?secret/i,
  /stack\s*trace/i, /sql syntax/i, /mongodb/i, /firebase/i, /supabase/i,
  /ghp_[a-zA-Z0-9]{36}/, /sk-[a-zA-Z0-9]{20,}/, /AIza[a-zA-Z0-9_-]{35}/,
  /AKIA[A-Z0-9]{16}/, /xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+/,
  /ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /at\s+\w+\s+\(.*\.js:\d+:\d+\)/i, /exception|traceback|errno/i,
];

const TOKEN_IN_URL_PATTERNS: RegExp[] = [
  /[?&]token=/i, /[?&]access_token=/i, /[?&]refresh_token=/i,
  /[?&]api_key=/i, /[?&]apikey=/i, /[?&]secret=/i,
  /[?&]password=/i, /[?&]authorization=/i,
  /[?&][^=]+=ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
];

const LARGE_PAYLOAD_BYTES = 512 * 1024;

export type NetworkRecord = {
  url: string;
  method: string;
  status?: number;
  contentType?: string | null;
  failed?: boolean;
  failureText?: string;
  sensitiveHits?: string[];
  responseSize?: number;
  duration?: number;
};

export type DuplicateCallGroup = {
  url: string;
  method: string;
  count: number;
};

export function attachNetworkMonitor(page: Page): { records: NetworkRecord[]; responses: Response[]; requestTimes: Map<string, number> } {
  const records: NetworkRecord[] = [];
  const responses: Response[] = [];
  const requestTimes = new Map<string, number>();

  page.on('request', (request) => { requestTimes.set(request.url() + request.method(), Date.now()); });
  page.on('requestfailed', (request) => {
    records.push({ url: request.url(), method: request.method(), failed: true, failureText: request.failure()?.errorText });
  });
  page.on('response', async (response) => {
    responses.push(response);
    const startTime = requestTimes.get(response.url() + response.request().method());
    const duration = startTime ? Date.now() - startTime : undefined;
    records.push({ url: response.url(), method: response.request().method(), status: response.status(), contentType: response.headers()['content-type'] || null, duration });
  });

  return { records, responses, requestTimes };
}

export async function scanResponsesForLeaks(responses: Response[]): Promise<NetworkRecord[]> {
  const findings: NetworkRecord[] = [];
  for (const response of responses) {
    const url = response.url();
    const contentType = response.headers()['content-type'] || '';
    if (!/json|text|html|javascript/i.test(contentType)) continue;
    let body = '';
    try { body = await response.text(); } catch { continue; }
    const hits = sensitivePatterns.filter(p => p.test(body) || p.test(url)).map(p => p.toString());
    if (hits.length > 0) {
      findings.push({ url, method: response.request().method(), status: response.status(), contentType, sensitiveHits: hits, responseSize: new Blob([body]).size });
    }
  }
  return findings;
}

export function scanUrlsForTokenLeaks(urls: string[]): NetworkRecord[] {
  const findings: NetworkRecord[] = [];
  for (const url of urls) {
    for (const pattern of TOKEN_IN_URL_PATTERNS) {
      if (pattern.test(url)) {
        findings.push({ url: url.slice(0, 200), method: 'GET', sensitiveHits: [`token-in-url: ${pattern}`] });
        break;
      }
    }
  }
  return findings;
}

export function detectDuplicateCalls(records: NetworkRecord[], minCount = 2): DuplicateCallGroup[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|css|js|map)(\?|$)/i.test(r.url)) continue;
    const key = `${r.method}:${r.url}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const duplicates: DuplicateCallGroup[] = [];
  for (const [key, count] of counts) {
    if (count >= minCount) {
      const [method, ...urlParts] = key.split(':');
      duplicates.push({ url: urlParts.join(':'), method, count });
    }
  }
  return duplicates;
}

export async function detectLargePayloads(responses: Response[]): Promise<NetworkRecord[]> {
  const findings: NetworkRecord[] = [];
  for (const response of responses) {
    const contentType = response.headers()['content-type'] || '';
    if (!/json|text/i.test(contentType)) continue;
    try {
      const body = await response.text();
      const size = new Blob([body]).size;
      if (size > LARGE_PAYLOAD_BYTES) {
        findings.push({ url: response.url(), method: response.request().method(), status: response.status(), contentType, responseSize: size });
      }
    } catch { continue; }
  }
  return findings;
}

export async function writeNetworkReport(routeName: string, records: NetworkRecord[], leaks: NetworkRecord[]): Promise<void> {
  const dir = path.join('qa-artifacts', 'network');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${routeName}-requests.json`), JSON.stringify(records, null, 2));
  fs.writeFileSync(path.join(dir, `${routeName}-sensitive-scan.json`), JSON.stringify(leaks, null, 2));
}

export function assertNetworkHealthy(records: NetworkRecord[]): void {
  const badStatuses = records.filter(r => typeof r.status === 'number' && r.status >= 400 && !r.url.includes('favicon'));
  const failures = records.filter(r => r.failed);
  expect({ badStatuses, failures }, JSON.stringify({ badStatuses, failures }, null, 2)).toEqual({ badStatuses: [], failures: [] });
}
