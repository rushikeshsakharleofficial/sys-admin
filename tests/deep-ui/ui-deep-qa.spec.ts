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
import { auditBrokenImages } from './helpers/broken-images';
import { auditLazyImages } from './helpers/lazy-images';
import { testReducedMotion } from './helpers/reduced-motion';
import { auditResponsiveBehavior } from './helpers/responsive-behavior';
import { auditToasts } from './helpers/toasts';
import { auditTables } from './helpers/tables';
import { auditPWA } from './helpers/pwa';
import { auditAuthSurface } from './helpers/auth';
import { testBackForwardNavigation } from './helpers/back-forward';
import { auditEdgeStates } from './helpers/edge-states';
import { auditPlaceholderContent } from './helpers/placeholder-content';
import { auditLinks } from './helpers/link-checker';
import { auditCookieConsent } from './helpers/cookie-consent';
import { auditHtmlValidation } from './helpers/html-validation';
import { auditMediaPlayers } from './helpers/media-player';
import { auditCarousels } from './helpers/carousel';
import { auditPrintMedia } from './helpers/print-media';
import { auditCsrf } from './helpers/csrf';
import { auditSitemapAndRobots } from './helpers/sitemap';
import { auditSearch } from './helpers/search';
import { auditScrollAxes } from './helpers/scroll-axes';
import { auditButtonAnimations } from './helpers/button-animations';
import { auditPopupQuality } from './helpers/popup-quality';
import { auditContentClipping } from './helpers/content-clipping';
import { auditUserLifecycle } from './helpers/user-lifecycle';
import { auditSidebar } from './helpers/sidebar';
import { auditDialogScroll } from './helpers/dialog-scroll';
import { auditFormAlignment } from './helpers/form-alignment';
import { auditTypography } from './helpers/typography';
import { auditAuthPermissions } from './helpers/auth-permissions';

