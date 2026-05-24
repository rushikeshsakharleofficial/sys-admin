<div align="center">

# sys-admin

**A Claude Code plugin with nine QA and productivity skills — UI, visual design, SEO, SQL, PostgreSQL, API, and more.**  
Install once. Invoke from any project. Add your own skills freely.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

---

## Table of contents

- [What is this?](#what-is-this)
- [Skills](#skills)
- [Installation](#installation)
- [Usage](#usage)
  - [Router](#router--smart-dispatch)
  - [UI / Web QA](#ui--web-qa)
  - [SQL / DB audit](#sql--db-audit)
  - [PostgreSQL deep audit](#postgresql-deep-audit)
  - [API testing](#api-testing)
  - [SEO audit](#seo-audit)
  - [Visual design QA](#visual-design-qa)
  - [Smart Todo](#smart-todo)
  - [Marketplace](#marketplace)
- [Configuration](#configuration)
- [Commands](#commands)
- [Project structure](#project-structure)
- [Adding a new skill](#adding-a-new-skill)
- [Contributing](#contributing)
- [Safety boundaries](#safety-boundaries)
- [License](#license)

---

## What is this?

`sys-admin` is an open-source Claude Code plugin that bundles a growing set of QA and productivity skills. Each skill is a focused instruction file Claude loads on demand — no runtime, no server, no build step.

Nine skills ship out of the box: a **smart router**, **functional UI QA** with Playwright (46 helpers), **visual design QA** with industry benchmarks, **SEO auditing**, **SQL auditing**, **PostgreSQL-specific auditing**, **REST/GraphQL/gRPC API testing**, **task tracking**, and a **Claude Code marketplace guide**.

**100% open. Fork it, modify it, add your own skills. MIT licensed.**

---

## Skills

| Skill | Invocation | Checks |
|:------|:-----------|:-------|
| Router | `/sys-admin:sys-admin` | Reads the request, extracts domain keywords, dispatches subskills in priority order |
| UI / Web QA | `/sys-admin:website-ui-deep-qa` | 46 check categories: layout, forms, a11y, network, security, responsive, SEO, CSRF, auth, flow bypass |
| SQL / DB audit | `/sys-admin:sql-deep-qa` | 17 categories: injection (all types + sqlmap), schema, indexes, performance, migrations, connections, ORM, compliance |
| PostgreSQL | `/sys-admin:postgres-deep-qa` | 17 categories: XID wraparound, autovacuum, WAL/replication, PgBouncer, RLS bypass (11 vectors), PG17, postgresql.conf |
| API testing | `/sys-admin:api-deep-qa` | 18 categories: OWASP Top 10, JWT/OAuth2, GraphQL, gRPC, webhooks, fuzzing, k6 load testing, contract testing |
| SEO audit | `/sys-admin:seo-deep-qa` | 21 categories: title/meta/headings, Core Web Vitals, structured data, canonical, sitemap, hreflang, E-E-A-T, crawlability |
| Visual design QA | `/sys-admin:ui-visual-qa` | Pixel regression + 14-category design quality + 73-design industry benchmark (awesome-design-md) |
| Smart Todo | `/sys-admin:smart-todo` | **Mandatory for any 3+ step task.** Tracked list with `[P1]`/`[P2]`/`[P3]`/`[BLOCKER]` tags |
| Marketplace | `/sys-admin:marketplace` | Full Claude Code plugin lifecycle: discover, install, create, publish, debug |

---

## Installation

**Requirements:** Claude Code CLI · Node.js 18+ · npm

```bash
git clone https://github.com/rushikeshsakharleofficial/sys-admin.git
cd sys-admin
bash install.sh
```

Restart Claude Code. All nine skills appear in the `/` picker under the `sys-admin:` namespace.

> The installer copies skill files to `~/.claude/plugins/cache/sys-admin/`, writes manifests, registers the plugin, and enables it automatically.

---

## Usage

### Router — smart dispatch

```text
/sys-admin:sys-admin Audit our entire app — UI, database, and security
```

The router scans the request for domain keywords and dispatches subskills in priority order: `smart-todo` → `sql-deep-qa` → `postgres-deep-qa` → `api-deep-qa` → `seo-deep-qa` → `website-ui-deep-qa` → `ui-visual-qa`. Higher-severity layers run before the surface.

```text
/sys-admin:sys-admin Test the login page on http://localhost:3000/login
# → website-ui-deep-qa only

/sys-admin:sys-admin Our N+1 queries are killing performance
# → sql-deep-qa only

/sys-admin:sys-admin XID wraparound risk and replication lag on our Postgres instance
# → postgres-deep-qa only

/sys-admin:sys-admin Page not indexed in Google, Core Web Vitals failing
# → seo-deep-qa only

/sys-admin:sys-admin Full security audit — AI built this with Cursor
# → smart-todo + sql-deep-qa + api-deep-qa + website-ui-deep-qa
```

---

### UI / Web QA

```text
/sys-admin:website-ui-deep-qa Test the checkout flow on http://localhost:3000
```

Three modes: **Playwright MCP** (live browser, exploratory) → **Playwright Test** (automated, repeatable) → **source inspection** (static analysis when no app is running).

```bash
npm install && npx playwright install
BASE_URL=http://localhost:3000 npm test

npm run test:chromium   # desktop 1440×900
npm run test:mobile     # mobile 390×844
npm run test:headed     # visible browser window
npm run report          # open HTML report
```

Artifacts land in `qa-artifacts/`: screenshots, network records, storage snapshots, a11y findings, console errors, and `final-report.md`.

---

### SQL / DB audit

```text
/sys-admin:sql-deep-qa Audit the database layer in ./src
```

Works from source code alone or against a live DB (read-only). 17 categories including injection (error-based, boolean, time-based, OOB, union, second-order, sqlmap), schema integrity, index strategy, query performance (N+1, pg_stat_statements), migration safety, connection management, ORM-specific checks (Prisma, SQLAlchemy, ActiveRecord, TypeORM, Sequelize, GORM), NoSQL injection (MongoDB, Redis, Elasticsearch), privilege audit, and compliance (PCI DSS, HIPAA, SOC2, GDPR).

---

### PostgreSQL deep audit

```text
/sys-admin:postgres-deep-qa Audit our PostgreSQL database
```

PostgreSQL-specific checks that go deeper than `sql-deep-qa`. Run both for full coverage. Requires a live PostgreSQL connection. 17 categories including XID wraparound (`age(relfrozenxid)` thresholds: warn 150M / critical 500M / emergency 1.5B), autovacuum tuning, WAL/replication and inactive slot disk-bomb prevention, PgBouncer transaction-mode gotchas, JSONB/BRIN/GiST/GIN/Bloom index selection, all 11 RLS bypass vectors, PG16/PG17 features (`transaction_timeout`, `gen_uuid_v7`, incremental backup), backup strategy (pgBackRest vs Barman vs WAL-G), and `postgresql.conf` tuning formulas.

---

### API testing

```text
/sys-admin:api-deep-qa Audit the REST API in ./src
```

18 categories: correctness, OWASP API Top 10 (2023), JWT attacks (`alg:none`, RS256→HS256 confusion), OAuth2 (PKCE bypass, state CSRF), GraphQL (introspection, depth limits, alias batching), gRPC (server reflection, mTLS), webhooks (HMAC validation, replay prevention), rate limit bypass, load testing with k6, contract testing (Pact, Schemathesis), fuzzing, HTTP/2 & HTTP/3, content negotiation, and observability.

---

### SEO audit

```text
/sys-admin:seo-deep-qa Audit SEO on https://example.com
```

21 check categories across on-page, technical, and page-experience SEO. Works against any live URL via Playwright MCP, Lighthouse CLI, or `curl`/`fetch` for HTTP-level signals.

| Area | Categories |
|:-----|:-----------|
| On-page | Title tags (50–60 chars), meta descriptions (150–160 chars, CTA), heading hierarchy (single H1, logical H2–H6) |
| Core Web Vitals | LCP < 2.5s · INP < 200ms · CLS < 0.1 — Lighthouse CLI + PageSpeed Insights API |
| Structured data | Schema.org JSON-LD: Article, Product, FAQ, BreadcrumbList, Organization, WebSite, Review, HowTo, LocalBusiness, VideoObject, Event |
| Technical SEO | Canonical URLs, robots meta + X-Robots-Tag header, robots.txt, XML sitemap, hreflang (BCP 47, `x-default`, bidirectional) |
| Crawlability | noindex detection, redirect chains (max 1 hop), soft 404s, JavaScript SEO (SSR vs JS-only content) |
| Page experience | HTTPS, no intrusive interstitials, mobile-first indexing, E-E-A-T signals (About/Contact/Privacy, author bio, reviews) |

---

### Visual design QA

```text
/sys-admin:ui-visual-qa Audit the visual design of http://localhost:3000
```

Three-phase visual audit — run alongside `website-ui-deep-qa` for full UI coverage:

**Phase 1 — Visual regression:** Pixel diffs via Playwright `toHaveScreenshot()` (0.1% threshold) across 5 viewports × 3 browsers. Dark/light mode and `prefers-reduced-motion` regression included.

**Phase 2 — Design quality (14 categories):** Typography · Color/Contrast (WCAG AA/AAA) · 8pt Spacing Grid · Component States (hover/focus/active/disabled/loading/error/empty) · Animation & Motion · Icon System · Image Quality · Responsive Behavior · Dark Mode · Skeletons · Error/Empty States · Scroll & Sticky · Z-index Stacking · Font Rendering

**Phase 3 — Industry benchmark:** Condition-based selection from 73 real-world DESIGN.md references ([awesome-design-md](https://github.com/voltagent/awesome-design-md)) — Stripe for fintech, Linear for dark SaaS, Vercel for dev tools, Supabase for databases, and 69 more. Every defect gets a real-world citation:

```
VIS-DEFECT-3: Card padding 10px/14px — not on 8pt grid
Industry reference: Stripe uses 8px base unit — xxs(2)·xs(4)·sm(8)·md(12)·lg(16)
Fix: --spacing-sm: 8px, --spacing-md: 16px, --spacing-lg: 24px
```

Artifacts land in `qa-artifacts/visual/`: screenshots, diffs, `phase2-audit.md`, `benchmark.md`, `final-report.md`.

---

### Smart Todo

```text
/sys-admin:smart-todo
```

Automatically invoked before any multi-step task. Creates a tracked list with `[P1]`/`[P2]`/`[P3]`/`[BLOCKER]` tags, updates status in real time, surfaces blockers, and delivers a completion summary.

---

### Marketplace

```text
/sys-admin:marketplace How do I install a plugin?
/sys-admin:marketplace How do I create and publish my own plugin?
```

Covers every `claude plugin` CLI command, the `/plugin` interactive UI, all `plugin.json` and `marketplace.json` schema fields, `SKILL.md` frontmatter, installation scopes (`user` / `project` / `local`), publishing to GitHub, submitting to the Anthropic community marketplace, team auto-install via `settings.json`, versioning strategy, and a debugging guide.

---

## Configuration

### Seed routes (`website-ui-deep-qa`)

Edit `tests/deep-ui/helpers/routes.ts` to set the initial routes the spec visits:

```typescript
export const seedRoutes: string[] = [
  '/',
  '/login',
  '/dashboard',
  '/settings',
];
```

Additional routes are discovered automatically via visible `<a href>` links at runtime.

### BASE_URL

`BASE_URL` defaults to `http://localhost:3000`. Override per run:

```bash
BASE_URL=http://localhost:8080 npm test
```

### Visual regression baselines

Update baselines only when changes are intentional:

```bash
BASE_URL=http://localhost:3000 npx playwright test --update-snapshots
```

---

## Commands

| Command | Purpose |
|:--------|:--------|
| `npm test` | Full Playwright suite — all viewports and browsers |
| `npm run test:chromium` | Chromium desktop 1440×900 only |
| `npm run test:mobile` | Chromium mobile 390×844 only |
| `npm run test:headed` | Headed mode — visible browser window |
| `npm run test:ci` | GitHub Actions reporter format |
| `npm run report` | Open HTML report from last run |
| `npm run typecheck` | Type-check helpers without running tests |

### Viewport matrix (`website-ui-deep-qa`)

| Project | Viewport |
|:--------|:---------|
| `chromium-desktop-1440` | 1440×900 |
| `chromium-laptop-1366` | 1366×768 |
| `chromium-tablet-1024` | 1024×768 |
| `chromium-mobile-390` | 390×844 |
| `chromium-mobile-360` | 360×640 |
| `firefox-smoke` | 1440×900 |
| `webkit-smoke` | 1440×900 |

---

## Testing

Type-check helpers without launching a browser:

```bash
npm run typecheck
```

Run the full Playwright suite (requires a running target app):

```bash
npm install
npx playwright install
BASE_URL=http://localhost:3000 npm test
```

When editing only `SKILL.md` or `skills/` files: verify manually — check frontmatter validity, internal resource paths, and that helper references in `SKILL.md` still match filenames in `tests/deep-ui/helpers/`.

---

## Project structure

```text
install.sh                    installer — run once, re-run after any change
SKILL.md                      website-ui-deep-qa skill (UI QA, 46 helpers)
playwright.config.ts          viewport matrix and artifact output paths
skills/
  sys-admin/SKILL.md          router — keyword → subskill dispatch
  sql-deep-qa/SKILL.md        SQL audit — 17 categories
  postgres-deep-qa/SKILL.md   PostgreSQL deep audit — 17 categories
  api-deep-qa/SKILL.md        API testing — 18 categories
  seo-deep-qa/SKILL.md        SEO audit — 21 categories
  ui-visual-qa/SKILL.md       visual design QA — regression + 14 categories + 73-design benchmark
  smart-todo/SKILL.md         task tracking
  marketplace/SKILL.md        Claude Code plugin lifecycle guide
tests/deep-ui/
  ui-deep-qa.spec.ts          main Playwright spec (website-ui-deep-qa)
  helpers/                    46 helper modules (routes, forms, a11y, network, …)
resources/                    checklists and templates
agents/openai.yaml            UI metadata for Codex/OpenAI-compatible agents
CLAUDE.md                     Claude Code project guidance
AGENTS.md                     Codex-style guidance
CONTRIBUTING.md               contribution guide
```

---

## Adding a new skill

Any skill is one file. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

**1.** Create `skills/my-skill/SKILL.md` with valid frontmatter (`name` + `description: Use when ...`).

**2.** Add a sync block to `install.sh`:

```bash
mkdir -p "$PLUGIN_CACHE/skills/my-skill"
cp "$REPO_DIR/skills/my-skill/SKILL.md" \
   "$PLUGIN_CACHE/skills/my-skill/SKILL.md"
```

**3.** Add a keyword row and domain map entry to `skills/sys-admin/SKILL.md`.

**4.** Re-run `bash install.sh`, restart Claude Code. The skill appears as `/sys-admin:my-skill`.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

1. Fork → `git checkout -b feat/my-skill`
2. Add `skills/my-skill/SKILL.md` with valid frontmatter
3. Wire it in `install.sh` and `skills/sys-admin/SKILL.md`
4. Run `bash install.sh` + verify in a fresh Claude Code session
5. Run `npm run typecheck` if you touched any `.ts` file
6. Open a pull request

No CLA, no bureaucracy. All skill additions welcome.

---

## Safety boundaries

| Skill | Read-only scope | Requires explicit confirmation for |
|:------|:----------------|:-----------------------------------|
| `website-ui-deep-qa` | Public pages only | Payments · bookings · email sends · account changes · data deletion · deployments |
| `sql-deep-qa` | Read-only DB queries | `DROP` · `DELETE` · `TRUNCATE` · `ALTER TABLE` (must include rollback plan) |
| `postgres-deep-qa` | Read-only DB queries | Same as `sql-deep-qa` |
| `api-deep-qa` | Read endpoints freely | Mutations to production data · sqlmap · fuzzing (require authorization context) |
| `seo-deep-qa` | GET/HEAD HTTP requests | Nothing — never submits forms, never authenticates |
| `ui-visual-qa` | DOM inspection only | Baseline overwrites (require `UPDATE_SNAPSHOTS=true` flag) |

Login, 2FA, and payment flows in the UI skill require a human to take over the browser. Credentials are never requested in chat.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
