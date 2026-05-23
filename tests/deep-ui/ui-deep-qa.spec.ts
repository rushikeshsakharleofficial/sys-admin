import { test, expect } from '@playwright/test';
import { seedRoutes, discoverLinks, normalizeRoute } from './helpers/routes';
import { screenshotStep, fullPageScreenshot, visualRegression } from './helpers/screenshots';
import {
  attachNetworkMonitor, scanResponsesForLeaks, writeNetworkReport,
  assertNetworkHealthy, scanUrlsForTokenLeaks, detectDuplicateCalls, detectLargePayloads,
} from './helpers/network';
import { collectStorageState, writeStorageReport } from './helpers/storage';
import { collectLayoutIssues } from './helpers/layout';
import { testVisibleButtons, testVisibleLinks } from './helpers/interactions';
import { testZoomScroll } from './helpers/zoom-scroll';
import { testThemeComparison } from './helpers/theme-comparison';
import { writeFixPlan } from './helpers/fix-plan';
import { collectAccessibilityIssues, collectKeyboardFocusOrder } from './helpers/accessibility';
import { attachConsoleMonitor, severeConsoleFindings } from './helpers/console';
import { collectPerformanceSnapshot, poorWebVitals } from './helpers/performance';
import { appendMarkdownReport, writeJsonArtifact } from './helpers/report';
import { auditForms, triggerAndCaptureValidation } from './helpers/forms';
import { discoverAndAuditOverlays } from './helpers/overlays';
import { auditSeo } from './helpers/seo';
import { auditDomSecurity, auditSecurityHeaders, auditMixedContent, scanUrlsForTokenLeaks as secScanUrls } from './helpers/security';

/**
 * Deep UI QA — enhanced entry point.
 *
 * Covers: layout, interactions, forms, overlays, network, storage,
 * accessibility, performance (Web Vitals), SEO, DOM security.
 */
