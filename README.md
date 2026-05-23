<div align="center">

# sys-admin

**A Claude Code plugin with UI QA, API testing, database auditing, and task-tracking skills.**  
Install once. Invoke from any project. Add your own skills freely.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

---

## What is this?

`sys-admin` is an open-source Claude Code plugin that bundles a growing set of QA and productivity skills. Each skill is a focused instruction file Claude loads on demand — no runtime, no server, no build step.

**100% open. Fork it, modify it, add your own skills. MIT licensed.**

---

## Skills

| Skill | Invocation | What it does |
|:------|:-----------|:-------------|
| Router | `/sys-admin:sys-admin` | Reads the request, extracts domain keywords, dispatches to the right subskills in priority order |
| UI / Web QA | `/sys-admin:website-ui-deep-qa` | Deep QA of any website: layout, forms, a11y, network, security, responsive, SEO — 46 check categories with Playwright |
| SQL / DB audit | `/sys-admin:sql-deep-qa` | Audits the SQL layer: injection (all types + sqlmap), schema, indexes, performance (pg_stat_statements, bloat), migrations (lock analysis), connections, ORM patterns, multi-tenancy, NoSQL injection, privilege audit, DB config hardening, compliance — 17 check categories |
| PostgreSQL deep audit | `/sys-admin:postgres-deep-qa` | PostgreSQL-specific checks beyond generic SQL: XID wraparound, autovacuum tuning, WAL/replication, PgBouncer gotchas, partitioning, JSONB indexes, advanced index types (BRIN/GiST/GIN/Bloom), RLS bypass vectors (11), PG16/PG17 features, CVE table, backup strategy (pgBackRest/Barman/WAL-G), postgresql.conf tuning — 17 check categories |
| API testing | `/sys-admin:api-deep-qa` | Tests REST, GraphQL, and gRPC APIs: OWASP Top 10, JWT/OAuth2 attacks, rate limit bypass, webhooks, contract testing, fuzzing, load testing with k6, HTTP/2 & HTTP/3 — 18 check categories |
| Smart Todo | `/sys-admin:smart-todo` | **Mandatory for any 3+ step task.** Decomposes work into a tracked list, updates status in real time, surfaces blockers |
| Marketplace | `/sys-admin:marketplace` | Full Claude Code plugin lifecycle: discover, install, manage scopes, create `plugin.json` + `SKILL.md`, publish to GitHub, submit to community, validate, debug |

---

## Installation

**Requirements:** Claude Code CLI, Node.js 18+, npm

```bash
git clone https://github.com/rushikeshsakharleofficial/sys-admin.git
cd sys-admin
bash install.sh
```

Restart Claude Code. All seven skills appear in the `/` picker under the `sys-admin:` namespace.

> The script copies skill files to `~/.claude/plugins/cache/sys-admin/`, writes manifests, registers the plugin, and enables it automatically.

---

## Usage

### Router — smart multi-domain dispatch

```text
/sys-admin:sys-admin Audit our entire app — UI, database, and security
```

The router scans the request for domain keywords and dispatches subskills in the right order. It always runs `smart-todo` first for multi-domain tasks, then `sql-deep-qa`, then `api-deep-qa`, then `website-ui-deep-qa` — higher-severity layers before the surface.

Examples it handles automatically:

```text
/sys-admin:sys-admin Test the login page on http://localhost:3000/login
# → website-ui-deep-qa only

/sys-admin:sys-admin Our N+1 queries are killing performance
# → sql-deep-qa only

/sys-admin:sys-admin Full security audit — AI built this with Cursor
# → smart-todo + sql-deep-qa + api-deep-qa + website-ui-deep-qa
```

---

### UI / Web QA

```text
/sys-admin:website-ui-deep-qa Test the checkout flow on http://localhost:3000
```

Supports three modes:

- **Playwright MCP** (live browser, exploratory) — preferred when MCP is connected
- **Playwright Test** (automated, repeatable) — runs `tests/deep-ui/ui-deep-qa.spec.ts`
- **Source inspection** — static analysis when no running app is available

```bash
# Run the bundled Playwright suite
npm install && npx playwright install
BASE_URL=http://localhost:3000 npm test

# Scope to one browser/viewport
npm run test:chromium   # desktop 1440×900
npm run test:mobile     # mobile 390×844
npm run test:headed     # visible browser window
npm run report          # open HTML report
```

Artifacts land in `qa-artifacts/`: screenshots, network records, storage snapshots, a11y findings, console errors, and a `final-report.md`.

---

### SQL / DB audit

```text
/sys-admin:sql-deep-qa Audit the database layer in ./src
```

Works from source code alone or against a live DB (read-only). Covers all 17 categories:

