import { Page } from '@playwright/test';
import { screenshotStep } from './screenshots';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type AuthPermissionsFinding = {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  selector?: string;
};

export type AuthPermissionsReport = {
  route: string;
  loginFormDetected: boolean;
  rememberMeDetected: boolean;
  permissionBlockedElementsFound: number;
  permissionErrorMessagesFound: number;
  roleGatedElementsFound: number;
  findings: AuthPermissionsFinding[];
};

export async function auditAuthPermissions(page: Page, route: string): Promise<AuthPermissionsReport> {
  const routeName = normalizeRoute(route);

  const emptyReport: AuthPermissionsReport = {
    route,
    loginFormDetected: false,
    rememberMeDetected: false,
    permissionBlockedElementsFound: 0,
    permissionErrorMessagesFound: 0,
    roleGatedElementsFound: 0,
    findings: [],
  };

  try {
    const hasAuthSurface = await page.evaluate(() =>
      document.querySelector(
        'input[type="password"], input[type="email"], [class*="login" i], [class*="signin" i], ' +
        '[class*="logout" i], [class*="permission" i], [class*="restricted" i], [class*="forbidden" i], ' +
        '[data-role], [data-permission]'
      ) !== null
    );

    if (!hasAuthSurface) {
      writeJsonArtifact('auth-permissions', `${routeName}-auth-permissions.json`, emptyReport);
      return emptyReport;
    }

    const evaluated = await page.evaluate(() => {
      const findings: AuthPermissionsFinding[] = [];
      let loginFormDetected = false;
      let rememberMeDetected = false;
      let permissionBlockedElementsFound = 0;
      let permissionErrorMessagesFound = 0;
      let roleGatedElementsFound = 0;

      function getSelectorDescription(el: Element): string {
        const id = el.id ? `#${el.id}` : '';
        const tag = el.tagName.toLowerCase();
        const cls = el.className && typeof el.className === 'string'
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
          : '';
        return `${tag}${id}${cls}`.slice(0, 80);
      }

      function isVisible(el: Element): boolean {
        const rect = (el as HTMLElement).getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }

      // CHECK 1: Login form quality
      try {
        const passwordInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'));
        const loginForms: Element[] = [];

        for (const pwInput of passwordInputs) {
          const form = pwInput.closest('form');
          if (form && !loginForms.includes(form)) {
            loginForms.push(form);
          } else if (!form && !loginForms.includes(pwInput)) {
            loginForms.push(pwInput);
          }
        }

        const formsToCheck = loginForms.slice(0, 2);

        for (const formEl of formsToCheck) {
          loginFormDetected = true;

          findings.push({
            severity: 'info',
            type: 'login-form-found',
            message: 'Login form detected on this route',
            selector: getSelectorDescription(formEl),
          });

          // Check for inputs named/id'd like password that are NOT type="password"
          const allInputs = Array.from(formEl.querySelectorAll('input'));
          for (const input of allInputs) {
            const name = (input.name || '').toLowerCase();
            const id = (input.id || '').toLowerCase();
            const placeholder = (input.placeholder || '').toLowerCase();
            const isPasswordNamed = name.includes('pass') || id.includes('pass') || placeholder.includes('password');
            if (isPasswordNamed && input.type !== 'password') {
              findings.push({
                severity: 'critical',
                type: 'password-field-not-type-password',
                message: `Input named/id/placeholder "password" is not type="password" (got type="${input.type}")`,
                selector: getSelectorDescription(input),
              });
            }
          }

          // Check autocomplete on password input
          const pwInput: HTMLInputElement | null =
            formEl instanceof HTMLInputElement && formEl.type === 'password'
              ? formEl
              : formEl.querySelector<HTMLInputElement>('input[type="password"]');
          if (pwInput) {
            const ac = (pwInput.getAttribute('autocomplete') || '').toLowerCase();
            if (ac !== 'current-password' && ac !== 'new-password') {
              findings.push({
                severity: 'medium',
                type: 'password-no-autocomplete',
                message: `Password input missing autocomplete="current-password" or "new-password" (got "${ac || 'none'}")`,
                selector: getSelectorDescription(pwInput),
              });
            }
          }

          // Check for forgot password link near form
          const searchRoot = formEl.parentElement || document.body;
          const forgotLink = searchRoot.querySelector(
            'a[href*="forgot" i], a[href*="reset" i], [class*="forgot" i]'
          );
          if (!forgotLink) {
            findings.push({
              severity: 'low',
              type: 'login-no-forgot-password',
              message: 'No forgot/reset password link found near login form',
              selector: getSelectorDescription(formEl),
            });
          }
        }
      } catch (_e) {
        // check 1 failed silently
      }

      // CHECK 2: Remember me detection
      try {
        const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
        const rememberCheckboxes = checkboxes.filter(cb => {
          const name = (cb.name || '').toLowerCase();
          const id = (cb.id || '').toLowerCase();
          const cls = typeof cb.className === 'string' ? cb.className.toLowerCase() : '';
          const nearbyLabel = cb.closest('label') || (cb.id ? document.querySelector(`label[for="${CSS.escape(cb.id)}"]`) : null);
          const labelText = nearbyLabel ? (nearbyLabel.textContent || '').toLowerCase() : '';
          return name.includes('remember') || id.includes('remember') || cls.includes('remember') || labelText.includes('remember');
        });

        for (const cb of rememberCheckboxes) {
          rememberMeDetected = true;
          const sel = getSelectorDescription(cb);

          findings.push({
            severity: 'info',
            type: 'remember-me-found',
            message: `Remember-me checkbox found`,
            selector: sel,
          });

          // Check for label
          const wrappingLabel = cb.closest('label');
          const forLabel = cb.id ? document.querySelector(`label[for="${CSS.escape(cb.id)}"]`) : null;
          const ariaLabel = cb.getAttribute('aria-label');

          if (!wrappingLabel && !forLabel && !ariaLabel) {
            findings.push({
              severity: 'high',
              type: 'remember-me-no-label',
              message: 'Remember-me checkbox has no <label> (by for/id or wrapping) and no aria-label',
              selector: sel,
            });
          } else {
            // Label exists — check if text is too short/vague
            const labelEl = wrappingLabel || forLabel;
            const labelText = labelEl ? (labelEl.textContent || '').toLowerCase().trim() : (ariaLabel || '').toLowerCase().trim();
            const hasDescriptiveText = /\bme\b|\bdevice\b|\bthis computer\b/.test(labelText);
            if (!hasDescriptiveText) {
              findings.push({
                severity: 'medium',
                type: 'remember-me-no-description',
                message: `Remember-me label text "${labelText.slice(0, 40)}" is overly short — missing "me"/"device"/"this computer"`,
                selector: sel,
              });
            }
          }
        }
      } catch (_e) {
        // check 2 failed silently
      }

      // CHECK 3: Permission-blocked UI elements
      try {
        const blockedSelector = [
          '[class*="locked" i]:not([hidden])',
          '[class*="restricted" i]:not([hidden])',
          '[class*="forbidden" i]:not([hidden])',
          '[class*="upgrade" i]:not([hidden])',
          '[class*="premium" i]:not([hidden])',
          '[aria-disabled="true"]',
          '[data-requires]',
          '[data-permission]',
        ].join(', ');

        const blocked = Array.from(document.querySelectorAll<HTMLElement>(blockedSelector))
          .filter(isVisible)
          .slice(0, 20);

        permissionBlockedElementsFound = blocked.length;

        for (const el of blocked) {
          const sel = getSelectorDescription(el);

          findings.push({
            severity: 'info',
            type: 'permission-blocked-element-found',
            message: 'Visible permission-blocked element found',
            selector: sel,
          });

          // Check if there is adjacent explanatory text
          const ariaLabel = el.getAttribute('aria-label') || '';
          const title = el.getAttribute('title') || '';
          const nearby = el.parentElement ? (el.parentElement.textContent || '') : '';
          const explanatory = /permission|upgrade|plan|role/i.test(ariaLabel + title + nearby);

          if (!explanatory) {
            findings.push({
              severity: 'low',
              type: 'permission-blocked-no-explanation',
              message: 'Blocked element has no adjacent text explaining why (no aria-label/title/nearby text with permission/upgrade/plan/role)',
              selector: sel,
            });
          }
        }
      } catch (_e) {
        // check 3 failed silently
      }

      // CHECK 4: Permission error message quality
      try {
        const errorSelector = '[role="alert"], [aria-live], [class*="error" i], [class*="forbidden" i], [class*="denied" i]';
        const errorEls = Array.from(document.querySelectorAll<HTMLElement>(errorSelector)).filter(el => {
          const text = (el.textContent || '').toLowerCase();
          return isVisible(el) && /permission|access|unauthorized|forbidden|403|not allowed|don't have|upgrade/.test(text);
        });

        permissionErrorMessagesFound = errorEls.length;

        for (const el of errorEls) {
          const sel = getSelectorDescription(el);
          const role = (el.getAttribute('role') || '').toLowerCase();
          const ariaLive = el.hasAttribute('aria-live');
          const text = (el.textContent || '').trim();

          findings.push({
            severity: 'info',
            type: 'permission-error-found',
            message: 'Descriptive permission error found',
            selector: sel,
          });

          if (role !== 'alert' && !ariaLive) {
            findings.push({
              severity: 'medium',
              type: 'permission-error-not-accessible',
              message: 'Permission error element is not in an [aria-live] region and not role="alert" — screen readers won\'t announce it (WCAG 1.3.1)',
              selector: sel,
            });
          }

          if (text.length < 20) {
            findings.push({
              severity: 'medium',
              type: 'permission-error-too-generic',
              message: `Permission error text "${text.slice(0, 40)}" is too short (<20 chars) — lacks actionable context`,
              selector: sel,
            });
          }
        }
      } catch (_e) {
        // check 4 failed silently
      }

      // CHECK 5: Role-gated UI elements
      try {
        const roleGatedSelector = '[class*="admin-only" i], [class*="superuser" i], [data-role], [data-permissions], [class*="role-" i]';
        const roleGated = Array.from(document.querySelectorAll<HTMLElement>(roleGatedSelector)).slice(0, 10);

        roleGatedElementsFound = roleGated.length;

        for (const el of roleGated) {
          findings.push({
            severity: 'info',
            type: 'role-gated-element-found',
            message: 'Role-gated element detected',
            selector: getSelectorDescription(el),
          });
        }

        if (roleGatedElementsFound > 0) {
          findings.push({
            severity: 'low',
            type: 'role-gated-elements-present',
            message: `Found ${roleGatedElementsFound} role-gated elements — verify correct hiding per authenticated user role`,
          });
        }
      } catch (_e) {
        // check 5 failed silently
      }

      // CHECK 6: Logout link vs logout button (CSRF risk)
      try {
        const logoutLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>(
          'a[href*="logout" i], a[href*="signout" i], a[href*="log-out" i], a[href*="sign-out" i]'
        ));

        for (const link of logoutLinks) {
          findings.push({
            severity: 'high',
            type: 'logout-via-get-link',
            message: `Logout implemented as GET link (href="${(link.getAttribute('href') || '').slice(0, 80)}") — vulnerable to CSRF; use POST form + CSRF token`,
            selector: getSelectorDescription(link),
          });
        }

        const logoutButtons = Array.from(document.querySelectorAll<HTMLElement>(
          'button[class*="logout" i], button[class*="signout" i], [role="button"][class*="logout" i]'
        ));

        for (const btn of logoutButtons) {
          findings.push({
            severity: 'info',
            type: 'logout-button-found',
            message: 'Logout button detected',
            selector: getSelectorDescription(btn),
          });

          if (btn.getAttribute('tabindex') === '-1') {
            findings.push({
              severity: 'medium',
              type: 'logout-button-not-keyboard-accessible',
              message: 'Logout button has tabindex=-1 — not keyboard accessible (WCAG 2.1.1)',
              selector: getSelectorDescription(btn),
            });
          }
        }
      } catch (_e) {
        // check 6 failed silently
      }

      // CHECK 7: API permission error indicators in DOM
      try {
        const apiErrorEls = Array.from(document.querySelectorAll<HTMLElement>(
          '[class*="403" i], [class*="401" i], [class*="unauthorized" i]'
        )).filter(isVisible);

        const textMatchEls = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(el => {
          if (!isVisible(el)) return false;
          const text = el.textContent || '';
          return /403 Forbidden|401 Unauthorized|Access Denied/i.test(text) && el.children.length === 0;
        });

        const allApiErrorEls = [...new Set([...apiErrorEls, ...textMatchEls])];

        for (const el of allApiErrorEls) {
          const sel = getSelectorDescription(el);

          findings.push({
            severity: 'medium',
            type: 'api-permission-error-visible',
            message: 'API permission error (403/401) visible in DOM — verify user sees helpful recovery action, not raw error',
            selector: sel,
          });

          // Check for nearby retry/support link or button
          const parent = el.parentElement || document.body;
          const hasRetry = parent.querySelector('button, a[href]') !== null;
          if (!hasRetry) {
            findings.push({
              severity: 'low',
              type: 'api-permission-error-no-retry',
              message: 'API permission error element has no nearby button/link for retry or contact support',
              selector: sel,
            });
          }
        }
      } catch (_e) {
        // check 7 failed silently
      }

      // CHECK 8: Sensitive data in DOM after permission denial
      try {
        const permissionIndicatorPresent = Array.from(document.querySelectorAll<HTMLElement>(
          '[role="alert"], [aria-live], [class*="error" i], [class*="forbidden" i], [class*="denied" i]'
        )).some(el => {
          const text = (el.textContent || '').toLowerCase();
          return isVisible(el) && /permission|access|unauthorized|forbidden|403|not allowed|don't have|upgrade/.test(text);
        });

        if (permissionIndicatorPresent) {
          const bodyText = document.body.textContent || '';
          const sensitivePatterns: Array<{ pattern: RegExp; label: string }> = [
            { pattern: /\b\S+@\S+\.\S+\b/, label: 'email address' },
            { pattern: /eyJ[A-Za-z0-9+/=]{20,}/, label: 'JWT token' },
            { pattern: /api_key/i, label: 'api_key' },
            { pattern: /\bsecret\b/i, label: 'secret' },
            { pattern: /private_key/i, label: 'private_key' },
          ];

          for (const { pattern, label } of sensitivePatterns) {
            if (pattern.test(bodyText)) {
              findings.push({
                severity: 'critical',
                type: 'sensitive-data-after-permission-denial',
                message: `Sensitive data pattern "${label}" found in DOM alongside a permission-denial indicator — possible data leak after failed permission check`,
              });
              break;
            }
          }
        }
      } catch (_e) {
        // check 8 failed silently
      }

      return {
        findings,
        loginFormDetected,
        rememberMeDetected,
        permissionBlockedElementsFound,
        permissionErrorMessagesFound,
        roleGatedElementsFound,
      };
    });

    const report: AuthPermissionsReport = {
      route,
      loginFormDetected: evaluated.loginFormDetected,
      rememberMeDetected: evaluated.rememberMeDetected,
      permissionBlockedElementsFound: evaluated.permissionBlockedElementsFound,
      permissionErrorMessagesFound: evaluated.permissionErrorMessagesFound,
      roleGatedElementsFound: evaluated.roleGatedElementsFound,
      findings: evaluated.findings,
    };

    const hasVisualSurface =
      report.loginFormDetected ||
      report.permissionBlockedElementsFound > 0 ||
      report.roleGatedElementsFound > 0;

    if (hasVisualSurface) {
      await screenshotStep(page, route, 'auth-permissions-found');
    }

    const hasHighOrCritical = report.findings.some(f => f.severity === 'high' || f.severity === 'critical');
    if (hasHighOrCritical) {
      await screenshotStep(page, route, 'auth-permissions-high-finding');
    }

    writeJsonArtifact('auth-permissions', `${routeName}-auth-permissions.json`, report);
    return report;
  } catch (_err) {
    writeJsonArtifact('auth-permissions', `${routeName}-auth-permissions.json`, { ...emptyReport, route });
    return { ...emptyReport, route };
  }
}
