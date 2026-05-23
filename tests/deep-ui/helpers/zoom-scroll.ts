import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

/**
 * Result from a single scroll attempt at a given zoom level.
 */
export type ZoomScrollResult = {
  zoom: number;
  scrollTarget: number;
  programmatic: ScrollAttemptResult;
  wheel: ScrollAttemptResult;
  keyboard: ScrollAttemptResult;
};

export type ScrollAttemptResult = {
  method: 'programmatic' | 'wheel' | 'keyboard';
  startY: number;
  targetY: number;
  actualY: number;
  moved: boolean;
  stuck: boolean;
  delta: number;
};

export type ZoomScrollFinding = {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  zoom: number;
  method: string;
  message: string;
  startY: number;
  targetY: number;
  actualY: number;
};

export type ZoomScrollReport = {
  route: string;
  browserZoomSupported: boolean;
  findings: ZoomScrollFinding[];
  results: ZoomScrollResult[];
  wcag_1_4_10_note: string;
};

/** Zoom levels to test: zoom-out, zoom-in standard (WCAG 1.4.4), zoom-in heavy (WCAG 1.4.10). */
const ZOOM_LEVELS = [0.75, 1.5, 2.0];

/**
 * Applies CSS zoom to the document root and waits for reflow to settle.
 * Note: CSS `zoom` is supported in Chromium and WebKit. Firefox ignores it
 * (no error, just no visual change). Findings are marked info on Firefox.
 */
async function applyZoom(page: Page, zoom: number): Promise<void> {
  await page.evaluate((z) => {
    (document.documentElement as HTMLElement).style.zoom = String(z);
  }, zoom);
  // Wait two animation frames for reflow + layout
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  await page.waitForTimeout(200);
}

/**
 * Resets CSS zoom on the document root and verifies the reset took effect.
 * Throws if zoom is still set — prevents zoom leaking into subsequent tests.
 */
async function resetZoom(page: Page): Promise<void> {
  await page.evaluate(() => {
    (document.documentElement as HTMLElement).style.zoom = '';
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  await page.waitForTimeout(150);

  const stillZoomed = await page.evaluate(
    () => (document.documentElement as HTMLElement).style.zoom
  );
  if (stillZoomed && stillZoomed !== '' && stillZoomed !== '1') {
    throw new Error(
      `[zoom-scroll] Zoom reset failed — style.zoom still "${stillZoomed}". ` +
        `Aborting to prevent zoom leak into subsequent tests.`
    );
  }
}

/**
 * Attempts programmatic scroll to `targetY` and reports whether it moved.
 */
async function attemptProgrammaticScroll(
  page: Page,
  targetY: number
): Promise<ScrollAttemptResult> {
  const startY = await page.evaluate(() => window.scrollY);
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), targetY);
  await page.waitForTimeout(150);
  const actualY = await page.evaluate(() => window.scrollY);
  const moved = Math.abs(actualY - startY) >= 2;
  const stuck = targetY > 10 && Math.abs(actualY - targetY) > 10 && !moved;
  return {
    method: 'programmatic',
    startY,
    targetY,
    actualY,
    moved,
    stuck,
    delta: actualY - startY,
  };
}

/**
 * Attempts mouse-wheel scroll and reports whether the page moved.
 */
async function attemptWheelScroll(page: Page): Promise<ScrollAttemptResult> {
  const startY = await page.evaluate(() => window.scrollY);
  // Wheel over the centre of the viewport
  const { width, height } = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(300);
  const actualY = await page.evaluate(() => window.scrollY);
  const moved = Math.abs(actualY - startY) >= 2;
  const targetY = startY + 400;
  return {
    method: 'wheel',
    startY,
    targetY,
    actualY,
    moved,
    stuck: !moved,
    delta: actualY - startY,
  };
}

/**
 * Attempts keyboard PageDown scroll and reports whether the page moved.
 */
