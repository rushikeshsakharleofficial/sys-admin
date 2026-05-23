import { Page } from '@playwright/test';

/**
 * Seed routes provide initial paths to visit. These should include all core
 * pages of your application. Additional routes will be discovered at
 * runtime via `discoverLinks`.
 */
export const seedRoutes: string[] = [
  '/',
  '/login',
  '/signup',
  '/dashboard',
  '/settings',
  '/profile',
];

/**
 * Discovers internal links on a page. Only links that share the same
 * origin as the current page will be returned.
 *
 * @param page Playwright page
 * @returns Unique list of pathname strings (e.g. `/dashboard`)
 */
export async function discoverLinks(page: Page): Promise<string[]> {
  const links = await page.locator('a[href]').evaluateAll((anchors) => {
    return anchors
      .map((a) => (a as HTMLAnchorElement).href)
      .filter(Boolean);
  });

  const origin = new URL(page.url()).origin;

  return [...new Set(
    links
      .filter((href) => href.startsWith(origin))
      .map((href) => new URL(href).pathname)
  )];
}

/**
 * Normalises a route name for use in filenames and snapshot names.
 * The root path `/` becomes `home`; otherwise slashes and non‑word
 * characters are replaced with hyphens.
 *
 * @param route The pathname (e.g. `/settings/profile`)
 * @returns Normalised string (e.g. `settings-profile`)
 */
export function normalizeRoute(route: string): string {
  if (!route || route === '/') return 'home';
  return route.replace(/^\/+/g, '').replace(/[^\w]+/g, '-');
}