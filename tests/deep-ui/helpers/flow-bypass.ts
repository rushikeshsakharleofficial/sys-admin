/**
 * flow-bypass.ts
 *
 * Audits whether a page's multi-step flows, paywalls, and form validation
 * can be bypassed by a user manipulating URLs, hidden fields, or DOM state.
 *
 * Safety contract:
 *   - Only navigates to modified step URLs (read-only, no side effects)
 *   - Never submits forms, never creates or deletes data
 *   - Restores original URL after any navigation test
 *   - Early-exits if no bypass-relevant signals detected
 */
import { Page } from '@playwright/test';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';
import { screenshotStep } from './screenshots';

export interface FlowBypassFinding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
}

export interface FlowBypassReport {
  route: string;
  multiStepFlowDetected: boolean;
  stepUrlParamDetected: boolean;
  novalidateFormsFound: number;
  hiddenStepFieldsFound: number;
  paywallGatesFound: number;
  directStepAccessBlocked: boolean | null; // null = not tested
  findings: FlowBypassFinding[];
}

// Triggers that indicate a bypass-relevant page
const STEP_PARAM_RE = /[?&](step|stage|page|wizard_step|current_step|checkout_step)=(\d+)/i;
const EARLY_EXIT_SELECTOR = [
  '[class*="step-indicator" i]',
  '[class*="wizard" i]',
  '[class*="stepper" i]',
  '[role="progressbar"]',
  'form[novalidate]',
  'input[type="hidden"][name*="step" i]',
  '[class*="paywall" i]',
  '[class*="locked-content" i]',
  '[class*="premium-content" i]',
  '[class*="gated" i]',
  '[class*="checkout" i]',
  '[data-step]',
  '[data-wizard-step]',
].join(', ');

