# Website UI Deep QA Skill

A Claude Code and Codex-compatible skill for deep, evidence-based UI QA of websites and web apps — especially AI-generated UIs that may look complete but contain broken interactions, non-functional controls, unsafe browser storage, or poor accessibility.

---

## What it tests

| Area | Minimum | Full coverage |
|:-----|:--------|:--------------|
| Routes | Home + nav links | Source route tree, sitemap, auth routes |
| Layout | Header / sidebar / main / footer | Every scroll point and breakpoint |
| Responsive | Desktop + mobile | 5-viewport matrix + cross-browser smoke |
| Forms | Empty + invalid + valid | Server error, slow network, double-submit |
| Overlays | Open + close + Escape | Focus trap, `aria-modal`, nested overlays |
| Network | Failures + leaks | Duplicate calls, large payloads, auth leakage |
| Storage | Cookies + local/session | IndexedDB, Cache API, logout clearing |
| Security | Token-in-URL + DOM secrets | Security headers, iframe sandbox, mixed content |
| Accessibility | Labels + keyboard | Focus order, ARIA, landmarks, contrast |
| Performance | No infinite loading | Web Vitals (TTFB, FCP, LCP, CLS), DOM growth |
| SEO | Title + favicon | Description, canonical, OG, `noindex` check |
| Console | Errors + page errors | React key warnings, hydration, CSP violations |

## Requirements

- Node.js 18+
- npm

## Installation

### As a Claude Code personal skill

```bash
git clone <repo-url> website-ui-deep-qa
mkdir -p ~/.claude/skills
cp -R website-ui-deep-qa ~/.claude/skills/
```

Invoke from any Claude Code session:

```text
/website-ui-deep-qa Test this app deeply with Playwright MCP and produce a defect report.
```

### As a Codex skill

```bash
git clone <repo-url> website-ui-deep-qa
mkdir -p ~/.codex/skills
cp -R website-ui-deep-qa ~/.codex/skills/
```

Invoke:

```text
$website-ui-deep-qa Test this app deeply and report all UI, network, storage, accessibility, and responsive defects.
```

### Install into a target project

To run the Playwright tests from inside the project you are QA-testing:

```bash
bash /path/to/website-ui-deep-qa-skill/scripts/install-into-project.sh /path/to/your-project
```

The script copies `tests/deep-ui/`, `playwright.config.ts`, and `tsconfig.json` into the target project and patches `package.json` with required devDependencies and scripts. Existing config files are left untouched.

After install:

```bash
cd /path/to/your-project
npm install
npx playwright install
# Edit tests/deep-ui/helpers/routes.ts → set seedRoutes[] for your app
BASE_URL=http://localhost:<port> npm test
```

## Quick start — bundled Playwright automation

```bash
# Install dependencies and browsers (first time only)
npm install
npx playwright install

# Run the full suite against a local app
BASE_URL=http://localhost:3000 npm test
```

## Commands

| Command | Purpose |
|:--------|:--------|
| `npm test` | Full suite — all viewports and browsers |
| `npm run test:chromium` | Chromium desktop 1440×900 only |
| `npm run test:mobile` | Chromium mobile 390×844 only |
| `npm run test:headed` | Headed mode (visible browser window) |
| `npm run test:ci` | GitHub Actions reporter |
| `npm run report` | Open HTML report from last run |
| `npm run typecheck` | Type-check helpers without running tests |

`BASE_URL` defaults to `http://localhost:3000` when not set.

## Configuration

### Seed routes

Edit `tests/deep-ui/helpers/routes.ts` to set the initial routes the spec visits:

```typescript
export const seedRoutes: string[] = [
  '/',
  '/login',
  '/dashboard',
  '/settings',
];
```

Additional routes are discovered automatically at runtime via visible `<a href>` links.

### Viewport and browser matrix

Defined in `playwright.config.ts`:

| Project | Viewport |
|:--------|:---------|
| `chromium-desktop-1440` | 1440×900 |
| `chromium-laptop-1366` | 1366×768 |
| `chromium-tablet-1024` | 1024×768 |
| `chromium-mobile-390` | 390×844 |
| `chromium-mobile-360` | 360×640 |
| `firefox-smoke` | 1440×900 |
| `webkit-smoke` | 1440×900 |

