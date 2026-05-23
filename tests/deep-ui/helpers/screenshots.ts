import fs from 'fs';
import path from 'path';
import { Page, expect } from '@playwright/test';
import { normalizeRoute } from './routes';

/**
 * Ensures a directory exists, creating it recursively if necessary.
 *
 * @param dir Directory path to ensure
 */
export async function ensureDir(dir: string): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Captures a viewport screenshot and saves it under the QA artefacts folder.
 *
 * @param page Playwright page instance
 * @param route The current route pathname
 * @param name Name of the screenshot file (without extension)
 */
export async function screenshotStep(
  page: Page,
  route: string,
  name: string
): Promise<void> {
  const dir = path.join('qa-artifacts', 'screenshots', normalizeRoute(route));
  await ensureDir(dir);
  await page.screenshot({
    path: path.join(dir, `${name}.png`),
    fullPage: false,
  });
}

/**
 * Captures a full‑page screenshot and saves it under the QA artefacts folder.
 *
 * @param page Playwright page instance
 * @param route The current route pathname
 * @param name Optional name of the screenshot file (defaults to `full-page`)
 */
export async function fullPageScreenshot(
  page: Page,
  route: string,
  name = 'full-page'
): Promise<void> {
  const dir = path.join('qa-artifacts', 'screenshots', normalizeRoute(route));
  await ensureDir(dir);
  await page.screenshot({
    path: path.join(dir, `${name}.png`),
    fullPage: true,
  });
}

/**
 * Performs a visual regression snapshot using Playwright's snapshot API.
 * The snapshot file will be named after the normalised route.
 *
 * @param page Playwright page instance
 * @param route The current route pathname
 */
export async function visualRegression(page: Page, route: string): Promise<void> {
  await expect(page).toHaveScreenshot(`${normalizeRoute(route)}.png`, {
    fullPage: true,
    animations: 'disabled',
  });
}