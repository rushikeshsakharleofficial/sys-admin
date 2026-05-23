import { Page } from '@playwright/test';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type HtmlValidationFinding = {
  severity: 'high' | 'medium' | 'low';
  type: string;
  message: string;
  selector?: string;
  tagName?: string;
};

export async function auditHtmlValidation(page: Page, route: string): Promise<HtmlValidationFinding[]> {
  const routeName = normalizeRoute(route);

  const findings: HtmlValidationFinding[] = await page.evaluate(() => {
    const results: HtmlValidationFinding[] = [];

    const selectorFor = (el: Element): string => {
      const h = el as HTMLElement;
      return h.id ? `#${h.id}` : (h.getAttribute('data-testid') || h.getAttribute('aria-label') || String(h.className || '').trim().split(/\s+/)[0] || h.tagName.toLowerCase());
    };

    const isVisible = (el: HTMLElement): boolean => {
      const s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden';
    };

    // HIGH: nested-interactive
    const nestedInteractivePairs = [
      { outer: 'button', inner: 'button' },
      { outer: 'a', inner: 'a' },
      { outer: 'button', inner: 'a' },
      { outer: 'a', inner: 'button' },
      { outer: 'label', inner: 'label' },
    ];
    let nestedCount = 0;
    for (const { outer, inner } of nestedInteractivePairs) {
      if (nestedCount >= 5) break;
      try {
        const matches = Array.from(document.querySelectorAll(`${outer} ${inner}`));
        for (const el of matches.slice(0, 5 - nestedCount)) {
          results.push({
            severity: 'high',
            type: 'nested-interactive',
            message: `<${inner}> nested inside <${outer}> — invalid HTML, causes browser parsing bugs`,
            selector: selectorFor(el),
            tagName: inner,
          });
          nestedCount++;
          if (nestedCount >= 5) break;
        }
      } catch (_) { /* skip */ }
    }

    // HIGH: form-missing-method
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form'));
    for (const form of forms.slice(0, 10)) {
      if (!form.hasAttribute('method') && !form.hasAttribute('onsubmit')) {
        results.push({
          severity: 'high',
          type: 'form-missing-method',
          message: 'Form has no method attribute and no onsubmit handler — defaults to GET, may expose data in URL',
          selector: selectorFor(form),
          tagName: 'form',
        });
      }
    }

    // HIGH: input-outside-form
    const standaloneInputTypes = ['text', 'email', 'password', 'tel'];
    const allInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
    let inputOutsideCount = 0;
    for (const input of allInputs) {
      if (inputOutsideCount >= 10) break;
      if (!standaloneInputTypes.includes(input.type)) continue;
      if (!isVisible(input)) continue;
      if (!input.closest('form')) {
        results.push({
          severity: 'high',
          type: 'input-outside-form',
          message: `Visible <input type="${input.type}"> has no parent <form> — data may not submit properly`,
          selector: selectorFor(input),
          tagName: 'input',
        });
        inputOutsideCount++;
      }
    }

    // MEDIUM: deprecated-tag
    const deprecatedTags = ['marquee', 'blink', 'font', 'center', 'strike', 'tt', 'big', 'small', 'frameset', 'frame', 'noframes'];
    for (const tag of deprecatedTags) {
      try {
        const found = document.querySelector(tag);
        if (found) {
          results.push({
            severity: 'medium',
            type: 'deprecated-tag',
            message: `Deprecated HTML element <${tag}> found — not supported in HTML5`,
            tagName: tag,
          });
        }
      } catch (_) { /* skip */ }
    }

    // MEDIUM: multiple-h1
    const h1s = Array.from(document.querySelectorAll('h1'));
    if (h1s.length > 1) {
      results.push({
        severity: 'medium',
        type: 'multiple-h1',
        message: `${h1s.length} <h1> elements on page — expected exactly one; confusing for SEO and screen readers`,
        tagName: 'h1',
      });
    }

    // LOW: missing-doctype (reported as low per spec comment)
    if (!document.doctype) {
      results.push({
        severity: 'low',
        type: 'missing-doctype',
        message: 'document.doctype is null — page missing DOCTYPE declaration',
      });
    }

    // MEDIUM: empty-heading
    const headings = Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'));
    let emptyHeadingCount = 0;
    for (const h of headings) {
      if (emptyHeadingCount >= 10) break;
      if (!(h.textContent || '').trim()) {
        results.push({
          severity: 'medium',
          type: 'empty-heading',
          message: `Empty <${h.tagName.toLowerCase()}> element — screen readers announce an empty heading`,
          selector: selectorFor(h),
          tagName: h.tagName.toLowerCase(),
        });
        emptyHeadingCount++;
      }
    }

    // MEDIUM: autofocus-multiple
    const autofocusEls = Array.from(document.querySelectorAll('[autofocus]'));
    if (autofocusEls.length > 1) {
      results.push({
        severity: 'medium',
        type: 'autofocus-multiple',
        message: `${autofocusEls.length} elements have the autofocus attribute — only one should have focus on load`,
      });
    }

    // MEDIUM: button-missing-type (inside forms only)
    let btnMissingTypeCount = 0;
    for (const form of forms) {
      if (btnMissingTypeCount >= 3) break;
      const buttons = Array.from(form.querySelectorAll<HTMLButtonElement>('button'));
      for (const btn of buttons) {
        if (btnMissingTypeCount >= 3) break;
        if (!btn.hasAttribute('type')) {
          results.push({
            severity: 'medium',
            type: 'button-missing-type',
            message: `<button> inside <form> has no type attribute — defaults to "submit" which may cause unintended form submission`,
            selector: selectorFor(btn),
            tagName: 'button',
          });
          btnMissingTypeCount++;
        }
      }
    }

    // LOW: tabindex-positive
    const posTabindex = Array.from(document.querySelectorAll('[tabindex]')).filter(el => {
      const val = parseInt(el.getAttribute('tabindex') || '0', 10);
      return val > 0;
    });
    for (const el of posTabindex.slice(0, 10)) {
      results.push({
        severity: 'low',
        type: 'tabindex-positive',
        message: `tabindex="${el.getAttribute('tabindex')}" breaks natural tab order — WCAG 2.4.3`,
        selector: selectorFor(el),
      });
    }

    // LOW: target-blank-without-rel
    const blankLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')).filter(a => {
      const rel = (a.getAttribute('rel') || '').split(/\s+/);
      return !rel.includes('noopener');
    });
    for (const a of blankLinks.slice(0, 10)) {
      results.push({
        severity: 'low',
        type: 'target-blank-without-rel',
        message: `<a target="_blank"> missing rel="noopener" — security and performance risk`,
        selector: selectorFor(a),
        tagName: 'a',
      });
    }

    // LOW: img-empty-alt-in-link
    const linkedImgsEmptyAlt = Array.from(document.querySelectorAll<HTMLAnchorElement>('a')).filter(a => {
      const img = a.querySelector('img');
      if (!img) return false;
      const altEmpty = !img.getAttribute('alt') || img.getAttribute('alt') === '';
      const linkHasNoName = !(a.getAttribute('aria-label') || a.getAttribute('aria-labelledby') || (a.textContent || '').trim());
      return altEmpty && linkHasNoName;
    });
    for (const a of linkedImgsEmptyAlt.slice(0, 10)) {
      results.push({
        severity: 'low',
        type: 'img-empty-alt-in-link',
        message: '<a><img alt=""></a> with no accessible name on link — link has no accessible label for screen readers',
        selector: selectorFor(a),
        tagName: 'a',
      });
    }

    // LOW: autocomplete-off-password
    const passwordInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]')).filter(
      i => (i.getAttribute('autocomplete') || '').toLowerCase() === 'off'
    );
    for (const input of passwordInputs.slice(0, 10)) {
      results.push({
        severity: 'low',
        type: 'autcomplete-off-password',
        message: '<input type="password" autocomplete="off"> prevents password managers — bad UX',
        selector: selectorFor(input),
        tagName: 'input',
      });
    }

    return results;
  });

  writeJsonArtifact('html-validation', `${routeName}-html-validation.json`, findings);
  return findings;
}