export async function auditFlowBypass(
  page: Page,
  route: string,
): Promise<FlowBypassReport> {
  const routeName = normalizeRoute(route);
  const report: FlowBypassReport = {
    route,
    multiStepFlowDetected: false,
    stepUrlParamDetected: false,
    novalidateFormsFound: 0,
    hiddenStepFieldsFound: 0,
    paywallGatesFound: 0,
    directStepAccessBlocked: null,
    findings: [],
  };

  try {
    // ---- EARLY EXIT: quick detection scan ----
    const currentUrl = page.url();
    const stepParamMatch = currentUrl.match(STEP_PARAM_RE);

    const hasRelevantElements = await page.evaluate(
      (sel: string) =>
        !!(
          document.querySelector(sel) ||
          /step\s+\d+\s+of\s+\d+/i.test(document.body.innerText) ||
          /\bstep\s+\d+\b/i.test(document.body.innerText)
        ),
      EARLY_EXIT_SELECTOR,
    );

    if (!hasRelevantElements && !stepParamMatch) {
      writeJsonArtifact('flow-bypass', `${routeName}-flow-bypass.json`, report);
      return report;
    }

    report.stepUrlParamDetected = !!stepParamMatch;

    // ---- MAIN DOM INSPECTION (single page.evaluate round-trip) ----
    type DomResult = {
      findings: FlowBypassFinding[];
      multiStepDetected: boolean;
      novalidateCount: number;
      hiddenStepCount: number;
      paywallCount: number;
    };

    const domResult: DomResult = await page.evaluate(() => {
      const findings: FlowBypassFinding[] = [];

      const visible = (el: HTMLElement): boolean => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (
          s.display !== 'none' &&
          s.visibility !== 'hidden' &&
          s.opacity !== '0' &&
          r.width > 0
        );
      };

      const sel = (el: HTMLElement): string => {
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className && typeof el.className === 'string'
          ? `.${el.className.trim().split(/\s+/)[0]}`
          : '';
        return `${tag}${id || cls}`;
      };

      // ---- CHECK 1: Multi-step flow detection ----
      const stepEls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[class*="step-indicator" i], [class*="step-item" i], [class*="wizard-step" i], [class*="stepper" i], [role="progressbar"], [aria-label*="step" i]',
        ),
      ).filter(visible);

      const stepTextMatch =
        /step\s+\d+\s+of\s+\d+/i.test(document.body.innerText) ||
        /\bstep\s+\d+\b/i.test(document.body.innerText);

      const wizardBtns = Array.from(
        document.querySelectorAll<HTMLElement>('button, [role="button"]'),
      ).filter(
        (el) =>
          visible(el) &&
          /\b(next step|continue|proceed|back|previous|go back)\b/i.test(
            el.textContent || '',
          ),
      );

      const multiStepDetected =
        stepEls.length > 0 || stepTextMatch || wizardBtns.length >= 2;

      if (multiStepDetected) {
        findings.push({
          severity: 'info',
          type: 'multistep-flow-detected',
          message: `Multi-step flow detected: ${stepEls.length} step indicator elements, step text: ${stepTextMatch}, wizard buttons: ${wizardBtns.length}`,
        });
      }

      // ---- CHECK 2: Forms with novalidate ----
      const novalidateForms = Array.from(
        document.querySelectorAll<HTMLFormElement>('form[novalidate]'),
      );

      for (const form of novalidateForms.slice(0, 5)) {
        const action = form.getAttribute('action') || '';
        const hasToken = !!form.querySelector(
          'input[name*="csrf" i], input[name*="_token" i], input[name*="token" i]',
        );
        const isClientOnly = action === '' || action === '#';

        if (isClientOnly && !hasToken) {
          findings.push({
            severity: 'high',
            type: 'form-novalidate-client-only',
            message: `form[novalidate] has no server action and no CSRF token — validation is client-side only, bypassable by removing HTML required attributes or disabling JS`,
            selector: sel(form),
          });
        } else if (!hasToken) {
          findings.push({
            severity: 'medium',
            type: 'form-novalidate-no-csrf',
            message: `form[novalidate] lacks CSRF token — server must independently validate all fields, since client validation can be bypassed`,
            selector: sel(form),
          });
        }
      }

      // ---- CHECK 3: Hidden step-control fields ----
      const hiddenStepFields = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          'input[type="hidden"][name*="step" i], input[type="hidden"][name*="stage" i], input[type="hidden"][name*="current_page" i], input[type="hidden"][name*="wizard" i], input[type="hidden"][name*="flow_step" i]',
        ),
      );

      for (const field of hiddenStepFields.slice(0, 5)) {
        findings.push({
          severity: 'high',
          type: 'hidden-step-field-found',
          message: `Hidden field name="${field.name}" value="${field.value}" controls flow step position — if server trusts this without session verification, client can increment it to skip steps`,
          selector: `input[name="${field.name}"]`,
        });
      }

      // ---- CHECK 4: Paywall / premium content in DOM ----
      const paywallEls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[class*="paywall" i], [class*="locked-content" i], [class*="premium-content" i], [class*="gated" i]',
        ),
      );

      for (const el of paywallEls.slice(0, 5)) {
        const s = getComputedStyle(el);
        const isBlurred = s.filter !== 'none' && s.filter.includes('blur');
        const isLowOpacity = parseFloat(s.opacity) < 0.3;
        const isOverflowHidden =
          s.overflow === 'hidden' && el.scrollHeight > el.clientHeight + 20;
        const textLen = (el.textContent || '').trim().length;

        if ((isBlurred || isLowOpacity) && textLen > 20) {
          findings.push({
            severity: 'high',
            type: 'paywall-content-in-dom',
            message: `Gated content exists in DOM hidden only by ${isBlurred ? 'CSS blur filter' : 'low opacity'} — content is accessible by removing the CSS rule. Text: "${(el.textContent || '').trim().slice(0, 80)}"`,
            selector: sel(el),
          });
        } else if (isOverflowHidden && textLen > 20) {
          findings.push({
            severity: 'medium',
            type: 'paywall-overflow-hidden',
            message: `Paywall element hides content with overflow:hidden — content exists in DOM (scrollHeight ${el.scrollHeight}px > clientHeight ${el.clientHeight}px), accessible by removing overflow restriction`,
            selector: sel(el),
          });
        } else {
          findings.push({
            severity: 'info',
            type: 'paywall-gate-present',
            message: `Paywall or premium gate detected — verify gating is enforced server-side, not only client-side CSS/JS`,
            selector: sel(el),
          });
        }
      }

      // ---- CHECK 5: Multi-step forms without step/CSRF token ----
      const allForms = Array.from(
        document.querySelectorAll<HTMLFormElement>('form'),
      );
      for (const form of allForms.slice(0, 10)) {
        const action = form.getAttribute('action') || '';
        const isMultiStep =
          /\/(step|stage|wizard|checkout|onboarding)\//i.test(action) ||
          !!form.querySelector(
            'input[type="hidden"][name*="step" i], input[type="hidden"][name*="stage" i]',
          );
        const hasToken = !!form.querySelector(
          'input[name*="csrf" i], input[name*="_token" i], input[name*="token" i]',
        );

        if (isMultiStep && !hasToken) {
          findings.push({
            severity: 'medium',
            type: 'multistep-form-no-token',
            message: `Multi-step form action="${action}" has no CSRF/step-sequence token — server should reject out-of-sequence submissions using session state`,
            selector: sel(form),
          });
        }
      }

      // ---- CHECK 6: Client-only step navigation via data attributes ----
      const dataStepControls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-step], [data-wizard-step], [data-goto-step], [data-go-to-step]',
        ),
      );
      const clientOnlyControls = dataStepControls.filter((el) => {
        const href = (el as HTMLAnchorElement).href;
        return !href || href.endsWith('#') || href === '';
      });

      if (clientOnlyControls.length > 2) {
        findings.push({
          severity: 'medium',
          type: 'client-only-step-navigation',
          message: `${clientOnlyControls.length} step navigation controls use data attributes with no real URL — step sequencing is client-side only; server must verify step eligibility independently on each POST`,
        });
      }

      return {
        findings,
        multiStepDetected,
        novalidateCount: novalidateForms.length,
        hiddenStepCount: hiddenStepFields.length,
        paywallCount: paywallEls.length,
      };
    });

    report.multiStepFlowDetected = domResult.multiStepDetected;
    report.novalidateFormsFound = domResult.novalidateCount;
    report.hiddenStepFieldsFound = domResult.hiddenStepCount;
    report.paywallGatesFound = domResult.paywallCount;
    report.findings.push(...domResult.findings);

    // ---- CHECK 7: Direct step URL access test ----
    // If current URL has a step param (e.g. ?step=1), try jumping to step+2
    // and detect whether the server redirects back (blocked) or allows access.
    if (stepParamMatch) {
      const [, paramName, stepNumStr] = stepParamMatch;
      const currentStep = parseInt(stepNumStr, 10);
      const targetStep = currentStep + 2;

      const testUrl = currentUrl.replace(
        new RegExp(`([?&]${paramName}=)${currentStep}`, 'i'),
        `$1${targetStep}`,
      );

      try {
        const response = await page.goto(testUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 10_000,
        });
        const finalUrl = page.url();
        // Blocked = server redirected us away from the target step URL
        const wasRedirected =
          !finalUrl.includes(`${paramName}=${targetStep}`) ||
          (response && response.status() >= 300 && response.status() < 400);

        report.directStepAccessBlocked = !!wasRedirected;

        if (!wasRedirected) {
          report.findings.push({
            severity: 'high',
            type: 'step-url-bypass-allowed',
            message: `Direct URL access to step ${targetStep} (jumped from step ${currentStep}) was NOT blocked — server accepted out-of-sequence step: ${testUrl}`,
          });
          await screenshotStep(page, route, `flow-bypass-step${targetStep}-allowed`);
        } else {
          report.findings.push({
            severity: 'info',
            type: 'step-url-bypass-blocked',
            message: `Step URL bypass correctly blocked — navigating to step ${targetStep} redirected to: ${finalUrl}`,
          });
        }

        // Restore original URL
        await page.goto(currentUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 15_000,
        });
      } catch {
        report.findings.push({
          severity: 'info',
          type: 'step-url-test-error',
          message: 'Step URL bypass navigation test failed (network/timeout) — manual verification needed',
        });
        try {
          await page.goto(currentUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 10_000,
          });
        } catch { /* ignore restore failure */ }
      }
    }

    // Screenshot when notable findings present
    const notable = report.findings.filter(
      (f) => f.severity === 'high' || f.severity === 'critical',
    );
    if (notable.length > 0) {
      try {
        await screenshotStep(page, route, 'flow-bypass-findings');
      } catch { /* ignore */ }
    }
  } catch {
    // partial report still written
  } finally {
    writeJsonArtifact('flow-bypass', `${routeName}-flow-bypass.json`, report);
  }

  return report;
}
