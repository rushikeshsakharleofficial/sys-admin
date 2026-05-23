# AGENTS.md

This repository contains the `website-ui-deep-qa` skill.

## Primary instruction file

Read `SKILL.md` first. It is the canonical skill file.

## Purpose

Use this skill to deeply test websites and web apps with Playwright MCP or Playwright Test. It is designed for AI-generated websites where UI may look complete but contain broken interactions, poor responsive behavior, fake controls, leaked mock data, or unsafe browser storage.

## Required behavior for agents

- Plan before testing each page.
- Use screenshots as evidence.
- Test top bar, sidebars, main content, footer, floating UI, modals, drawers, popovers, forms, tables, and navigation.
- Test scroll at top, 25%, 50%, 75%, and bottom.
- Test desktop, laptop, tablet, and mobile layouts.
- Check network, console, storage, cookies, cache, and service workers.
- Check accessibility basics and keyboard navigation.
- Report defects with severity, reproduction steps, evidence, likely cause, and retest steps.
- Never claim tests passed unless they actually ran and passed.

## Safe commands

```bash
npm install
npx playwright install
BASE_URL=http://localhost:3000 npm test
```

## Destructive actions

Do not perform production writes, account changes, payments, public messages, bookings, deletions, migrations, or deployments without explicit user confirmation.

## Output artifacts

Use `qa-artifacts/` for screenshots, network logs, storage snapshots, accessibility findings, console findings, layout findings, performance data, and reports.
