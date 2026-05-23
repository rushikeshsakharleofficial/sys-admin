import { Page } from '@playwright/test';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type LinkFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  href?: string;
  text?: string;
  selector?: string;
};

export type LinkCheckerReport = {
  route: string;
  totalLinks: number;
  findings: LinkFinding[];
};

export async function auditLinks(page: Page, route: string): Promise<LinkCheckerReport> {
  const routeName = normalizeRoute(route);

  const result = await page.evaluate((): { totalLinks: number; findings: LinkFinding[] } => {
    const findings: LinkFinding[] = [];
    const MAX_LINKS = 100;

    const allAnchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
    const totalLinks = allAnchors.length;
    const anchors = allAnchors.slice(0, MAX_LINKS);

    function isVisible(el: Element): boolean {
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }

    function visibleText(el: HTMLAnchorElement): string {
      return (el.innerText || el.textContent || '').trim();
    }

    // HIGH: empty-href
    for (const a of anchors) {
      if (!isVisible(a)) continue;
      const href = a.getAttribute('href');
      const text = visibleText(a);
      if (text.length > 0 && (href === '' || href === null)) {
        findings.push({
          severity: 'high',
          type: 'empty-href',
          message: `Anchor with visible text has empty or missing href — broken link`,
          href: href ?? undefined,
          text: text.slice(0, 80),
          selector: 'a',
        });
      }
    }

    // HIGH / LOW: javascript-void-href
    for (const a of anchors) {
      if (!isVisible(a)) continue;
      const href = a.getAttribute('href') || '';
      const text = visibleText(a);
      if (text.length > 0 && (href === 'javascript:void(0)' || href === 'javascript:;')) {
        const hasOnclick = a.hasAttribute('onclick');
        findings.push({
          severity: hasOnclick ? 'low' : 'high',
          type: 'javascript-void-href',
          message: hasOnclick
            ? `Anchor uses javascript:void href but has onclick — may be intentional`
            : `Anchor uses javascript:void href with no onclick — likely placeholder`,
          href,
          text: text.slice(0, 80),
          selector: 'a',
        });
      }
    }

    // MEDIUM: anchor-only-href (#)
    const navigationHints = /^(home|about|contact|services|products|blog|docs|faq|pricing|login|signup|menu|nav)/i;
    for (const a of anchors) {
      if (!isVisible(a)) continue;
      const href = a.getAttribute('href') || '';
      const text = visibleText(a);
      if (href === '#' && text.length > 0) {
        const looksLikeNav = navigationHints.test(text);
        findings.push({
          severity: looksLikeNav ? 'medium' : 'medium',
          type: 'anchor-only-href',
          message: `Anchor href="#" with visible text${looksLikeNav ? ' suggesting navigation' : ''} — potential placeholder`,
          href,
          text: text.slice(0, 80),
          selector: 'a',
        });
      }
    }

    // MEDIUM: duplicate-text-different-href
    const first20 = anchors.slice(0, 20);
    const textToHrefs: Record<string, Set<string>> = {};
    for (const a of first20) {
      if (!isVisible(a)) continue;
      const text = visibleText(a).toLowerCase();
      const href = a.href || '';
      if (text.length === 0) continue;
      if (!textToHrefs[text]) textToHrefs[text] = new Set();
      textToHrefs[text].add(href);
    }
    for (const [text, hrefs] of Object.entries(textToHrefs)) {
      if (hrefs.size > 1) {
        findings.push({
          severity: 'medium',
          type: 'duplicate-text-different-href',
          message: `Multiple links share text "${text}" but point to ${hrefs.size} different hrefs — ambiguous for screen readers`,
          text: text.slice(0, 80),
          selector: 'a',
        });
      }
    }

    // MEDIUM: generic-link-text (WCAG 2.4.4)
    const genericTexts = new Set(['here', 'click here', 'read more', 'learn more', 'more', 'link', 'this link']);
    for (const a of anchors) {
      if (!isVisible(a)) continue;
      const text = visibleText(a).toLowerCase();
      if (genericTexts.has(text)) {
        findings.push({
          severity: 'medium',
          type: 'generic-link-text',
          message: `Link text "${visibleText(a)}" is too generic — fails WCAG 2.4.4 (Link Purpose)`,
          href: a.href || a.getAttribute('href') || undefined,
          text: visibleText(a).slice(0, 80),
          selector: 'a',
        });
      }
    }

    // MEDIUM: new-tab-no-warning
    for (const a of anchors) {
      if (!isVisible(a)) continue;
      if (a.getAttribute('target') !== '_blank') continue;
      const ariaLabel = (a.getAttribute('aria-label') || '').toLowerCase();
      const text = visibleText(a).toLowerCase();
      const warnsNewTab = /new tab|new window|opens in/.test(ariaLabel) || /new tab|new window|opens in/.test(text);
      if (!warnsNewTab) {
        findings.push({
          severity: 'medium',
          type: 'new-tab-no-warning',
          message: `Link opens in new tab/window without warning user in text or aria-label`,
          href: a.href || a.getAttribute('href') || undefined,
          text: visibleText(a).slice(0, 80),
          selector: 'a[target="_blank"]',
        });
      }
    }

    // MEDIUM: missing-rel-noopener
    for (const a of anchors) {
      if (!isVisible(a)) continue;
      if (a.getAttribute('target') !== '_blank') continue;
      const rel = (a.getAttribute('rel') || '').toLowerCase();
      if (!rel.includes('noopener') && !rel.includes('noreferrer')) {
        findings.push({
          severity: 'medium',
          type: 'missing-rel-noopener',
          message: `Link with target="_blank" missing rel="noopener" or rel="noopener noreferrer" — security risk`,
          href: a.href || a.getAttribute('href') || undefined,
          text: visibleText(a).slice(0, 80),
          selector: 'a[target="_blank"]',
        });
      }
    }

    // LOW: hash-link-broken
    for (const a of anchors) {
      if (!isVisible(a)) continue;
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#') && href.length > 1) {
        const id = href.slice(1);
        if (!document.getElementById(id)) {
          findings.push({
            severity: 'low',
            type: 'hash-link-broken',
            message: `Anchor href="${href}" points to #${id} but no element with that ID exists`,
            href,
            text: visibleText(a).slice(0, 80),
            selector: 'a',
          });
        }
      }
    }

    // LOW: telephone-format
    for (const a of anchors) {
      if (!isVisible(a)) continue;
      const href = a.getAttribute('href') || '';
      if (href.startsWith('tel:')) {
        const num = href.slice(4);
        if (!num.startsWith('+')) {
          findings.push({
            severity: 'low',
            type: 'telephone-format',
            message: `tel: link does not use international format (should start with tel:+): "${href}"`,
            href,
            text: visibleText(a).slice(0, 80),
            selector: 'a[href^="tel:"]',
          });
        }
      }
    }

    // LOW: email-format
    for (const a of anchors) {
      if (!isVisible(a)) continue;
      const href = a.getAttribute('href') || '';
      if (href.startsWith('mailto:')) {
        const addr = href.slice(7).split('?')[0];
        if (!addr.includes('@') || !addr.includes('.')) {
          findings.push({
            severity: 'low',
            type: 'email-format',
            message: `mailto: link address appears malformed (missing @ or domain): "${href}"`,
            href,
            text: visibleText(a).slice(0, 80),
            selector: 'a[href^="mailto:"]',
          });
        }
      }
    }

    return { totalLinks, findings };
  });

  const report: LinkCheckerReport = {
    route,
    totalLinks: result.totalLinks,
    findings: result.findings,
  };

  writeJsonArtifact('link-checker', `${routeName}-link-checker.json`, report);
  return report;
}