test.describe('Deep UI QA', () => {
  test('discover and test visible routes', async ({ page, context, baseURL }, testInfo) => {
    const discoveredRoutes = new Set<string>(seedRoutes);

    await page.goto(baseURL || '/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    for (const link of await discoverLinks(page)) {
      discoveredRoutes.add(link);
    }

    appendMarkdownReport(
      'final-report.md',
      `# Deep UI QA Report\n\nBase URL: ${baseURL || '/'}\n\nProject: ${testInfo.project.name}\n\nDiscovered routes: ${Array.from(discoveredRoutes).join(', ')}\n`
    );

    for (const route of discoveredRoutes) {
      const routeName = normalizeRoute(route);
      const network = attachNetworkMonitor(page);
      const consoleMonitor = attachConsoleMonitor(page);

      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(700);

      // ── Storage: before ──────────────────────────────────────────────────
      const storageBefore = await collectStorageState(page, context);
      await writeStorageReport(routeName, 'before', storageBefore);

      // ── Performance: before ──────────────────────────────────────────────
      const performanceBefore = await collectPerformanceSnapshot(page);
      writeJsonArtifact('performance', `${routeName}-performance-before.json`, performanceBefore);

      // ── Screenshots: top + full page ─────────────────────────────────────
      await screenshotStep(page, route, '01-top');
      await fullPageScreenshot(page, route, '02-full-page');

      // ── Accessibility ────────────────────────────────────────────────────
      const accessibilityIssues = await collectAccessibilityIssues(page);
      writeJsonArtifact('accessibility', `${routeName}-accessibility.json`, accessibilityIssues);

      const keyboardResult = await collectKeyboardFocusOrder(page, 30);
      writeJsonArtifact('accessibility', `${routeName}-keyboard-focus-order.json`, keyboardResult);

      // ── Scroll + layout checks ───────────────────────────────────────────
      const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const viewportHeight = await page.evaluate(() => window.innerHeight);
      const positions: number[] = [
        0,
        Math.floor(scrollHeight * 0.25),
        Math.floor(scrollHeight * 0.5),
        Math.floor(scrollHeight * 0.75),
        Math.max(0, scrollHeight - viewportHeight),
      ];

      for (let i = 0; i < positions.length; i++) {
        await page.evaluate((y) => window.scrollTo(0, y), positions[i]);
        await page.waitForTimeout(300);
        await screenshotStep(page, route, `scroll-${i}-${positions[i]}`);
        const layoutIssues = await collectLayoutIssues(page);
        writeJsonArtifact('layout', `${routeName}-layout-scroll-${i}.json`, layoutIssues);
        expect(
          layoutIssues,
          `Layout issues on ${route} at scroll ${positions[i]}:\n${JSON.stringify(layoutIssues, null, 2)}`
        ).toEqual([]);
      }

      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      // ── Zoom + scroll tests ──────────────────────────────────────────────
      // CSS zoom is Chromium + WebKit only; Firefox silently ignores it.
      // Findings are written to qa-artifacts/zoom-scroll/ — NOT fed into
      // the strict assertNoBasicLayoutIssues assertion because horizontal
      // overflow at high zoom is expected behaviour, not a hard test fail.
      // Scroll-stuck findings (programmatic/wheel/keyboard blocked) are
      // reported as High/Medium defects in the zoom-scroll JSON artifact.
      const zoomScrollReport = await testZoomScroll(page, route);
      const zoomScrollHighFindings = zoomScrollReport.findings.filter(
        (f) => f.severity === 'critical' || f.severity === 'high'
      );
      // Assert: scroll must not be completely broken (stuck) at any zoom level.
      // Horizontal overflow at zoom and info-level skips do NOT fail here.
      expect(
        zoomScrollHighFindings,
        `Scroll broken under zoom on ${route}:\n${JSON.stringify(zoomScrollHighFindings, null, 2)}`
      ).toEqual([]);

      // Verify zoom fully reset before continuing (prevents leak into interactions
      // and visualRegression baseline screenshots).
      const zoomAfterTest = await page.evaluate(
        () => (document.documentElement as HTMLElement).style.zoom
      );
      expect(
        zoomAfterTest,
        `[zoom-scroll] Zoom leaked after testZoomScroll on ${route}. ` +
          `style.zoom="${zoomAfterTest}" — subsequent tests will run zoomed.`
      ).toMatch(/^(|1)$/);

      // ── Theme comparison ─────────────────────────────────────────────────
      // Compares light vs dark rendering using prefers-color-scheme emulation.
      // Primary check: elements that become near-invisible (contrast <1.5) in
      // one theme but are readable (≥4.5) in the other — HIGH severity.
      // Secondary: theme toggle smoke test and layout overflow in dark mode.
      // Resets to light mode after; body-bg leak guard runs before interactions
      // and visualRegression to prevent baseline drift.
      const themeReport = await testThemeComparison(page, route);
      const themeHighFindings = themeReport.issues.filter(
        (f) => f.severity === 'critical' || f.severity === 'high'
      );
      expect(
        themeHighFindings,
        `Theme-broken elements (invisible in one theme) on ${route}:\n${JSON.stringify(themeHighFindings, null, 2)}`
      ).toEqual([]);

      // Verify emulateMedia reset to light before continuing
      // (page.emulateMedia has no getter — verify via body bg change guard in helper;
      // re-assert emulation is light so visualRegression baselines are stable)
      await page.emulateMedia({ colorScheme: 'light' });

      // ── Interaction tests ────────────────────────────────────────────────
      await testVisibleLinks(page, route);
      await testVisibleButtons(page, route);

      // ── Form audit ───────────────────────────────────────────────────────
      const formFindings = await auditForms(page);
      writeJsonArtifact('forms', `${routeName}-forms.json`, formFindings);
      await triggerAndCaptureValidation(page, route);

      // ── Overlay audit ────────────────────────────────────────────────────
      const overlaySummary = await discoverAndAuditOverlays(page, route);
      writeJsonArtifact('overlays', `${routeName}-overlays.json`, overlaySummary);

      // ── SEO audit ────────────────────────────────────────────────────────
      const seoIssues = await auditSeo(page);
      writeJsonArtifact('seo', `${routeName}-seo.json`, seoIssues);

      // ── DOM security ─────────────────────────────────────────────────────
      const domSecFindings = await auditDomSecurity(page);
      const secHeaderFindings = await auditSecurityHeaders(network.responses);
      const mixedContentFindings = await auditMixedContent(page);
      const tokenInUrlFindings = secScanUrls(network.records.map(r => r.url));
      const allSecFindings = [...domSecFindings, ...secHeaderFindings, ...mixedContentFindings, ...tokenInUrlFindings];
      writeJsonArtifact('security', `${routeName}-security.json`, allSecFindings);

      // ── Storage: after ───────────────────────────────────────────────────
      const storageAfter = await collectStorageState(page, context);
      await writeStorageReport(routeName, 'after', storageAfter);

      // ── Performance: after + Web Vitals ──────────────────────────────────
      const performanceAfter = await collectPerformanceSnapshot(page);
      writeJsonArtifact('performance', `${routeName}-performance-after.json`, performanceAfter);
      const poorVitals = poorWebVitals(performanceAfter);
      writeJsonArtifact('performance', `${routeName}-poor-vitals.json`, poorVitals);

      // ── Network analysis ─────────────────────────────────────────────────
      const leaks = await scanResponsesForLeaks(network.responses);
      const duplicates = detectDuplicateCalls(network.records);
      const largePayloads = await detectLargePayloads(network.responses);
      await writeNetworkReport(routeName, network.records, leaks);
      writeJsonArtifact('network', `${routeName}-duplicates.json`, duplicates);
      writeJsonArtifact('network', `${routeName}-large-payloads.json`, largePayloads);

      // ── Console findings ─────────────────────────────────────────────────
      const consoleFindings = severeConsoleFindings(consoleMonitor.records, consoleMonitor.pageErrors);
      writeJsonArtifact('console', `${routeName}-console.json`, {
        records: consoleMonitor.records,
        allPageErrors: consoleMonitor.pageErrors,
        ...consoleFindings,
      });

      // ── Markdown summary ─────────────────────────────────────────────────
      const criticalSec = allSecFindings.filter(f => f.severity === 'critical').length;
      appendMarkdownReport(
        'final-report.md',
        `\n## Route: ${route}\n\n` +
        `- Zoom/scroll findings: ${zoomScrollReport.findings.length} (browser zoom supported: ${zoomScrollReport.browserZoomSupported})\n` +
        `- Zoom/scroll high+critical: ${zoomScrollHighFindings.length}\n` +
        `- Theme: dark-mode responsive=${themeReport.siteRespondsToDarkMode}, toggle=${themeReport.toggleFound}\n` +
        `- Theme findings: ${themeReport.issues.length} | High+critical: ${themeHighFindings.length}\n` +
        `- Accessibility issues: ${accessibilityIssues.length}\n` +
        `- Focus visibility issues: ${keyboardResult.focusVisibilityIssues.length}\n` +
        `- Form findings: ${formFindings.length}\n` +
        `- Overlay findings: ${overlaySummary.findings.length}\n` +
        `- SEO issues: ${seoIssues.length}\n` +
        `- Security findings (critical): ${criticalSec} / total: ${allSecFindings.length}\n` +
        `- Network records: ${network.records.length} | Leaks: ${leaks.length} | Duplicates: ${duplicates.length} | Large payloads: ${largePayloads.length}\n` +
        `- Console errors/page errors: ${consoleFindings.severeMessages.length + consoleFindings.pageErrors.length}\n` +
        `- React key warnings: ${consoleFindings.reactKeyWarnings.length} | React warnings: ${consoleFindings.reactWarnings.length}\n` +
        `- Hydration errors: ${consoleFindings.hydrationErrors.length}\n` +
        `- Web Vitals: ${performanceAfter.webVitals.map(v => `${v.name}=${v.value}(${v.rating})`).join(', ') || 'n/a'}\n` +
        `- Poor Web Vitals: ${poorVitals.map(v => v.name).join(', ') || 'none'}\n` +
        `- DOM nodes before/after: ${performanceBefore.domNodes}/${performanceAfter.domNodes}\n`
      );

      // ── Assertions ───────────────────────────────────────────────────────
      assertNetworkHealthy(network.records);

      expect(leaks, `Sensitive response leaks on ${route}:\n${JSON.stringify(leaks, null, 2)}`).toEqual([]);

      const criticalSecIssues = allSecFindings.filter(f => f.severity === 'critical');
      expect(criticalSecIssues, `Critical security issues on ${route}:\n${JSON.stringify(criticalSecIssues, null, 2)}`).toEqual([]);

      expect(
        { severeMessages: consoleFindings.severeMessages, pageErrors: consoleFindings.pageErrors },
        `Severe console/page errors on ${route}:\n${JSON.stringify(consoleFindings, null, 2)}`
      ).toEqual({ severeMessages: [], pageErrors: [] });

      expect(
        accessibilityIssues,
        `Accessibility issues on ${route}:\n${JSON.stringify(accessibilityIssues, null, 2)}`
      ).toEqual([]);

      await visualRegression(page, route);
    }

    // ── Fix plan ────────────────────────────────────────────────────────────
    // Runs once after all routes are tested. Reads every JSON artifact written
    // above, aggregates + deduplicates findings across all categories, maps
    // each issue type to a specific fix recommendation + effort estimate, and
    // writes a prioritised fix plan to qa-artifacts/reports/fix-plan.md.
    // Missing artifact files (routes that bailed mid-test) are silently skipped.
    writeFixPlan(Array.from(discoveredRoutes));
  });
});
