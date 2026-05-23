import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type FormAlignmentFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type FormAlignmentReport = {
  route: string;
  formsChecked: number;
  inputsChecked: number;
  findings: FormAlignmentFinding[];
};

export async function auditFormAlignment(page: Page, route: string): Promise<FormAlignmentReport> {
  const routeName = normalizeRoute(route);

  const emptyReport: FormAlignmentReport = {
    route,
    formsChecked: 0,
    inputsChecked: 0,
    findings: [],
  };

  try {
    const hasForms = await page.evaluate(
      () => document.querySelector('form, [role="form"]') !== null
    );

    if (!hasForms) {
      writeJsonArtifact('form-alignment', `${routeName}-form-alignment.json`, emptyReport);
      return emptyReport;
    }

    const result = await page.evaluate(() => {
      type Finding = {
        severity: 'high' | 'medium' | 'low' | 'info';
        type: string;
        message: string;
        selector?: string;
      };

      const findings: Finding[] = [];
      let formsChecked = 0;
      let inputsChecked = 0;

      const MAX_FORMS = 5;
      const MAX_INPUTS = 20;

      function isVisible(el: Element): boolean {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      }

      function parseRadius(val: string, rootFontSize: number): number {
        if (!val) return 0;
        const trimmed = val.split(' ')[0].trim();
        if (trimmed.endsWith('rem')) return parseFloat(trimmed) * rootFontSize;
        if (trimmed.endsWith('px')) return parseFloat(trimmed);
        return parseFloat(trimmed) || 0;
      }

      function stdDev(values: number[]): number {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
      }

      const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

      const allForms = Array.from(document.querySelectorAll<HTMLElement>('form, [role="form"]'))
        .filter(isVisible)
        .slice(0, MAX_FORMS);

      for (const form of allForms) {
        try {
          formsChecked++;
          const formRect = form.getBoundingClientRect();

          const INPUT_SELECTOR =
            'input[type="text"], input[type="email"], input[type="password"], input[type="tel"],' +
            'input[type="url"], input[type="number"], input[type="date"], textarea, select';

          const allInputs = Array.from(form.querySelectorAll<HTMLElement>(INPUT_SELECTOR))
            .filter(isVisible)
            .slice(0, MAX_INPUTS);

          inputsChecked += allInputs.length;

          // ── CHECK 1: Label–input vertical alignment consistency ──────────────────
          try {
            const alignStyles: string[] = [];

            for (const input of allInputs) {
              const inputEl = input as HTMLInputElement;
              const inputRect = input.getBoundingClientRect();

              let label: HTMLElement | null = null;

              if (inputEl.id) {
                label = document.querySelector<HTMLElement>(`label[for="${inputEl.id}"]`);
              }
              if (!label) {
                let ancestor: HTMLElement | null = input.parentElement;
                while (ancestor && ancestor !== form) {
                  if (ancestor.tagName.toLowerCase() === 'label') {
                    label = ancestor;
                    break;
                  }
                  ancestor = ancestor.parentElement;
                }
              }

              if (label) {
                const labelRect = label.getBoundingClientRect();
                const selectorStr = inputEl.id
                  ? `#${inputEl.id}`
                  : inputEl.name
                  ? `[name="${inputEl.name}"]`
                  : input.className || INPUT_SELECTOR;

                if (labelRect.bottom > inputRect.top + 10 && labelRect.top < inputRect.bottom) {
                  findings.push({
                    severity: 'high',
                    type: 'label-overlaps-input',
                    message: `Label and input overlap — label.bottom=${Math.round(labelRect.bottom)} input.top=${Math.round(inputRect.top)}`,
                    selector: selectorStr,
                  });
                } else if (labelRect.bottom <= inputRect.top + 4) {
                  alignStyles.push('above');
                } else if (Math.abs(labelRect.top - inputRect.top) <= 6) {
                  alignStyles.push('inline');
                }
              }
            }

            const aboveCount = alignStyles.filter((s) => s === 'above').length;
            const inlineCount = alignStyles.filter((s) => s === 'inline').length;
            if (aboveCount > 1 && inlineCount > 1) {
              findings.push({
                severity: 'medium',
                type: 'label-alignment-inconsistent',
                message: 'Form mixes above-label and inline-label patterns',
              });
            }
          } catch {
            // skip check 1
          }

          // ── CHECK 2: Inter-field spacing consistency ──────────────────────────────
          try {
            const sorted = [...allInputs].sort(
              (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
            );

            const gaps: number[] = [];
            for (let i = 1; i < sorted.length; i++) {
              const prev = sorted[i - 1].getBoundingClientRect();
              const curr = sorted[i].getBoundingClientRect();
              const gap = curr.top - prev.bottom;
              gaps.push(gap);
            }

            if (gaps.length > 0) {
              const minGap = Math.min(...gaps);
              const maxGap = Math.max(...gaps);

              if (minGap < 4) {
                findings.push({
                  severity: 'high',
                  type: 'field-spacing-too-tight',
                  message: `Fields too close together (gap ${Math.round(minGap)}px < 4px)`,
                });
              }
              if (maxGap > 80) {
                findings.push({
                  severity: 'low',
                  type: 'field-spacing-too-large',
                  message: `Large gap between fields (${Math.round(maxGap)}px) — check for unintended whitespace`,
                });
              }
              if (gaps.length > 2) {
                const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                const sd = stdDev(gaps);
                if (mean > 0 && sd / mean > 0.4) {
                  findings.push({
                    severity: 'medium',
                    type: 'field-spacing-inconsistent',
                    message: `Field spacing varies significantly (min ${Math.round(minGap)}px, max ${Math.round(maxGap)}px) — standardise vertical rhythm`,
                  });
                }
              }
            }
          } catch {
            // skip check 2
          }

          // ── CHECK 3: Input width consistency ─────────────────────────────────────
          try {
            const textLikeSelector =
              'input[type="text"], input[type="email"], input[type="password"],' +
              'input[type="tel"], input[type="url"], input[type="number"], textarea';
            const textInputs = Array.from(form.querySelectorAll<HTMLElement>(textLikeSelector))
              .filter(isVisible)
              .slice(0, MAX_INPUTS);

            if (textInputs.length > 1) {
              const widths = textInputs.map((el) => el.getBoundingClientRect().width);
              const minW = Math.min(...widths);
              const maxW = Math.max(...widths);

              if (minW > 0 && maxW / minW > 1.2) {
                findings.push({
                  severity: 'medium',
                  type: 'input-width-inconsistent',
                  message: `Input widths inconsistent in same form (min ${Math.round(minW)}px, max ${Math.round(maxW)}px)`,
                });
              }

              for (const input of textInputs) {
                try {
                  const inputEl = input as HTMLInputElement;
                  const inputRect = input.getBoundingClientRect();

                  let label: HTMLElement | null = null;
                  if (inputEl.id) {
                    label = document.querySelector<HTMLElement>(`label[for="${inputEl.id}"]`);
                  }
                  if (!label) {
                    let ancestor: HTMLElement | null = input.parentElement;
                    while (ancestor && ancestor !== form) {
                      if (ancestor.tagName.toLowerCase() === 'label') {
                        label = ancestor;
                        break;
                      }
                      ancestor = ancestor.parentElement;
                    }
                  }

                  if (label) {
                    const labelRect = label.getBoundingClientRect();
                    if (inputRect.width < labelRect.width) {
                      findings.push({
                        severity: 'low',
                        type: 'input-narrower-than-label',
                        message: `Input (${Math.round(inputRect.width)}px) is narrower than its label (${Math.round(labelRect.width)}px)`,
                        selector: inputEl.id ? `#${inputEl.id}` : inputEl.name ? `[name="${inputEl.name}"]` : undefined,
                      });
                    }
                  }
                } catch {
                  // skip this input
                }
              }
            }
          } catch {
            // skip check 3
          }

          // ── CHECK 4: Border-radius consistency ───────────────────────────────────
          try {
            const radiusSelector =
              'input[type="text"], input[type="email"], input[type="password"],' +
              'input[type="tel"], input[type="url"], input[type="number"], input[type="date"],' +
              'textarea, select, button[type="submit"], button[type="button"], input[type="submit"]';

            const radiusEls = Array.from(form.querySelectorAll<HTMLElement>(radiusSelector)).filter(isVisible);
            const inputRadii: number[] = [];
            const buttonRadii: number[] = [];

            for (const el of radiusEls) {
              const tag = el.tagName.toLowerCase();
              const elType = (el as HTMLInputElement).type || '';
              const isButton =
                (tag === 'button') ||
                (tag === 'input' && elType === 'submit');

              const r = parseRadius(getComputedStyle(el).borderRadius, rootFontSize);
              if (isButton) {
                buttonRadii.push(r);
              } else {
                inputRadii.push(r);
              }
            }

            const allRadii = [...inputRadii, ...buttonRadii];
            if (allRadii.length > 1) {
              const minR = Math.min(...allRadii);
              const maxR = Math.max(...allRadii);
              if (maxR - minR > 4) {
                findings.push({
                  severity: 'medium',
                  type: 'corner-radius-inconsistent',
                  message: `Input border-radius values inconsistent: [${allRadii.map((r) => Math.round(r)).join(', ')}]`,
                });
              }
            }

            if (inputRadii.length > 0 && buttonRadii.length > 0) {
              const inputMaxR = Math.max(...inputRadii);
              const buttonMinR = Math.min(...buttonRadii);
              if (inputMaxR === 0 && buttonMinR > 4) {
                findings.push({
                  severity: 'low',
                  type: 'corner-radius-style-mismatch',
                  message: 'Inputs have zero border-radius but buttons have rounded corners',
                });
              }
            }
          } catch {
            // skip check 4
          }

          // ── CHECK 5: Internal padding of inputs ──────────────────────────────────
          try {
            for (const input of allInputs) {
              try {
                const inputEl = input as HTMLInputElement;
                const tag = inputEl.tagName.toLowerCase();
                const isTextarea = tag === 'textarea';
                const cs = getComputedStyle(input);
                const padTop = parseFloat(cs.paddingTop) || 0;
                const padBottom = parseFloat(cs.paddingBottom) || 0;
                const padLeft = parseFloat(cs.paddingLeft) || 0;
                const rect = input.getBoundingClientRect();
                const h = rect.height;

                const selectorStr = inputEl.id
                  ? `#${inputEl.id}`
                  : inputEl.name
                  ? `[name="${inputEl.name}"]`
                  : undefined;

                if (padTop + padBottom < 4) {
                  findings.push({
                    severity: 'medium',
                    type: 'input-vertical-padding-too-small',
                    message: `Input vertical padding too small (${Math.round(padTop + padBottom)}px) — touch target too short`,
                    selector: selectorStr,
                  });
                }
                if (padLeft < 4) {
                  findings.push({
                    severity: 'medium',
                    type: 'input-left-padding-missing',
                    message: 'Input has no left padding — text touches border',
                    selector: selectorStr,
                  });
                }
                if (h < 28) {
                  findings.push({
                    severity: 'high',
                    type: 'input-too-short',
                    message: `Input height ${Math.round(h)}px is below minimum touch target (28px)`,
                    selector: selectorStr,
                  });
                }
                if (h > 80 && !isTextarea) {
                  findings.push({
                    severity: 'low',
                    type: 'input-unexpectedly-tall',
                    message: `Input height ${Math.round(h)}px is unexpectedly tall for a non-textarea field`,
                    selector: selectorStr,
                  });
                }
              } catch {
                // skip this input
              }
            }
          } catch {
            // skip check 5
          }

          // ── CHECK 6: Error message alignment ─────────────────────────────────────
          try {
            const errorEls = Array.from(
              form.querySelectorAll<HTMLElement>(
                '[class*="error" i], [aria-live], [role="alert"], [aria-describedby]'
              )
            ).filter(isVisible);

            for (const errorEl of errorEls) {
              try {
                const errorRect = errorEl.getBoundingClientRect();
                let nearestInput: HTMLElement | null = null;
                let nearestDist = Infinity;

                for (const inp of allInputs) {
                  const inpRect = inp.getBoundingClientRect();
                  const dist = Math.abs(errorRect.top - inpRect.bottom);
                  if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestInput = inp;
                  }
                }

                if (nearestInput && nearestDist < 100) {
                  const inpRect = nearestInput.getBoundingClientRect();
                  if (errorRect.left > inpRect.right) {
                    findings.push({
                      severity: 'medium',
                      type: 'error-message-outside-input',
                      message: 'Error message positioned outside/right of input',
                    });
                  } else if (errorRect.top < inpRect.top) {
                    findings.push({
                      severity: 'low',
                      type: 'error-message-above-input',
                      message: 'Error message appears above its input field',
                    });
                  }
                }
              } catch {
                // skip this error element
              }
            }

            // aria-invalid with no visible error
            const invalidInputs = Array.from(
              form.querySelectorAll<HTMLElement>('[aria-invalid="true"]')
            ).filter(isVisible);

            for (const inv of invalidInputs) {
              try {
                const invEl = inv as HTMLInputElement;
                const describedBy = invEl.getAttribute('aria-describedby');
                let hasVisibleError = false;

                if (describedBy) {
                  const errEl = document.getElementById(describedBy);
                  if (errEl && isVisible(errEl)) hasVisibleError = true;
                }

                if (!hasVisibleError) {
                  const adjacentError = inv.parentElement?.querySelector('[class*="error" i]');
                  if (adjacentError && isVisible(adjacentError)) hasVisibleError = true;
                }

                if (!hasVisibleError) {
                  findings.push({
                    severity: 'medium',
                    type: 'aria-invalid-no-visible-error',
                    message: 'Input has aria-invalid="true" but no visible error message (WCAG 1.3.1)',
                    selector: invEl.id ? `#${invEl.id}` : invEl.name ? `[name="${invEl.name}"]` : undefined,
                  });
                }
              } catch {
                // skip
              }
            }
          } catch {
            // skip check 6
          }

          // ── CHECK 7: Form button alignment ───────────────────────────────────────
          try {
            const buttons = Array.from(
              form.querySelectorAll<HTMLElement>(
                'button[type="submit"], button[type="button"], input[type="submit"]'
              )
            ).filter(isVisible);

            if (buttons.length > 1) {
              const tops = buttons.map((b) => b.getBoundingClientRect().top);
              const minTop = Math.min(...tops);
              const maxTop = Math.max(...tops);
              if (maxTop - minTop > 4) {
                findings.push({
                  severity: 'low',
                  type: 'form-buttons-misaligned',
                  message: 'Form buttons are not vertically aligned with each other',
                });
              }

              // Button group gap
              const sortedBtns = [...buttons].sort(
                (a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left
              );
              for (let i = 1; i < sortedBtns.length; i++) {
                const prev = sortedBtns[i - 1].getBoundingClientRect();
                const curr = sortedBtns[i].getBoundingClientRect();
                const gap = curr.left - prev.right;
                if (gap < 4) {
                  findings.push({
                    severity: 'medium',
                    type: 'form-button-group-too-tight',
                    message: `Form buttons are too close together (gap ${Math.round(gap)}px < 4px)`,
                  });
                }
              }
            }

            if (buttons.length > 0) {
              const primaryBtn = buttons[0];
              const btnRect = primaryBtn.getBoundingClientRect();

              if (btnRect.left > formRect.left + formRect.width * 0.8) {
                findings.push({
                  severity: 'info',
                  type: 'form-submit-right-aligned',
                  message: 'Primary submit button is right-aligned in form',
                });
              } else if (btnRect.left < formRect.left + 10) {
                findings.push({
                  severity: 'info',
                  type: 'form-submit-left-aligned',
                  message: 'Primary submit button is left-aligned in form',
                });
              }
            }
          } catch {
            // skip check 7
          }

          // ── CHECK 8: Placeholder text alignment ──────────────────────────────────
          try {
            const placeholderInputs = Array.from(
              form.querySelectorAll<HTMLInputElement>(
                'input[placeholder], textarea[placeholder]'
              )
            ).filter(isVisible);

            for (const inp of placeholderInputs) {
              try {
                const cs = getComputedStyle(inp);
                const rect = inp.getBoundingClientRect();
                const isSingleLine = inp.tagName.toLowerCase() !== 'textarea';
                const isShort = rect.width < 300;

                if (cs.textAlign === 'center' && isSingleLine && isShort) {
                  findings.push({
                    severity: 'low',
                    type: 'input-placeholder-centered',
                    message: 'Input placeholder/text is center-aligned (acceptable but notable)',
                    selector: inp.id ? `#${inp.id}` : inp.name ? `[name="${inp.name}"]` : undefined,
                  });
                }

                if (!inp.value && inp.getAttribute('placeholder')) {
                  findings.push({
                    severity: 'info',
                    type: 'input-has-placeholder',
                    message: 'Input has visible placeholder text',
                    selector: inp.id ? `#${inp.id}` : inp.name ? `[name="${inp.name}"]` : undefined,
                  });
                }
              } catch {
                // skip this input
              }
            }
          } catch {
            // skip check 8
          }

          // ── CHECK 9: Help / hint text position ───────────────────────────────────
          try {
            const hintEls = Array.from(
              form.querySelectorAll<HTMLElement>(
                '[class*="hint" i], [class*="help" i], [class*="description" i]'
              )
            ).filter(isVisible);

            for (const hint of hintEls) {
              try {
                const hintRect = hint.getBoundingClientRect();
                let nearestInput: HTMLElement | null = null;
                let nearestDist = Infinity;

                for (const inp of allInputs) {
                  const inpRect = inp.getBoundingClientRect();
                  const dist = Math.abs(hintRect.top - inpRect.bottom);
                  if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestInput = inp;
                  }
                }

                if (nearestInput && nearestDist < 80) {
                  const inpRect = nearestInput.getBoundingClientRect();

                  if (hintRect.top < inpRect.top) {
                    findings.push({
                      severity: 'low',
                      type: 'hint-text-above-input',
                      message: 'Help/hint text appears above its associated input field',
                    });
                  }

                  if (Math.abs(hintRect.left - inpRect.left) > 10) {
                    findings.push({
                      severity: 'low',
                      type: 'hint-text-misaligned',
                      message: `Help/hint text left edge (${Math.round(hintRect.left)}px) does not align with input left edge (${Math.round(inpRect.left)}px)`,
                    });
                  }
                }
              } catch {
                // skip this hint element
              }
            }
          } catch {
            // skip check 9
          }

          // ── CHECK 10: Required field indicators ──────────────────────────────────
          try {
            const requiredInputs = Array.from(
              form.querySelectorAll<HTMLInputElement>(
                'input[required], textarea[required], select[required],' +
                'input[aria-required="true"], textarea[aria-required="true"], select[aria-required="true"]'
              )
            ).filter(isVisible);

            for (const inp of requiredInputs) {
              try {
                let hasIndicator = false;

                if (inp.id) {
                  const lbl = document.querySelector<HTMLElement>(`label[for="${inp.id}"]`);
                  if (lbl && (lbl.textContent?.includes('*') || /required/i.test(lbl.textContent || ''))) {
                    hasIndicator = true;
                  }
                }

                if (!hasIndicator) {
                  let ancestor: HTMLElement | null = inp.parentElement;
                  while (ancestor && ancestor !== form) {
                    const text = ancestor.textContent || '';
                    if (text.includes('*') || /required/i.test(text)) {
                      hasIndicator = true;
                      break;
                    }
                    ancestor = ancestor.parentElement;
                  }
                }

                if (!hasIndicator) {
                  findings.push({
                    severity: 'low',
                    type: 'required-field-no-indicator',
                    message: 'Required field has no visible indicator (* or "required" text)',
                    selector: inp.id ? `#${inp.id}` : inp.name ? `[name="${inp.name}"]` : undefined,
                  });
                }
              } catch {
                // skip this input
              }
            }
          } catch {
            // skip check 10
          }
        } catch {
          // skip this form
        }
      }

      return { findings, formsChecked, inputsChecked };
    });

    const report: FormAlignmentReport = {
      route,
      formsChecked: result.formsChecked,
      inputsChecked: result.inputsChecked,
      findings: result.findings as FormAlignmentFinding[],
    };

    // Screenshots — max 2
    if (report.formsChecked > 0) {
      try {
        await screenshotStep(page, route, 'form-alignment-found');
      } catch {
        // skip screenshot
      }

      const hasHigh = report.findings.some((f) => f.severity === 'high');
      if (hasHigh) {
        try {
          await screenshotStep(page, route, 'form-alignment-high-finding');
        } catch {
          // skip screenshot
        }
      }
    }

    writeJsonArtifact('form-alignment', `${routeName}-form-alignment.json`, report);
    return report;
  } catch {
    writeJsonArtifact('form-alignment', `${routeName}-form-alignment.json`, emptyReport);
    return emptyReport;
  }
}
