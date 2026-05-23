import { Page } from '@playwright/test';

export type WebVitalEntry = {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor' | 'unknown';
};

export type PerformanceSnapshot = {
  url: string;
  domNodes: number;
  resources: number;
  transferSize: number;
  loadEventEnd: number;
  domContentLoadedEventEnd: number;
  navigationDuration: number;
  ttfb?: number;
  fcp?: number;
  lcp?: number;
  cls?: number;
  webVitals: WebVitalEntry[];
};

export async function collectPerformanceSnapshot(page: Page): Promise<PerformanceSnapshot> {
  return await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];

    const ttfb = nav ? nav.responseStart - nav.requestStart : undefined;
    const paintEntries = performance.getEntriesByType('paint') as PerformanceEntry[];
    const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');
    const fcp = fcpEntry?.startTime;

    let lcp: number | undefined;
    try {
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint') as PerformanceEntry[];
      if (lcpEntries.length > 0) lcp = lcpEntries[lcpEntries.length - 1].startTime;
    } catch { /* not supported */ }

    let cls: number | undefined;
    try {
      const shifts = performance.getEntriesByType('layout-shift') as PerformanceEntry[];
      if (shifts.length > 0) {
        cls = shifts.reduce((sum, e) => {
          const s = e as unknown as { value: number; hadRecentInput: boolean };
          return !s.hadRecentInput ? sum + s.value : sum;
        }, 0);
      }
    } catch { /* not supported */ }

    const webVitals: WebVitalEntry[] = [];
    if (ttfb !== undefined) webVitals.push({ name: 'TTFB', value: Math.round(ttfb), rating: ttfb < 800 ? 'good' : ttfb < 1800 ? 'needs-improvement' : 'poor' });
    if (fcp !== undefined) webVitals.push({ name: 'FCP', value: Math.round(fcp), rating: fcp < 1800 ? 'good' : fcp < 3000 ? 'needs-improvement' : 'poor' });
    if (lcp !== undefined) webVitals.push({ name: 'LCP', value: Math.round(lcp), rating: lcp < 2500 ? 'good' : lcp < 4000 ? 'needs-improvement' : 'poor' });
    if (cls !== undefined) webVitals.push({ name: 'CLS', value: Math.round(cls * 1000) / 1000, rating: cls < 0.1 ? 'good' : cls < 0.25 ? 'needs-improvement' : 'poor' });

    return {
      url: location.href,
      domNodes: document.querySelectorAll('*').length,
      resources: resources.length,
      transferSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
      loadEventEnd: nav?.loadEventEnd || 0,
      domContentLoadedEventEnd: nav?.domContentLoadedEventEnd || 0,
      navigationDuration: nav?.duration || 0,
      ttfb: ttfb !== undefined ? Math.round(ttfb) : undefined,
      fcp: fcp !== undefined ? Math.round(fcp) : undefined,
      lcp: lcp !== undefined ? Math.round(lcp) : undefined,
      cls: cls !== undefined ? Math.round(cls * 1000) / 1000 : undefined,
      webVitals,
    };
  });
}

export function poorWebVitals(snapshot: PerformanceSnapshot): WebVitalEntry[] {
  return snapshot.webVitals.filter(v => v.rating === 'poor');
}

export function domGrowthWithinBound(before: PerformanceSnapshot, after: PerformanceSnapshot, threshold = 500): boolean {
  return after.domNodes - before.domNodes <= threshold;
}
