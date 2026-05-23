import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type ScrollAxesFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type ScrollAxesReport = {
  route: string;
  verticalScrollWorks: boolean;
  horizontalScrollWorks: boolean;
  scrollableContainersFound: number;
  findings: ScrollAxesFinding[];
};

export async function auditScrollAxes(page: Page, route: string): Promise<ScrollAxesReport> {
  const findings: ScrollAxesFinding[] = [];
  let verticalScrollWorks = true;
  let horizontalScrollWorks = true;
  let scrollableContainersFound = 0;
  const routeName = normalizeRoute(route);

  // Early-exit check
  const pageMetrics = await page.evaluate(() => {
    const overflowXContainers = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(el => {
      const s = getComputedStyle(el);
      return s.overflowX === 'auto' || s.overflowX === 'scroll';
    });
    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      hasOverflowXContainers: overflowXContainers.length > 0,
    };
  }).catch(() => null);

  if (
    pageMetrics &&
    pageMetrics.scrollHeight <= pageMetrics.innerHeight &&
    !pageMetrics.hasOverflowXContainers
  ) {
    const report: ScrollAxesReport = {
      route,
      verticalScrollWorks: true,
      horizontalScrollWorks: true,
      scrollableContainersFound: 0,
      findings: [],
    };
    writeJsonArtifact('scroll-axes', `${routeName}-scroll-axes.json`, report);
    return report;
  }

  // 1. Vertical scroll
  try {
    const vMetrics = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    }));

    if (vMetrics.scrollHeight > vMetrics.innerHeight) {
      await page.evaluate(() => window.scrollTo(0, 500));
      await page.waitForTimeout(200);

      const scrollY = await page.evaluate(() => window.scrollY).catch(() => 0);

      if (scrollY < 100) {
        verticalScrollWorks = false;
        findings.push({
          severity: 'high',
          type: 'vertical-scroll-broken',
          message: `Page is taller than viewport (scrollHeight=${vMetrics.scrollHeight}, innerHeight=${vMetrics.innerHeight}) but window.scrollY=${scrollY} after scrollTo(0, 500)`,
        });
        await screenshotStep(page, route, 'scroll-axes-vertical-broken').catch(() => undefined);
      }

      // scrollBy delta check
      const scrollYBefore = await page.evaluate(() => window.scrollY).catch(() => 0);
      await page.evaluate(() => window.scrollBy(0, 300));
      await page.waitForTimeout(200);
      const scrollYAfter = await page.evaluate(() => window.scrollY).catch(() => 0);
      if (scrollYAfter <= scrollYBefore && vMetrics.scrollHeight > vMetrics.innerHeight) {
        verticalScrollWorks = false;
        if (!findings.some(f => f.type === 'vertical-scroll-broken')) {
          findings.push({
            severity: 'high',
            type: 'vertical-scroll-broken',
            message: `window.scrollBy(0, 300) had no effect (scrollY before=${scrollYBefore}, after=${scrollYAfter})`,
          });
          await screenshotStep(page, route, 'scroll-axes-vertical-scrollby-broken').catch(() => undefined);
        }
      }

      // Keyboard PageDown check
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(100);
      await page.keyboard.press('PageDown').catch(() => undefined);
      await page.waitForTimeout(200);
      const scrollYKeyboard = await page.evaluate(() => window.scrollY).catch(() => 0);
      if (scrollYKeyboard < 50 && vMetrics.scrollHeight > vMetrics.innerHeight) {
        findings.push({
          severity: 'medium',
          type: 'keyboard-pagedown-no-scroll',
          message: `PageDown key did not scroll the page (scrollY=${scrollYKeyboard})`,
        });
        await screenshotStep(page, route, 'scroll-axes-keyboard-broken').catch(() => undefined);
      }
    }
  } catch (_e) {
    // section failed silently
  }

  // Reset to top before next section
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);

  // 2. Horizontal scroll
  try {
    // Overflow-x containers
    const hContainerResults = await page.evaluate(() => {
      const containers = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(el => {
        const s = getComputedStyle(el);
        return s.overflowX === 'auto' || s.overflowX === 'scroll';
      }).slice(0, 5);

      return containers.map(el => {
        const selectorFor = (e: HTMLElement) =>
          e.getAttribute('data-testid') || e.getAttribute('aria-label') || e.id ||
          (typeof e.className === 'string' ? e.className.slice(0, 50) : '') || e.tagName;

        const hasOverflow = el.scrollWidth > el.clientWidth;
        let scrollWorks: boolean | null = null;
        if (hasOverflow) {
          const before = el.scrollLeft;
          el.scrollLeft = 200;
          scrollWorks = el.scrollLeft > 0;
          el.scrollLeft = before; // restore
        }
        return {
          selector: selectorFor(el),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          hasOverflow,
          scrollWorks,
        };
      });
    }).catch(() => []);

    scrollableContainersFound = hContainerResults.length;

    for (const c of hContainerResults) {
      if (c.hasOverflow && c.scrollWorks === false && c.scrollWidth > c.clientWidth + 10) {
        horizontalScrollWorks = false;
        findings.push({
          severity: 'medium',
          type: 'h-scroll-container-broken',
          message: `Overflow-x container has scrollWidth=${c.scrollWidth} > clientWidth=${c.clientWidth} but scrollLeft won't move`,
          selector: c.selector,
        });
        await screenshotStep(page, route, 'scroll-axes-hcontainer-broken').catch(() => undefined);
      }
    }

    // Page-level horizontal scroll
    const pageHScroll = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    })).catch(() => null);

    if (pageHScroll && pageHScroll.scrollWidth > pageHScroll.innerWidth + 10) {
      findings.push({
        severity: 'medium',
        type: 'unexpected-page-h-scroll',
        message: `Page has unexpected horizontal scroll (scrollWidth=${pageHScroll.scrollWidth}, innerWidth=${pageHScroll.innerWidth})`,
      });
      await screenshotStep(page, route, 'scroll-axes-page-hscroll').catch(() => undefined);
    }
  } catch (_e) {
    // section failed silently
  }

  // 3. Scroll snap
  try {
    const snapIssues = await page.evaluate(() => {
      const issues: Array<{ selector: string; message: string }> = [];
      const selectorFor = (el: HTMLElement) =>
        el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.id ||
        (typeof el.className === 'string' ? el.className.slice(0, 50) : '') || el.tagName;

      const snapParents = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(el => {
        const snapType = getComputedStyle(el).getPropertyValue('scroll-snap-type');
        return snapType && snapType !== 'none' && snapType.trim() !== '';
      });

      for (const parent of snapParents) {
        const children = Array.from(parent.children) as HTMLElement[];
        const hasSnapAlign = children.some(child => {
          const align = getComputedStyle(child).getPropertyValue('scroll-snap-align');
          return align && align !== 'none' && align.trim() !== '';
        });
        if (!hasSnapAlign && children.length > 0) {
          issues.push({
            selector: selectorFor(parent),
            message: `scroll-snap-type set on container but no children have scroll-snap-align`,
          });
        }
      }
      return issues;
    }).catch(() => []);

    for (const issue of snapIssues) {
      findings.push({
        severity: 'low',
        type: 'scroll-snap-missing-align',
        message: issue.message,
        selector: issue.selector,
      });
    }
  } catch (_e) {
    // section failed silently
  }

  // 4. Smooth scroll
  try {
    const scrollBehavior = await page.evaluate(() =>
      getComputedStyle(document.documentElement).scrollBehavior
    ).catch(() => '');

    if (scrollBehavior === 'smooth') {
      findings.push({
        severity: 'info',
        type: 'smooth-scroll-enabled',
        message: 'document.documentElement has scroll-behavior: smooth',
      });
    }
  } catch (_e) {
    // section failed silently
  }

  // 5. Reset scroll position
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);

  const report: ScrollAxesReport = {
    route,
    verticalScrollWorks,
    horizontalScrollWorks,
    scrollableContainersFound,
    findings,
  };

  writeJsonArtifact('scroll-axes', `${routeName}-scroll-axes.json`, report);
  return report;
}
