import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type SidebarFinding = {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type SidebarReport = {
  route: string;
  sidebarDetected: boolean;
  sidebarPosition: 'left' | 'right' | 'unknown' | 'none';
  isCollapsible: boolean;
  hasMobileDrawer: boolean;
  findings: SidebarFinding[];
};

type EvaluateResult = {
  sidebarPosition: 'left' | 'right' | 'unknown' | 'none';
  sidebarSelector: string;
  toggleSelector: string;
  toggleTabIndex: number | null;
  isCollapsible: boolean;
  sidebarWidth: number;
  sidebarScrollHeight: number;
  sidebarClientHeight: number;
  sidebarScrollWidth: number;
  sidebarClientWidth: number;
  overflowY: string;
  findings: SidebarFinding[];
};

export async function auditSidebar(page: Page, route: string): Promise<SidebarReport> {
  const report: SidebarReport = {
    route,
    sidebarDetected: false,
    sidebarPosition: 'none',
    isCollapsible: false,
    hasMobileDrawer: false,
    findings: [],
  };

  let toggleSelector = '';
  let sidebarSelector = '';

  try {
    // Early exit — cheap pre-check
    const hasSidebar = await page.evaluate(() =>
      document.querySelector(
        'aside, nav, [role="navigation"], [class*="sidebar" i], [class*="sidenav" i], [class*="side-nav" i], [class*="nav-panel" i], [id*="sidebar" i]'
      ) !== null
    );

    if (!hasSidebar) {
      return report;
    }

    report.sidebarDetected = true;
    await screenshotStep(page, route, 'sidebar-detected');

    // Big single evaluate — CHECKS 1–6, 10
    const evalResult: EvaluateResult = await page.evaluate((): EvaluateResult => {
      const findings: SidebarFinding[] = [];

      const visible = (el: HTMLElement): boolean => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          s.display !== 'none' &&
          s.visibility !== 'hidden' &&
          s.opacity !== '0' &&
          r.width > 0 &&
          r.height > 0
        );
      };

      const selectorFor = (el: Element): string => {
        const h = el as HTMLElement;
        return (
          h.getAttribute('data-testid') ||
          h.getAttribute('aria-label') ||
          h.id ||
          h.className?.toString().slice(0, 50) ||
          h.tagName
        );
      };

      // ---- Detect sidebar element ----
      let sidebar: HTMLElement | null = null;

      const candidates: HTMLElement[] = [];

      // Priority 1: aside
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('aside'))) {
        if (visible(el)) candidates.push(el);
      }

      // Priority 2: [role="navigation"] NOT inside header
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>('[role="navigation"]')
      )) {
        if (!el.closest('header') && visible(el)) candidates.push(el);
      }

      // Priority 3: class-based sidebar selectors
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>(
          '[class*="sidebar" i], [class*="sidenav" i], [class*="side-nav" i], [id*="sidebar" i]'
        )
      )) {
        if (visible(el)) candidates.push(el);
      }

      // Priority 4: nav NOT inside header
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('nav'))) {
        if (!el.closest('header') && visible(el)) candidates.push(el);
      }

      // Pick tallest visible candidate
      let maxHeight = 0;
      for (const el of candidates) {
        if (el.clientHeight > maxHeight) {
          maxHeight = el.clientHeight;
          sidebar = el;
        }
      }

      if (!sidebar) {
        return {
          sidebarPosition: 'none',
          sidebarSelector: '',
          toggleSelector: '',
          toggleTabIndex: null,
          isCollapsible: false,
          sidebarWidth: 0,
          sidebarScrollHeight: 0,
          sidebarClientHeight: 0,
          sidebarScrollWidth: 0,
          sidebarClientWidth: 0,
          overflowY: '',
          findings,
        };
      }

      const rect = sidebar.getBoundingClientRect();
      const style = getComputedStyle(sidebar);

      // Position detection
      let sidebarPosition: 'left' | 'right' | 'unknown' | 'none' = 'unknown';
      if (rect.width > 0) {
        sidebarPosition = rect.left < window.innerWidth / 2 ? 'left' : 'right';
      }

      // Build a stable selector string to pass back
      const sidebarSel = selectorFor(sidebar);

      // ---- CHECK 1: Layout / attachment ----
      const position = style.position;
      const mainContent = document.querySelector<HTMLElement>('main, [role="main"]');
      if (position === 'static' && mainContent) {
        findings.push({
          severity: 'low',
          type: 'sidebar-not-sticky',
          message:
            'Sidebar uses static positioning — may scroll away with page content',
          selector: sidebarSel,
        });
      }

      if (rect.top > 100) {
        findings.push({
          severity: 'medium',
          type: 'sidebar-not-top-attached',
          message: `Sidebar top edge is ${Math.round(rect.top)}px from viewport top — not attached to top`,
          selector: sidebarSel,
        });
      }

      if (rect.bottom < window.innerHeight - 50) {
        findings.push({
          severity: 'low',
          type: 'sidebar-not-full-height',
          message: `Sidebar bottom (${Math.round(rect.bottom)}px) is more than 50px above viewport bottom — not full height`,
          selector: sidebarSel,
        });
      }

      if (sidebarPosition === 'left' && rect.left > 5) {
        findings.push({
          severity: 'low',
          type: 'sidebar-gap-from-edge',
          message: `Sidebar has a ${Math.round(rect.left)}px gap from left viewport edge`,
          selector: sidebarSel,
        });
      }

      if (sidebar.scrollWidth > sidebar.clientWidth + 5) {
        findings.push({
          severity: 'medium',
          type: 'sidebar-h-overflow',
          message: 'Sidebar has horizontal overflow content',
          selector: sidebarSel,
        });
      }

      const sidebarWidth = rect.width;
      if (sidebarWidth > 0 && sidebarWidth < 100) {
        findings.push({
          severity: 'low',
          type: 'sidebar-too-narrow',
          message: `Sidebar width is ${Math.round(sidebarWidth)}px — may be too narrow`,
          selector: sidebarSel,
        });
      } else if (sidebarWidth > 400) {
        findings.push({
          severity: 'low',
          type: 'sidebar-too-wide',
          message: `Sidebar width is ${Math.round(sidebarWidth)}px — may be too wide`,
          selector: sidebarSel,
        });
      }

      // ---- CHECK 2: z-index ----
      const zIndex = style.zIndex;
      if (zIndex === 'auto' || zIndex === '0') {
        findings.push({
          severity: 'medium',
          type: 'sidebar-zindex-unset',
          message: `Sidebar z-index is "${zIndex}" — may be covered by other elements`,
          selector: sidebarSel,
        });
      } else {
        const z = parseInt(zIndex);
        if (!isNaN(z) && z >= 1000) {
          findings.push({
            severity: 'low',
            type: 'sidebar-zindex-too-high',
            message: `Sidebar z-index is ${z} — may cover modals/dialogs`,
            selector: sidebarSel,
          });
        }
      }

      // ---- CHECK 3: Nav links audit ----
      const navItems = Array.from(
        sidebar.querySelectorAll<HTMLElement>('a, button')
      ).slice(0, 30);
      const totalNavItems = navItems.length;

      let noLabelCount = 0;
      let iconNoLabelCount = 0;
      let noopLinkCount = 0;
      let hasAriaCurrent = false;

      for (const item of navItems) {
        const text = (item.textContent || '').trim();
        const ariaLabel = item.getAttribute('aria-label') || '';

        if (!text && !ariaLabel) {
          noLabelCount++;
          if (noLabelCount <= 5) {
            findings.push({
              severity: 'high',
              type: 'sidebar-link-no-label',
              message: 'Sidebar link/button has no visible text and no aria-label',
              selector: selectorFor(item),
            });
          }
        }

        const hasIcon = item.querySelector('img, svg') !== null;
        if (!text && hasIcon && !ariaLabel) {
          iconNoLabelCount++;
          if (iconNoLabelCount <= 5) {
            findings.push({
              severity: 'high',
              type: 'sidebar-icon-no-label',
              message: 'Icon-only sidebar link/button missing aria-label (WCAG 4.1.2)',
              selector: selectorFor(item),
            });
          }
        }

        if (item.tagName === 'A' && (item as HTMLAnchorElement).getAttribute('href') === '#') {
          noopLinkCount++;
          findings.push({
            severity: 'medium',
            type: 'sidebar-noop-link',
            message: 'Sidebar link uses href="#" (no-op)',
            selector: selectorFor(item),
          });
        }

        if (item.getAttribute('aria-current') === 'page') {
          hasAriaCurrent = true;
          findings.push({
            severity: 'info',
            type: 'sidebar-active-aria-current',
            message: 'Sidebar item has aria-current="page" — active state indicated',
            selector: selectorFor(item),
          });
        }
      }

      const currentPath = window.location.pathname;
      if (!hasAriaCurrent && currentPath !== '/' && totalNavItems > 0) {
        findings.push({
          severity: 'low',
          type: 'sidebar-no-active-state',
          message: 'No sidebar item has aria-current="page" on a non-root route',
          selector: sidebarSel,
        });
      }

      // ---- CHECK 4: Navigation landmark ----
      const isNav = sidebar.tagName === 'NAV';
      const hasNavRole =
        isNav ||
        sidebar.getAttribute('role') === 'navigation' ||
        sidebar.querySelector('[role="navigation"]') !== null;

      if (!hasNavRole) {
        findings.push({
          severity: 'medium',
          type: 'sidebar-missing-nav-role',
          message: 'Sidebar has no <nav> element or role="navigation" (WCAG 1.3.6)',
          selector: sidebarSel,
        });
      }

      const navEl: HTMLElement | null = isNav
        ? sidebar
        : (sidebar.querySelector<HTMLElement>('nav, [role="navigation"]') ||
            (sidebar.getAttribute('role') === 'navigation' ? sidebar : null));

      if (navEl) {
        const hasNavLabel =
          navEl.getAttribute('aria-label') || navEl.getAttribute('aria-labelledby');
        if (!hasNavLabel) {
          findings.push({
            severity: 'low',
            type: 'sidebar-nav-no-label',
            message:
              'Navigation landmark has no aria-label or aria-labelledby to distinguish it (WCAG 2.4.1)',
            selector: selectorFor(navEl),
          });
        }
      }

      // ---- CHECK 5: Active / hover state (CSS inspection) ----
      const activeEl = sidebar.querySelector<HTMLElement>(
        '[class*="active" i], [class*="current" i], [class*="selected" i]'
      );
      if (activeEl) {
        findings.push({
          severity: 'info',
          type: 'sidebar-active-class-found',
          message: `Sidebar active-state class found on element: ${selectorFor(activeEl)}`,
          selector: selectorFor(activeEl),
        });
      } else {
        findings.push({
          severity: 'low',
          type: 'sidebar-no-active-indicator',
          message:
            'No sidebar item found with active/current/selected class — active state may not be visually indicated',
          selector: sidebarSel,
        });
      }

      // ---- CHECK 6: Collapse toggle detection ----
      const toggleCandidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          'button[class*="collapse" i], button[class*="toggle" i], button[class*="hamburger" i], ' +
            'button[class*="menu-btn" i], button[class*="sidebar-toggle" i], button[class*="close-sidebar" i], ' +
            'button[aria-expanded], [role="button"][aria-expanded]'
        )
      );

      let toggleEl: HTMLElement | null = null;
      let toggleSel = '';
      let isCollapsible = false;
      let toggleTabIdx: number | null = null;

      if (toggleCandidates.length > 0) {
        toggleEl = toggleCandidates[0];
        isCollapsible = true;
        toggleSel = selectorFor(toggleEl);
        const tabIndex = toggleEl.getAttribute('tabindex');
        toggleTabIdx = tabIndex !== null ? parseInt(tabIndex) : null;

        if (!toggleEl.getAttribute('aria-label') && !toggleEl.getAttribute('aria-labelledby')) {
          findings.push({
            severity: 'medium',
            type: 'sidebar-toggle-no-label',
            message: 'Sidebar collapse toggle button has no aria-label',
            selector: toggleSel,
          });
        }

        const hasAriaExpanded =
          toggleEl.hasAttribute('aria-expanded') ||
          (toggleEl.getAttribute('aria-controls') &&
            document
              .getElementById(toggleEl.getAttribute('aria-controls')!)
              ?.hasAttribute('aria-expanded'));
        if (!hasAriaExpanded) {
          findings.push({
            severity: 'medium',
            type: 'sidebar-toggle-no-aria-expanded',
            message: 'Sidebar toggle missing aria-expanded attribute (WCAG 4.1.2)',
            selector: toggleSel,
          });
        }

        if (toggleTabIdx === -1) {
          findings.push({
            severity: 'high',
            type: 'sidebar-toggle-not-keyboard-accessible',
            message: 'Sidebar toggle has tabindex="-1" — not keyboard accessible',
            selector: toggleSel,
          });
        }
      } else if (sidebarWidth > 400) {
        findings.push({
          severity: 'low',
          type: 'sidebar-no-collapse-option',
          message: 'Wide sidebar (>400px) has no visible collapse toggle',
          selector: sidebarSel,
        });
      }

      // ---- CHECK 10: Text overflow in sidebar items ----
      let clippedCount = 0;
      for (const item of navItems) {
        const itemStyle = getComputedStyle(item);
        const isClipped =
          item.scrollWidth > item.offsetWidth + 5 &&
          (itemStyle.overflow === 'hidden' || itemStyle.textOverflow === 'ellipsis');
        if (isClipped) {
          clippedCount++;
          if (clippedCount <= 3) {
            findings.push({
              severity: 'low',
              type: 'sidebar-item-text-clipped',
              message: `Sidebar item text is clipped/truncated: "${(item.textContent || '').trim().slice(0, 40)}"`,
              selector: selectorFor(item),
            });
          }
        }
      }

      return {
        sidebarPosition,
        sidebarSelector: sidebarSel,
        toggleSelector: toggleSel,
        toggleTabIndex: toggleTabIdx,
        isCollapsible,
        sidebarWidth,
        sidebarScrollHeight: (sidebar as HTMLElement).scrollHeight,
        sidebarClientHeight: (sidebar as HTMLElement).clientHeight,
        sidebarScrollWidth: (sidebar as HTMLElement).scrollWidth,
        sidebarClientWidth: (sidebar as HTMLElement).clientWidth,
        overflowY: style.overflowY,
        findings,
      };
    });

    report.sidebarPosition = evalResult.sidebarPosition;
    report.isCollapsible = evalResult.isCollapsible;
    report.findings.push(...evalResult.findings);
    toggleSelector = evalResult.toggleSelector;
    sidebarSelector = evalResult.sidebarSelector;

    // ---- CHECK 7: Collapsed state visual check (Playwright interaction) ----
    if (evalResult.isCollapsible && toggleSelector) {
      try {
        const toggleLocator = page.locator(
          `button[aria-expanded], button[class*="collapse" i], button[class*="toggle" i], ` +
            `button[class*="hamburger" i], button[class*="menu-btn" i], button[class*="sidebar-toggle" i], ` +
            `button[class*="close-sidebar" i]`
        ).first();

        const tagName = await toggleLocator.evaluate((el) => el.tagName).catch(() => '');
        if (tagName === 'BUTTON') {
          await toggleLocator.click({ timeout: 2000 });
          await page.waitForTimeout(400);
          await screenshotStep(page, route, 'sidebar-collapsed-state');

          const widthAfterCollapse = await page.evaluate((sel: string) => {
            const candidates = Array.from(
              document.querySelectorAll<HTMLElement>(
                'aside, [class*="sidebar" i], [class*="sidenav" i], [class*="side-nav" i], [id*="sidebar" i], nav:not(header nav)'
              )
            ).filter((el) => {
              const s = getComputedStyle(el);
              return s.display !== 'none';
            });
            return candidates.length > 0 ? candidates[0].clientWidth : -1;
          }, sidebarSelector);

          if (widthAfterCollapse !== -1 && widthAfterCollapse >= evalResult.sidebarWidth - 5) {
            report.findings.push({
              severity: 'high',
              type: 'sidebar-toggle-no-visual-change',
              message: `Sidebar toggle clicked but sidebar width unchanged (${widthAfterCollapse}px) — toggle may not work`,
              selector: toggleSelector,
            });
          }

          // Restore expanded state
          await toggleLocator.click({ timeout: 2000 }).catch(() => undefined);
          await page.waitForTimeout(400);
          await screenshotStep(page, route, 'sidebar-expanded-state');
        }
      } catch {
        // skip — interaction failed, don't throw
      }
    }

    // ---- CHECK 8: Mobile drawer behavior ----
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);

      const mobileResult = await page.evaluate(() => {
        const sidebarCandidates = Array.from(
          document.querySelectorAll<HTMLElement>(
            'aside, [class*="sidebar" i], [class*="sidenav" i], [class*="side-nav" i], [id*="sidebar" i], nav:not(header nav)'
          )
        );

        let sidebarEl: HTMLElement | null = null;
        for (const el of sidebarCandidates) {
          if (el.clientHeight > 0 || el.clientWidth > 0) {
            sidebarEl = el;
            break;
          }
        }

        if (!sidebarEl) {
          return {
            isHidden: true,
            causingHorizontalScroll: false,
            hamburgerSelector: '',
            hamburgerTabIndex: null as number | null,
          };
        }

        const s = getComputedStyle(sidebarEl);
        const transform = s.transform || s.webkitTransform || '';
        const isHidden =
          s.display === 'none' ||
          s.visibility === 'hidden' ||
          transform.includes('translateX(-') ||
          transform.includes('translateX(1');

        const causingHorizontalScroll =
          !isHidden && document.documentElement.scrollWidth > document.documentElement.clientWidth + 5;

        // Find hamburger trigger
        const hamburgerCandidates = Array.from(
          document.querySelectorAll<HTMLElement>(
            'button[class*="hamburger" i], button[aria-label*="menu" i], button[aria-label*="navigation" i], ' +
              'button[class*="menu" i], [role="button"][class*="menu" i]'
          )
        ).filter((el) => {
          const es = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return es.display !== 'none' && es.visibility !== 'hidden' && r.width > 0;
        });

        let hamburgerSel = '';
        let hamburgerTabIdx: number | null = null;
        if (hamburgerCandidates.length > 0) {
          const hb = hamburgerCandidates[0];
          hamburgerSel =
            hb.getAttribute('data-testid') ||
            hb.getAttribute('aria-label') ||
            hb.id ||
            hb.className.toString().slice(0, 50) ||
            hb.tagName;
          const tabIndex = hb.getAttribute('tabindex');
          hamburgerTabIdx = tabIndex !== null ? parseInt(tabIndex) : null;
        }

        return {
          isHidden,
          causingHorizontalScroll,
          hamburgerSelector: hamburgerSel,
          hamburgerTabIndex: hamburgerTabIdx,
        };
      });

      if (mobileResult.causingHorizontalScroll) {
        report.findings.push({
          severity: 'high',
          type: 'sidebar-not-hidden-mobile',
          message: 'Sidebar is visible at 390px viewport and causing horizontal scroll',
          selector: sidebarSelector,
        });
      }

      if (mobileResult.isHidden) {
        report.hasMobileDrawer = true;

        if (!mobileResult.hamburgerSelector) {
          report.findings.push({
            severity: 'high',
            type: 'mobile-drawer-no-trigger',
            message: 'Sidebar hidden on mobile but no hamburger/menu trigger button found',
          });
        } else {
          try {
            const hamburgerLocator = page
              .locator(
                'button[class*="hamburger" i], button[aria-label*="menu" i], button[aria-label*="navigation" i], button[class*="menu" i]'
              )
              .first();

            const hbTag = await hamburgerLocator.evaluate((el) => el.tagName).catch(() => '');
            if (hbTag === 'BUTTON') {
              await hamburgerLocator.click({ timeout: 2000 });
              await page.waitForTimeout(300);

              const drawerState = await page.evaluate(() => {
                const sidebarCandidates = Array.from(
                  document.querySelectorAll<HTMLElement>(
                    'aside, [class*="sidebar" i], [class*="sidenav" i], [class*="side-nav" i], [id*="sidebar" i], nav:not(header nav)'
                  )
                );
                let sidebarVisible = false;
                for (const el of sidebarCandidates) {
                  const s = getComputedStyle(el);
                  const transform = s.transform || '';
                  const hidden =
                    s.display === 'none' ||
                    s.visibility === 'hidden' ||
                    transform.includes('translateX(-') ||
                    transform.includes('translateX(1');
                  if (!hidden && el.clientWidth > 0) {
                    sidebarVisible = true;
                    break;
                  }
                }

                const backdrop = document.querySelector<HTMLElement>(
                  '[class*="backdrop" i], [class*="overlay" i], [class*="mask" i]'
                );
                const backdropVisible = backdrop
                  ? getComputedStyle(backdrop).display !== 'none'
                  : false;

                const closeBtn = document.querySelector<HTMLElement>(
                  '[class*="sidebar" i] button[aria-label*="close" i], ' +
                    'aside button[aria-label*="close" i], ' +
                    '[class*="drawer" i] button[aria-label*="close" i], ' +
                    '[class*="drawer" i] [aria-label*="close" i]'
                );

                return {
                  sidebarVisible,
                  hasBackdrop: backdropVisible,
                  hasCloseBtn: closeBtn !== null,
                };
              });

              if (!drawerState.sidebarVisible) {
                report.findings.push({
                  severity: 'high',
                  type: 'mobile-drawer-trigger-broken',
                  message: 'Mobile hamburger button clicked but drawer did not appear',
                  selector: mobileResult.hamburgerSelector,
                });
              } else {
                await screenshotStep(page, route, 'mobile-drawer-open');

                if (!drawerState.hasBackdrop) {
                  report.findings.push({
                    severity: 'medium',
                    type: 'mobile-drawer-no-backdrop',
                    message: 'Mobile drawer opened but no backdrop/overlay element found',
                  });
                }

                if (!drawerState.hasCloseBtn) {
                  report.findings.push({
                    severity: 'high',
                    type: 'mobile-drawer-no-close-btn',
                    message: 'Mobile drawer has no identifiable close button — user may be trapped',
                  });
                }

                // Press Escape to close
                await page.keyboard.press('Escape');
                await page.waitForTimeout(300);

                const afterEscape = await page.evaluate(() => {
                  const sidebarCandidates = Array.from(
                    document.querySelectorAll<HTMLElement>(
                      'aside, [class*="sidebar" i], [class*="sidenav" i], [class*="side-nav" i], [id*="sidebar" i], nav:not(header nav)'
                    )
                  );
                  for (const el of sidebarCandidates) {
                    const s = getComputedStyle(el);
                    const transform = s.transform || '';
                    const hidden =
                      s.display === 'none' ||
                      s.visibility === 'hidden' ||
                      transform.includes('translateX(-') ||
                      transform.includes('translateX(1');
                    if (!hidden && el.clientWidth > 0) return false;
                  }
                  return true;
                });

                if (!afterEscape) {
                  report.findings.push({
                    severity: 'medium',
                    type: 'mobile-drawer-escape-broken',
                    message: 'Mobile drawer did not close on Escape key press',
                  });
                }
              }
            }
          } catch {
            // skip — interaction failed
          }
        }
      }
    } catch {
      // skip mobile viewport block
    } finally {
      try {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(200);
      } catch {
        // skip
      }
    }

    // ---- CHECK 9: Sidebar scroll (back at desktop viewport) ----
    try {
      if (
        evalResult.sidebarScrollHeight > evalResult.sidebarClientHeight + 50
      ) {
        const overflowY = evalResult.overflowY;
        if (overflowY !== 'auto' && overflowY !== 'scroll') {
          report.findings.push({
            severity: 'medium',
            type: 'sidebar-no-internal-scroll',
            message: `Sidebar has overflowing content (scrollHeight ${evalResult.sidebarScrollHeight}px > clientHeight ${evalResult.sidebarClientHeight}px) but overflow-y is "${overflowY}"`,
            selector: sidebarSelector,
          });
        } else {
          const scrollApplied = await page.evaluate(() => {
            const candidates = Array.from(
              document.querySelectorAll<HTMLElement>(
                'aside, [class*="sidebar" i], [class*="sidenav" i], [class*="side-nav" i], [id*="sidebar" i], nav:not(header nav)'
              )
            );
            for (const el of candidates) {
              if (el.clientHeight > 0) {
                el.scrollTop = 200;
                return el.scrollTop;
              }
            }
            return -1;
          });

          if (scrollApplied === 0) {
            report.findings.push({
              severity: 'medium',
              type: 'sidebar-scroll-broken',
              message: 'Sidebar appears to overflow but scrollTop could not be set — internal scroll may be broken',
              selector: sidebarSelector,
            });
          }
        }
      }
    } catch {
      // skip
    }
  } catch {
    // top-level catch — partial report is still written
  } finally {
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
    } catch {
      // skip
    }
    try {
      writeJsonArtifact(
        'sidebar',
        `${normalizeRoute(route)}-sidebar.json`,
        report
      );
    } catch {
      // skip
    }
  }

  return report;
}
