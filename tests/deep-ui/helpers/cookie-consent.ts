import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type CookieConsentFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type CookieConsentReport = {
  route: string;
  bannerDetected: boolean;
  hasAcceptButton: boolean;
  hasRejectButton: boolean;
  hasPrivacyLink: boolean;
  cookiesBeforeConsent: string[];
  findings: CookieConsentFinding[];
};

export async function auditCookieConsent(page: Page, route: string): Promise<CookieConsentReport> {
  const routeName = normalizeRoute(route);
  const findings: CookieConsentFinding[] = [];

  const result = await page.evaluate(() => {
    const bannerSelectors = [
      '[id*="cookie" i]',
      '[class*="cookie" i]',
      '[id*="consent" i]',
      '[class*="consent" i]',
      '[id*="gdpr" i]',
      '[class*="gdpr" i]',
      '[id*="privacy-banner" i]',
      '[aria-label*="cookie" i]',
      '[role="dialog"][aria-label*="cookie" i]',
      '#cookieConsent',
      '.cookie-banner',
      '.cc-banner',
      '#cookie-notice',
    ];

    const isVisible = (el: Element): boolean => {
      const s = getComputedStyle(el as HTMLElement);
      const r = (el as HTMLElement).getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && (r.width > 0 || r.height > 0);
    };

    let bannerEl: Element | null = null;
    for (const sel of bannerSelectors) {
      try {
        const els = Array.from(document.querySelectorAll(sel));
        const visible = els.find(isVisible);
        if (visible) {
          bannerEl = visible;
          break;
        }
      } catch (_) { /* invalid selector, skip */ }
    }

    const bannerDetected = bannerEl !== null;

    const acceptTexts = /\b(accept|accept all|i agree|ok|got it|allow all)\b/i;
    const rejectTexts = /\b(reject|decline|reject all|no thanks|necessary only)\b/i;
    const privacyTexts = /privacy|policy|learn more/i;

    let hasAcceptButton = false;
    let hasRejectButton = false;
    let hasPrivacyLink = false;

    if (bannerEl) {
      const buttons = Array.from(bannerEl.querySelectorAll('button, [role="button"]'));
      for (const btn of buttons) {
        const text = (btn.textContent || '').trim();
        if (acceptTexts.test(text)) hasAcceptButton = true;
        if (rejectTexts.test(text)) hasRejectButton = true;
      }
      const links = Array.from(bannerEl.querySelectorAll('a'));
      for (const a of links) {
        const text = (a.textContent || '').trim();
        if (privacyTexts.test(text)) hasPrivacyLink = true;
      }
    }

    const rawCookies = document.cookie;
    const cookiesBeforeConsent: string[] = rawCookies
      ? rawCookies.split(';').map(c => c.trim().split('=')[0].trim()).filter(Boolean)
      : [];

    const trackingPatterns = /^(_ga|_gid|_gat|_fbp|_fbc|fr|ads_|analytics)/i;
    const trackingCookies = cookiesBeforeConsent.filter(name => trackingPatterns.test(name));

    return {
      bannerDetected,
      hasAcceptButton,
      hasRejectButton,
      hasPrivacyLink,
      cookiesBeforeConsent,
      trackingCookies,
      hasCookies: cookiesBeforeConsent.length > 0,
      bannerSelector: bannerEl
        ? (bannerEl.id ? `#${bannerEl.id}` : (bannerEl.className ? `.${String(bannerEl.className).trim().split(/\s+/)[0]}` : bannerEl.tagName.toLowerCase()))
        : null,
    };
  });

  if (result.trackingCookies.length > 0) {
    findings.push({
      severity: 'high',
      type: 'tracking-cookies-before-consent',
      message: `Tracking cookies set before consent interaction: ${result.trackingCookies.join(', ')}`,
    });
  }

  if (!result.bannerDetected && result.hasCookies) {
    findings.push({
      severity: 'low',
      type: 'no-consent-banner',
      message: `Cookies present (${result.cookiesBeforeConsent.join(', ')}) but no cookie consent banner detected`,
    });
  }

  if (result.bannerDetected && !result.hasRejectButton) {
    findings.push({
      severity: 'medium',
      type: 'consent-no-reject-option',
      message: 'Cookie consent banner detected but no reject/decline option found — may not meet GDPR requirements',
      selector: result.bannerSelector ?? undefined,
    });
  }

  if (result.bannerDetected) {
    try {
      await screenshotStep(page, route, 'cookie-consent-banner');
    } catch (_) { /* non-fatal */ }
  }

  const report: CookieConsentReport = {
    route,
    bannerDetected: result.bannerDetected,
    hasAcceptButton: result.hasAcceptButton,
    hasRejectButton: result.hasRejectButton,
    hasPrivacyLink: result.hasPrivacyLink,
    cookiesBeforeConsent: result.cookiesBeforeConsent,
    findings,
  };

  writeJsonArtifact('cookie-consent', `${routeName}-cookie-consent.json`, report);
  return report;
}
