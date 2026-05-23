import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type DialogScrollFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type DialogScrollReport = {
  route: string;
  dialogsFound: number;
  findings: DialogScrollFinding[];
};

export async function auditDialogScroll(page: Page, route: string): Promise<DialogScrollReport> {
  const routeName = normalizeRoute(route);
  const findings: DialogScrollFinding[] = [];
  let screenshotCount = 0;

  const report: DialogScrollReport = { route, dialogsFound: 0, findings };

  try {
    const hasDialog = await page.evaluate(() =>
      document.querySelector(
        '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [class*="modal" i], [class*="dialog" i], [class*="drawer" i], [class*="sheet" i], dialog'
      ) !== null
    );

    if (!hasDialog) {
      writeJsonArtifact('dialog-scroll', `${routeName}-dialog-scroll.json`, report);
      return report;
    }
  } catch {
    writeJsonArtifact('dialog-scroll', `${routeName}-dialog-scroll.json`, report);
    return report;
  }

  // --- DETECTION ---
  type DialogInfo = {
    dialogSel: string;
    contentSel: string;
    scrollHeight: number;
    clientHeight: number;
    overflowY: string;
    maxHeight: string;
    dialogBottom: number;
    dialogHeight: number;
    windowHeight: number;
    focusableCount: number;
    hasAriaModal: boolean;
    hasAutofocus: boolean;
    role: string;
  };

  let dialogs: DialogInfo[] = [];

  try {
    dialogs = await page.evaluate(() => {
      const DIALOG_SELECTORS = [
        '[role="dialog"]',
        '[role="alertdialog"]',
        '[aria-modal="true"]',
        'dialog[open]',
        '[class*="modal" i]:not([hidden])',
        '[class*="dialog" i]:not([hidden])',
      ];

      const CONTENT_SELECTORS = [
        '[class*="modal-body" i]',
        '[class*="dialog-body" i]',
        '[class*="dialog-content" i]',
        '[class*="modal-content" i]',
      ];

      const seen = new Set<Element>();
      const results: DialogInfo[] = [];

      for (const sel of DIALOG_SELECTORS) {
        const els = Array.from(document.querySelectorAll<HTMLElement>(sel));
        for (const el of els) {
          if (seen.has(el)) continue;
          const style = getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const rect = el.getBoundingClientRect();
          if (rect.height <= 0) continue;
          seen.add(el);

          // Build a stable selector for this dialog
          let dialogSel = sel;
          if (el.id) {
            dialogSel = `#${CSS.escape(el.id)}`;
          } else if (el.getAttribute('data-testid')) {
            dialogSel = `[data-testid="${el.getAttribute('data-testid')}"]`;
          }

          // Find content area
          let contentArea: HTMLElement | null = null;
          let contentSel = dialogSel;
          for (const cSel of CONTENT_SELECTORS) {
            const found = el.querySelector<HTMLElement>(cSel);
            if (found) {
              contentArea = found;
              contentSel = `${dialogSel} ${cSel}`;
              break;
            }
          }
          if (!contentArea) {
            contentArea = el;
            contentSel = dialogSel;
          }

          const cs = getComputedStyle(contentArea);

          // Focusable elements
          const focusable = el.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
          );

          results.push({
            dialogSel,
            contentSel,
            scrollHeight: contentArea.scrollHeight,
            clientHeight: contentArea.clientHeight,
            overflowY: cs.overflowY,
            maxHeight: cs.maxHeight,
            dialogBottom: rect.bottom,
            dialogHeight: rect.height,
            windowHeight: window.innerHeight,
            focusableCount: focusable.length,
            hasAriaModal: el.getAttribute('aria-modal') === 'true',
            hasAutofocus: el.querySelector('[autofocus]') !== null,
            role: el.getAttribute('role') || el.tagName.toLowerCase(),
          });

          if (results.length >= 3) break;
        }
        if (results.length >= 3) break;
      }

      return results;
    });
  } catch {
    // detection failed — bail
    writeJsonArtifact('dialog-scroll', `${routeName}-dialog-scroll.json`, report);
    return report;
  }

  report.dialogsFound = dialogs.length;
  if (dialogs.length === 0) {
    writeJsonArtifact('dialog-scroll', `${routeName}-dialog-scroll.json`, report);
    return report;
  }

  // Screenshot: dialog found
  try {
    if (screenshotCount < 2) {
      await screenshotStep(page, route, 'dialog-scroll-found');
      screenshotCount++;
    }
  } catch { /* ignore */ }

  for (const d of dialogs) {
    const { dialogSel, contentSel, scrollHeight, clientHeight, overflowY, maxHeight, dialogBottom, dialogHeight, windowHeight, focusableCount, hasAriaModal, hasAutofocus, role } = d;
    const diff = scrollHeight - clientHeight;
    const isTall = diff > 10;
    const hasInternalScroll = isTall && (overflowY === 'auto' || overflowY === 'scroll');

    // --- CHECK 1: Overflow-y / scroll setup ---
    try {
      if (isTall) {
        if (overflowY === 'hidden' || overflowY === 'visible') {
          findings.push({
            severity: 'high',
            type: 'dialog-overflow-hidden-tall',
            message: `Dialog content taller than container (${diff}px) but overflow-y is ${overflowY} — content is clipped`,
            selector: contentSel,
          });
        } else if (overflowY === 'auto' || overflowY === 'scroll') {
          findings.push({
            severity: 'info',
            type: 'dialog-has-internal-scroll',
            message: `Dialog has internal scroll (scrollHeight=${scrollHeight})`,
            selector: contentSel,
          });
        }
      } else {
        findings.push({
          severity: 'info',
          type: 'dialog-content-fits',
          message: 'Dialog content fits without scroll',
          selector: contentSel,
        });
      }

      if (maxHeight === 'none' && dialogHeight > windowHeight * 0.9) {
        findings.push({
          severity: 'medium',
          type: 'dialog-no-max-height',
          message: 'Dialog has no max-height — may exceed viewport on small screens',
          selector: dialogSel,
        });
      }

      if (dialogBottom > windowHeight - 20 && !hasInternalScroll) {
        findings.push({
          severity: 'high',
          type: 'dialog-exceeds-viewport',
          message: 'Dialog bottom exceeds viewport and has no internal scroll — content unreachable',
          selector: dialogSel,
        });
      }
    } catch { /* ignore */ }

    // --- CHECK 2: Scrollbar visibility ---
    try {
      if (isTall && (overflowY === 'auto' || overflowY === 'scroll')) {
        const hasHScroll = await page.evaluate((sel) => {
          const el = document.querySelector<HTMLElement>(sel);
          if (!el) return false;
          return (el.scrollWidth - el.clientWidth) > 15;
        }, contentSel);
        if (hasHScroll) {
          findings.push({
            severity: 'medium',
            type: 'dialog-unwanted-h-scroll',
            message: 'Dialog has unexpected horizontal scrollbar',
            selector: contentSel,
          });
        }
      }
    } catch { /* ignore */ }

    // --- CHECK 3: Programmatic scroll test ---
    try {
      if (isTall) {
        const scrolledTo = await page.evaluate((sel) => {
          const el = document.querySelector<HTMLElement>(sel);
          if (!el) return -1;
          el.scrollTop = 200;
          return el.scrollTop;
        }, contentSel);

        if (scrolledTo < 50 && diff > 100) {
          findings.push({
            severity: 'high',
            type: 'dialog-scroll-broken',
            message: 'Dialog content area scroll is broken — scrollTop did not change after assignment',
            selector: contentSel,
          });
          if (screenshotCount < 2) {
            try {
              await screenshotStep(page, route, 'dialog-scroll-high-finding');
              screenshotCount++;
            } catch { /* ignore */ }
          }
        }

        // Restore
        await page.evaluate((sel) => {
          const el = document.querySelector<HTMLElement>(sel);
          if (el) el.scrollTop = 0;
        }, contentSel);
      }
    } catch { /* ignore */ }

    // --- CHECK 4: Keyboard scroll inside dialog ---
    try {
      if (isTall && hasInternalScroll) {
        const scrollTopBefore = await page.evaluate((sel) => document.querySelector<HTMLElement>(sel)?.scrollTop ?? 0, contentSel);

        // Tab into dialog up to 3 times
        for (let i = 0; i < 3; i++) {
          await page.keyboard.press('Tab');
        }

        await page.keyboard.press('ArrowDown');
        const afterArrow = await page.evaluate((sel) => document.querySelector<HTMLElement>(sel)?.scrollTop ?? 0, contentSel);

        await page.keyboard.press('PageDown');
        const afterPage = await page.evaluate((sel) => document.querySelector<HTMLElement>(sel)?.scrollTop ?? 0, contentSel);

        if (afterArrow <= scrollTopBefore && afterPage <= scrollTopBefore) {
          findings.push({
            severity: 'medium',
            type: 'dialog-keyboard-scroll-broken',
            message: 'Dialog is scrollable but ArrowDown and PageDown did not move scrollTop (WCAG 2.1.1)',
            selector: contentSel,
          });
        }

        // Restore
        await page.evaluate((sel) => {
          const el = document.querySelector<HTMLElement>(sel);
          if (el) el.scrollTop = 0;
        }, contentSel);
      }
    } catch { /* ignore */ }

    // --- CHECK 5: Content cut-off at scroll boundaries ---
    try {
      if (isTall) {
        const clipResult = await page.evaluate((sel) => {
          const el = document.querySelector<HTMLElement>(sel);
          if (!el || el.children.length === 0) return { topClipped: false, bottomClipped: false };
          const elRect = el.getBoundingClientRect();

          const first = el.children[0] as HTMLElement;
          const firstRect = first.getBoundingClientRect();
          const topClipped = firstRect.top < elRect.top - 5;

          // Scroll to bottom
          el.scrollTop = el.scrollHeight;
          const last = el.children[el.children.length - 1] as HTMLElement;
          const lastRect = last.getBoundingClientRect();
          const bottomClipped = lastRect.bottom > elRect.bottom + 5;

          el.scrollTop = 0;
          return { topClipped, bottomClipped };
        }, contentSel);

        if (clipResult.topClipped) {
          findings.push({
            severity: 'medium',
            type: 'dialog-content-clipped-top',
            message: 'Dialog content is clipped at the top — first child not fully visible',
            selector: contentSel,
          });
        }
        if (clipResult.bottomClipped) {
          findings.push({
            severity: 'medium',
            type: 'dialog-content-clipped-bottom',
            message: 'Dialog content is clipped at the bottom — last child not fully visible',
            selector: contentSel,
          });
        }
      }
    } catch { /* ignore */ }

    // --- CHECK 6: Scroll indicator (shadow/fade) ---
    try {
      if (isTall) {
        const hasShadow = await page.evaluate((sel) => {
          const el = document.querySelector<HTMLElement>(sel);
          if (!el) return false;
          const after = getComputedStyle(el, '::after');
          const before = getComputedStyle(el, '::before');
          return after.content !== 'none' || before.content !== 'none';
        }, contentSel);

        if (hasShadow) {
          findings.push({
            severity: 'info',
            type: 'dialog-scroll-shadow-present',
            message: 'Dialog content area has scroll shadow/gradient pseudo-element',
            selector: contentSel,
          });
        } else {
          findings.push({
            severity: 'low',
            type: 'dialog-no-scroll-indicator',
            message: 'Tall dialog has no scroll shadow/gradient to hint at scrollable content',
            selector: contentSel,
          });
        }
      }
    } catch { /* ignore */ }

    // --- CHECK 7: Focus trap check ---
    try {
      if (focusableCount === 0) {
        findings.push({
          severity: 'medium',
          type: 'dialog-no-focusable-elements',
          message: 'Dialog has no focusable elements',
          selector: dialogSel,
        });
      }

      if ((role === 'dialog' || role === 'alertdialog') && !hasAriaModal) {
        findings.push({
          severity: 'medium',
          type: 'dialog-missing-aria-modal',
          message: 'Dialog has role="dialog" but no aria-modal="true" (WCAG 4.1.2)',
          selector: dialogSel,
        });
      }

      if (focusableCount > 0 && !hasAutofocus) {
        findings.push({
          severity: 'low',
          type: 'dialog-no-initial-focus',
          message: 'Dialog has focusable elements but none has autofocus set (WCAG 2.4.3)',
          selector: dialogSel,
        });
      }
    } catch { /* ignore */ }

    // Screenshot on any HIGH finding found for this dialog
    try {
      const hasHigh = findings.some(f => f.severity === 'high' && (f.selector === dialogSel || f.selector === contentSel));
      if (hasHigh && screenshotCount < 2) {
        await screenshotStep(page, route, 'dialog-scroll-high-finding');
        screenshotCount++;
      }
    } catch { /* ignore */ }
  }

  writeJsonArtifact('dialog-scroll', `${routeName}-dialog-scroll.json`, report);
  return report;
}
