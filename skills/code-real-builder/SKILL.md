---
name: code-real-builder
description: Use when asked to test, QA, audit, or validate any part of a codebase — UI, security, backend APIs, performance, accessibility, user experience, or cross-browser behavior. Routes to the right specialized subskill.
---

# Code Real Builder — Testing Skills Router

## Overview

Umbrella skill. Routes testing requests to the right specialist subskill. Each subskill is a deep, focused tester for one domain.

**Rule:** Always route to the most specific matching subskill. Load parent skill first to select the right domain, then load the subskill.

## Routing Table

| What you're testing | Domain | Subskill |
|---------------------|--------|----------|
| Website UI, layout, responsive, accessibility, forms, overlays, SEO, CSRF, network, storage | UI / Web App | `website-ui-deep-qa` |
| Backend REST/GraphQL APIs, response schemas, auth headers, rate limits, error handling | Backend API | `code-real-builder-backend` *(planned)* |
| Auth flows, OWASP top 10, injection, secrets in code, headers, cookies | Security | `code-real-builder-security` *(planned)* |
| Unit tests, integration tests, coverage gaps, flaky tests, mutation testing | Test Quality | `code-real-builder-test-quality` *(planned)* |
| Trading strategies, backtesting, P&L attribution, signal validation | Backtesting | `code-real-builder-backtest` *(planned)* |
| User flows, onboarding, click paths, session recordings, heatmap analysis | User Experience | `code-real-builder-ux` *(planned)* |
| React/Vue/Angular components, prop contracts, render correctness | Frontend Components | `code-real-builder-frontend` *(planned)* |
| CI/CD pipelines, deploy correctness, env var hygiene, rollback | Deploy & Infra | `code-real-builder-infra` *(planned)* |

## Active Subskills

### UI / Web App QA

**REQUIRED SUB-SKILL:** Use `website-ui-deep-qa`

Covers 46 helper categories: layout, accessibility, forms, overlays, network, storage, console, performance, SEO, security, screenshots, responsive behavior, sidebar, dialog scroll, typography, auth permissions, flow bypass, and more.

Supports: Playwright MCP (live testing), Playwright Test (automated spec), source-code inspection.

Trigger: any URL, local dev server, preview link, or repo containing a web app.

---

## Planned Subskills

The following domains are architecture-ready. Contribute or build them as standalone skills in `~/.claude/skills/code-real-builder-<domain>/`.

| Domain | Key checks planned |
|--------|--------------------|
| `code-real-builder-backend` | REST endpoint contracts, auth header enforcement, pagination, error codes, rate limits, DB query leaks |
| `code-real-builder-security` | OWASP top 10 automation, secrets scanning, dependency CVEs, header audit, injection surface |
| `code-real-builder-test-quality` | Coverage gaps, assertion quality, flaky test detection, missing edge cases, mutation score |
| `code-real-builder-backtest` | Strategy correctness, lookahead bias, P&L attribution, drawdown metrics, signal validity |
| `code-real-builder-ux` | User flow completion, drop-off points, rage clicks, accessibility for real users |
| `code-real-builder-frontend` | Component contracts, prop type coverage, render regression, Storybook parity |
| `code-real-builder-infra` | Deploy correctness, env var hygiene, secret exposure in CI logs, rollback readiness |

## Naming Convention for New Subskills

```
~/.claude/skills/code-real-builder-<domain>/
  SKILL.md          # name: code-real-builder-<domain>
  tests/            # automated spec files if applicable
  helpers/          # domain helper functions
```

Reference this skill in each subskill's SKILL.md:

```markdown
**REQUIRED BACKGROUND:** Part of the `code-real-builder` ecosystem.
Use `code-real-builder` to route between testing domains.
```
