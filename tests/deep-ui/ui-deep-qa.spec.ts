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
        pageErrors: consoleMonitor.pageErrors,
        ...consoleFindings,
      });

      // ── Markdown summary ─────────────────────────────────────────────────
      const criticalSec = allSecFindings.filter(f => f.severity === 'critical').length;
      appendMarkdownReport(
        'final-report.md',
        `\n## Route: ${route}\n\n` +
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
  });
});
