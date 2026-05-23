import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type ToastFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
  text?: string;
};

export type ToastReport = {
  route: string;
  toastsFound: number;
  findings: ToastFinding[];
};

export async function auditToasts(page: Page, route: string): Promise<ToastReport> {
  const routeName = normalizeRoute(route);
  const findings: ToastFinding[] = [];

  // Token-efficient early exit: skip full audit if no toast-like elements visible.
  try {
    const hasToasts = await page.evaluate(() =>
      document.querySelector('[role="status"], [role="alert"], [role="log"], [class*="toast" i], [class*="snackbar" i], [data-testid*="toast" i]') !== null
    );
    if (!hasToasts) {
      const emptyReport: ToastReport = { route, toastsFound: 0, findings: [] };
      writeJsonArtifact('toasts', `${routeName}-toasts.json`, emptyReport);
      return emptyReport;
    }
  } catch { /* proceed to full audit on pre-check error */ }

  const result = await page.evaluate(() => {
    // Contrast helpers
    const parseRgb = (s: string): [number, number, number] | null => {
      const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
    };
    const lum = ([r, g, b]: [number, number, number]): number => {
      const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const contrastRatio = (l1: number, l2: number): number =>
      (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    const isVisible = (el: HTMLElement): boolean => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return (
        s.display !== 'none' &&
        s.visibility !== 'hidden' &&
        s.opacity !== '0' &&
        r.width > 0 &&
        r.height > 0
      );
    };

    const selectorFor = (el: HTMLElement): string =>
      el.getAttribute('data-testid') ||
      el.getAttribute('aria-label') ||
      el.id ||
      el.className?.toString().slice(0, 50) ||
      el.tagName;

    // Collect all candidate toast elements
    const selectors = [
      '[role="status"]',
      '[role="alert"]',
      '[role="log"]',
      '[data-sonner-toast]',
      '.toast',
      '.Toastify__toast',
      '.chakra-toast',
      '[aria-live="polite"]',
      '[aria-live="assertive"]',
      '[data-state="open"][data-type]',
    ];

    const seen = new Set<Element>();
    const toastEls: HTMLElement[] = [];
    for (const sel of selectors) {
      try {
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
          if (!seen.has(el) && isVisible(el)) {
            seen.add(el);
            toastEls.push(el);
          }
        }
      } catch {
        // ignore invalid selectors in older browsers
      }
    }

    const toastFindings: ToastFinding[] = [];
    const vh = window.innerHeight;

    for (const toast of toastEls) {
      const sel = selectorFor(toast);
      const text = toast.innerText?.trim() || '';

      // Check empty toast
      if (!text) {
        toastFindings.push({
          severity: 'low',
          type: 'toast-empty',
          message: 'Toast element has no text content',
          selector: sel,
        });
      }

      // Check contrast
      const s = getComputedStyle(toast);
      const fg = parseRgb(s.color);
      const bg = parseRgb(s.backgroundColor);
      if (fg && bg) {
        const skipTransparent =
          s.backgroundColor.includes('rgba') && bg[0] === 0 && bg[1] === 0 && bg[2] === 0;
        if (!skipTransparent) {
          const ratio = contrastRatio(lum(fg), lum(bg));
          if (ratio < 4.5 && ratio > 1.05) {
            toastFindings.push({
              severity: 'medium',
              type: 'toast-poor-contrast',
              message: `Toast contrast ${ratio.toFixed(2)}:1 is below 4.5:1 minimum`,
              selector: sel,
              text: text.slice(0, 80),
            });
          }
        }
      }

      // Check position — flag if covers viewport middle (20%–80%)
      const rect = toast.getBoundingClientRect();
      const topPct = rect.top / vh;
      if (topPct > 0.2 && topPct < 0.8) {
        toastFindings.push({
          severity: 'medium',
          type: 'toast-covers-content',
          message: `Toast positioned at ${Math.round(topPct * 100)}% viewport height — may obscure main content`,
          selector: sel,
          text: text.slice(0, 80),
        });
      }

      // Check accessible role
      const role = toast.getAttribute('role') || '';
      if (!['status', 'alert'].includes(role)) {
        toastFindings.push({
          severity: 'medium',
          type: 'toast-missing-role',
          message: 'Toast element lacks role="status" or role="alert" for screen reader announcement',
          selector: sel,
          text: text.slice(0, 80),
        });
      }

      // Check dismiss button
      const hasDismiss =
        toast.querySelector('[aria-label]') !== null &&
        (() => {
          const btns = Array.from(toast.querySelectorAll<HTMLElement>('[aria-label]'));
          return btns.some(b => {
            const lbl = (b.getAttribute('aria-label') || '').toLowerCase();
            return lbl.includes('close') || lbl.includes('dismiss');
          });
        })() ||
        toast.querySelector('button') !== null;

      if (!hasDismiss) {
        toastFindings.push({
          severity: 'low',
          type: 'toast-not-dismissible',
          message: 'Toast has no dismiss/close button',
          selector: sel,
          text: text.slice(0, 80),
        });
      }
    }

    // Stack overflow check
    if (toastEls.length > 5) {
      toastFindings.push({
        severity: 'high',
        type: 'toast-stack-overflow',
        message: `${toastEls.length} toasts visible simultaneously — exceeds readable limit of 5`,
      });
    }

    // aria-live region check (page-level, only if toasts were found)
    let hasAriaLive = false;
    if (toastEls.length > 0) {
      hasAriaLive =
        document.querySelector('[aria-live="polite"], [aria-live="assertive"]') !== null;
      if (!hasAriaLive) {
        toastFindings.push({
          severity: 'medium',
          type: 'toast-no-aria-live',
          message: 'Toasts detected but no aria-live region found in page for dynamic announcements',
        });
      }
    }

    return {
      toastsFound: toastEls.length,
      findings: toastFindings,
    };
  });

  findings.push(...result.findings);

  if (result.toastsFound > 0) {
    await screenshotStep(page, route, `${routeName}-toasts-found`);
  }

  const report: ToastReport = {
    route,
    toastsFound: result.toastsFound,
    findings,
  };
  writeJsonArtifact('toasts', `${routeName}-toasts.json`, report);
  return report;
}
