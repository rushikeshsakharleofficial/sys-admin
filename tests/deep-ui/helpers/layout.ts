import { Page, expect } from '@playwright/test';

export type LayoutIssue = {
  type: string;
  message: string;
  selector?: string;
  rect?: unknown;
};

/**
 * Collects basic layout issues from the current page. This helper runs in the
 * browser context and inspects all visible elements, looking for overflow,
 * clipping and oversized fixed overlays.
 *
 * @param page Playwright page instance
 * @returns A list of detected issues
 */
export async function collectLayoutIssues(page: Page): Promise<LayoutIssue[]> {
  return await page.evaluate(() => {
    const issues: LayoutIssue[] = [];
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const visibleElements = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(
      (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      }
    );

    for (const el of visibleElements) {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const label =
        el.getAttribute('data-testid') ||
        el.getAttribute('aria-label') ||
        el.id ||
        (el.className && typeof el.className === 'string' ? el.className : '') ||
        el.tagName;

      // Element flows beyond the right edge
      if (rect.right > viewportWidth + 2) {
        issues.push({
          type: 'horizontal-overflow',
          message: `Element overflows viewport right edge: ${label}`,
          selector: label,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            viewportWidth,
          },
        });
      }
      // Element flows beyond the left edge
      if (rect.left < -2) {
        issues.push({
          type: 'negative-left-overflow',
          message: `Element overflows viewport left edge: ${label}`,
          selector: label,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        });
      }
      // Oversized fixed overlays that cover the viewport
      if (
        style.position === 'fixed' &&
        rect.width > viewportWidth * 0.98 &&
        rect.height > viewportHeight * 0.9
      ) {
        issues.push({
          type: 'fixed-overlay-too-large',
          message: `Fixed element nearly covers viewport: ${label}`,
          selector: label,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        });
      }
      // Content clipping horizontally without overflowX
      if (el.scrollWidth > el.clientWidth + 2 && !['auto', 'scroll'].includes(style.overflowX)) {
        issues.push({
          type: 'text-or-content-clipping',
          message: `Element content may be clipped horizontally: ${label}`,
          selector: label,
          rect: {
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          },
        });
      }
    }
    // Page horizontal scroll
    if (document.documentElement.scrollWidth > viewportWidth + 2) {
      issues.push({
        type: 'page-horizontal-scroll',
        message: 'Page has unexpected horizontal scrolling.',
        rect: {
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth,
        },
      });
    }
    return issues;
  });
}

/**
 * Asserts that there are no basic layout issues on the current page. This
 * helper will cause the test to fail if any issues are found.
 *
 * @param page Playwright page instance
 */
export async function assertNoBasicLayoutIssues(page: Page): Promise<void> {
  const issues = await collectLayoutIssues(page);
  expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
}