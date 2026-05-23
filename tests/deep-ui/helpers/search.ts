import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type SearchFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type SearchReport = {
  route: string;
  searchFound: boolean;
  findings: SearchFinding[];
};

const SEARCH_SELECTORS = [
  'input[type="search"]',
  'input[placeholder*="search" i]',
  'input[aria-label*="search" i]',
  'input[name="q"]',
  'input[name="search"]',
  'input[name="query"]',
  '[role="search"] input',
];

export async function auditSearch(page: Page, route: string): Promise<SearchReport> {
  const routeName = normalizeRoute(route);
  const findings: SearchFinding[] = [];

  // Detect first visible search input
  let searchSelector: string | null = null;
  for (const sel of SEARCH_SELECTORS) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count() > 0 && await loc.isVisible()) {
        searchSelector = sel;
        break;
      }
    } catch {
      // try next selector
    }
  }

  if (!searchSelector) {
    const report: SearchReport = { route, searchFound: false, findings };
    writeJsonArtifact('search', `${routeName}-search.json`, report);
    return report;
  }

  // 1. Accessibility checks (DOM-only, no interaction)
  try {
    const a11yFindings = await page.evaluate((sel: string) => {
      const results: Array<{ severity: 'high' | 'medium' | 'low' | 'info'; type: string; message: string; selector?: string }> = [];
      const input = document.querySelector<HTMLInputElement>(sel);
      if (!input) return results;

      // a. Label check
      const hasAriaLabel = !!input.getAttribute('aria-label');
      const hasAriaLabelledBy = !!input.getAttribute('aria-labelledby');
      const id = input.id;
      const hasAssociatedLabel = id
        ? !!document.querySelector(`label[for="${id}"]`)
        : false;
      const isWrappedInLabel = input.closest('label') !== null;

      if (!hasAriaLabel && !hasAriaLabelledBy && !hasAssociatedLabel && !isWrappedInLabel) {
        results.push({
          severity: 'medium',
          type: 'search-missing-label',
          message: 'Search input has no aria-label, aria-labelledby, or associated <label> (WCAG 1.3.1)',
          selector: sel,
        });
      }

      // b. role="search" landmark
      const inSearchLandmark = input.closest('[role="search"]') !== null;
      if (!inSearchLandmark) {
        results.push({
          severity: 'low',
          type: 'search-missing-role',
          message: 'Search input is not contained within a [role="search"] landmark',
          selector: sel,
        });
      }

      // c. Submit button presence
      const container = input.closest('form') || input.closest('[role="search"]') || input.parentElement;
      if (container) {
        const hasSubmit =
          container.querySelector('button[type="submit"]') !== null ||
          container.querySelector('input[type="submit"]') !== null ||
          container.querySelector('button:not([type])') !== null ||
          container.querySelector('[aria-label*="search" i]') !== null;
        if (!hasSubmit) {
          results.push({
            severity: 'low',
            type: 'search-submit-button',
            message: 'No submit button or search-labelled button found near search input — keyboard users may not know how to submit',
            selector: sel,
          });
        }
      }

      return results;
    }, searchSelector);

    for (const f of a11yFindings) {
      findings.push(f);
    }
  } catch {
    // skip a11y checks on error
  }

  const searchInput = page.locator(searchSelector).first();
  const initialUrl = page.url();

  // 2a. Empty query test
  try {
    await searchInput.focus();
    await searchInput.fill('');
    await searchInput.press('Enter');
    await page.waitForTimeout(500);
    await screenshotStep(page, route, 'search-empty-query');

    const titleAfterEmpty = await page.title().catch(() => '');
    const titleLower = titleAfterEmpty.toLowerCase();
    if (titleLower.includes('500') || titleLower.includes('error') || titleLower.includes('server error')) {
      findings.push({
        severity: 'high',
        type: 'search-empty-query-error',
        message: `Empty query submission caused a server error (page title: "${titleAfterEmpty}")`,
        selector: searchSelector,
      });
    }

    // Navigate back if URL changed
    if (page.url() !== initialUrl) {
      await page.goto(initialUrl).catch(() => {});
      await page.waitForTimeout(300);
    }
  } catch {
    // skip empty query test on error
  }

  // Re-acquire locator after potential navigation
  const searchInputAfterEmpty = page.locator(searchSelector).first();

  // 2b. Special chars / XSS reflection test
  try {
    const xssPayload = '<script>alert(1)</script>';
    await searchInputAfterEmpty.focus();
    await searchInputAfterEmpty.fill(xssPayload);
    await searchInputAfterEmpty.press('Enter');
    await page.waitForTimeout(500);
    await screenshotStep(page, route, 'search-xss-chars');

    const titleAfterXss = await page.title().catch(() => '');
    const h1AfterXss = await page.locator('h1').first().innerText().catch(() => '');
    if (
      titleAfterXss.includes('<script>') ||
      titleAfterXss.includes('alert(1)') ||
      h1AfterXss.includes('<script>') ||
      h1AfterXss.includes('alert(1)')
    ) {
      findings.push({
        severity: 'high',
        type: 'search-xss-reflection',
        message: 'Search query with script tags reflected unsanitized in page title or h1',
        selector: searchSelector,
      });
    }

    // Navigate back if URL changed, then clear input
    if (page.url() !== initialUrl) {
      await page.goto(initialUrl).catch(() => {});
      await page.waitForTimeout(300);
    } else {
      await page.locator(searchSelector).first().fill('').catch(() => {});
    }
  } catch {
    // skip xss test on error
  }

  // 2c. Very long query test
  try {
    const longQuery = 'a'.repeat(200);
    const inputForLong = page.locator(searchSelector).first();
    await inputForLong.focus();
    await inputForLong.fill(longQuery);
    await inputForLong.press('Enter');
    await page.waitForTimeout(500);
    await screenshotStep(page, route, 'search-long-query');

    if (page.url() !== initialUrl) {
      await page.goto(initialUrl).catch(() => {});
      await page.waitForTimeout(300);
    } else {
      await page.locator(searchSelector).first().fill('').catch(() => {});
    }
  } catch {
    // skip long query test on error
  }

  // 2d. No results test
  try {
    const noResultsQuery = 'zzzzztestqqqq12345nonexistentterm';
    const inputForNoResults = page.locator(searchSelector).first();
    await inputForNoResults.focus();
    await inputForNoResults.fill(noResultsQuery);
    await inputForNoResults.press('Enter');
    await page.waitForTimeout(800);
    await screenshotStep(page, route, 'search-no-results');

    const urlAfterNoResults = page.url();
    const pageContentChanged = urlAfterNoResults !== initialUrl;

    const hasNoResultsMessage = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase();
      return (
        body.includes('no results') ||
        body.includes('not found') ||
        body.includes('0 results') ||
        body.includes('nothing found') ||
        body.includes('no matches') ||
        body.includes('no items found')
      );
    }).catch(() => false);

    if (hasNoResultsMessage) {
      findings.push({
        severity: 'info',
        type: 'search-no-results-state',
        message: 'Search shows a "no results" message for unmatched queries — good UX',
        selector: searchSelector,
      });
    } else if (pageContentChanged) {
      findings.push({
        severity: 'medium',
        type: 'search-missing-no-results-message',
        message: 'Search navigated/updated content for unmatched query but shows no "no results" indicator',
        selector: searchSelector,
      });
    }

    if (page.url() !== initialUrl) {
      await page.goto(initialUrl).catch(() => {});
      await page.waitForTimeout(300);
    } else {
      await page.locator(searchSelector).first().fill('').catch(() => {});
    }
  } catch {
    // skip no-results test on error
  }

  // 3. Restore search input to empty
  try {
    const finalInput = page.locator(searchSelector).first();
    if (await finalInput.count() > 0 && await finalInput.isVisible()) {
      await finalInput.fill('');
    }
  } catch {
    // skip restore on error
  }

  const report: SearchReport = { route, searchFound: true, findings };
  writeJsonArtifact('search', `${routeName}-search.json`, report);
  return report;
}
