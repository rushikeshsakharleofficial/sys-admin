import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type PWAFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
};

export type PWAReport = {
  route: string;
  isPWA: boolean;
  hasServiceWorker: boolean;
  hasManifest: boolean;
  findings: PWAFinding[];
};

export async function auditPWA(page: Page, route: string): Promise<PWAReport> {
  const routeName = normalizeRoute(route);
  const findings: PWAFinding[] = [];

  // Token-efficient: batch SW + manifest detection in one evaluate round-trip.
  const { hasServiceWorker, hasManifest } = await page.evaluate(async () => {
    let sw = false;
    try {
      sw = 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;
    } catch { /* ignore */ }
    const manifest = document.querySelector('link[rel="manifest"]') !== null;
    return { hasServiceWorker: sw, hasManifest: manifest };
  });

  // Early exit: not a PWA — report info-only findings, skip heavy manifest fetch.
  if (!hasServiceWorker && !hasManifest) {
    const report: PWAReport = {
      route, isPWA: false, hasServiceWorker: false, hasManifest: false,
      findings: [{ severity: 'info', type: 'not-a-pwa', message: 'No manifest or service worker detected — not a PWA.' }],
    };
    writeJsonArtifact('pwa', `${routeName}-pwa.json`, report);
    return report;
  }

  if (hasManifest) {
    const manifestData = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      if (!link) return null;
      try {
        const r = await fetch((link as HTMLLinkElement).href);
        return await r.json();
      } catch {
        return null;
      }
    });

    if (manifestData === null) {
      findings.push({
        severity: 'high',
        type: 'manifest-fetch-failed',
        message: 'Manifest link found but failed to fetch or parse manifest JSON',
      });
    } else {
      if (!manifestData.name && !manifestData.short_name) {
        findings.push({
          severity: 'low',
          type: 'manifest-missing-name',
          message: 'Manifest missing both "name" and "short_name" fields',
        });
      }
      if (!manifestData.start_url) {
        findings.push({
          severity: 'low',
          type: 'manifest-missing-start-url',
          message: 'Manifest missing "start_url" field',
        });
      }
      if (!manifestData.display) {
        findings.push({
          severity: 'low',
          type: 'manifest-missing-display',
          message: 'Manifest missing "display" field',
        });
      }
      const icons: Array<{ sizes?: string }> = Array.isArray(manifestData.icons) ? manifestData.icons : [];
      const has192 = icons.some(icon => {
        const sizes = (icon.sizes || '').split(' ');
        return sizes.some(s => {
          const [w] = s.split('x').map(Number);
          return w >= 192;
        });
      });
      if (!has192) {
        findings.push({
          severity: 'low',
          type: 'manifest-missing-192-icon',
          message: 'Manifest does not include an icon with size >= 192x192',
        });
      }
    }
  }

  if (hasServiceWorker && !hasManifest) {
    findings.push({
      severity: 'medium',
      type: 'sw-without-manifest',
      message: 'Service worker registered but no web app manifest found',
    });
  }

  if (hasServiceWorker) {
    const hasFetchHandler = await page.evaluate(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        return reg !== undefined;
      } catch {
        return false;
      }
    });
    if (!hasFetchHandler) {
      findings.push({
        severity: 'low',
        type: 'no-offline-fetch-handler',
        message: 'Service worker registration not detectable; offline fetch handler may be absent',
      });
    }
  }

  const hasThemeColor = await page.evaluate(() => {
    return document.querySelector('meta[name="theme-color"]') !== null;
  });
  if (!hasThemeColor) {
    findings.push({
      severity: 'low',
      type: 'missing-theme-color',
      message: 'No meta[name="theme-color"] found; browser toolbar color will not be themed',
    });
  }

  const hasViewport = await page.evaluate(() => {
    return document.querySelector('meta[name="viewport"]') !== null;
  });
  if (!hasViewport) {
    findings.push({
      severity: 'medium',
      type: 'missing-viewport-meta',
      message: 'No meta[name="viewport"] found; page may not render correctly on mobile',
    });
  }

  const isPWA = hasServiceWorker && hasManifest;

  await screenshotStep(page, route, 'pwa-audit');

  const report: PWAReport = {
    route,
    isPWA,
    hasServiceWorker,
    hasManifest,
    findings,
  };

  writeJsonArtifact('pwa', `${routeName}-pwa.json`, report);

  return report;
}
