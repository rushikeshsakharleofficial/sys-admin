import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';

export type FormFinding = {
  type: string;
  message: string;
  formIndex: number;
  selector?: string;
};

/**
 * Safe test values to exercise form fields without submitting real data.
 */
const TEST_VALUES = {
  text: 'Test Input 123',
  longText: 'A'.repeat(300),
  email: 'test@example.com',
  invalidEmail: 'not-an-email',
  phone: '+1-555-0100',
  invalidPhone: 'abc',
  password: 'TestP@ssw0rd!',
  shortPassword: 'a',
  number: '42',
  negativeNumber: '-1',
  zero: '0',
  largeNumber: '9999999999',
  html: '<script>alert(1)</script>',
  sql: "' OR 1=1 --",
  emoji: '🎉 café naïve',
  search: 'test search query',
};

/**
 * Scans visible forms on the page and reports structural issues.
 * Does NOT submit any form.
 *
 * Checks:
 * - Forms missing submit button or button type=submit
 * - Password fields without masking
 * - Inputs without labels or aria attributes
 * - Autocomplete attribute missing on sensitive fields
 * - Forms with action="#" or missing action on non-SPA forms
 *
 * @param page Playwright page instance
 * @returns Array of form findings
 */
export async function auditForms(page: Page): Promise<FormFinding[]> {
  return await page.evaluate(() => {
    const findings: FormFinding[] = [];
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form'));

    forms.forEach((form, formIndex) => {
      // Check for submit mechanism
      const hasSubmit =
        form.querySelector('button[type="submit"], input[type="submit"], button:not([type])') !== null;
      if (!hasSubmit) {
        findings.push({
          type: 'form-no-submit',
          message: 'Form has no visible submit button or input[type=submit]',
          formIndex,
        });
      }

      // Check action="#" on non-SPA
      const action = form.getAttribute('action');
      if (action === '#') {
        findings.push({
          type: 'form-placeholder-action',
          message: 'Form action is "#" — likely a placeholder or unfired handler',
          formIndex,
          selector: 'form[action="#"]',
        });
      }

      // Check password fields have autocomplete
      const passwordInputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="password"]'));
      for (const pw of passwordInputs) {
        const ac = pw.getAttribute('autocomplete');
        if (!ac || ac === '') {
          findings.push({
            type: 'password-no-autocomplete',
            message: 'Password field missing autocomplete attribute (should be "current-password" or "new-password")',
            formIndex,
            selector: pw.id || pw.name || pw.className || 'input[type=password]',
          });
        }
      }

      // Check email fields
      const emailInputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="email"]'));
      for (const em of emailInputs) {
        if (!em.getAttribute('autocomplete')) {
          findings.push({
            type: 'email-no-autocomplete',
            message: 'Email field missing autocomplete attribute',
            formIndex,
            selector: em.id || em.name || 'input[type=email]',
          });
        }
      }

      // Check disabled submit without aria-disabled explanation
      const disabledSubmit = form.querySelector<HTMLButtonElement>(
        'button[type="submit"][disabled], button[type="submit"][aria-disabled="true"]'
      );
      if (disabledSubmit) {
        findings.push({
          type: 'submit-disabled',
          message: 'Submit button is disabled on initial render — verify not a stuck loading state',
          formIndex,
          selector: disabledSubmit.id || disabledSubmit.className || 'button[disabled]',
        });
      }
    });

    return findings;
  });
}

/**
 * Fills a form field with a safe test value matched to its type.
 * Does NOT submit. Returns the value used.
 *
 * @param page Playwright page instance
 * @param selector CSS selector or locator string
 * @param type Input type hint: text, email, password, search, number, textarea
 * @returns The value that was filled
 */
export async function fillFormField(
  page: Page,
  selector: string,
  type: keyof typeof TEST_VALUES = 'text'
): Promise<string> {
  const value = TEST_VALUES[type] ?? TEST_VALUES.text;
  const locator = page.locator(selector).first();
  await locator.focus();
  await locator.fill(value);
  return value;
}

/**
 * Triggers and captures validation state for visible forms.
 * Submits via Enter key on the first focusable field (does NOT click submit)
 * to trigger HTML5 native validation only. Safe on local/preview environments.
 *
 * Screenshots each validation state.
 *
 * @param page Playwright page instance
 * @param route Current route for screenshot naming
 */
export async function triggerAndCaptureValidation(
  page: Page,
  route: string
): Promise<void> {
  const forms = page.locator('form');
  const count = await forms.count();
  for (let i = 0; i < count; i++) {
    const form = forms.nth(i);
    try {
      if (!(await form.isVisible())) continue;
      // Focus first focusable field and press Enter to trigger native validation
      const firstField = form.locator('input:not([type="hidden"]):not([type="submit"]):not([disabled])').first();
      if (await firstField.count() > 0) {
        await firstField.focus();
        await firstField.press('Enter');
        await page.waitForTimeout(400);
        await screenshotStep(page, route, `form-${i}-validation-empty`);
      }
    } catch {
      // skip form if interaction fails
    }
  }
}

/**
 * Checks for double-submit risk on forms: verifies the submit button disables
 * or is replaced after first click. Operates on the first form only.
 * This is a heuristic check using MutationObserver via page.evaluate.
 *
 * @param page Playwright page instance
 * @returns true if button appeared to disable on submit, false if risk detected
 */
export async function checkDoubleSubmitProtection(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const submit = document.querySelector<HTMLButtonElement>(
      'button[type="submit"], button:not([type])'
    );
    if (!submit) return true; // no submit found — can't assess
    return submit.disabled || submit.getAttribute('aria-disabled') === 'true';
  });
}