/**
 * Deep UI QA — enhanced entry point.
 *
 * Covers: layout, interactions, forms, overlays, network, storage,
 * accessibility, performance (Web Vitals), SEO, DOM security,
 * broken images, lazy images, reduced motion, responsive behavior,
 * toasts, tables, PWA, auth surface, back/forward navigation, edge states,
 * placeholder content, link checker, cookie consent, HTML validation,
 * media players, carousels, print media, CSRF, sitemap/robots, search.
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

      // ── Broken images ────────────────────────────────────────────────────
      // Detects: img with naturalWidth=0 (broken src), missing alt, empty src,
      // broken CSS background-image, picture without fallback img.
      // HIGH findings (broken/empty src) asserted below.
      const brokenImagesFindings = await auditBrokenImages(page, route);
      const brokenImagesHigh = brokenImagesFindings.filter(
        (f) => f.severity === 'high'
      );

      // ── Lazy images ──────────────────────────────────────────────────────
      // Scrolls to trigger lazy-loaded images, verifies they resolve.
      // Returns to top after. HIGH = lazy image still unloaded after scroll.
      const lazyImageReport = await auditLazyImages(page, route);
      const lazyImagesHigh = lazyImageReport.findings.filter(
        (f) => f.severity === 'high'
      );

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

      // ── Reduced motion ───────────────────────────────────────────────────
      // Emulates prefers-reduced-motion: reduce, checks if animations stop.
      // Resets to no-preference after. WCAG 2.3.3.
      // Medium findings only — not hard-asserted (too site-specific).
      const reducedMotionReport = await testReducedMotion(page, route);

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

      // ── Responsive behavior ──────────────────────────────────────────────
      // Resizes viewport to desktop/tablet/mobile, checks nav, overflow,
      // font size, floating-UI CTA overlap, table clipping.
      // Restores 1440x900 after. HIGH = mobile nav completely missing.
      const responsiveReport = await auditResponsiveBehavior(page, route);
      const responsiveHigh = responsiveReport.findings.filter(
        (f) => f.severity === 'high'
      );

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

      // ── Toast audit ──────────────────────────────────────────────────────
      // Audits currently-visible toasts: contrast, position, role, dismiss,
      // stack overflow. Inspection only — no toast triggering.
      const toastReport = await auditToasts(page, route);

      // ── Table audit ──────────────────────────────────────────────────────
      // Structural checks + sort/pagination/search interactions on tables.
      const tableReport = await auditTables(page, route);

      // ── SEO audit ────────────────────────────────────────────────────────
      const seoIssues = await auditSeo(page);
      writeJsonArtifact('seo', `${routeName}-seo.json`, seoIssues);

      // ── PWA audit ────────────────────────────────────────────────────────
      // Checks manifest, service worker, theme-color, viewport meta.
      // Informational only for non-PWA sites.
      const pwaReport = await auditPWA(page, route);

      // ── Auth surface audit ───────────────────────────────────────────────
      // Inspection only — no login/logout. Detects login page patterns,
      // token-in-localStorage, password field exposure, auth cookies.
      // CRITICAL = password field not type="password".
      const authReport = await auditAuthSurface(page, route);
      const authCritical = authReport.findings.filter(
        (f) => f.severity === 'critical'
      );

      // ── User lifecycle ───────────────────────────────────────────────────
      // Detects user management panel (create user form, user list, permission UI,
      // session management surface, logout button, login page).
      // Audits 10 checks: form fields, email validation, role UI, session cookies,
      // logout via GET (CSRF risk), no-logout on auth pages, MFA presence.
      // CRITICAL = password field not type="password" in create-user form.
      // Never submits forms or creates real users.
      const userLifecycleReport = await auditUserLifecycle(page, route);
      const userLifecycleCritical = userLifecycleReport.findings.filter(
        (f) => f.severity === 'critical'
      );
      const userLifecycleHigh = userLifecycleReport.findings.filter(
        (f) => f.severity === 'high'
      );

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

      // ── Back/forward navigation ──────────────────────────────────────────
      // Clicks first internal link, tests goBack/goForward/reload.
      // Navigates back to route after. HIGH = back broken / page blank.
      const backForwardReport = await testBackForwardNavigation(page, route, baseURL || '/');
      const backForwardHigh = backForwardReport.findings.filter(
        (f) => f.severity === 'high'
      );

      // ── Edge states ──────────────────────────────────────────────────────
      // Checks 404 handling, infinite spinner, skeleton stuck, error boundary,
      // empty state indicators. Navigates to /nonexistent-404-test, returns.
      const edgeStateReport = await auditEdgeStates(page, route, baseURL || '/');
      const edgeStateHigh = edgeStateReport.findings.filter(
        (f) => f.severity === 'high'
      );

      // ── Placeholder content ──────────────────────────────────────────────
      // Detects lorem ipsum, TODO/FIXME, test data, placeholder images.
      // HIGH = visible placeholder text in production UI.
      const placeholderFindings = await auditPlaceholderContent(page, route);
      const placeholderHigh = placeholderFindings.filter((f) => f.severity === 'high');

      // ── Link checker ─────────────────────────────────────────────────────
      // Audits anchor hrefs: broken (#-only no-op, mailto/tel missing text),
      // missing rel=noopener on external _blank links, empty href.
      // HIGH = dead links that break primary navigation.
      const linkReport = await auditLinks(page, route);
      const linkCheckerHigh = linkReport.findings.filter((f) => f.severity === 'high');

      // ── Cookie consent ───────────────────────────────────────────────────
      // Checks consent banner presence, accept/reject buttons, GDPR phrasing,
      // cookies set before consent. HIGH = cookies stored before any consent.
      const cookieConsentReport = await auditCookieConsent(page, route);
      const cookieConsentHigh = cookieConsentReport.findings.filter((f) => f.severity === 'high');

      // ── HTML validation ──────────────────────────────────────────────────
      // Checks duplicate IDs, missing <html lang>, deprecated tags, misuse of
      // interactive-element nesting, missing doctype. HIGH = duplicate IDs / no lang.
      const htmlValidationFindings = await auditHtmlValidation(page, route);
      const htmlValidationHigh = htmlValidationFindings.filter((f) => f.severity === 'high');

      // ── Media players ────────────────────────────────────────────────────
      // Audits <video>/<audio>: captions, autoplay without mute, controls
      // attribute, poster image, keyboard focus. Informational for non-media sites.
      const mediaPlayerReport = await auditMediaPlayers(page, route);

      // ── Carousels ────────────────────────────────────────────────────────
      // Detects carousel/slider widgets, checks keyboard nav, autoplay pause,
      // ARIA labels, indicator dots. Informational if no carousels present.
      const carouselReport = await auditCarousels(page, route);

      // ── Print media ──────────────────────────────────────────────────────
      // Emulates print media, checks print stylesheet presence, nav/sidebar
      // visibility, page-break issues. Resets to screen after.
      const printMediaReport = await auditPrintMedia(page, route);

      // ── CSRF ─────────────────────────────────────────────────────────────
      // Inspects forms for CSRF token fields, meta tags, SameSite cookie attrs.
      // Informational — DOM-only check, cannot verify server-side validation.
      const csrfFindings = await auditCsrf(page, route);

      // ── Sitemap + robots.txt ─────────────────────────────────────────────
      // Fetches /sitemap.xml and /robots.txt via page.evaluate fetch (no navigate).
      // Checks for missing files, noindex on public pages, disallow misuse.
      // Only runs on first route to avoid repeated fetches.
      const sitemapReport = await auditSitemapAndRobots(page, route, baseURL || '/');

      // ── Search ───────────────────────────────────────────────────────────
      // Detects search input, tests empty/special-char queries, checks for
      // no-results state, keyboard submit, ARIA role=search.
      const searchReport = await auditSearch(page, route);

      // ── Content clipping ─────────────────────────────────────────────────
      // Detects elements clipped past viewport edge, text truncated by ellipsis,
      // overflow:hidden containers clipping children, fixed header/footer covering
      // content, image object-fit crop, absolute elements outside parent bounds.
      // HIGH = element clipped right/left or content hidden under fixed header.
      // All 7 checks run in ONE page.evaluate() round-trip.
      const contentClippingReport = await auditContentClipping(page, route);
      const contentClippingHigh = contentClippingReport.findings.filter((f) => f.severity === 'high');

      // ── Scroll axes ──────────────────────────────────────────────────────
      // Tests vertical + horizontal scroll on page and overflow-x containers.
      // HIGH = vertical scroll completely broken (page taller than viewport but scrollY stuck).
      const scrollAxesReport = await auditScrollAxes(page, route);
      const scrollAxesHigh = scrollAxesReport.findings.filter((f) => f.severity === 'high');

      // ── Button animations ────────────────────────────────────────────────
      // Checks CSS transitions, box-shadow, hover/active state feedback,
      // disabled styling, loading states. Uses GPU-compositing best practices.
      // MEDIUM = buttons with no hover feedback.
      const buttonAnimReport = await auditButtonAnimations(page, route);

      // ── Popup quality ────────────────────────────────────────────────────
      // Inspects currently-visible modals/dialogs/drawers for shadow, backdrop,
      // open/close animation, z-index, viewport containment, internal scroll.
      // HIGH = popup z-index too low or clipped outside viewport.
      const popupQualityReport = await auditPopupQuality(page, route);
      const popupQualityHigh = popupQualityReport.findings.filter((f) => f.severity === 'high');

      // ── Auth permissions audit ───────────────────────────────────────────
      // 8 checks (inspection only, never submits): login form quality,
      // remember-me label, permission-blocked UI elements, permission error
      // message quality (aria-live, descriptive text), role-gated elements,
      // logout via GET (CSRF risk), API 403/401 in DOM, sensitive data leak
      // after permission denial.
      // CRITICAL = password-field-not-type-password, sensitive-data-after-permission-denial
      // HIGH = remember-me-no-label, logout-via-get-link
      const authPermReport = await auditAuthPermissions(page, route);
      const authPermCritical = authPermReport.findings.filter((f) => f.severity === 'critical');
      const authPermHigh = authPermReport.findings.filter((f) => f.severity === 'high');

      // ── Typography audit ─────────────────────────────────────────────────
      // 10 checks: body font size, line-height ratio, heading hierarchy,
      // line length (readability), font family count, web font preload,
      // font-display:swap, small text (< 10px), text overflow clipping,
      // letter spacing extremes.
      // HIGH = body font < 12px, line-height ratio < 1.2, content > 900px wide,
      //        any element < 10px font size.
      const typographyReport = await auditTypography(page, route);
      const typographyHigh = typographyReport.findings.filter((f) => f.severity === 'high');

      // ── Sidebar audit ────────────────────────────────────────────────────
      // Detects sidebar, checks: z-index, nav link labels (icon-only a11y),
      // collapse toggle keyboard access, mobile drawer open/close/escape,
      // internal scroll for long nav lists.
      // HIGH = icon-only link no aria-label, toggle tabindex="-1", sidebar
      //        visible on mobile causing h-scroll, no mobile drawer trigger.
      const sidebarReport = await auditSidebar(page, route);
      const sidebarCritical = sidebarReport.findings.filter((f) => f.severity === 'critical');
      const sidebarHigh = sidebarReport.findings.filter((f) => f.severity === 'high');

      // ── Dialog scroll audit ──────────────────────────────────────────────
      // Inspects open dialogs/modals for scroll setup: overflow-y, viewport
      // containment, programmatic scroll test, keyboard (Arrow/PageDown) scroll,
      // content boundary clipping, scroll indicator shadow, aria-modal + focus.
      // HIGH = overflow:hidden on tall dialog, dialog past viewport bottom with
      //        no internal scroll, scrollTop stuck after assignment.
      const dialogScrollReport = await auditDialogScroll(page, route);
      const dialogScrollHigh = dialogScrollReport.findings.filter((f) => f.severity === 'high');

      // ── Form alignment audit ─────────────────────────────────────────────
      // 10 checks per form: label-input alignment (overlap detection), field
      // spacing, input width consistency, border-radius uniformity, padding/
      // height, error message placement, button alignment, hint text position,
      // required field indicators. Single page.evaluate() round-trip.
      // HIGH = label overlaps input, spacing < 4px, input height < 28px.
      const formAlignReport = await auditFormAlignment(page, route);
      const formAlignHigh = formAlignReport.findings.filter((f) => f.severity === 'high');

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
        `- Reduced motion: respects=${reducedMotionReport.siteRespectsReducedMotion}, animating=${reducedMotionReport.animatingElements}\n` +
        `- Responsive: viewports=${responsiveReport.viewportsTested.length} | High: ${responsiveHigh.length} | Total: ${responsiveReport.findings.length}\n` +
        `- Broken images: ${brokenImagesFindings.length} total | High: ${brokenImagesHigh.length}\n` +
        `- Lazy images: ${lazyImageReport.totalLazyImages} lazy | Not loaded: ${lazyImageReport.notLoadedAfterScroll}\n` +
        `- Accessibility issues: ${accessibilityIssues.length}\n` +
        `- Focus visibility issues: ${keyboardResult.focusVisibilityIssues.length}\n` +
        `- Form findings: ${formFindings.length}\n` +
        `- Overlay findings: ${overlaySummary.findings.length}\n` +
        `- Toasts: ${toastReport.toastsFound} found | Findings: ${toastReport.findings.length}\n` +
        `- Tables: ${tableReport.tablesFound} found | Findings: ${tableReport.findings.length}\n` +
        `- SEO issues: ${seoIssues.length}\n` +
        `- PWA: isPWA=${pwaReport.isPWA}, SW=${pwaReport.hasServiceWorker}, manifest=${pwaReport.hasManifest}\n` +
        `- Auth: loginPage=${authReport.isLoginPage}, logoutBtn=${authReport.hasLogoutButton} | Critical: ${authCritical.length}\n` +
        `- User lifecycle: mgmt=${userLifecycleReport.userManagementDetected}, createForm=${userLifecycleReport.createUserFormDetected}, perms=${userLifecycleReport.permissionUIDetected} | Critical: ${userLifecycleCritical.length} | High: ${userLifecycleHigh.length}\n` +
        `- Back/forward: back=${backForwardReport.backWorked}, fwd=${backForwardReport.forwardWorked}, reload=${backForwardReport.reloadWorked}\n` +
        `- Edge states: 404=${edgeStateReport.notFoundPageWorks}, infiniteSpinner=${edgeStateReport.infiniteSpinnerSuspected}\n` +
        `- Security findings (critical): ${criticalSec} / total: ${allSecFindings.length}\n` +
        `- Network records: ${network.records.length} | Leaks: ${leaks.length} | Duplicates: ${duplicates.length} | Large payloads: ${largePayloads.length}\n` +
        `- Placeholder content: ${placeholderFindings.length} total | High: ${placeholderHigh.length}\n` +
        `- Links: ${linkReport.totalLinks} total | High: ${linkCheckerHigh.length} | Total findings: ${linkReport.findings.length}\n` +
        `- Cookie consent: banner=${cookieConsentReport.bannerDetected}, cookiesBeforeConsent=${cookieConsentReport.cookiesBeforeConsent.length} | High: ${cookieConsentHigh.length}\n` +
        `- HTML validation: ${htmlValidationFindings.length} total | High: ${htmlValidationHigh.length}\n` +
        `- Media players: videos=${mediaPlayerReport.videosFound}, audio=${mediaPlayerReport.audiosFound} | Findings: ${mediaPlayerReport.findings.length}\n` +
        `- Carousels: ${carouselReport.carouselsFound} found | Findings: ${carouselReport.findings.length}\n` +
        `- Print media: hasPrintCSS=${printMediaReport.hasPrintStylesheet} | Findings: ${printMediaReport.findings.length}\n` +
        `- CSRF: ${csrfFindings.length} findings\n` +
        `- Sitemap/robots: sitemap=${sitemapReport.sitemapFound}, robots=${sitemapReport.robotsFound} | Findings: ${sitemapReport.findings.length}\n` +
        `- Search: found=${searchReport.searchFound} | Findings: ${searchReport.findings.length}\n` +
        `- Content clipping: ${contentClippingReport.findings.length} total | High: ${contentClippingHigh.length}\n` +
        `- Scroll axes: v=${scrollAxesReport.verticalScrollWorks}, h=${scrollAxesReport.horizontalScrollWorks} | Containers: ${scrollAxesReport.scrollableContainersFound} | High: ${scrollAxesHigh.length}\n` +
        `- Button animations: checked=${buttonAnimReport.buttonsChecked} | Findings: ${buttonAnimReport.findings.length}\n` +
        `- Popup quality: ${popupQualityReport.popupsFound} popups | High: ${popupQualityHigh.length} | Findings: ${popupQualityReport.findings.length}\n` +
        `- Sidebar: detected=${sidebarReport.sidebarDetected}, pos=${sidebarReport.sidebarPosition}, collapsible=${sidebarReport.isCollapsible}, mobileDrawer=${sidebarReport.hasMobileDrawer} | Critical: ${sidebarCritical.length} | High: ${sidebarHigh.length} | Findings: ${sidebarReport.findings.length}\n` +
        `- Dialog scroll: dialogs=${dialogScrollReport.dialogsFound} | High: ${dialogScrollHigh.length} | Findings: ${dialogScrollReport.findings.length}\n` +
        `- Form alignment: forms=${formAlignReport.formsChecked}, inputs=${formAlignReport.inputsChecked} | High: ${formAlignHigh.length} | Findings: ${formAlignReport.findings.length}\n` +
        `- Typography: bodyFont=${typographyReport.bodyFontSize}px, lineHeight=${typographyReport.bodyLineHeight.toFixed(2)}, families=${typographyReport.fontFamiliesFound.length}, webFonts=${typographyReport.webFontsDetected} | High: ${typographyHigh.length} | Findings: ${typographyReport.findings.length}\n` +
        `- Auth permissions: loginForm=${authPermReport.loginFormDetected}, rememberMe=${authPermReport.rememberMeDetected}, blocked=${authPermReport.permissionBlockedElementsFound}, roleGated=${authPermReport.roleGatedElementsFound} | Critical: ${authPermCritical.length} | High: ${authPermHigh.length} | Findings: ${authPermReport.findings.length}\n` +
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

      expect(
        brokenImagesHigh,
        `Broken images on ${route}:\n${JSON.stringify(brokenImagesHigh, null, 2)}`
      ).toEqual([]);

      expect(
        lazyImagesHigh,
        `Lazy images not loaded on ${route}:\n${JSON.stringify(lazyImagesHigh, null, 2)}`
      ).toEqual([]);

      expect(
        authCritical,
        `Critical auth surface issues on ${route}:\n${JSON.stringify(authCritical, null, 2)}`
      ).toEqual([]);

      expect(
        userLifecycleCritical,
        `Critical user lifecycle issues on ${route}:\n${JSON.stringify(userLifecycleCritical, null, 2)}`
      ).toEqual([]);

      expect(
        userLifecycleHigh,
        `High user lifecycle issues on ${route}:\n${JSON.stringify(userLifecycleHigh, null, 2)}`
      ).toEqual([]);

      expect(
        backForwardHigh,
        `Back/forward navigation broken on ${route}:\n${JSON.stringify(backForwardHigh, null, 2)}`
      ).toEqual([]);

      expect(
        edgeStateHigh,
        `Edge state issues on ${route}:\n${JSON.stringify(edgeStateHigh, null, 2)}`
      ).toEqual([]);

      // responsiveHigh and responsiveReport: assert HIGH (mobile nav missing).
      expect(
        responsiveHigh,
        `Responsive layout broken on ${route}:\n${JSON.stringify(responsiveHigh, null, 2)}`
      ).toEqual([]);

      expect(
        placeholderHigh,
        `Placeholder/test content in production on ${route}:\n${JSON.stringify(placeholderHigh, null, 2)}`
      ).toEqual([]);

      expect(
        linkCheckerHigh,
        `Broken links on ${route}:\n${JSON.stringify(linkCheckerHigh, null, 2)}`
      ).toEqual([]);

      expect(
        htmlValidationHigh,
        `HTML validation errors on ${route}:\n${JSON.stringify(htmlValidationHigh, null, 2)}`
      ).toEqual([]);

      expect(
        cookieConsentHigh,
        `Cookie consent violations on ${route}:\n${JSON.stringify(cookieConsentHigh, null, 2)}`
      ).toEqual([]);

      expect(
        contentClippingHigh,
        `Content clipped on ${route}:\n${JSON.stringify(contentClippingHigh, null, 2)}`
      ).toEqual([]);

      expect(
        scrollAxesHigh,
        `Scroll broken on ${route}:\n${JSON.stringify(scrollAxesHigh, null, 2)}`
      ).toEqual([]);

      expect(
        popupQualityHigh,
        `Popup quality issues on ${route}:\n${JSON.stringify(popupQualityHigh, null, 2)}`
      ).toEqual([]);

      expect(
        sidebarCritical,
        `Critical sidebar issues on ${route}:\n${JSON.stringify(sidebarCritical, null, 2)}`
      ).toEqual([]);

      expect(
        sidebarHigh,
        `High sidebar issues on ${route}:\n${JSON.stringify(sidebarHigh, null, 2)}`
      ).toEqual([]);

      expect(
        dialogScrollHigh,
        `Dialog scroll issues on ${route}:\n${JSON.stringify(dialogScrollHigh, null, 2)}`
      ).toEqual([]);

      expect(
        formAlignHigh,
        `Form alignment issues on ${route}:\n${JSON.stringify(formAlignHigh, null, 2)}`
      ).toEqual([]);

      expect(
        typographyHigh,
        `Typography issues on ${route}:\n${JSON.stringify(typographyHigh, null, 2)}`
      ).toEqual([]);

      expect(
        authPermCritical,
        `Critical auth/permission issues on ${route}:\n${JSON.stringify(authPermCritical, null, 2)}`
      ).toEqual([]);

      expect(
        authPermHigh,
        `High auth/permission issues on ${route}:\n${JSON.stringify(authPermHigh, null, 2)}`
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
