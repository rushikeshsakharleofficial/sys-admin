import { Page } from '@playwright/test';

export type AccessibilityIssue = {
  type: string;
  message: string;
  selector?: string;
  text?: string;
};

export async function collectAccessibilityIssues(page: Page): Promise<AccessibilityIssue[]> {
  return await page.evaluate(() => {
    const issues: AccessibilityIssue[] = [];

    const selectorFor = (el: Element) => {
      const h = el as HTMLElement;
      return h.getAttribute('data-testid') || h.getAttribute('aria-label') || h.id || h.className?.toString().slice(0, 50) || h.tagName;
    };

    const visible = (el: HTMLElement) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && r.width > 0 && r.height > 0;
    };

    // Missing accessible names
    const controls = Array.from(document.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [role="button"], [role="link"], [tabindex]'
    )).filter(visible);

    for (const el of controls) {
      const role = el.getAttribute('role') || el.tagName.toLowerCase();
      const name = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') ||
        (el as HTMLInputElement).labels?.[0]?.textContent || el.textContent?.trim() ||
        (el as HTMLInputElement).placeholder || (el as HTMLInputElement).value || '';
      if (!name.trim() && !['input', 'select', 'textarea'].includes(el.tagName.toLowerCase())) {
        issues.push({ type: 'missing-accessible-name', message: `Visible ${role} has no accessible name`, selector: selectorFor(el) });
      }
      if (el.getAttribute('role') === 'button' && !el.hasAttribute('tabindex')) {
        issues.push({ type: 'role-button-not-focusable', message: 'Element with role="button" is not explicitly focusable', selector: selectorFor(el), text: el.textContent?.trim() || '' });
      }
    }

    // Clickable divs/spans without keyboard support
    const clickable = Array.from(document.querySelectorAll<HTMLElement>('div, span'))
      .filter(el => {
        if (!visible(el)) return false;
        return (el.getAttribute('onclick') || el.style.cursor === 'pointer') && !el.getAttribute('role') && !el.hasAttribute('tabindex');
      });
    for (const el of clickable.slice(0, 10)) {
      issues.push({ type: 'clickable-without-role', message: 'Clickable div/span has no role or tabindex — not keyboard accessible', selector: selectorFor(el), text: el.textContent?.trim().slice(0, 40) || '' });
    }

    // Inputs without labels
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')).filter(visible);
    for (const input of inputs) {
      if ((input as HTMLInputElement).type === 'hidden') continue;
      const hasLabel = Boolean(
        input.getAttribute('aria-label') || input.getAttribute('aria-labelledby') ||
        (input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`)) ||
        (input as HTMLInputElement).labels?.length
      );
      if (!hasLabel) {
        issues.push({ type: 'input-missing-label', message: 'Visible form field has no label or accessible name', selector: selectorFor(input) });
      }
    }

    // Duplicate IDs
    const ids = new Map<string, number>();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[id]'))) {
      ids.set(el.id, (ids.get(el.id) || 0) + 1);
    }
    for (const [id, count] of ids) {
      if (count > 1) issues.push({ type: 'duplicate-id', message: `Duplicate id: "${id}" (${count} elements)`, selector: id });
    }

    // Heading level skips
    const headings = Array.from(document.querySelectorAll<HTMLHeadingElement>('h1,h2,h3,h4,h5,h6'));
    if (headings.length > 0) {
      let prev = Number(headings[0].tagName.slice(1));
      for (const h of headings.slice(1)) {
        const cur = Number(h.tagName.slice(1));
        if (cur > prev + 1) issues.push({ type: 'heading-level-skip', message: `Heading jumps from h${prev} to h${cur}`, selector: selectorFor(h), text: h.textContent?.trim().slice(0, 60) || '' });
        prev = cur;
      }
    }

    // Missing landmarks
    if (!document.querySelector('main, [role="main"]')) issues.push({ type: 'missing-main-landmark', message: 'No <main> or role="main" landmark' });
    if (!document.querySelector('nav, [role="navigation"]')) issues.push({ type: 'missing-nav-landmark', message: 'No <nav> or role="navigation" landmark' });
    if (!document.querySelector('header, [role="banner"]')) issues.push({ type: 'missing-header-landmark', message: 'No <header> or role="banner" landmark' });

    // Missing lang on <html>
    if (!document.documentElement.getAttribute('lang')?.trim()) {
      issues.push({ type: 'missing-html-lang', message: '<html> element missing lang attribute' });
    }

    // Simplified contrast check (sample first 50 text elements)
    const parseRgb = (s: string): [number, number, number] | null => {
      const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
    };
    const lum = ([r, g, b]: [number, number, number]) => {
      const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const contrast = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const textEls = Array.from(document.querySelectorAll<HTMLElement>('p,span,a,button,label,li,td,th,h1,h2,h3,h4,h5,h6'))
      .filter(el => visible(el) && (el.textContent?.trim() || '').length > 3);
    let contrastCount = 0;
    for (const el of textEls.slice(0, 50)) {
      const s = getComputedStyle(el);
      const fg = parseRgb(s.color), bg = parseRgb(s.backgroundColor);
      if (!fg || !bg) continue;
      if (s.backgroundColor.includes('rgba') && bg[0] === 0 && bg[1] === 0 && bg[2] === 0) continue;
      const ratio = contrast(lum(fg), lum(bg));
      const isLarge = parseFloat(s.fontSize) >= 18 || (parseInt(s.fontWeight) >= 700 && parseFloat(s.fontSize) >= 14);
      if (ratio < (isLarge ? 3.0 : 4.5) && ratio > 1.05) {
        contrastCount++;
        if (contrastCount <= 3) issues.push({ type: 'poor-color-contrast', message: `Contrast ${ratio.toFixed(2)}:1 below minimum`, selector: selectorFor(el), text: el.textContent?.trim().slice(0, 40) || '' });
      }
    }
    if (contrastCount > 3) issues.push({ type: 'poor-color-contrast-summary', message: `${contrastCount} contrast issues (showing first 3)` });

    // aria-expanded without controls
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[aria-expanded]'))) {
      if (!el.getAttribute('aria-controls') && !el.getAttribute('aria-owns')) {
        issues.push({ type: 'aria-expanded-no-controls', message: 'aria-expanded without aria-controls or aria-owns', selector: selectorFor(el), text: el.textContent?.trim().slice(0, 40) || '' });
      }
    }

    return issues;
  });
}

export async function collectKeyboardFocusOrder(page: Page, maxTabs = 40): Promise<{ order: string[]; focusVisibilityIssues: string[] }> {
  const order: string[] = [];
  const focusVisibilityIssues: string[] = [];
  await page.keyboard.press('Home').catch(() => undefined);
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const result = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return { label: 'body', hasOutline: true, selector: '' };
      const s = getComputedStyle(el);
      const hasOutline = (parseFloat(s.outlineWidth) > 0 && s.outlineStyle !== 'none') || (s.boxShadow !== 'none' && s.boxShadow !== '');
      return {
        label: el.getAttribute('aria-label') || el.getAttribute('data-testid') || el.textContent?.trim().slice(0, 80) || el.id || el.tagName,
        hasOutline,
        selector: el.id || el.className?.toString().slice(0, 40) || el.tagName,
      };
    });
    order.push(result?.label || 'unknown');
    if (result && !result.hasOutline && result.label !== 'body') {
      focusVisibilityIssues.push(`Focus not visible on: ${result.label} (${result.selector})`);
    }
  }
  return { order, focusVisibilityIssues };
}