Artifacts go to `qa-artifacts/`. Traces and videos are retained on failure.

### Visual regression baselines

Update baselines only when changes are intentional:

```bash
BASE_URL=http://localhost:3000 npx playwright test --update-snapshots
```

## Output artifacts

All artifacts are written to `qa-artifacts/`:

```text
qa-artifacts/
  screenshots/          per-route, per-viewport PNG files
  network/              network records and leak findings (JSON)
  storage/              before/after storage state (JSON)
  console/              console errors and page errors (JSON)
  accessibility/        a11y issues and keyboard focus order (JSON)
  performance/          Web Vitals and DOM node counts (JSON)
  layout/               layout issues per scroll position (JSON)
  forms/                form audit findings (JSON)
  overlays/             overlay audit findings (JSON)
  seo/                  SEO issues (JSON)
  security/             DOM, header, mixed-content, and URL-token findings (JSON)
  reports/
    final-report.md     per-route Markdown summary
  playwright-report/    HTML report (open with npm run report)
  results.json          machine-readable test results
```

## Project structure

```text
SKILL.md                  skill instructions for Claude Code (primary file)
AGENTS.md                 Codex/OpenAI-style guidance
CLAUDE.md                 Claude Code repository guidance
playwright.config.ts      viewport matrix and artifact paths
agents/
  openai.yaml             UI metadata for compatible agents
resources/
  accessibility-checklist.md
  coverage-matrix.md
  defect-template.md
  mcp-runbook.md
  report-template.md
  responsive-checklist.md
  security-storage-network-checklist.md
tests/deep-ui/
  ui-deep-qa.spec.ts      main Playwright spec
  helpers/
    routes.ts             seedRoutes, discoverLinks, normalizeRoute
    screenshots.ts        screenshotStep, fullPageScreenshot, visualRegression
    network.ts            attachNetworkMonitor, scanResponsesForLeaks, assertNetworkHealthy
    storage.ts            collectStorageState, writeStorageReport
    layout.ts             collectLayoutIssues
    interactions.ts       testVisibleButtons, testVisibleLinks
    accessibility.ts      collectAccessibilityIssues, collectKeyboardFocusOrder
    console.ts            attachConsoleMonitor, severeConsoleFindings
    performance.ts        collectPerformanceSnapshot, poorWebVitals
    forms.ts              auditForms, triggerAndCaptureValidation
    overlays.ts           discoverAndAuditOverlays
    seo.ts                auditSeo
    security.ts           auditDomSecurity, auditSecurityHeaders, auditMixedContent
    report.ts             appendMarkdownReport, writeJsonArtifact
```

## Testing

Run the full Playwright suite to verify the skill's bundled automation:

```bash
npm install
npx playwright install
BASE_URL=http://localhost:3000 npm test
```

Type-check helpers without launching a browser:

```bash
npm run typecheck
```

When editing only `SKILL.md` or `resources/` files, verify manually: frontmatter validity, internal resource paths, and helper references.

## Contributing

1. Fork the repository and create a feature branch.
2. Edit `SKILL.md` to update skill instructions; edit `tests/deep-ui/` to update automation.
3. Keep `SKILL.md` and `tests/deep-ui/ui-deep-qa.spec.ts` in sync — the spec implements what the skill describes.
4. Run `npm run typecheck` before submitting a pull request.
5. Do not remove safety boundaries or the inspect-first rule from `SKILL.md`.

## Safety boundaries

The skill and spec never perform the following without explicit user confirmation:

- Payments or subscription changes
- Bookings or reservations
- Sending email or public messages
- Destructive account changes or data deletion
- Production deployment or live database migration

Login, 2FA, and payment flows require a human to take over the browser. Credentials are never requested in chat.

## License

No `LICENSE` file is present in this repository.

## Maintainer TODOs

- **License**: Add a `LICENSE` file to clarify how this skill may be used and distributed.
