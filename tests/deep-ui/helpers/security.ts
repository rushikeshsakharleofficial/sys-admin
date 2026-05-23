import { Page, Response } from '@playwright/test';

export type SecurityFinding = {
  type: string;
  message: string;
  value?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
};

/**
 * Sensitive token patterns that should NOT appear in URLs.
 * Query strings are logged, bookmarked, and appear in server access logs.
 */
const TOKEN_IN_URL_PATTERNS: RegExp[] = [
  /[?&]token=/i,
  /[?&]access_token=/i,
  /[?&]refresh_token=/i,
  /[?&]id_token=/i,
  /[?&]api_key=/i,
  /[?&]apikey=/i,
  /[?&]secret=/i,
  /[?&]password=/i,
  /[?&]authorization=/i,
  /[?&]bearer=/i,
  /[?&]session=/i,
  // JWT-like: base64url.base64url.base64url
  /[?&][^=]+=ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
];

/**
 * Response header security checks.
 */
const EXPECTED_SECURITY_HEADERS = [
  'x-content-type-options',
  'x-frame-options',
  'content-security-policy',
  'referrer-policy',
  'permissions-policy',
] as const;

/**
 * Scans request URLs for tokens or secrets in query strings.
 *
 * @param urls Array of request URLs
 * @returns Security findings for token leaks in URLs
 */
export function scanUrlsForTokenLeaks(urls: string[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  for (const url of urls) {
    for (const pattern of TOKEN_IN_URL_PATTERNS) {
      if (pattern.test(url)) {
        findings.push({
          type: 'token-in-url',
          message: `Sensitive token/secret found in URL query string`,
          value: url.slice(0, 200),
          severity: 'critical',
        });
        break; // one finding per URL
      }
    }
  }
  return findings;
}

/**
 * Checks security response headers on the main page response.
 * Missing security headers are reported as medium severity.
 *
 * @param responses Array of Playwright responses
 * @returns Security findings for missing headers
 */
export async function auditSecurityHeaders(
  responses: Response[]
): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];

  // Only check HTML navigation responses (status 200, content-type text/html)
  const htmlResponses = responses.filter(r => {
    const ct = r.headers()['content-type'] || '';
    return r.status() === 200 && /text\/html/i.test(ct);
  });

  if (htmlResponses.length === 0) return findings;

  const firstResponse = htmlResponses[0];
  const headers = firstResponse.headers();

  for (const header of EXPECTED_SECURITY_HEADERS) {
    if (!headers[header]) {
      const severity = header === 'content-security-policy' ? 'high' : 'medium';
      findings.push({
        type: `missing-security-header`,
        message: `Security header missing: ${header}`,
        value: header,
        severity,
      });
    }
  }

  // Check X-Content-Type-Options value
  if (headers['x-content-type-options'] && headers['x-content-type-options'].toLowerCase() !== 'nosniff') {
    findings.push({
      type: 'weak-x-content-type-options',
      message: `X-Content-Type-Options should be "nosniff", got: ${headers['x-content-type-options']}`,
      severity: 'medium',
    });
  }

  // Check X-Frame-Options value
  const xfo = headers['x-frame-options'];
  if (xfo && !['deny', 'sameorigin'].includes(xfo.toLowerCase())) {
    findings.push({
      type: 'weak-x-frame-options',
      message: `X-Frame-Options has unexpected value: ${xfo}`,
      severity: 'medium',
    });
  }

  return findings;
}

/**
 * Audits inline security risks in the DOM:
 * - iframes without sandbox attribute
 * - iframes loading cross-origin content
 * - inline event handlers (onclick, onerror) on non-script elements
 * - target="_blank" without rel="noopener noreferrer"
 * - Exposed API keys or secrets in visible text or HTML comments
 *
 * @param page Playwright page instance
 * @returns Array of security findings
 */