- SQL injection (error-based, boolean, time-based, OOB, union, second-order) + automated sqlmap scanning
- Schema integrity: PKs, FKs, NOT NULL, UNIQUE, column types, check constraints
- Index strategy: missing indexes, unnecessary indexes, composite order, partial indexes, bloat
- Query performance: N+1, unbounded queries, offset pagination, `SELECT *`, pg_stat_statements analysis
- Migration safety: dangerous DDL patterns, lock timeout analysis, zero-downtime patterns
- Connection management: pool sizing, PgBouncer, idle timeout, connection leaks
- Sensitive data exposure and log hygiene
- Access control, RLS, multi-tenancy, FORCE ROW LEVEL SECURITY
- Credential and config hygiene
- ORM-specific checks: Prisma, SQLAlchemy, ActiveRecord, TypeORM, Sequelize, GORM
- Backup and PITR verification
- Transaction and concurrency safety
- DB configuration security: pg_hba.conf, SSL, scram-sha-256, MySQL hardening
- Audit logging and compliance: pgaudit, PCI DSS, HIPAA, SOC2, GDPR
- Data integrity: orphaned FK records, constraint violations, duplicate detection
- NoSQL injection: MongoDB `$where`/`$ne` bypass, Redis KEYS injection, Elasticsearch script injection
- Privilege testing: least-privilege audit, SECURITY DEFINER escalation, ideal privilege model

---

### PostgreSQL deep audit

```text
/sys-admin:postgres-deep-qa Audit our PostgreSQL database
```

PostgreSQL-specific checks that go deeper than `sql-deep-qa`. Requires a PostgreSQL database (live or connection string). Covers all 17 categories:

- Version and CVE exposure: patch level check against 2024–2025 CVE table (CVSSv3 scores), PG17 feature adoption gaps
- XID wraparound risk: `age(relfrozenxid)` thresholds, autovacuum health, bloat via pgstattuple
- WAL and replication: `archive_command` health, replication lag, inactive slot disk bomb prevention, `max_slot_wal_keep_size`
- PgBouncer gotchas: session vs transaction vs statement mode, `SET LOCAL` for RLS, `pg_advisory_xact_lock` vs session locks
- Table partitioning: partition pruning validation, partition-wise join/aggregate, pg_partman automation
- JSONB and advanced indexes: `jsonb_ops` vs `jsonb_path_ops`, BRIN correlation check, GiST/GIN/Bloom selection guide, expression indexes
- Full-text search: tsvector column audit, GIN vs GiST for FTS, query-time tsvector anti-pattern
- Lock monitoring: blocked query detection, idle-in-transaction alerts, `lock_timeout` enforcement
- RLS bypass vectors: all 11 documented vectors (superuser, FORCE missing, SECURITY DEFINER views, COPY, PgBouncer context loss, missing WITH CHECK, non-LEAKPROOF functions, OR policy semantics, materialized views, FK/unique leakage)
- Sequences and IDENTITY: INT4 SERIAL overflow detection, `BIGINT GENERATED ALWAYS AS IDENTITY`, UUIDv7 via `gen_uuid_v7()`
- Foreign Data Wrappers: credential exposure audit, `pg_read_server_files` grant check
- Extensions: high-risk extension audit (`plpythonu`, `dblink`, `file_fdw`), recommended extension setup
- Monitoring queries: cache hit rate, connection saturation, slowest queries, table size with dead tuple overhead
- Backup strategy: pgBackRest vs Barman vs WAL-G comparison, `pg_stat_archiver` health check, PG17 incremental backup
- postgresql.conf tuning: `shared_buffers=25% RAM`, `work_mem` formula, SSD tuning, logging for compliance
- PostgreSQL-specific anti-patterns: `NOT IN` with NULLs, `timestamp without time zone`, `BETWEEN` with timestamps, `trust` auth, `search_path` in SECURITY DEFINER
- Compliance and audit logging: pgaudit setup, PCI DSS/HIPAA/SOC2/GDPR requirement map

---

### API testing

```text
/sys-admin:api-deep-qa Audit the REST API in ./src
```

Covers all 18 categories:

- Correctness: status codes, response shape, field types, pagination, idempotency
- OWASP API Top 10 (2023): BOLA, broken auth, mass assignment, resource consumption, BFLA, SSRF, shadow APIs
- Auth security: JWT attacks (alg:none, RS256→HS256 confusion, kid injection), OAuth2 (PKCE bypass, redirect URI, state CSRF)
- Input validation: injection payloads, XXE, SSTI, prototype pollution
- Rate limit bypass: header spoofing, distributed bypass, body variation
- GraphQL: introspection in prod, depth limits, alias batching, query cost
- gRPC: server reflection, mTLS, deadline propagation
- Webhooks: HMAC signature validation, replay prevention, SSRF
- Load testing with k6: arrival rate, thresholds as CI gates
- Contract testing: Pact, oasdiff, Schemathesis, schema drift
- Fuzzing: unexpected types, boundary values, special characters
- HTTP/2 and HTTP/3: header injection, stream multiplexing, QUIC behavior
- Content negotiation: type confusion, format downgrade
- Observability: correlation IDs, structured error shapes, trace propagation

