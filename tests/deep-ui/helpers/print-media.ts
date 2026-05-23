import { Page } from '@playwright/test';
import { screenshotStep, fullPageScreenshot } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type PrintMediaFinding = {
  severity: 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type PrintMediaReport = {
  route: string;
  hasPrintStylesheet: boolean;
  findings: PrintMediaFinding[];
};

export async function auditPrintMedia(page: Page, route: string): Promise<PrintMediaReport> {
  const routeName = normalizeRoute(route);
  const findings: PrintMediaFinding[] = [];
  let hasPrintStylesheet = false;

  try {
    hasPrintStylesheet = await page.evaluate((): boolean => {
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        if (sheet.media && sheet.media.mediaText && sheet.media.mediaText.includes('print')) {
          return true;
        }
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule instanceof CSSMediaRule && rule.conditionText && rule.conditionText.includes('print')) {
              return true;
            }
          }
        } catch {
          // Cross-origin stylesheet — skip
        }
      }
      return false;
    });
  } catch {
    // Evaluation failed — leave hasPrintStylesheet false
  }

  try {
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(300);
  } catch {
    // emulateMedia failed — continue with checks
  }

  try {
    await fullPageScreenshot(page, route, 'print-media-view');
  } catch {
    try {
      await screenshotStep(page, route, 'print-media-view');
    } catch {
      // Screenshot failed — non-fatal
    }
  }

  try {
    const printFindings = await page.evaluate((): Array<{
      severity: 'medium' | 'low' | 'info';
      type: string;
      message: string;
      selector?: string;
    }> => {
      const issues: Array<{
        severity: 'medium' | 'low' | 'info';
        type: string;
        message: string;
        selector?: string;
      }> = [];

      // a. Nav visible in print mode
      const navSelectors = ['nav', '[role="navigation"]'];
      for (const sel of navSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const style = getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            issues.push({
              severity: 'low',
              type: 'print-nav-visible',
              message: `Navigation element (${sel}) is still visible in print mode. Most sites hide navigation when printing.`,
              selector: sel,
            });
            break;
          }
        }
      }

      // b. Sidebar visible in print mode
      const sidebarEls = Array.from(document.querySelectorAll<HTMLElement>('[class*="sidebar" i], aside'));
      for (const el of sidebarEls) {
        const style = getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          const sel = el.tagName.toLowerCase() + (el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '');
          issues.push({
            severity: 'low',
            type: 'print-sidebar-visible',
            message: `Sidebar or aside element is still visible in print mode. Consider hiding non-essential layout in print.`,
            selector: sel.slice(0, 80),
          });
          break;
        }
      }

      // c. Horizontal overflow in print mode
      if (document.documentElement.scrollWidth > window.innerWidth + 4) {
        issues.push({
          severity: 'medium',
          type: 'print-layout-overflow',
          message: `Page has horizontal overflow in print mode (scrollWidth: ${document.documentElement.scrollWidth}px, innerWidth: ${window.innerWidth}px). Content may be clipped when printed.`,
        });
      }

      // d. Background images that may not print
      const allEls = Array.from(document.querySelectorAll<HTMLElement>('*'));
      let bgImageCount = 0;
      for (const el of allEls) {
        const style = getComputedStyle(el);
        if (style.backgroundImage && style.backgroundImage !== 'none') {
          bgImageCount++;
        }
      }
      if (bgImageCount > 0) {
        issues.push({
          severity: 'low',
          type: 'print-background-images',
          message: `${bgImageCount} element(s) use background-image. Browsers often strip background images when printing unless "Print backgrounds" is enabled. Ensure critical content is not conveyed solely via background images.`,
        });
      }

      // e. Links present but no print rule to show URLs
      const links = Array.from(document.querySelectorAll('a[href]'));
      const hasLinks = links.length > 0;
      let hasPrintUrlRule = false;
      if (hasLinks) {
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              if (rule instanceof CSSMediaRule && rule.conditionText && rule.conditionText.includes('print')) {
                const innerRules = Array.from(rule.cssRules || []);
                for (const inner of innerRules) {
                  if (inner instanceof CSSStyleRule) {
                    const selector = inner.selectorText || '';
                    const cssText = inner.style.content || '';
                    if ((selector.includes('a') || selector.includes('::after')) && cssText.includes('attr(href)')) {
                      hasPrintUrlRule = true;
                    }
                  }
                }
              }
            }
          } catch {
            // Cross-origin stylesheet — skip
          }
        }
        if (!hasPrintUrlRule) {
          issues.push({
            severity: 'low',
            type: 'print-links-no-url',
            message: `Page contains ${links.length} link(s) but no @media print rule found that appends URL via a::after { content: " (" attr(href) ")" }. URLs will not be visible in printed output.`,
          });
        }
      }

      // f. Long page with no page-break rules
      const scrollHeight = document.documentElement.scrollHeight;
      if (scrollHeight > 2000) {
        let hasPageBreakRule = false;
        const sheets = Array.from(document.styleSheets);
        for (const sheet of sheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              if (rule instanceof CSSStyleRule) {
                const css = rule.style;
                if (
                  css.pageBreakBefore || css.pageBreakAfter || css.pageBreakInside ||
                  css.getPropertyValue('break-before') || css.getPropertyValue('break-after') || css.getPropertyValue('break-inside')
                ) {
                  hasPageBreakRule = true;
                }
              }
              if (rule instanceof CSSMediaRule && rule.conditionText && rule.conditionText.includes('print')) {
                const innerRules = Array.from(rule.cssRules || []);
                for (const inner of innerRules) {
                  if (inner instanceof CSSStyleRule) {
                    const css = inner.style;
                    if (
                      css.pageBreakBefore || css.pageBreakAfter || css.pageBreakInside ||
                      css.getPropertyValue('break-before') || css.getPropertyValue('break-after') || css.getPropertyValue('break-inside')
                    ) {
                      hasPageBreakRule = true;
                    }
                  }
                }
              }
            }
          } catch {
            // Cross-origin stylesheet — skip
          }
        }
        if (!hasPageBreakRule) {
          issues.push({
            severity: 'low',
            type: 'print-no-page-break',
            message: `Page is tall (scrollHeight: ${scrollHeight}px) but no page-break-* or break-* CSS rules detected. Content may be awkwardly split across printed pages.`,
          });
        }
      }

      return issues;
    });

    findings.push(...printFindings);
  } catch {
    // Evaluation in print mode failed — non-fatal
  }

  try {
    await page.emulateMedia({ media: 'screen' });
    await page.waitForTimeout(200);
  } catch {
    // Reset failed — best effort
  }

  const report: PrintMediaReport = {
    route,
    hasPrintStylesheet,
    findings,
  };

  try {
    writeJsonArtifact('print-media', `${routeName}-print-media.json`, report);
  } catch {
    // Artifact write failed — non-fatal
  }

  return report;
}
