import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type ButtonAnimationFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type ButtonAnimationReport = {
  route: string;
  buttonsChecked: number;
  findings: ButtonAnimationFinding[];
};

const MAX_BUTTONS = 10;

function parseTransitions(transition: string): Array<{ property: string; durationMs: number }> {
  if (!transition || transition === 'none' || transition.trim() === '') return [];
  return transition.split(',').map((t) => {
    const tokens = t.trim().split(/\s+/);
    const property = tokens[0] ?? '';
    let durationMs = 0;
    for (const token of tokens) {
      if (token.endsWith('ms')) {
        durationMs = parseFloat(token);
        break;
      } else if (token.endsWith('s') && !token.endsWith('ms')) {
        durationMs = parseFloat(token) * 1000;
        break;
      }
    }
    return { property, durationMs };
  });
}

type ButtonInfo = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  transition: string;
  boxShadow: string;
  backgroundColor: string;
  transform: string;
  opacity: string;
  cursor: string;
  pointerEvents: string;
  disabled: boolean;
  ariaBusy: boolean;
  classHasLoading: boolean;
  hasSpinnerChild: boolean;
};

export async function auditButtonAnimations(
  page: Page,
  route: string
): Promise<ButtonAnimationReport> {
  const findings: ButtonAnimationFinding[] = [];
  const routeName = normalizeRoute(route);

  const report: ButtonAnimationReport = {
    route,
    buttonsChecked: 0,
    findings,
  };

  try {
    const hasButtons = await page.evaluate(
      () =>
        document.querySelector(
          'button, [role="button"], input[type="submit"], input[type="button"], a.btn, [class*="btn" i]'
        ) !== null
    );
    if (!hasButtons) {
      writeJsonArtifact('button-animations', `${routeName}-button-animations.json`, report);
      return report;
    }
  } catch {
    writeJsonArtifact('button-animations', `${routeName}-button-animations.json`, report);
    return report;
  }

  let buttons: ButtonInfo[] = [];

  try {
    buttons = await page.evaluate((max: number) => {
      const SELECTORS =
        'button, [role="button"], input[type="submit"], input[type="button"], a.btn, [class*="btn" i]';
      const all = Array.from(document.querySelectorAll<HTMLElement>(SELECTORS));
      const visible: ButtonInfo[] = [];

      for (let i = 0; i < all.length && visible.length < max; i++) {
        const el = all[i];
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;

        el.setAttribute('data-btn-audit-idx', String(visible.length));

        const className = typeof el.className === 'string' ? el.className : '';
        const loadingPattern = /loading|spinner|pending/i;

        visible.push({
          index: visible.length,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          transition: cs.transition,
          boxShadow: cs.boxShadow,
          backgroundColor: cs.backgroundColor,
          transform: cs.transform,
          opacity: cs.opacity,
          cursor: cs.cursor,
          pointerEvents: cs.pointerEvents,
          disabled:
            (el as HTMLButtonElement).disabled === true ||
            el.getAttribute('aria-disabled') === 'true',
          ariaBusy: el.getAttribute('aria-busy') === 'true',
          classHasLoading: loadingPattern.test(className),
          hasSpinnerChild:
            el.querySelector(
              '[class*="spinner" i], [class*="loading" i], [aria-label*="loading" i]'
            ) !== null,
        });
      }
      return visible;
    }, MAX_BUTTONS);
  } catch {
    writeJsonArtifact('button-animations', `${routeName}-button-animations.json`, report);
    return report;
  }

  report.buttonsChecked = buttons.length;

  // 1. CSS transition audit
  try {
    const LAYOUT_PROPS = ['width', 'height', 'top', 'left', 'right', 'bottom'];
    let anyTransition = false;

    for (const btn of buttons) {
      const transitions = parseTransitions(btn.transition);
      const realTransitions = transitions.filter((t) => t.durationMs > 0);

      if (realTransitions.length > 0) {
        anyTransition = true;

        for (const t of realTransitions) {
          const matchedLayout = LAYOUT_PROPS.find(
            (lp) => t.property === lp || t.property === 'all'
          );
          if (matchedLayout) {
            findings.push({
              severity: 'medium',
              type: 'btn-animation-layout-prop',
              message: `Button transition animates layout property ${t.property} — use transform/opacity for performance`,
              selector: `[data-btn-audit-idx="${btn.index}"]`,
            });
          }
          if (t.durationMs > 600) {
            findings.push({
              severity: 'low',
              type: 'btn-animation-too-slow',
              message: `Button transition duration ${t.durationMs}ms > 600ms — feels sluggish`,
              selector: `[data-btn-audit-idx="${btn.index}"]`,
            });
          }
          if (t.durationMs > 0 && t.durationMs < 50) {
            findings.push({
              severity: 'low',
              type: 'btn-animation-too-fast',
              message: `Button transition ${t.durationMs}ms too fast to perceive`,
              selector: `[data-btn-audit-idx="${btn.index}"]`,
            });
          }
        }
      }
    }

    if (!anyTransition) {
      findings.push({
        severity: 'info',
        type: 'btn-no-transitions',
        message: 'No CSS transitions on buttons — consider hover feedback',
      });
    }
  } catch {
    // skip
  }

  // 2. Box-shadow audit
  try {
    const shadowPattern = /(\d+)px\s+(\d+)px\s+(\d+)px\s+(\d+)px/;
    let anyShadow = false;

    for (const btn of buttons) {
      if (btn.boxShadow && btn.boxShadow !== 'none') {
        anyShadow = true;
        const match = shadowPattern.exec(btn.boxShadow);
        if (match) {
          const spread = parseInt(match[4], 10);
          if (spread > 20) {
            findings.push({
              severity: 'low',
              type: 'btn-shadow-too-large',
              message: `Button box-shadow spread ${spread}px > 20px — consider reducing`,
              selector: `[data-btn-audit-idx="${btn.index}"]`,
            });
          }
        }
      }
    }

    if (!anyShadow) {
      findings.push({
        severity: 'info',
        type: 'btn-no-shadow',
        message: 'No box-shadow on buttons — consider elevation feedback',
      });
    }
  } catch {
    // skip
  }

  // 3. Hover state (first 3 buttons)
  const hoverTargets = buttons.slice(0, 3);
  try {
    for (const btn of hoverTargets) {
      try {
        const cx = btn.x + btn.width / 2;
        const cy = btn.y + btn.height / 2;

        await page.mouse.move(cx, cy);
        await page.waitForTimeout(150);

        await screenshotStep(page, route, `btn-hover-${btn.index}`);

        const postHover = await page.evaluate((idx: number) => {
          const el = document.querySelector<HTMLElement>(`[data-btn-audit-idx="${idx}"]`);
          if (!el) return null;
          const cs = getComputedStyle(el);
          return {
            backgroundColor: cs.backgroundColor,
            transform: cs.transform,
            boxShadow: cs.boxShadow,
          };
        }, btn.index);

        if (postHover) {
          const bgChanged = postHover.backgroundColor !== btn.backgroundColor;
          const transformChanged =
            postHover.transform !== btn.transform && postHover.transform !== 'none';
          const shadowChanged = postHover.boxShadow !== btn.boxShadow;

          if (!bgChanged && !transformChanged && !shadowChanged) {
            findings.push({
              severity: 'medium',
              type: 'btn-no-hover-feedback',
              message: 'Button has no visible hover state change',
              selector: `[data-btn-audit-idx="${btn.index}"]`,
            });
          }
        }

        await page.mouse.move(0, 0);
        await page.waitForTimeout(150);
      } catch {
        try {
          await page.mouse.move(0, 0);
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // skip hover section
  }

  // 4. Active/pressed state (first 2 buttons)
  const activeTargets = buttons.slice(0, 2);
  try {
    for (const btn of activeTargets) {
      try {
        const cx = btn.x + btn.width / 2;
        const cy = btn.y + btn.height / 2;

        await page.mouse.move(cx, cy);
        await page.waitForTimeout(50);

        const prePressStyle = await page.evaluate((idx: number) => {
          const el = document.querySelector<HTMLElement>(`[data-btn-audit-idx="${idx}"]`);
          if (!el) return null;
          const cs = getComputedStyle(el);
          return { backgroundColor: cs.backgroundColor, transform: cs.transform };
        }, btn.index);

        await page.mouse.down();

        const pressedStyle = await page.evaluate((idx: number) => {
          const el = document.querySelector<HTMLElement>(`[data-btn-audit-idx="${idx}"]`);
          if (!el) return null;
          const cs = getComputedStyle(el);
          return { backgroundColor: cs.backgroundColor, transform: cs.transform };
        }, btn.index);

        await page.mouse.up();

        if (prePressStyle && pressedStyle) {
          const bgChanged = pressedStyle.backgroundColor !== prePressStyle.backgroundColor;
          const transformChanged =
            pressedStyle.transform !== prePressStyle.transform &&
            pressedStyle.transform !== 'none';

          if (!bgChanged && !transformChanged) {
            findings.push({
              severity: 'low',
              type: 'btn-no-active-state',
              message: 'Button has no visual change on press',
              selector: `[data-btn-audit-idx="${btn.index}"]`,
            });
          }
        }
      } catch {
        try {
          await page.mouse.up();
        } catch {
          // ignore
        }
      }
    }
  } finally {
    try {
      await page.mouse.move(10, 10);
    } catch {
      // ignore
    }
  }

  // 5. Disabled button styling
  try {
    const disabledButtons = buttons.filter((b) => b.disabled);
    for (const btn of disabledButtons) {
      const opacity = parseFloat(btn.opacity);
      const hasOpacityReduced = !isNaN(opacity) && opacity < 1;
      const hasNotAllowedCursor = btn.cursor === 'not-allowed';
      const hasPointerEventsNone = btn.pointerEvents === 'none';

      if (!hasOpacityReduced && !hasNotAllowedCursor && !hasPointerEventsNone) {
        findings.push({
          severity: 'medium',
          type: 'btn-disabled-no-visual',
          message:
            'Disabled button has full opacity and normal cursor — no visual distinction',
          selector: `[data-btn-audit-idx="${btn.index}"]`,
        });
      }
    }
  } catch {
    // skip
  }

  // 6. Loading state detection
  try {
    const loadingButtons = buttons.filter((b) => b.ariaBusy || b.classHasLoading);
    for (const btn of loadingButtons) {
      if (!btn.hasSpinnerChild) {
        findings.push({
          severity: 'low',
          type: 'btn-loading-no-spinner',
          message: 'Button in loading state has no spinner/indicator child element',
          selector: `[data-btn-audit-idx="${btn.index}"]`,
        });
      }
    }
  } catch {
    // skip
  }

  // Cleanup audit markers
  try {
    await page.evaluate(() => {
      document.querySelectorAll('[data-btn-audit-idx]').forEach((el) => {
        el.removeAttribute('data-btn-audit-idx');
      });
    });
  } catch {
    // ignore
  }

  writeJsonArtifact('button-animations', `${routeName}-button-animations.json`, report);
  return report;
}
