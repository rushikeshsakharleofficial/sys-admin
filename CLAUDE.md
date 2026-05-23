# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code / Codex skill for deep UI QA of websites and web apps. The skill has two delivery mechanisms that must stay in sync:

- **`SKILL.md`** — the skill instruction file loaded by Claude Code at invocation time. Keep frontmatter valid (`name: website-ui-deep-qa`) and keep the body explicit and suitable for weaker models.
- **`tests/deep-ui/ui-deep-qa.spec.ts`** — the bundled Playwright Test that automates the same checks programmatically.

## Commands

```bash
# Install dependencies and browsers (first time)
npm install
npx playwright install

# Type-check helpers without running tests
npm run typecheck
```

All test-running commands and `BASE_URL` usage are documented in `SKILL.md → ## Bundled automation`.

## Architecture

```
SKILL.md                ← loaded by Claude Code at /website-ui-deep-qa
playwright.config.ts    ← defines viewport/browser matrix + artifact output paths
tests/deep-ui/
  ui-deep-qa.spec.ts    ← single spec: discovers routes, loops through them,
                           calls helpers in order, writes artifacts, asserts
  helpers/
    routes.ts                ← seedRoutes[], discoverLinks(), normalizeRoute()
    screenshots.ts           ← screenshotStep(), fullPageScreenshot(), visualRegression()
    network.ts               ← attachNetworkMonitor(), scanResponsesForLeaks(), assertNetworkHealthy()
    storage.ts               ← collectStorageState(), writeStorageReport()
    layout.ts                ← collectLayoutIssues()
    interactions.ts          ← testVisibleButtons(), testVisibleLinks()
    accessibility.ts         ← collectAccessibilityIssues(), collectKeyboardFocusOrder()
    console.ts               ← attachConsoleMonitor(), severeConsoleFindings()
    performance.ts           ← collectPerformanceSnapshot(), poorWebVitals()
    forms.ts                 ← auditForms(), triggerAndCaptureValidation()
    overlays.ts              ← discoverAndAuditOverlays()
    seo.ts                   ← auditSeo()
    security.ts              ← auditDomSecurity(), auditSecurityHeaders(), auditMixedContent()
    report.ts                ← appendMarkdownReport(), writeJsonArtifact()
    broken-images.ts         ← auditBrokenImages()
    lazy-images.ts           ← auditLazyImages()
    zoom-scroll.ts           ← testZoomScroll()
    theme-comparison.ts      ← testThemeComparison()
    reduced-motion.ts        ← testReducedMotion()
    responsive-behavior.ts   ← auditResponsiveBehavior()
    toasts.ts                ← auditToasts()
    tables.ts                ← auditTables()
    pwa.ts                   ← auditPWA()
    auth.ts                  ← auditAuthSurface()
    back-forward.ts          ← testBackForwardNavigation()
    edge-states.ts           ← auditEdgeStates()
    placeholder-content.ts   ← auditPlaceholderContent()
    link-checker.ts          ← auditLinks()
    cookie-consent.ts        ← auditCookieConsent()
    html-validation.ts       ← auditHtmlValidation()
    media-player.ts          ← auditMediaPlayers()
    carousel.ts              ← auditCarousels()
    print-media.ts           ← auditPrintMedia()
    csrf.ts                  ← auditCsrf()
    sitemap.ts               ← auditSitemapAndRobots()
    search.ts                ← auditSearch()
    scroll-axes.ts           ← auditScrollAxes()
    button-animations.ts     ← auditButtonAnimations()
    popup-quality.ts         ← auditPopupQuality()
    content-clipping.ts      ← auditContentClipping()
    user-lifecycle.ts        ← auditUserLifecycle()
    sidebar.ts               ← auditSidebar()
    dialog-scroll.ts         ← auditDialogScroll()
    form-alignment.ts        ← auditFormAlignment()
    typography.ts            ← auditTypography()
    auth-permissions.ts      ← auditAuthPermissions()
    fix-plan.ts              ← writeFixPlan()
resources/              ← checklists and templates referenced by SKILL.md
agents/openai.yaml      ← UI metadata for Codex/OpenAI-compatible agents
AGENTS.md               ← Codex-style guidance (mirrors CLAUDE.md intent)
```

## Key customization points

- **`tests/deep-ui/helpers/routes.ts → seedRoutes`**: Edit this array to seed the routes the spec will visit for a given target app. The spec also discovers additional routes dynamically via `discoverLinks()`.
- **`playwright.config.ts`**: Defines the viewport/browser matrix (desktop 1440, laptop 1366, tablet 1024, mobile 390/360, Firefox smoke, WebKit smoke). Artifacts go to `qa-artifacts/`.

## Verification after Markdown-only edits

No tests to run. Review manually: frontmatter validity, all internal resource paths under `resources/`, helper references (e.g. `helpers/forms.ts`, `helpers/seo.ts`) still accurate.

See `SKILL.md → ## Skill quality bar` for the quality rules that govern all edits to this skill.

## Agent allocation

When dispatching sub-agents to build or edit this skill, follow the rules in
[`agents/agent-allocation.md`](agents/agent-allocation.md).

**Short version:**
- `caveman:cavecrew-builder` — writing or editing any single helper file (`helpers/*.ts`)
- `caveman:cavecrew-investigator` — find where a function is defined / locate patterns
- `caveman:cavecrew-reviewer` — review a PR, diff, or single file
- `general-purpose` — tasks spanning 3+ files that cannot be split
- Parallel dispatch for independent helpers (same message = concurrent execution)
- Main thread always does the wiring: imports, calls, assertions, fix-plan entries