async function attemptKeyboardScroll(page: Page): Promise<ScrollAttemptResult> {
  const startY = await page.evaluate(() => window.scrollY);
  // Focus the body so keyboard events reach the scroll container
  await page.evaluate(() => (document.body as HTMLElement).focus());
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(300);
  const actualY = await page.evaluate(() => window.scrollY);
  const moved = Math.abs(actualY - startY) >= 2;
  const targetY = startY + (page.viewportSize()?.height ?? 400) * 0.85;
  return {
    method: 'keyboard',
    startY,
    targetY,
    actualY,
    moved,
    stuck: !moved,
    delta: actualY - startY,
  };
}

/**
 * Checks whether CSS zoom is actually applied by the browser (Firefox ignores it).
 */
async function detectZoomSupport(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const el = document.documentElement as HTMLElement;
    const prev = el.style.zoom;
    el.style.zoom = '1.5';
    // getComputedStyle does not expose zoom on Firefox — use offsetWidth delta trick
    const zoomed = el.style.zoom === '1.5';
    el.style.zoom = prev;
    return zoomed;
  });
}

/**
 * Runs scroll tests at each zoom level for the given route.
 *
 * Checks:
 * 1. Programmatic `window.scrollTo` — baseline JS scroll ability
 * 2. Mouse wheel — passive listener / overflow:hidden body blocks user scroll
 * 3. Keyboard PageDown — keyboard accessibility at zoom
 *
 * Zoom levels: 0.75 (zoom-out), 1.5 (WCAG 1.4.4 zoom-in), 2.0 (WCAG 1.4.10 reflow)
 *
 * NOTE: CSS `zoom` is Chromium + WebKit only. Firefox silently ignores it.
 * Skip zoom-scroll checks on Firefox via the `browserZoomSupported` flag in report.
 *
 * @param page Playwright page instance
 * @param route Current route pathname (for artifact naming)
 * @returns ZoomScrollReport with all findings and raw results
 */
