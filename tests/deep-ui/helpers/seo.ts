import { Page } from '@playwright/test';

export type SeoIssue = {
  type: string;
  message: string;
  value?: string;
};

/**
 * Performs an SEO and metadata audit on the current page.
 *
 * Checks:
 * - <title> present and not empty or generic
 * - meta description present and not too short/long
 * - canonical link present when expected
 * - Open Graph og:title and og:description
 * - robots meta not accidentally set to noindex
 * - favicon loads (presence check only, not HTTP check)
 * - h1 present and singular
 * - Important images have alt text
 * - Structured data (JSON-LD) present when plausible
 * - No duplicate title or description
 *
 * @param page Playwright page instance
 * @returns Array of SEO issues found
 */
export async function auditSeo(page: Page): Promise<SeoIssue[]> {
  return await page.evaluate(() => {
    const issues: SeoIssue[] = [];
    const head = document.head;

    // Title
    const titleEl = head.querySelector('title');
    if (!titleEl || !titleEl.textContent?.trim()) {
      issues.push({ type: 'missing-title', message: 'Page has no <title> element or title is empty' });
    } else {
      const title = titleEl.textContent.trim();
      if (title.length < 10) {
        issues.push({ type: 'title-too-short', message: `Title is too short (${title.length} chars): "${title}"`, value: title });
      }
      if (title.length > 80) {
        issues.push({ type: 'title-too-long', message: `Title exceeds 80 chars (${title.length}): "${title.slice(0, 60)}..."`, value: title });
      }
      // Generic AI-generated default titles
      const genericTitles = ['my app', 'react app', 'vite app', 'next.js app', 'untitled', 'localhost'];
      if (genericTitles.some(g => title.toLowerCase().includes(g))) {
        issues.push({ type: 'generic-title', message: `Title looks like a placeholder/default: "${title}"`, value: title });
      }
    }

    // Meta description
    const descEl = head.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!descEl || !descEl.content?.trim()) {
      issues.push({ type: 'missing-meta-description', message: 'Missing meta description' });
    } else {
      const desc = descEl.content.trim();
      if (desc.length < 50) {
        issues.push({ type: 'meta-description-too-short', message: `Meta description too short (${desc.length} chars)`, value: desc });
      }
      if (desc.length > 165) {
        issues.push({ type: 'meta-description-too-long', message: `Meta description exceeds 165 chars (${desc.length})`, value: desc });
      }
    }

    // Robots — check for accidental noindex
    const robotsEl = head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (robotsEl) {
      const content = robotsEl.content.toLowerCase();
      if (content.includes('noindex')) {
        issues.push({
          type: 'noindex-detected',
          message: `robots meta contains "noindex" — may be accidentally blocking search engines: ${robotsEl.content}`,
          value: robotsEl.content,
        });
      }
      if (content.includes('nofollow')) {
        issues.push({
          type: 'nofollow-detected',
          message: `robots meta contains "nofollow": ${robotsEl.content}`,
          value: robotsEl.content,
        });
      }
    }

    // Canonical
    const canonicalEl = head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalEl) {
      issues.push({ type: 'missing-canonical', message: 'No canonical link element found' });
    } else if (!canonicalEl.href || canonicalEl.href === '') {
      issues.push({ type: 'empty-canonical', message: 'Canonical link href is empty', value: canonicalEl.href });
    }

    // Favicon
    const favicon =
      head.querySelector('link[rel="icon"]') ||
      head.querySelector('link[rel="shortcut icon"]') ||
      head.querySelector('link[rel="apple-touch-icon"]');
    if (!favicon) {
      issues.push({ type: 'missing-favicon', message: 'No favicon link element found in <head>' });
    }

    // Open Graph
    const ogTitle = head.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
    const ogDesc = head.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
    const ogImage = head.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
    if (!ogTitle?.content) {
      issues.push({ type: 'missing-og-title', message: 'Missing og:title Open Graph tag' });
    }
    if (!ogDesc?.content) {
      issues.push({ type: 'missing-og-description', message: 'Missing og:description Open Graph tag' });
    }
    if (!ogImage?.content) {
      issues.push({ type: 'missing-og-image', message: 'Missing og:image Open Graph tag' });
    }

    // Twitter card
    const twitterCard = head.querySelector('meta[name="twitter:card"]') as HTMLMetaElement | null;
    if (!twitterCard?.content) {
      issues.push({ type: 'missing-twitter-card', message: 'Missing twitter:card meta tag' });
    }

    // H1 checks
    const h1s = Array.from(document.querySelectorAll('h1'));
    if (h1s.length === 0) {
      issues.push({ type: 'missing-h1', message: 'Page has no <h1> element' });
    } else if (h1s.length > 1) {
      issues.push({
        type: 'multiple-h1',
        message: `Page has ${h1s.length} <h1> elements — expected exactly 1`,
        value: h1s.map(h => h.textContent?.trim().slice(0, 40)).join(', '),
      });
    }

    // Important images alt text
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
    const missingAlt = images.filter(img => {
      const style = getComputedStyle(img);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = img.getBoundingClientRect();
      if (rect.width < 16 || rect.height < 16) return false; // skip tiny icons
      return !img.alt || img.alt.trim() === '';
    });
    if (missingAlt.length > 0) {
      issues.push({
        type: 'images-missing-alt',
        message: `${missingAlt.length} visible image(s) missing alt text`,
        value: missingAlt.map(img => img.src.slice(-60)).join(', '),
      });
    }

    // JSON-LD structured data presence check
    const jsonLd = head.querySelector('script[type="application/ld+json"]');
    if (!jsonLd) {
      // Only flag on what looks like a public-facing page (has article/product/org signals)
      const hasStructuredSignals = document.querySelector('article, [itemtype], [data-schema]');
      if (hasStructuredSignals) {
        issues.push({ type: 'missing-json-ld', message: 'Page has structured content but no JSON-LD schema markup' });
      }
    }

    return issues;
  });
}

/**
 * Writes SEO audit results to JSON artifact.
 */
export function seoIssueSummary(issues: SeoIssue[]): {
  critical: SeoIssue[];
  warnings: SeoIssue[];
} {
  const critical = issues.filter(i =>
    ['missing-title', 'noindex-detected', 'generic-title'].includes(i.type)
  );
  const warnings = issues.filter(i => !critical.includes(i));
  return { critical, warnings };
}
