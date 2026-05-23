---
name: code-real-builder
description: Use when asked to test, QA, audit, or validate any part of a codebase — UI, security, backend APIs, performance, accessibility, user experience, backtesting, or cross-browser behavior.
---

# Code Real Builder

## Overview

Parent testing skill. Routes to the right subskill for each domain. Each subskill is a self-contained specialist — invoke it directly after routing.

## Domain Routing

| Testing target | Subskill |
|----------------|----------|
| Website / web app — layout, a11y, forms, network, security, responsive, SEO, CSRF, auth, flow bypass, 46 helpers | `website-ui-deep-qa` |
| Backend REST/GraphQL — contracts, auth headers, rate limits, error handling, schema validation | *(planned)* |
| Security — OWASP top 10, secrets scan, dep CVEs, injection, header/cookie audit | *(planned)* |
| Test quality — coverage gaps, flaky tests, assertion quality, mutation score | *(planned)* |
| Trading strategies — backtesting, P&L, lookahead bias, signal validation | *(planned)* |
| User flows — onboarding completion, drop-off, rage clicks, session analysis | *(planned)* |
| Frontend components — prop contracts, render regression, Storybook parity | *(planned)* |
| Deploy & infra — env var hygiene, secrets in CI logs, rollback readiness | *(planned)* |

## How to Use

1. Identify domain from table above.
2. Invoke the listed subskill.

### UI / Web App Testing

**REQUIRED SUB-SKILL:** Use `website-ui-deep-qa`

Covers 46 helper categories. Supports Playwright MCP (live), Playwright Test (automated), and source-code inspection.

## Adding a New Domain

1. Build the subskill — install to `~/.claude/skills/<subskill-name>/`
2. Add a row to the routing table above
3. Add `**REQUIRED SUB-SKILL:** Use <subskill-name>` section below the table
4. Run `bash install.sh` in repo to sync
