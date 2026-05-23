import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type SitemapFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  url?: string;
};

export type SitemapReport = {
  route: string;
  sitemapFound: boolean;
  robotsFound: boolean;
  findings: SitemapFinding[];
};

export async function auditSitemapAndRobots(
  page: Page,
  route: string,
  baseURL: string
): Promise<SitemapReport> {
  const routeName = normalizeRoute(route);
  const findings: SitemapFinding[] = [];
  let sitemapFound = false;
  let robotsFound = false;

  // 1. robots.txt
  try {
    const robotsUrl = baseURL.replace(/\/$/, '') + '/robots.txt';
    const robotsResult = await page.evaluate(async (url: string) => {
      try {
        const r = await fetch(url);
        return { status: r.status, text: await r.text() };
      } catch (e) {
        return { status: 0, text: '' };
      }
    }, robotsUrl);

    if (robotsResult.status !== 200) {
      findings.push({
        severity: 'medium',
        type: 'robots-txt-missing',
        message: `robots.txt not found (HTTP ${robotsResult.status}) at ${robotsUrl}`,
        url: robotsUrl,
      });
    } else {
      robotsFound = true;
      const robotsText = robotsResult.text;

      if (/Disallow:\s*\/\s*$/m.test(robotsText)) {
        findings.push({
          severity: 'medium',
          type: 'robots-disallow-all',
          message: 'robots.txt contains "Disallow: /" which blocks all crawlers',
          url: robotsUrl,
        });
      }

      if (/^Sitemap:/im.test(robotsText)) {
        findings.push({
          severity: 'info',
          type: 'robots-sitemap-directive',
          message: 'robots.txt contains a Sitemap: directive',
          url: robotsUrl,
        });
      }

      if (/noindex/i.test(robotsText)) {
        findings.push({
          severity: 'low',
          type: 'robots-noindex-directive',
          message: 'robots.txt contains "noindex" — unusual placement, typically belongs in meta tags',
          url: robotsUrl,
        });
      }
    }
  } catch {
    // skip robots check on error
  }

  // 2. sitemap.xml / sitemap_index.xml
  try {
    const base = baseURL.replace(/\/$/, '');
    const sitemapUrls = [base + '/sitemap.xml', base + '/sitemap_index.xml'];
    let sitemapText = '';
    let sitemapUrl = '';

    for (const url of sitemapUrls) {
      const result = await page.evaluate(async (u: string) => {
        try {
          const r = await fetch(u);
          return { status: r.status, text: await r.text() };
        } catch (e) {
          return { status: 0, text: '' };
        }
      }, url);

      if (result.status === 200 && result.text.trim().length > 0) {
        sitemapFound = true;
        sitemapText = result.text;
        sitemapUrl = url;
        break;
      }
    }

    if (!sitemapFound) {
      findings.push({
        severity: 'low',
        type: 'sitemap-missing',
        message: 'Neither /sitemap.xml nor /sitemap_index.xml returned a 200 response',
      });
    } else {
      const trimmed = sitemapText.trim();
      const isValidXml =
        trimmed.startsWith('<?xml') ||
        trimmed.startsWith('<urlset') ||
        trimmed.startsWith('<sitemapindex');

      if (!isValidXml) {
        findings.push({
          severity: 'high',
          type: 'sitemap-malformed',
          message: `Sitemap at ${sitemapUrl} does not start with valid XML declaration or root element`,
          url: sitemapUrl,
        });
      } else {
        const locMatches = sitemapText.match(/<loc>/g);
        const locCount = locMatches ? locMatches.length : 0;
        findings.push({
          severity: 'info',
          type: 'sitemap-url-count',
          message: `Sitemap contains ${locCount} <loc> URL entries`,
          url: sitemapUrl,
        });

        const httpUrls = sitemapText.match(/<loc>http:\/\//g);
        if (httpUrls && httpUrls.length > 0) {
          findings.push({
            severity: 'low',
            type: 'sitemap-http-urls',
            message: `Sitemap contains ${httpUrls.length} <loc> URL(s) using http:// instead of https://`,
            url: sitemapUrl,
          });
        }
      }
    }
  } catch {
    // skip sitemap check on error
  }

  // 3 & 4 & 5: Page-level checks via page.evaluate
  try {
    const pageChecks = await page.evaluate((currentRoute: string) => {
      const head = document.head;
      const result = {
        hasSitemapLink: false,
        hasNoindex: false,
        hasCanonical: false,
        canonicalHref: '',
        currentUrl: window.location.href,
      };

      // 3. <link rel="sitemap">
      const sitemapLink = head.querySelector('link[rel="sitemap"]');
      result.hasSitemapLink = sitemapLink !== null;

      // 4. robots meta noindex
      const robotsMeta = head.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
      if (robotsMeta && robotsMeta.content.toLowerCase().includes('noindex')) {
        result.hasNoindex = true;
      }

      // 5. canonical
      const canonicalEl = head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (canonicalEl) {
        result.hasCanonical = true;
        result.canonicalHref = canonicalEl.href || '';
      }

      return result;
    }, route);

    if (pageChecks.hasNoindex) {
      if (route === '/') {
        findings.push({
          severity: 'high',
          type: 'homepage-noindex',
          message: 'Homepage has <meta name="robots" content="noindex"> — blocks search engine indexing of root page',
        });
      } else {
        findings.push({
          severity: 'medium',
          type: 'page-noindex',
          message: `Page "${route}" has <meta name="robots" content="noindex"> — verify this is intentional`,
        });
      }
    }

    if (!pageChecks.hasCanonical) {
      findings.push({
        severity: 'low',
        type: 'missing-canonical',
        message: `Page "${route}" has no <link rel="canonical"> element`,
      });
    } else if (pageChecks.canonicalHref) {
      try {
        const canonicalUrl = new URL(pageChecks.canonicalHref);
        const currentUrl = new URL(pageChecks.currentUrl);
        const canonicalPath = canonicalUrl.pathname.replace(/\/$/, '') || '/';
        const currentPath = currentUrl.pathname.replace(/\/$/, '') || '/';
        if (canonicalPath !== currentPath || canonicalUrl.origin !== currentUrl.origin) {
          findings.push({
            severity: 'medium',
            type: 'canonical-mismatch',
            message: `Canonical URL "${pageChecks.canonicalHref}" differs significantly from current page URL "${pageChecks.currentUrl}"`,
            url: pageChecks.canonicalHref,
          });
        }
      } catch {
        // malformed canonical href — skip mismatch check
      }
    }
  } catch {
    // skip page-level checks on error
  }

  await screenshotStep(page, route, 'sitemap-audit');

  const report: SitemapReport = {
    route,
    sitemapFound,
    robotsFound,
    findings,
  };

  writeJsonArtifact('sitemap', `${routeName}-sitemap.json`, report);
  return report;
}
