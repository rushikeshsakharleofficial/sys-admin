import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';

/**
 * Hovers and trial‑clicks all visible buttons on the page. Each hover
 * captures a screenshot. Trial clicks simulate a click without causing
 * side effects; if the trial click fails, it is silently ignored.
 *
 * @param page Playwright page instance
 * @param route Current route pathname for screenshot naming
 */
export async function testVisibleButtons(page: Page, route: string): Promise<void> {
  const buttons = page.getByRole('button');
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    try {
      if (!(await button.isVisible())) continue;
      if (!(await button.isEnabled())) continue;
    } catch {
      continue;
    }
    const label =
      (await button.innerText().catch(() => '')) ||
      (await button.getAttribute('aria-label').catch(() => '')) ||
      `button-${i}`;
    try {
      await button.hover();
    } catch {
      // ignore hover failure
    }
    await screenshotStep(page, route, `hover-button-${i}-${safeName(label)}`);
    try {
      await button.click({ trial: true });
    } catch {
      // ignore trial click failure
    }
  }
}

/**
 * Hovers all visible links on the page and captures a screenshot. Links
 * include any anchor elements with an `href` attribute.
 *
 * @param page Playwright page instance
 * @param route Current route pathname for screenshot naming
 */
export async function testVisibleLinks(page: Page, route: string): Promise<void> {
  const links = page.locator('a[href]');
  const count = await links.count();
  for (let i = 0; i < count; i++) {
    const link = links.nth(i);
    try {
      if (!(await link.isVisible())) continue;
    } catch {
      continue;
    }
    const text =
      (await link.innerText().catch(() => '')) ||
      (await link.getAttribute('href').catch(() => '')) ||
      `link-${i}`;
    try {
      await link.hover();
    } catch {
      // ignore hover failure
    }
    await screenshotStep(page, route, `hover-link-${i}-${safeName(text)}`);
  }
}

/**
 * Sanitises a name for use in filenames. Truncates to 40 characters and
 * replaces non‑word characters with hyphens.
 *
 * @param value String to sanitise
 * @returns Safe filename fragment
 */
function safeName(value: string): string {
  return value
    .toLowerCase()
    .slice(0, 40)
    .replace(/[^\w]+/g, '-')
    .replace(/^-|-$/g, '');
}