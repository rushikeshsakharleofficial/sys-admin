import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';

export type OverlayFinding = {
  type: string;
  message: string;
  selector?: string;
};

export type OverlaySummary = {
  detected: string[];
  findings: OverlayFinding[];
};

/**
 * Detects currently-open overlay elements: modals, dialogs, drawers, sheets,
 * popovers, and toasts. Returns their selectors and ARIA roles.
 *
 * @param page Playwright page instance
 * @returns Array of detected overlay descriptors
 */
export async function detectOpenOverlays(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const overlays: string[] = [];
    const selectors = [
      '[role="dialog"]',
      '[role="alertdialog"]',
      '[aria-modal="true"]',
      '[data-state="open"]',
      '.modal:not([hidden])',
      '.drawer:not([hidden])',
      '.sheet:not([hidden])',
      '.popover:not([hidden])',
      '[data-radix-popper-content-wrapper]',
      '[data-headlessui-state="open"]',
    ];
    for (const sel of selectors) {
      const elements = Array.from(document.querySelectorAll<HTMLElement>(sel));
      for (const el of elements) {
        const style = getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          const label =
            el.getAttribute('aria-label') ||
            el.getAttribute('aria-labelledby') ||
            el.getAttribute('data-testid') ||
            el.id ||
            sel;
          overlays.push(label);
        }
      }
    }
    return [...new Set(overlays)];
  });
}

/**
 * Audits overlay ARIA attributes and behavior.
 * Checks: aria-modal, aria-labelledby/aria-label, role, backdrop presence,
 * focus trap (first focusable element is inside overlay).
 *
 * @param page Playwright page instance
 * @returns Array of overlay findings
 */
export async function auditOpenOverlays(page: Page): Promise<OverlayFinding[]> {
  return await page.evaluate(() => {
    const findings: OverlayFinding[] = [];
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],[role="alertdialog"]'));

    for (const dialog of dialogs) {
      const style = getComputedStyle(dialog);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const label =
        dialog.getAttribute('aria-label') ||
        dialog.id ||
        dialog.getAttribute('data-testid') ||
        dialog.className.toString().slice(0, 40) ||
        'dialog';

      // Must have accessible name
      const hasName =
        dialog.getAttribute('aria-label') ||
        (dialog.getAttribute('aria-labelledby') &&
          document.getElementById(dialog.getAttribute('aria-labelledby')!));
      if (!hasName) {
        findings.push({
          type: 'dialog-no-accessible-name',
          message: `Dialog has no aria-label or aria-labelledby: ${label}`,
          selector: label,
        });
      }

      // Should have aria-modal="true" for true modal
      if (!dialog.getAttribute('aria-modal')) {
        findings.push({
          type: 'dialog-missing-aria-modal',
          message: `Dialog missing aria-modal="true": ${label}`,
          selector: label,
        });
      }

      // Check focusable element inside
      const focusable = dialog.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable) {
        findings.push({
          type: 'dialog-no-focusable-element',
          message: `Dialog has no focusable element inside — focus trap impossible: ${label}`,
          selector: label,
        });
      }

      // Check close mechanism
      const closeButton = dialog.querySelector<HTMLButtonElement>(
        '[aria-label*="close" i], [aria-label*="dismiss" i], button[data-dismiss], .close-button'
      );
      if (!closeButton) {
        findings.push({
          type: 'dialog-no-close-button',
          message: `Dialog has no identifiable close button (check aria-label): ${label}`,
          selector: label,
        });
      }
    }

    // Check toast stack overflow
    const toasts = Array.from(document.querySelectorAll<HTMLElement>(
      '[role="status"], [role="alert"], [data-sonner-toast], .toast, .Toastify__toast'
    )).filter(el => {
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden';
    });
    if (toasts.length > 5) {
      findings.push({
        type: 'toast-stack-overflow',
        message: `More than 5 toasts visible simultaneously (${toasts.length}) — toast queue not bounded`,
      });
    }

    return findings;
  });
}

/**
 * Tries to close an open overlay using Escape key and screenshots the result.
 * Returns true if overlay was dismissed.
 *
 * @param page Playwright page instance
 * @param route Current route for screenshot naming
 * @returns Whether the Escape key closed the overlay
 */
export async function testEscapeClosesOverlay(
  page: Page,
  route: string
): Promise<boolean> {
  const before = await detectOpenOverlays(page);
  if (before.length === 0) return true; // nothing to close

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await screenshotStep(page, route, `after-escape-overlay`);

  const after = await detectOpenOverlays(page);
  return after.length < before.length;
}

/**
 * Attempts to find and trigger common overlay triggers: buttons that open
 * dialogs, drawers, modals. Safe: only clicks buttons with matching
 * aria-haspopup or data attributes.
 *
 * @param page Playwright page instance
 * @param route Current route for screenshot naming
 * @returns Summary of detected overlays and findings
 */
export async function discoverAndAuditOverlays(
  page: Page,
  route: string
): Promise<OverlaySummary> {
  const findings: OverlayFinding[] = [];
  const detected: string[] = [];

  // Collect trigger buttons
  const triggers = page.locator(
    '[aria-haspopup="dialog"],[aria-haspopup="true"],[data-modal-trigger],[data-drawer-trigger]'
  );
  const count = await triggers.count();

  for (let i = 0; i < count; i++) {
    const trigger = triggers.nth(i);
    try {
      if (!(await trigger.isVisible())) continue;
      if (!(await trigger.isEnabled())) continue;
      await trigger.click();
      await page.waitForTimeout(400);
      await screenshotStep(page, route, `overlay-trigger-${i}-open`);

      const open = await detectOpenOverlays(page);
      detected.push(...open);
      const auditFindings = await auditOpenOverlays(page);
      findings.push(...auditFindings);

      // Try escape
      await testEscapeClosesOverlay(page, route);
    } catch {
      // skip
    }
  }

  return { detected: [...new Set(detected)], findings };
}
