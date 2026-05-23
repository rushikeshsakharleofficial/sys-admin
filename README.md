# Website UI Deep QA Skill

A Claude Code / Codex-compatible skill for deep UI QA of websites and web apps, especially AI-generated UIs.

The primary file is `SKILL.md`.

## What it tests

- Page discovery and route coverage
- Sidebar, top bar, footer, main area, floating UI, modals, drawers, popovers, banners, and toasts
- Scroll behavior at top, 25%, 50%, 75%, and bottom
- Desktop, laptop, tablet, and mobile layouts
- Cross-browser smoke checks in Chromium, Firefox, and WebKit
- Click, hover, focus, keyboard, tab, Escape, and form behavior
- Form validation, loading, success, server error, and duplicate-submit behavior
- Tables, search, filters, sort, pagination, infinite scroll, uploads, downloads, and exports
- Browser console errors and page exceptions
- Network failures, duplicate requests, and sensitive response leakage
- Cookies, localStorage, sessionStorage, IndexedDB, Cache API, and service worker behavior
- Authentication/session/logout behavior when authenticated access is available
- Accessibility smoke checks
- Performance and stability signals
- Public-page SEO basics

## File structure

```text
skill/
├── SKILL.md
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── package.json
├── playwright.config.ts
├── agents/
│   └── openai.yaml
├── resources/
│   ├── accessibility-checklist.md
│   ├── coverage-matrix.md
│   ├── defect-template.md
│   ├── mcp-runbook.md
│   ├── report-template.md
│   ├── responsive-checklist.md
│   └── security-storage-network-checklist.md
└── tests/
    └── deep-ui/
        ├── ui-deep-qa.spec.ts
        └── helpers/
```

## Install as a Claude Code personal skill

```bash
git clone <repo-url> website-ui-deep-qa
mkdir -p ~/.claude/skills
cp -R website-ui-deep-qa ~/.claude/skills/
```

Then invoke:

```text
/website-ui-deep-qa Test this app deeply with Playwright MCP and produce a defect report.
```

## Install as a Codex/project guidance skill

```bash
git clone <repo-url> website-ui-deep-qa
mkdir -p ~/.codex/skills
cp -R website-ui-deep-qa ~/.codex/skills/
```

Codex-compatible invocation:

```text
$website-ui-deep-qa Test this app deeply and report all UI, network, storage, accessibility, and responsive defects.
```

For repository-local instructions, keep `AGENTS.md` at the repo root or copy the skill into a project-specific skills directory.

## Run the bundled Playwright automation

From the skill directory:

```bash
npm install
npx playwright install
BASE_URL=http://localhost:3000 npm test
```

Generate/update visual baselines only when intentional:

```bash
BASE_URL=http://localhost:3000 npx playwright test --update-snapshots
```

## Output

The automated tests write artifacts under:

```text
qa-artifacts/
  screenshots/
  network/
  storage/
  console/
  accessibility/
  performance/
  layout/
  reports/
```

## Important limitation

This skill performs DevTools-equivalent checks through browser automation, network events, DOM inspection, storage APIs, screenshots, and traces. It should not claim that Chrome DevTools was manually inspected unless a human actually opened and reviewed it.