---

### Smart Todo

```text
/sys-admin:smart-todo
```

Automatically invoked before any multi-step task. Creates a `TodoWrite` list with priority tags (`[P1]`/`[P2]`/`[P3]`/`[BLOCKER]`), updates status as work progresses, and delivers a completion summary.

---

### Marketplace — Claude Code plugin lifecycle

```text
/sys-admin:marketplace How do I install a plugin?
/sys-admin:marketplace How do I create and publish my own plugin?
```

Covers every `claude plugin` CLI command and flag, the `/plugin` interactive UI, all `plugin.json` and `marketplace.json` schema fields, SKILL.md frontmatter options, installation scopes (`user` / `project` / `local`), publishing to GitHub, submitting to the Anthropic community marketplace, team auto-install via `settings.json`, versioning strategy, and a debugging guide.

---

## Configuration

### Seed routes (website-ui-deep-qa)

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

`BASE_URL` defaults to `http://localhost:3000` when not set. Override per run:

```bash
BASE_URL=http://localhost:8080 npm test
```

### Visual regression baselines

Update baselines only when changes are intentional:

```bash
BASE_URL=http://localhost:3000 npx playwright test --update-snapshots
```

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

When editing only `SKILL.md` or `skills/` files: verify manually — check frontmatter validity, internal resource paths, and that helper references in SKILL.md still match `tests/deep-ui/helpers/` filenames.

---

## Adding a new skill

Any skill is one file. To add your own:

**1. Create the skill directory and `SKILL.md`:**

```bash
mkdir -p skills/my-skill
cat > skills/my-skill/SKILL.md << 'EOF'
---
name: my-skill
description: Use when [triggering conditions for this skill]
---

# My Skill

[Skill instructions here]
EOF
```

**2. Add a sync line to `install.sh`:**

```bash
# my-skill
mkdir -p "$PLUGIN_CACHE/skills/my-skill"
cp "$REPO_DIR/skills/my-skill/SKILL.md" \
   "$PLUGIN_CACHE/skills/my-skill/SKILL.md"
```

**3. Add a row to `skills/sys-admin/SKILL.md` routing table:**

```markdown
| My domain | `my-skill` | ✅ Active |
```

**4. Re-run the installer:**

```bash
bash install.sh
```

Restart Claude Code. Your skill appears as `/sys-admin:my-skill`.

---

## Project structure

```text
install.sh                    installer — runs once, re-run after any change
SKILL.md                      website-ui-deep-qa skill (UI QA, 46 helpers)
AGENTS.md                     Codex/OpenAI-compatible guidance
CLAUDE.md                     Claude Code project guidance
playwright.config.ts          viewport matrix and artifact paths
skills/
  sys-admin/SKILL.md          router skill — smart keyword → subskill dispatch
  sql-deep-qa/SKILL.md        SQL audit skill — 17 check categories
  api-deep-qa/SKILL.md        API testing skill — 18 check categories
  smart-todo/SKILL.md         task tracking skill
  marketplace/SKILL.md        Claude Code plugin lifecycle guide
  postgres-deep-qa/SKILL.md   PostgreSQL deep audit — 17 check categories
tests/deep-ui/
  ui-deep-qa.spec.ts          main Playwright spec (website-ui-deep-qa)
  helpers/                    46 helper modules (routes, forms, a11y, network, …)
resources/                    checklists and templates
agents/openai.yaml            UI metadata for compatible agents
```

### Viewport matrix (website-ui-deep-qa)

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

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

Quick version:

1. Fork → `git checkout -b feat/my-skill`
2. Add `skills/my-skill/SKILL.md` with valid frontmatter
3. Wire it in `install.sh` and `skills/sys-admin/SKILL.md`
4. Run `bash install.sh` + verify in a fresh Claude Code session
5. `npm run typecheck` if you touched any `.ts` file
6. Open a pull request

No CLA, no bureaucracy. All skill additions welcome.

---

## Safety boundaries

The UI QA skill and Playwright spec never perform the following without explicit confirmation:

- Payments, subscriptions, or billing changes
- Bookings or reservations
- Sending email or public messages
- Destructive account changes or data deletion
- Production deployments or live database migrations

Login, 2FA, and payment flows require a human to take over the browser. Credentials are never requested in chat.

The SQL audit skill runs **read-only** by default. `DROP`, `DELETE`, `TRUNCATE`, and `ALTER TABLE` require explicit confirmation with a stated rollback plan.

The API testing skill never sends requests to production endpoints that create, modify, or delete real data without explicit confirmation. Automated scanning tools (sqlmap, fuzzing) require authorization context before use.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
