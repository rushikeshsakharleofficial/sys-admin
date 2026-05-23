import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type PopupQualityFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type PopupQualityReport = {
  route: string;
  popupsFound: number;
  findings: PopupQualityFinding[];
};

export async function auditPopupQuality(page: Page, route: string): Promise<PopupQualityReport> {
  const routeName = normalizeRoute(route);
  const report: PopupQualityReport = { route, popupsFound: 0, findings: [] };

  try {
    const hasPopups = await page.evaluate(() =>
      document.querySelector(
        '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [class*="modal" i], [class*="popup" i], [class*="drawer" i], [class*="sheet" i]'
      ) !== null
    );

    if (!hasPopups) {
      writeJsonArtifact('popup-quality', `${routeName}-popup-quality.json`, report);
      return report;
    }

    type SerializedFinding = {
      severity: 'high' | 'medium' | 'low' | 'info';
      type: string;
      message: string;
      selector?: string;
    };

    const inspected = await page.evaluate((): { popupsFound: number; findings: SerializedFinding[] } => {
      const findings: SerializedFinding[] = [];

      const SELECTOR =
        '[role="dialog"], [role="alertdialog"], [aria-modal="true"], ' +
        '[class*="modal" i], [class*="popup" i], [class*="drawer" i], [class*="sheet" i]';

      const candidates = Array.from(document.querySelectorAll(SELECTOR)) as HTMLElement[];

      const visiblePopups = candidates.filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
        return true;
      });

      const MAX_POPUPS = 5;
      const popups = visiblePopups.slice(0, MAX_POPUPS);

      const makeSelector = (el: HTMLElement, idx: number): string => {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || '';
        const firstClass = el.classList[0] || '';
        return `${tag}${role ? `[role="${role}"]` : ''}${firstClass ? `.${firstClass}` : ''}[${idx}]`;
      };

      // Per-popup checks
      for (let i = 0; i < popups.length; i++) {
        const el = popups[i];
        const sel = makeSelector(el, i);
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        // 1. Shadow / elevation check
        const boxShadow = cs.boxShadow;
        const filter = cs.filter;
        const hasDropShadow = filter && filter.includes('drop-shadow');

        if (boxShadow === 'none' && !hasDropShadow) {
          findings.push({
            severity: 'low',
            type: 'popup-no-shadow',
            message: 'Modal/popup has no box-shadow — lacks visual elevation above page content',
            selector: sel,
          });
        } else {
          const shadowVal = hasDropShadow ? filter : boxShadow;
          findings.push({
            severity: 'info',
            type: 'popup-has-shadow',
            message: `Popup has box-shadow: ${shadowVal}`,
            selector: sel,
          });
        }

        // 2. Backdrop check
        const role = el.getAttribute('role') || '';
        const isDialog = role === 'dialog' || role === 'alertdialog';
        const isNativeDialog = el.tagName.toLowerCase() === 'dialog';

        let backdropFound = false;

        // Check sibling/child backdrop elements
        const backdropSelectors = [
          '[class*="backdrop" i]',
          '[class*="overlay" i]',
          '[class*="mask" i]',
        ];
        for (const bSel of backdropSelectors) {
          if (
            document.querySelector(bSel) ||
            el.querySelector(bSel) ||
            (el.parentElement && el.parentElement.querySelector(bSel))
          ) {
            backdropFound = true;
            break;
          }
        }

        // Check ::before / ::after pseudo-elements on parent
        if (!backdropFound && el.parentElement) {
          const bef = getComputedStyle(el.parentElement, '::before');
          const aft = getComputedStyle(el.parentElement, '::after');
          if (bef.content !== 'none' || aft.content !== 'none') {
            backdropFound = true;
          }
        }

        // Native <dialog> has implicit ::backdrop
        if (!backdropFound && isNativeDialog) {
          backdropFound = true;
        }

        if (isDialog && !backdropFound) {
          findings.push({
            severity: 'medium',
            type: 'popup-no-backdrop',
            message: 'Modal dialog has no backdrop — background content not visually separated',
            selector: sel,
          });
        }

        // Check backdrop transparency
        if (backdropFound) {
          const backdropEl = ((): Element | null => {
            for (const bSel of backdropSelectors) {
              const found =
                document.querySelector(bSel) ||
                el.querySelector(bSel) ||
                (el.parentElement && el.parentElement.querySelector(bSel));
              if (found) return found;
            }
            return null;
          })();

          if (backdropEl) {
            const bcs = getComputedStyle(backdropEl as HTMLElement);
            const bg = bcs.backgroundColor;
            if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
              findings.push({
                severity: 'low',
                type: 'popup-transparent-backdrop',
                message: 'Backdrop/overlay element has no background color — fully transparent',
                selector: makeSelector(backdropEl as HTMLElement, i),
              });
            }
          }
        }

        // 3. Open animation check
        const transition = cs.transition;
        const animation = cs.animation;
        const noTransition = !transition || transition === 'none' || transition === 'all 0s ease 0s';
        const noAnimation = !animation || animation === 'none' || animation.startsWith('none ');

        if (noTransition && noAnimation) {
          findings.push({
            severity: 'info',
            type: 'popup-no-open-animation',
            message: 'Popup has no CSS transition/animation — consider entry animation for better UX',
            selector: sel,
          });
        } else {
          const animStr = noAnimation ? transition : animation;

          // Check for layout properties in animation/transition
          const layoutProps = ['width', 'height', 'top', 'left', 'bottom', 'right', 'margin', 'padding'];
          const usesLayout = layoutProps.some((p) => animStr.includes(p));
          if (usesLayout) {
            findings.push({
              severity: 'medium',
              type: 'popup-animation-layout-prop',
              message: 'Popup animation uses layout property — use transform/opacity for GPU compositing',
              selector: sel,
            });
          }

          // Check transition duration > 500ms
          const durationMatch = animStr.match(/(\d+(?:\.\d+)?)(ms|s)/);
          if (durationMatch) {
            const val = parseFloat(durationMatch[1]);
            const ms = durationMatch[2] === 's' ? val * 1000 : val;
            if (ms > 500) {
              findings.push({
                severity: 'low',
                type: 'popup-animation-too-slow',
                message: `Popup animation duration ${ms}ms exceeds 500ms — may feel sluggish`,
                selector: sel,
              });
            }
          }

          // Good pattern: transform scale/translate
          if (animStr.includes('transform') || cs.transform !== 'none') {
            findings.push({
              severity: 'info',
              type: 'popup-uses-transform-animation',
              message: 'Popup uses transform for animation — good GPU-composited pattern',
              selector: sel,
            });
          }
        }

        // 4. Z-index check
        const zIndexRaw = cs.zIndex;
        if (zIndexRaw === 'auto' || zIndexRaw === '0') {
          findings.push({
            severity: 'high',
            type: 'popup-low-zindex',
            message: 'Modal z-index too low — may appear behind page elements',
            selector: sel,
          });
        } else {
          const zVal = parseInt(zIndexRaw, 10);
          if (!isNaN(zVal) && zVal < 100) {
            findings.push({
              severity: 'medium',
              type: 'popup-low-zindex',
              message: `Modal z-index ${zVal} is below 100 — may appear behind page elements`,
              selector: sel,
            });
          }
        }

        // 5. Viewport containment
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        if (rect.right > vw) {
          findings.push({
            severity: 'high',
            type: 'popup-clipped-right',
            message: `Popup extends ${Math.round(rect.right - vw)}px beyond right viewport edge`,
            selector: sel,
          });
        }
        if (rect.left < 0) {
          findings.push({
            severity: 'high',
            type: 'popup-clipped-left',
            message: `Popup extends ${Math.round(-rect.left)}px beyond left viewport edge`,
            selector: sel,
          });
        }
        if (rect.bottom > vh) {
          const overflowY = cs.overflowY;
          const hasScroll = overflowY === 'auto' || overflowY === 'scroll';
          if (!hasScroll) {
            findings.push({
              severity: 'medium',
              type: 'popup-clipped-bottom',
              message: 'Popup extends beyond bottom viewport edge and has no internal scroll',
              selector: sel,
            });
          }
        }

        // 6. Border-radius consistency
        const borderRadius = cs.borderRadius;
        findings.push({
          severity: 'info',
          type: 'popup-border-radius',
          message: `Popup border-radius: ${borderRadius || '0'} (0 = sharp corners)`,
          selector: sel,
        });

        // 7. Overflow / internal scroll
        if (rect.height > vh * 0.8) {
          const overflowY = cs.overflowY;
          if (overflowY !== 'auto' && overflowY !== 'scroll') {
            findings.push({
              severity: 'medium',
              type: 'popup-no-internal-scroll',
              message: `Popup height (${Math.round(rect.height)}px) exceeds 80% viewport height but overflow-y is "${overflowY}"`,
              selector: sel,
            });
          }
        }
      }

      // Cross-popup z-index ordering check
      if (popups.length > 1) {
        const zIndices = popups.map((el) => {
          const v = getComputedStyle(el).zIndex;
          return v === 'auto' ? null : parseInt(v, 10);
        });
        const defined = zIndices.filter((v): v is number => v !== null && !isNaN(v));
        if (defined.length > 1) {
          const unique = new Set(defined);
          if (unique.size < defined.length) {
            findings.push({
              severity: 'medium',
              type: 'popup-zindex-collision',
              message: 'Multiple visible popups share the same z-index value — stacking order may be unpredictable',
            });
          }
        }
      }

      return { popupsFound: popups.length, findings };
    });

    report.popupsFound = inspected.popupsFound;
    report.findings = inspected.findings;

    // Screenshots: evidence + one per HIGH finding (cap 3 total)
    if (report.popupsFound > 0) {
      try {
        await screenshotStep(page, route, 'popup-quality-found');
      } catch (_) {
        // non-fatal
      }

      let highScreenshots = 0;
      for (const finding of report.findings) {
        if (highScreenshots >= 3) break;
        if (finding.severity === 'high') {
          try {
            await screenshotStep(page, route, `popup-quality-high-${finding.type}`);
            highScreenshots++;
          } catch (_) {
            // non-fatal
          }
        }
      }
    }
  } catch (_) {
    // return partial/empty report, never throw
  }

  writeJsonArtifact('popup-quality', `${routeName}-popup-quality.json`, report);
  return report;
}