export async function auditDomSecurity(page: Page): Promise<SecurityFinding[]> {
  return await page.evaluate(() => {
    const findings: SecurityFinding[] = [];
    const origin = window.location.origin;

    // Iframes without sandbox
    const iframes = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe'));
    for (const iframe of iframes) {
      if (!iframe.sandbox || iframe.sandbox.length === 0) {
        findings.push({
          type: 'iframe-no-sandbox',
          message: `iframe missing sandbox attribute: ${iframe.src || iframe.id || 'unnamed'}`,
          value: iframe.src || '',
          severity: 'high',
        });
      }
      // Cross-origin iframes with allow="*" or no allow
      if (iframe.src && !iframe.src.startsWith(origin) && !iframe.src.startsWith('about:')) {
        const allow = iframe.getAttribute('allow') || '';
        if (allow.includes('*')) {
          findings.push({
            type: 'iframe-cross-origin-permissive-allow',
            message: `Cross-origin iframe has permissive allow="*": ${iframe.src.slice(0, 80)}`,
            severity: 'high',
          });
        }
      }
    }

    // target="_blank" without noopener
    const blankLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]'));
    for (const link of blankLinks) {
      const rel = (link.getAttribute('rel') || '').toLowerCase();
      if (!rel.includes('noopener') && !rel.includes('noreferrer')) {
        findings.push({
          type: 'blank-link-missing-noopener',
          message: `a[target="_blank"] without rel="noopener noreferrer": ${link.href.slice(0, 80) || link.textContent?.trim() || 'unknown'}`,
          value: link.href,
          severity: 'medium',
        });
      }
    }

    // Exposed secrets in HTML comments
    const iterator = document.createNodeIterator(document.documentElement, NodeFilter.SHOW_COMMENT);
    const secretPatterns = [
      /sk-[a-zA-Z0-9]{20,}/,
      /ghp_[a-zA-Z0-9]{36}/,
      /AIza[a-zA-Z0-9_-]{35}/,
      /AKIA[A-Z0-9]{16}/,
      /api[_-]?key\s*[:=]\s*['""]?[a-zA-Z0-9_\-]{16,}/i,
      /password\s*[:=]\s*['""]?[^\s'"">]+/i,
    ];
    let commentNode: Node | null;
    while ((commentNode = iterator.nextNode()) !== null) {
      const text = commentNode.nodeValue || '';
      for (const pattern of secretPatterns) {
        if (pattern.test(text)) {
          findings.push({
            type: 'secret-in-html-comment',
            message: 'Potential secret or API key found in HTML comment',
            value: text.trim().slice(0, 100),
            severity: 'critical',
          });
          break;
        }
      }
    }

    // Check for inline onclick with suspicious content
    const allElements = Array.from(document.querySelectorAll<HTMLElement>('[onclick]'));
    for (const el of allElements) {
      const onclick = el.getAttribute('onclick') || '';
      if (/eval\(|Function\(|setTimeout\(|setInterval\(/i.test(onclick)) {
        findings.push({
          type: 'dangerous-inline-handler',
          message: `Potentially dangerous inline event handler: ${onclick.slice(0, 80)}`,
          severity: 'high',
        });
      }
    }

    return findings as SecurityFinding[];
  });
}

/**
 * Checks whether mixed content (HTTP resources on HTTPS page) is present.
 *
 * @param page Playwright page instance
 * @returns Array of mixed content findings
 */
export async function auditMixedContent(page: Page): Promise<SecurityFinding[]> {
  return await page.evaluate(() => {
    const findings: SecurityFinding[] = [];
    if (!location.protocol.startsWith('https')) return findings;

    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const mixed = resources.filter(r => r.name.startsWith('http://'));
    for (const r of mixed) {
      findings.push({
        type: 'mixed-content',
        message: `Mixed content: HTTP resource loaded on HTTPS page: ${r.name.slice(0, 100)}`,
        value: r.name,
        severity: 'high',
      });
    }

    return findings;
  });
}
