import { Page, ConsoleMessage } from '@playwright/test';

export type ConsoleRecord = {
  type: string;
  text: string;
  location?: string;
};

export type ConsoleFindings = {
  severeMessages: ConsoleRecord[];
  pageErrors: string[];
  reactWarnings: ConsoleRecord[];
  reactKeyWarnings: ConsoleRecord[];
  hydrationErrors: ConsoleRecord[];
  cspViolations: ConsoleRecord[];
};

export function attachConsoleMonitor(page: Page): { records: ConsoleRecord[]; pageErrors: string[] } {
  const records: ConsoleRecord[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    const location = message.location();
    records.push({
      type: message.type(),
      text: message.text(),
      location: location.url ? `${location.url}:${location.lineNumber}:${location.columnNumber}` : undefined,
    });
  });
  page.on('pageerror', (error) => { pageErrors.push(error.message); });
  return { records, pageErrors };
}

export function severeConsoleFindings(records: ConsoleRecord[], pageErrors: string[]): ConsoleFindings {
  const severeMessages = records.filter(r =>
    r.type === 'error' ||
    /hydration|csp violation|mixed content|failed to load|uncaught|unhandled|net::err/i.test(r.text)
  );
  const reactWarnings = records.filter(r =>
    r.type === 'warning' &&
    /Warning:|React\.createElement|prop-types|controlled|uncontrolled|unknown prop|invalid prop|validateDOMNesting|maximum update depth/i.test(r.text)
  );
  const reactKeyWarnings = records.filter(r =>
    /unique.*key|key.*prop|each child in a list/i.test(r.text)
  );
  const hydrationErrors = records.filter(r =>
    /hydrat|did not match|server.*client.*mismatch|useLayoutEffect.*server/i.test(r.text)
  );
  const cspViolations = records.filter(r =>
    /Content-Security-Policy|csp violation|blocked.*directive|refused to load/i.test(r.text)
  );
  return { severeMessages, pageErrors, reactWarnings, reactKeyWarnings, hydrationErrors, cspViolations };
}

export function isConsoleClear(findings: ConsoleFindings, strict = false): boolean {
  if (findings.severeMessages.length > 0) return false;
  if (findings.pageErrors.length > 0) return false;
  if (findings.hydrationErrors.length > 0) return false;
  if (strict && findings.reactWarnings.length > 0) return false;
  if (strict && findings.reactKeyWarnings.length > 0) return false;
  return true;
}