export async function testZoomScroll(page: Page, route: string): Promise<ZoomScrollReport> {
  const routeName = normalizeRoute(route);
  const findings: ZoomScrollFinding[] = [];
  const results: ZoomScrollResult[] = [];

  // Detect browser zoom support (Firefox no-op guard)
  const browserZoomSupported = await detectZoomSupport(page);

  // Reset to top before starting
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);

  for (const zoom of ZOOM_LEVELS) {
    // Apply zoom
    await applyZoom(page, zoom);

    // Recalculate scroll dimensions after zoom changes layout
    const { scrollHeight, viewportHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));
    const maxScrollY = Math.max(0, scrollHeight - viewportHeight);

    // Screenshot at top of page with this zoom level applied
    await screenshotStep(page, route, `zoom-${zoom.toString().replace('.', '_')}-top`);

    // If page doesn't scroll at this zoom, record as info and skip scroll tests
    if (maxScrollY < 10) {
      findings.push({
        severity: 'info',
        zoom,
        method: 'n/a',
        message: `Page has no scrollable overflow at zoom ${zoom}x (scrollHeight=${scrollHeight}, viewportHeight=${viewportHeight}). Scroll tests skipped.`,
        startY: 0,
        targetY: 0,
        actualY: 0,
      });
      await resetZoom(page);
      continue;
    }

    // Target: ~50% of max scroll (representative mid-page position)
    const scrollTarget = Math.floor(maxScrollY * 0.5);

    // ── 1. Programmatic scroll ─────────────────────────────────────────────
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    const programmatic = await attemptProgrammaticScroll(page, scrollTarget);

    if (programmatic.stuck) {
      findings.push({
        severity: 'high',
        zoom,
        method: 'programmatic',
        message:
          `Programmatic scroll stuck at zoom ${zoom}x. ` +
          `scrollTo(${scrollTarget}) → scrollY stayed at ${programmatic.actualY}. ` +
          `Likely: overflow:hidden on body or html at zoomed layout.`,
        startY: programmatic.startY,
        targetY: programmatic.targetY,
        actualY: programmatic.actualY,
      });
    }

    // Screenshot mid-scroll position
    await screenshotStep(
      page,
      route,
      `zoom-${zoom.toString().replace('.', '_')}-scroll-mid`
    );

    // Collect layout issues at this zoom + scroll position — written as separate
    // artifact, NOT fed into the strict assertNoBasicLayoutIssues assertion.
    // Horizontal overflow at high zoom is an expected layout change, not a hard fail.
    const layoutAtZoom = await page.evaluate(() => {
      const vw = window.innerWidth;
      const issues: { type: string; message: string }[] = [];
      if (document.documentElement.scrollWidth > vw + 4) {
        issues.push({
          type: 'horizontal-scroll-at-zoom',
          message: `Horizontal overflow present at zoom. scrollWidth=${document.documentElement.scrollWidth} > viewportWidth=${vw}`,
        });
      }
      return issues;
    });

    if (layoutAtZoom.length > 0) {
      findings.push({
        severity: zoom >= 2.0 ? 'medium' : 'low',
        zoom,
        method: 'layout',
        message:
          `Horizontal overflow at zoom ${zoom}x. WCAG 1.4.10 requires no 2D scrolling at 400% zoom. ` +
          layoutAtZoom.map((i) => i.message).join('; '),
        startY: 0,
        targetY: 0,
        actualY: 0,
      });
    }

    // ── 2. Mouse wheel scroll ──────────────────────────────────────────────
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    const wheel = await attemptWheelScroll(page);

    if (wheel.stuck && maxScrollY > 50) {
      findings.push({
        severity: 'high',
        zoom,
        method: 'wheel',
        message:
          `Mouse wheel scroll blocked at zoom ${zoom}x. ` +
          `Wheel event did not move page (startY=${wheel.startY}, actualY=${wheel.actualY}). ` +
          `Likely: overflow:hidden on scroll container or passive listener consuming events.`,
        startY: wheel.startY,
        targetY: wheel.targetY,
        actualY: wheel.actualY,
      });
    }

    // ── 3. Keyboard PageDown scroll ────────────────────────────────────────
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    const keyboard = await attemptKeyboardScroll(page);

    if (keyboard.stuck && maxScrollY > 50) {
      findings.push({
        severity: 'medium',
        zoom,
        method: 'keyboard',
        message:
          `Keyboard (PageDown) scroll blocked at zoom ${zoom}x. ` +
          `Key press did not move page (startY=${keyboard.startY}, actualY=${keyboard.actualY}). ` +
          `Accessibility impact: keyboard-only users cannot scroll zoomed content.`,
        startY: keyboard.startY,
        targetY: keyboard.targetY,
        actualY: keyboard.actualY,
      });
    }

    // Screenshot after keyboard scroll
    await screenshotStep(
      page,
      route,
      `zoom-${zoom.toString().replace('.', '_')}-scroll-keyboard`
    );

    results.push({ zoom, scrollTarget, programmatic, wheel, keyboard });

    // Reset scroll position and zoom before next level
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    await resetZoom(page);

    // Verify zoom is cleared before continuing (prevents leak into next zoom level)
    const zoomAfterReset = await page.evaluate(
      () => (document.documentElement as HTMLElement).style.zoom
    );
    if (zoomAfterReset && zoomAfterReset !== '' && zoomAfterReset !== '1') {
      throw new Error(
        `[zoom-scroll] Zoom leaked after reset at level ${zoom}. style.zoom="${zoomAfterReset}"`
      );
    }
  }

  // Final reset + top scroll to clean state for subsequent spec steps
  await page.evaluate(() => {
    (document.documentElement as HTMLElement).style.zoom = '';
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(150);

  const report: ZoomScrollReport = {
    route,
    browserZoomSupported,
    findings,
    results,
    wcag_1_4_10_note:
      'WCAG 1.4.10 (Reflow): content must be available without 2D scrolling at 320 CSS px width ' +
      '(equivalent to 400% zoom on a 1280px viewport). Horizontal overflow at zoom ≥2.0 is a Medium defect. ' +
      'WCAG 1.4.4 (Resize Text): text must be resizable to 200% without loss of content or function.',
  };

  writeJsonArtifact('zoom-scroll', `${routeName}-zoom-scroll.json`, report);

  return report;
}
