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
    routes.ts           ← seedRoutes[], discoverLinks(), normalizeRoute()
    screenshots.ts      ← screenshotStep(), fullPageScreenshot(), visualRegression()
    network.ts          ← attachNetworkMonitor(), scanResponsesForLeaks(), assertNetworkHealthy()
    storage.ts          ← collectStorageState(), writeStorageReport()
    layout.ts           ← collectLayoutIssues()
    interactions.ts     ← testVisibleButtons(), testVisibleLinks()
    accessibility.ts    ← collectAccessibilityIssues(), collectKeyboardFocusOrder()
    console.ts          ← attachConsoleMonitor(), severeConsoleFindings()
    performance.ts      ← collectPerformanceSnapshot(), poorWebVitals()
    forms.ts            ← auditForms(), triggerAndCaptureValidation()
    overlays.ts         ← discoverAndAuditOverlays()
    seo.ts              ← auditSeo()
    security.ts         ← auditDomSecurity(), auditSecurityHeaders(), auditMixedContent()
    report.ts           ← appendMarkdownReport(), writeJsonArtifact()
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
