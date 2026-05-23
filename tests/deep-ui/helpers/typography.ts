import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type TypographyFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type TypographyReport = {
  route: string;
  bodyFontSize: number;
  bodyLineHeight: number;
  fontFamiliesFound: string[];
  webFontsDetected: boolean;
  findings: TypographyFinding[];
};

export async function auditTypography(page: Page, route: string): Promise<TypographyReport> {
  const routeName = normalizeRoute(route);
  try {

  const result = await page.evaluate(() => {
    const findings: Array<{
      severity: 'high' | 'medium' | 'low' | 'info';
      type: string;
      message: string;
      selector?: string;
    }> = [];

    const visible = (el: HTMLElement): boolean => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 0 && r.height > 0;
    };

    let bodyFontSize = 16;
    let bodyLineHeight = 1.5;
    let fontFamiliesFound: string[] = [];
    let webFontsDetected = false;

    // CHECK 1: Base body font size
    try {
      const bodyStyle = getComputedStyle(document.body);
      const fs = parseFloat(bodyStyle.fontSize);
      bodyFontSize = isNaN(fs) ? 16 : fs;
      if (bodyFontSize < 12) {
        findings.push({ severity: 'high', type: 'body-font-too-small', message: `Body font size is ${bodyFontSize}px — inaccessible (< 12px)` });
      } else if (bodyFontSize < 14) {
        findings.push({ severity: 'medium', type: 'body-font-small', message: `Body font size is ${bodyFontSize}px — too small for body text (< 14px)` });
      }
      findings.push({ severity: 'info', type: 'body-font-size', message: `Body font size: ${bodyFontSize}px` });
    } catch {
      // skip
    }

    // CHECK 2: Body line-height
    try {
      const bodyStyle = getComputedStyle(document.body);
      const lh = bodyStyle.lineHeight;
      let ratio = 1.5;
      if (lh === 'normal') {
        ratio = 1.2;
      } else {
        const lhPx = parseFloat(lh);
        if (!isNaN(lhPx) && bodyFontSize > 0) {
          ratio = lhPx / bodyFontSize;
        }
      }
      bodyLineHeight = ratio;
      if (ratio < 1.2) {
        findings.push({ severity: 'high', type: 'line-height-too-tight', message: `Body line-height ratio is ${ratio.toFixed(2)} — too tight (< 1.2, WCAG 1.4.8 recommends 1.5)` });
      } else if (ratio < 1.4) {
        findings.push({ severity: 'medium', type: 'line-height-low', message: `Body line-height ratio is ${ratio.toFixed(2)} — below recommended 1.4` });
      } else if (ratio > 2.5) {
        findings.push({ severity: 'low', type: 'line-height-too-loose', message: `Body line-height ratio is ${ratio.toFixed(2)} — too loose (> 2.5)` });
      }
    } catch {
      // skip
    }

    // CHECK 3: Heading hierarchy — font-size scaling
    try {
      const headingTags = ['h1', 'h2', 'h3', 'h4'] as const;
      const headingSizes: { tag: string; size: number }[] = [];
      for (const tag of headingTags) {
        const el = document.querySelector<HTMLElement>(tag);
        if (el && visible(el)) {
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (!isNaN(fs)) headingSizes.push({ tag, size: fs });
        }
      }
      for (let i = 1; i < headingSizes.length; i++) {
        const prev = headingSizes[i - 1];
        const curr = headingSizes[i];
        if (curr.size >= prev.size) {
          findings.push({
            severity: 'medium',
            type: 'heading-hierarchy-wrong',
            message: `${curr.tag} (${curr.size}px) >= ${prev.tag} (${prev.size}px) — wrong heading size hierarchy`,
            selector: curr.tag,
          });
        }
        if (curr.size === bodyFontSize) {
          findings.push({
            severity: 'low',
            type: 'heading-same-size-as-body',
            message: `${curr.tag} has same font size as body (${curr.size}px)`,
            selector: curr.tag,
          });
        }
      }
    } catch {
      // skip
    }

    // CHECK 4: Line length
    try {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>('p, article, .content, main'));
      const visibleCandidate = candidates.find(el => visible(el));
      if (visibleCandidate) {
        const w = visibleCandidate.getBoundingClientRect().width;
        const sel = visibleCandidate.tagName.toLowerCase() + (visibleCandidate.className ? `.${visibleCandidate.className.toString().split(' ')[0]}` : '');
        if (w > 900) {
          findings.push({ severity: 'high', type: 'line-length-too-wide', message: `Content width ${Math.round(w)}px exceeds 900px — too wide for readability (~100 chars)`, selector: sel });
        } else if (w > 780) {
          findings.push({ severity: 'medium', type: 'line-length-wide', message: `Content width ${Math.round(w)}px exceeds 780px — above optimal range (~90 chars)`, selector: sel });
        } else if (w < 250) {
          findings.push({ severity: 'low', type: 'line-length-too-narrow', message: `Content width ${Math.round(w)}px is too narrow (< 250px)`, selector: sel });
        }
      }
    } catch {
      // skip
    }

    // CHECK 5: Font family consistency
    try {
      const selectors = ['body', 'h1', 'h2', 'p', 'button', 'input'];
      const families = new Set<string>();
      for (const sel of selectors) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) {
          const ff = getComputedStyle(el).fontFamily;
          const first = ff.split(',')[0].replace(/['"]/g, '').trim();
          if (first) families.add(first);
        }
      }
      fontFamiliesFound = Array.from(families);
      if (fontFamiliesFound.length > 3) {
        findings.push({ severity: 'low', type: 'too-many-font-families', message: `${fontFamiliesFound.length} distinct font families in use — more than 3 can create visual inconsistency` });
      }
    } catch {
      // skip
    }

    // CHECK 6: Web font detection
    try {
      webFontsDetected = document.fonts.size > 0;
      const preloadLink = document.querySelector('link[rel="preload"][as="font"]');
      findings.push({ severity: 'info', type: 'web-fonts-detected', message: `Web fonts detected: ${webFontsDetected}` });
      if (webFontsDetected && !preloadLink) {
        findings.push({ severity: 'low', type: 'web-fonts-no-preload', message: 'Web fonts loaded but no <link rel="preload" as="font"> found — risk of FOUT' });
      }
    } catch {
      // skip
    }

    // CHECK 7: font-display setting awareness
    try {
      let hasFontFaceRules = false;
      let hasFontDisplaySwap = false;
      const sheets = Array.from(document.styleSheets);
      for (const sheet of sheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule instanceof CSSFontFaceRule) {
              hasFontFaceRules = true;
              const style = rule.style;
              const display = style.getPropertyValue('font-display');
              if (display === 'swap') hasFontDisplaySwap = true;
            }
          }
        } catch {
          // cross-origin stylesheet, skip
        }
      }
      if (hasFontFaceRules) webFontsDetected = true;
      if (hasFontDisplaySwap) {
        findings.push({ severity: 'info', type: 'font-display-swap', message: 'font-display: swap found — good practice for FOUT prevention' });
      } else if (hasFontFaceRules) {
        findings.push({ severity: 'low', type: 'font-display-missing-swap', message: '@font-face rules present but no font-display: swap found — may cause render blocking' });
      }
    } catch {
      // skip
    }

    // CHECK 8: Small text detection
    try {
      const allEls = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(el => {
        if (!visible(el)) return false;
        const tag = el.tagName.toLowerCase();
        if (['script', 'style', 'head', 'meta', 'link', 'noscript'].includes(tag)) return false;
        return true;
      }).slice(0, 200);

      let highSmall = false;
      let mediumSmall = false;
      for (const el of allEls) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (isNaN(fs)) continue;
        if (fs < 10) {
          if (!highSmall) {
            highSmall = true;
            const sel = el.id || el.className?.toString().slice(0, 40) || el.tagName;
            findings.push({ severity: 'high', type: 'text-too-small', message: `Element has font size ${fs}px — unreadable (< 10px)`, selector: sel });
          }
        } else if (fs < 11) {
          if (!mediumSmall) {
            mediumSmall = true;
            const sel = el.id || el.className?.toString().slice(0, 40) || el.tagName;
            findings.push({ severity: 'medium', type: 'text-very-small', message: `Element has font size ${fs}px — very small (10–11px)`, selector: sel });
          }
        }
      }
    } catch {
      // skip
    }

    // CHECK 9: Text overflow / word wrap
    try {
      const textEls = Array.from(document.querySelectorAll<HTMLElement>('p, span, div, h1, h2, h3, h4, h5, h6'))
        .filter(el => visible(el))
        .slice(0, 100);
      for (const el of textEls) {
        const overflow = getComputedStyle(el).overflow;
        if (el.scrollWidth > el.offsetWidth + 5 && overflow === 'hidden') {
          const sel = el.id || el.className?.toString().slice(0, 40) || el.tagName;
          findings.push({ severity: 'medium', type: 'text-overflow-clipped', message: 'Text is truncated/clipped due to overflow:hidden without visible affordance', selector: sel });
          break;
        }
      }
    } catch {
      // skip
    }

    // CHECK 10: Letter spacing extremes
    try {
      const bodyTextSels = ['p', 'li', 'td'];
      const headingSels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

      for (const sel of bodyTextSels) {
        const els = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter(visible).slice(0, 20);
        for (const el of els) {
          const ls = getComputedStyle(el).letterSpacing;
          if (ls && ls !== 'normal') {
            const lsPx = parseFloat(ls);
            const fsPx = parseFloat(getComputedStyle(el).fontSize) || 16;
            const lsEm = lsPx / fsPx;
            if (lsEm < -0.05) {
              findings.push({ severity: 'low', type: 'negative-letter-spacing', message: `Body text (${sel}) has negative letter-spacing (${lsEm.toFixed(3)}em) — hurts readability`, selector: sel });
              break;
            }
          }
        }
      }

      for (const sel of headingSels) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el && visible(el)) {
          const ls = getComputedStyle(el).letterSpacing;
          if (ls && ls !== 'normal') {
            const lsPx = parseFloat(ls);
            const fsPx = parseFloat(getComputedStyle(el).fontSize) || 16;
            const lsEm = lsPx / fsPx;
            if (lsEm > 0.3) {
              findings.push({ severity: 'low', type: 'heading-letter-spacing-extreme', message: `${sel} has letter-spacing ${lsEm.toFixed(3)}em > 0.3em — decorative but notable`, selector: sel });
            }
          }
        }
      }
    } catch {
      // skip
    }

    return { findings, bodyFontSize, bodyLineHeight, fontFamiliesFound, webFontsDetected };
  });

  const report: TypographyReport = {
    route,
    bodyFontSize: result.bodyFontSize,
    bodyLineHeight: result.bodyLineHeight,
    fontFamiliesFound: result.fontFamiliesFound,
    webFontsDetected: result.webFontsDetected,
    findings: result.findings,
  };

  try {
    await screenshotStep(page, route, 'typography-scan');
  } catch {
    // skip
  }

  const hasHigh = result.findings.some(f => f.severity === 'high');
  if (hasHigh) {
    try {
      await screenshotStep(page, route, 'typography-high-finding');
    } catch {
      // skip
    }
  }

  const viewports = [
    { name: 'tablet' as const, width: 1024, height: 768 },
    { name: 'mobile' as const, width: 390, height: 844 },
  ];

  let vpScreenshots = 0;

  for (const vp of viewports) {
    try {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);

      const vpFindings = await page.evaluate(([vpName, vpWidth]) => {
        const findings: Array<{ severity: 'high' | 'medium' | 'low' | 'info'; type: string; message: string; selector?: string }> = [];

        const visible = (el: HTMLElement): boolean => {
          const s = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 0 && r.height > 0;
        };

        // CHECK 1: font-size at viewport
        try {
          const fs = parseFloat(getComputedStyle(document.body).fontSize);
          if (!isNaN(fs)) {
            if (fs < 12) {
              findings.push({ severity: 'high', type: `${vpName}-body-font-too-small`, message: `Body font size is ${fs}px at ${vpName} — inaccessible (< 12px)` });
            } else if (fs < 14) {
              findings.push({ severity: 'medium', type: `${vpName}-body-font-small`, message: `Body font size is ${fs}px at ${vpName} — too small for body text (< 14px)` });
            }
          }
        } catch {
          // skip
        }

        // CHECK 2: text overflow at viewport
        try {
          const scrollWidth = document.documentElement.scrollWidth;
          const clientWidth = document.documentElement.clientWidth;
          if (scrollWidth > clientWidth + 5) {
            findings.push({ severity: 'high', type: `${vpName}-page-h-overflow`, message: `Page has unexpected horizontal overflow at ${vpName} (${scrollWidth}px > ${clientWidth}px) — text/content may be cut off` });
          }
        } catch {
          // skip
        }

        // CHECK 3: content line length at viewport
        try {
          const candidates = Array.from(document.querySelectorAll<HTMLElement>('p, article, main'));
          const visibleCandidate = candidates.find(el => visible(el));
          if (visibleCandidate) {
            const w = visibleCandidate.getBoundingClientRect().width;
            if (w > vpWidth) {
              findings.push({ severity: 'low', type: `${vpName}-line-length-too-wide`, message: `Content width ${Math.round(w)}px exceeds viewport width ${vpWidth}px at ${vpName} — content wider than viewport` });
            }
          }
        } catch {
          // skip
        }

        // CHECK 4: tap target — font in buttons/links
        try {
          const els = Array.from(document.querySelectorAll<HTMLElement>('a, button')).filter(el => visible(el)).slice(0, 10);
          for (const el of els) {
            const fs = parseFloat(getComputedStyle(el).fontSize);
            if (!isNaN(fs) && fs < 12) {
              const sel = el.id || el.className?.toString().slice(0, 40) || el.tagName;
              findings.push({ severity: 'medium', type: `${vpName}-tap-target-font-tiny`, message: `Link/button has font size ${fs}px at ${vpName} — too small for tap targets (< 12px)`, selector: sel });
              break;
            }
          }
        } catch {
          // skip
        }

        // CHECK 5: heading visible and readable
        try {
          const heading = document.querySelector<HTMLElement>('h1') || document.querySelector<HTMLElement>('h2');
          if (heading && visible(heading)) {
            const fs = parseFloat(getComputedStyle(heading).fontSize);
            const threshold = vpName === 'mobile' ? 16 : 18;
            if (!isNaN(fs) && fs < threshold) {
              findings.push({ severity: 'medium', type: `${vpName}-heading-too-small`, message: `Heading font size is ${fs}px at ${vpName} — too small (< ${threshold}px)`, selector: heading.tagName.toLowerCase() });
            }
          }
        } catch {
          // skip
        }

        // CHECK 6: viewport meta (mobile only)
        if (vpName === 'mobile') {
          try {
            const metaViewport = document.querySelector('meta[name="viewport"]');
            if (!metaViewport) {
              findings.push({ severity: 'high', type: 'mobile-no-viewport-meta', message: 'No <meta name="viewport"> tag found — page will not scale correctly on mobile devices' });
            }
          } catch {
            // skip
          }
        }

        return findings;
      }, [vp.name, vp.width] as const);

      report.findings.push(...vpFindings);

      const hasHighVp = vpFindings.some(f => f.severity === 'high');
      if (hasHighVp && vpScreenshots < 2) {
        try { await screenshotStep(page, route, `typography-${vp.name}-high`); vpScreenshots++; } catch { /* ignore */ }
      }
    } catch {
      // skip this viewport
    }
  }

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
  } catch { /* ignore */ }

  writeJsonArtifact('typography', `${routeName}-typography.json`, report);

  return report;
  } catch (err) {
    const fallback: TypographyReport = {
      route,
      bodyFontSize: 0,
      bodyLineHeight: 0,
      fontFamiliesFound: [],
      webFontsDetected: false,
      findings: [{ severity: 'info', type: 'audit-error', message: `auditTypography failed: ${String(err)}` }],
    };
    try { writeJsonArtifact('typography', `${routeName}-typography.json`, fallback); } catch { /* ignore */ }
    return fallback;
  }
}
