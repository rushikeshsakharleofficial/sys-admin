import { Page } from '@playwright/test';
import { writeJsonArtifact } from './report';
import { normalizeRoute } from './routes';

export type CsrfFinding = {
  severity: 'high' | 'medium' | 'low' | 'info';
  type: string;
  message: string;
  formIndex?: number;
  selector?: string;
};

export async function auditCsrf(page: Page, route: string): Promise<CsrfFinding[]> {
  const routeName = normalizeRoute(route);
  const findings: CsrfFinding[] = [];

  // Token-efficient early exit: skip if no forms present.
  try {
    const hasForms = await page.evaluate(() => document.querySelector('form') !== null);
    if (!hasForms) {
      writeJsonArtifact('csrf', `${routeName}-csrf.json`, findings);
      return findings;
    }
  } catch { /* proceed on pre-check error */ }

  try {
    const domFindings = await page.evaluate((): Array<{
      severity: 'high' | 'medium' | 'low' | 'info';
      type: string;
      message: string;
      formIndex?: number;
      selector?: string;
    }> => {
      const issues: Array<{
        severity: 'high' | 'medium' | 'low' | 'info';
        type: string;
        message: string;
        formIndex?: number;
        selector?: string;
      }> = [];

      // Page-level CSRF meta tokens
      const csrfMetaToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
      const csrfMetaParam = document.querySelector<HTMLMetaElement>('meta[name="csrf-param"]');
      const tokenMeta = document.querySelector<HTMLMetaElement>('meta[name="_token"]');

      if (csrfMetaToken || csrfMetaParam || tokenMeta) {
        const names: string[] = [];
        if (csrfMetaToken) names.push('csrf-token');
        if (csrfMetaParam) names.push('csrf-param');
        if (tokenMeta) names.push('_token');
        issues.push({
          severity: 'info',
          type: 'csrf-meta-token-present',
          message: `CSRF meta tag(s) detected in <head>: ${names.join(', ')}. Framework-level CSRF protection appears active for AJAX requests.`,
          selector: `meta[name="${names[0]}"]`,
        });
      }

      // POST forms CSRF check (max 10)
      const allForms = Array.from(document.querySelectorAll<HTMLFormElement>('form'));
      const postForms = allForms.filter(f => (f.method || '').toLowerCase() === 'post');
      const formsToCheck = postForms.slice(0, 10);

      for (let i = 0; i < formsToCheck.length; i++) {
        const form = formsToCheck[i];
        const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]'));

        const hasCsrfInput = inputs.some(inp => {
          const name = (inp.name || '').toLowerCase();
          return (
            name.includes('csrf') ||
            name.includes('token') ||
            name === 'authenticity_token' ||
            name === '_wpnonce' ||
            name === '_token'
          );
        });

        // Also accept page-level meta token as indicator of CSRF protection
        const hasMetaToken = !!(csrfMetaToken || csrfMetaParam || tokenMeta);

        if (!hasCsrfInput && !hasMetaToken) {
          const action = form.action ? form.action.slice(0, 80) : '(no action)';
          const id = form.id ? `#${form.id}` : '';
          const name = form.name ? `[name="${form.name}"]` : '';
          issues.push({
            severity: 'medium',
            type: 'form-missing-csrf-token',
            message: `POST form (index ${i}, action: ${action}) has no detectable CSRF token hidden input and no page-level CSRF meta tag. Note: DOM-only check — cannot verify server-side validation or header-based CSRF protection (e.g. custom headers in AJAX).`,
            formIndex: i,
            selector: `form${id || name}[method="post"]`,
          });
        }
      }

      // GET forms with sensitive fields
      const getForms = allForms.filter(f => {
        const method = (f.method || '').toLowerCase();
        return method === 'get' || method === '';
      });

      for (let i = 0; i < getForms.length; i++) {
        const form = getForms[i];
        const sensitiveInputs = Array.from(form.querySelectorAll<HTMLInputElement>('input')).filter(inp => {
          const type = (inp.type || '').toLowerCase();
          const name = (inp.name || '').toLowerCase();
          return (
            type === 'password' ||
            name.includes('password') ||
            name.includes('credit') ||
            name.includes('card') ||
            name.includes('cvv') ||
            name.includes('ccv') ||
            name.includes('cvc')
          );
        });

        if (sensitiveInputs.length > 0) {
          const fieldNames = sensitiveInputs.map(inp => inp.name || inp.type).join(', ');
          const id = form.id ? `#${form.id}` : '';
          issues.push({
            severity: 'high',
            type: 'sensitive-data-get-form',
            message: `GET form (index ${i}) contains sensitive field(s): ${fieldNames}. GET requests expose values in the URL, browser history, and server access logs.`,
            formIndex: i,
            selector: `form${id}`,
          });
        }
      }

      // SameSite cookie info (document.cookie only exposes non-HttpOnly cookies without SameSite attribute in string)
      const cookieStr = document.cookie;
      if (cookieStr.trim().length > 0) {
        const cookieNames = cookieStr.split(';').map(c => c.split('=')[0].trim()).filter(Boolean);
        issues.push({
          severity: 'info',
          type: 'csrf-cookie-visibility',
          message: `${cookieNames.length} cookie(s) visible via document.cookie (non-HttpOnly): ${cookieNames.slice(0, 5).join(', ')}${cookieNames.length > 5 ? '...' : ''}. Note: SameSite attribute cannot be read from DOM — verify SameSite=Strict or SameSite=Lax via DevTools or response headers.`,
        });
      }

      return issues;
    });

    findings.push(...domFindings);
  } catch {
    findings.push({
      severity: 'info',
      type: 'csrf-audit-error',
      message: 'CSRF DOM audit failed to evaluate — page may have restrictive CSP or evaluation error.',
    });
  }

  try {
    writeJsonArtifact('csrf', `${routeName}-csrf.json`, findings);
  } catch {
    // Artifact write failed — non-fatal
  }

  return findings;
}
