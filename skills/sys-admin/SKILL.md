---
name: sys-admin
description: Use when the testing domain is unclear, multiple domains apply at once, or the request contains mixed signals — UI + SQL + API + security together. Also use when the user says "audit everything", "test our app", or does not name a specific domain. For a single clearly-named domain, go direct to that subskill instead.
---

# Sys Admin — Smart Router

## Core rule

**Read the request. Match keywords. Pick subskills. Dispatch in order.**

Never guess. Never skip. If two domains are mentioned, run both subskills.

---

## Step 1 — Keyword extraction

Scan the user's request for trigger words. Each word maps to a subskill.

### Keyword → subskill map

| User says any of these... | Route to |
|---------------------------|----------|
| page, website, web app, frontend, UI, layout, button, form, modal, navbar, sidebar, responsive, mobile, desktop, a11y, accessibility, SEO, Playwright, screenshot, CSS, HTML, click, hover, scroll, rendering, visual, component, breakpoint, cookie banner, toast, drawer, carousel | `website-ui-deep-qa` |
| database, DB, SQL, PostgreSQL, MySQL, SQLite, MSSQL, schema, migration, ORM, Prisma, SQLAlchemy, ActiveRecord, TypeORM, GORM, Sequelize, Drizzle, Hibernate, query, index, table, column, foreign key, constraint, stored procedure, transaction, N+1, connection pool, backup, tenant isolation, RLS, MongoDB, Redis, Elasticsearch, NoSQL, pg_hba.conf, pgaudit, pg_stat_statements, bloat, EXPLAIN, orphaned, compliance, PCI, HIPAA, SOC2, bcrypt, argon2, encryption at rest | `sql-deep-qa` |
| XID wraparound, autovacuum, vacuum tuning, replication lag, WAL configuration, PgBouncer, transaction mode, partition pruning, JSONB index, GIN index, BRIN index, GiST, Bloom index, extended statistics, logical replication slot, RLS bypass, pg_maintain, sequence overflow, IDENTITY column, FDW security, pgBackRest, WAL-G, Barman, XID age, dead tuple ratio, cache hit rate, postgresql.conf tuning, shared_buffers, work_mem formula, PG16, PG17, transaction_timeout, gen_uuid_v7, PITR, failover slot, incremental backup, pg_partman, pgvector | `postgres-deep-qa` |
| API, endpoint, REST, GraphQL, gRPC, HTTP, request, response, status code, JSON, JWT, token, rate limit, CORS, webhook, OpenAPI, Swagger, route, controller, payload, headers, auth, IDOR, BOLA, rate limiting, injection, fuzzing, contract, Pact, k6, Artillery | `api-deep-qa` |
| plan, track, todo, checklist, steps, list, organize, manage tasks, what's left, progress | `smart-todo` |
| plugin, skill, marketplace, install plugin, publish plugin, plugin.json, marketplace.json, SKILL.md, claude plugin, /plugin, add marketplace, submit plugin, plugin frontmatter, plugin manifest, plugin namespace, plugin scope | `marketplace` |
| visual regression, pixel diff, design audit, design quality, component states, spacing grid, design tokens, visual QA, typography audit, color tokens, dark mode broken, animation quality, icon consistency, image quality, loading states, skeleton, error state design, touch targets, z-index, font rendering, does it look good, UI looks bad, compare to Stripe, compare to Linear, compare to Vercel, pixel perfect, screenshot diff, baseline, visual-qa, ui-visual-qa | `ui-visual-qa` |
| SEO, search engine optimization, title tag, meta description, heading hierarchy, H1, Core Web Vitals, LCP, CLS, INP, structured data, schema.org, JSON-LD, Open Graph, Twitter Card, canonical URL, robots.txt, sitemap, hreflang, URL structure, internal linking, image SEO, alt text, page speed, mobile-first indexing, JavaScript SEO, duplicate content, E-E-A-T, crawlability, indexability, breadcrumbs, page experience, not indexed, Google Search Console, Lighthouse, rich results, noindex, sitemap errors, ranking | `seo-deep-qa` |
| design from scratch, build UI, create component, add animation, scroll animation, animated scrolling, scroll effect, 3D hero, 3D element, 3D website, Three.js, React Three Fiber, R3F, GSAP, ScrollTrigger, Framer Motion, Lenis, smooth scroll, glassmorphism, neobrutalism, neumorphism, claymorphism, bento layout, bento grid, design system, design tokens, color palette, typography scale, landing page, hero section, redesign, improve UI, dark mode design, parallax, particle effect, WebGL, CSS animation, micro-interaction, page transition, motion design, tilt card, magnetic button, cursor follower, text reveal, stagger animation, pinned section, horizontal scroll, button animation, hover effect, UI builder, build interface, design tokens CSS, card flip, ripple effect | `ui-ux-designer` |
| web server security, server hardening, Apache security, Nginx security, OpenLiteSpeed security, LiteSpeed security, nginx.conf audit, httpd.conf audit, .htaccess security, server headers, server version disclosure, directory listing disabled, TLS audit, SSL configuration, cipher suites, HSTS, server misconfiguration, mod_security, WAF, WAF bypass, reverse proxy security, virtual host security, server-status exposed, nginx_status, directory traversal, path traversal, request smuggling, slow loris, BREACH, CRIME, CORS misconfiguration, clickjacking, server banner, ServerTokens, server_tokens, file exposure, .env exposed, .git exposed, phpinfo exposed, admin panel exposed, rate limiting, connection limits, HTTP methods, TRACE method enabled, nikto, testssl, sslyze, server fingerprinting, CGI security, SSI injection, ShellShock, log injection, Log4Shell, ModSecurity, OWASP CRS, Nginx off-by-slash, alias traversal, merge_slashes, add_header inheritance, OLS WebAdmin, ESI injection, LiteSpeed Cache CVE | `webserver-security` |
| Supabase security, Supabase audit, Supabase RLS, row level security audit, RLS bypass, Supabase anon key, service_role key, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, Supabase auth security, Supabase JWT, Supabase storage security, public bucket Supabase, Supabase Edge Functions security, PostgREST security, Supabase GraphQL security, Supabase Realtime security, Supabase tenant isolation, Supabase secrets, Supabase vault, Supabase PITR, Supabase compliance, GDPR Supabase, Supabase hardening, Supabase rate limiting, Supabase CORS, Supabase MFA, security definer Supabase, Supabase migration secrets, Supabase pgaudit, Supabase roles, supabase_url, getSession vs getUser, raw_user_meta_data, raw_app_meta_data, Supabase auth hooks, Supabase multi-tenant | `supabase-security` |

---

## Step 2 — Domain count decision

```
Count distinct domains matched:

0 domains → Ask one clarifying question (see Step 5)
1 domain  → Dispatch that subskill directly
2+ domains → Multi-domain dispatch (see Step 3)
```

---

## Step 3 — Multi-domain dispatch order

When multiple subskills are needed, always run in this order:

```
1. smart-todo          ← ALWAYS FIRST, every task, no exceptions
2. sql-deep-qa         ← security/data risk highest; run before UI
3. postgres-deep-qa    ← PostgreSQL-specific (run alongside sql-deep-qa when PG keywords detected)
4. api-deep-qa         ← API surface before UI layer
5. seo-deep-qa         ← SEO/crawlability (run before UI checks — indexability is foundational)
6. website-ui-deep-qa  ← functional UI layer
7. ui-visual-qa        ← visual design layer last (runs on top of functional checks)
```

**Rationale:** Data and API vulnerabilities are higher severity than UI defects. SEO indexability issues prevent pages from being found at all — fix before UI polish. Functional correctness before visual polish.

Example multi-domain dispatch:

```
Request: "Full audit of our checkout — the page, the API, and the database"

Dispatch order:
  1. /sys-admin:smart-todo        ← track the full audit
  2. /sys-admin:sql-deep-qa       ← DB layer: injection, schema, indexes, tenant isolation
  3. /sys-admin:api-deep-qa       ← API layer: OWASP, JWT, rate limiting, contracts
  4. /sys-admin:website-ui-deep-qa ← UI layer: layout, forms, a11y, network, security headers
```

---

## Step 4 — Signal patterns (beyond keywords)

Some requests don't use exact keywords. Recognize these patterns:

| Pattern | Route to |
|---------|----------|
| URL provided (`http://`, `https://`, `localhost:`) | `website-ui-deep-qa` first; if API endpoints visible also `api-deep-qa` |
| Repo path provided (`./src`, `/app`, `~/project`) | Inspect structure → route by what's found |
| "It looks broken" / "something is wrong" | Ask one question: UI, API, or DB? |
| "Is it secure?" / "security audit" | All three: `sql-deep-qa` + `api-deep-qa` + `website-ui-deep-qa` |
| "Is it fast?" / "why is it slow?" | `api-deep-qa` (Check 3 + 13) + `sql-deep-qa` (Check 4) |
| "Does it work?" / "test everything" | All three in order |
| "AI generated this" / "Cursor/v0/Bolt built this" | All three — AI-generated code commonly has issues in all layers |
| "Pre-deploy review" / "before we ship" | All three + `smart-todo` to track findings |
| "Database migration" | `sql-deep-qa` only (Check 5) |
| "API is returning wrong data" | `api-deep-qa` (Check 1, 4) + `sql-deep-qa` (Check 3, 4) |
| "Login is broken" | `api-deep-qa` (Check 2, 7) + `website-ui-deep-qa` (auth section) |
| "Slow queries" | `sql-deep-qa` (Check 3, 4) only |
| "CORS error" | `api-deep-qa` (Check 2, security misconfiguration) |
| "Page layout broken" | `website-ui-deep-qa` only |
| "Form not submitting" | `website-ui-deep-qa` (forms) + `api-deep-qa` (Check 1) |

---

## Step 5 — Clarifying question (0 domains matched)

If no domain keyword is found, ask **one** question only:

```
"What layer should I audit?
  A) Website / UI (pages, forms, layout, accessibility)
  B) Database (schema, queries, migrations, security)
  C) API (endpoints, auth, performance, security)
  D) All of the above"
```

Do not ask multiple questions. Do not start work until the answer is received.

---

## Step 6 — smart-todo is always first

**smart-todo is the primary skill. It activates for EVERY task — no conditions, no exceptions.**

Before dispatching any subskill, before doing any work:
1. Invoke `sys-admin:smart-todo`
2. Create the master todo list
3. Add one `[P1]` item per subskill to dispatch
4. Add `[P1]` items for each major check category
5. Add `[P2]` items for report writing, reviewing findings, prioritizing defects
6. Then begin dispatching subskills in order

This applies even when dispatching a single subskill. smart-todo is always step 1.

---

## Domain map

| Domain | Subskill | Checks | Status |
|--------|----------|--------|--------|
| Website / web app | `website-ui-deep-qa` | 46 helpers: layout, a11y, forms, network, security, responsive, SEO, CSRF, auth, flow bypass | ✅ Active |
| SQL / database | `sql-deep-qa` | 17 categories: injection (all types + sqlmap), schema, indexes, performance (pg_stat_statements, bloat), migrations (lock analysis), connections, sensitive data, access control, credentials, ORM (6 ORMs), backup, transactions, DB config security, audit logging, data integrity, NoSQL injection, privilege testing | ✅ Active |
| REST / GraphQL / gRPC API | `api-deep-qa` | 18 categories: correctness, OWASP Top 10, JWT/OAuth2, GraphQL, gRPC, webhooks, rate limit bypass, fuzzing, load testing, contract testing, HTTP/2-3, observability | ✅ Active |
| Task tracking | `smart-todo` | Mandatory for 3+ step tasks: decompose, track, update, surface blockers | ✅ Active (auto) |
| Claude Code plugin / marketplace | `marketplace` | Full plugin lifecycle: discover, install, manage scopes, create plugin.json + SKILL.md, publish to GitHub, submit to community, validate, debug | ✅ Active |
| PostgreSQL deep audit | `postgres-deep-qa` | 17 categories: XID wraparound, autovacuum, WAL/replication, PgBouncer gotchas, partitioning, JSONB/advanced indexes, FTS, lock monitoring, RLS bypass vectors (11), sequences/IDENTITY, FDW, extensions, monitoring queries, backup strategy, postgresql.conf tuning, anti-patterns, compliance | ✅ Active |
| Visual design QA | `ui-visual-qa` | 3 phases: visual regression (pixel diff, all viewports), design quality (14 categories: typography, color, spacing, states, motion, icons, images, responsive, dark mode, skeletons, errors, scroll, z-index, font rendering), industry benchmark (73-design reference map from awesome-design-md, condition-based selection) | ✅ Active |
| SEO page optimization | `seo-deep-qa` | 21 check categories: title tags, meta descriptions, heading hierarchy, Core Web Vitals (LCP/INP/CLS), structured data (Schema.org/JSON-LD), Open Graph + Twitter Card, canonical URLs, robots meta + X-Robots-Tag, robots.txt, XML sitemap, hreflang, URL structure, internal linking, image SEO, page speed + resource hints, mobile-first indexing, JavaScript SEO, duplicate content, E-E-A-T signals, crawlability + indexability pipeline, breadcrumbs | ✅ Active |
| UI/UX design builder | `ui-ux-designer` | Full design process: design tokens, 7 style presets (Glass, Neobrutal, Clay, Neu, Bento, Premium, Minimal), GSAP + ScrollTrigger scroll animations, Framer Motion (React), Three.js + R3F 3D scenes, CSS 3D tilt/flip, Lenis smooth scroll, 6 scroll patterns, micro-interactions, Playwright scraping of design sites (21st.dev, ui.aceternity.com, magicui.design, codrops), web research for latest patterns, performance gates, component patterns (buttons, inputs, cards, skeletons, nav) | ✅ Active |
| Web server security | `webserver-security` | 22 check categories: server version disclosure, HTTP security headers (HSTS/CSP/COOP/COEP), TLS/SSL audit (testssl.sh), directory listing, HTTP methods (TRACE disable), sensitive file exposure (.env/.git/phpinfo), admin interface restriction (server-status/nginx_status/OLS WebAdmin), path traversal (Nginx alias off-by-slash), CORS misconfiguration, rate limiting + DoS protection (Slowloris), BREACH/CRIME compression, reverse proxy + host header injection, request smuggling (CL.TE/TE.CL), CGI/SSI/ShellShock, PHP upload bypass, .htaccess security, Nginx-specific vectors (CVE-2023-44487 Rapid Reset), Apache-specific (CVE-2021-41773/42013 path traversal), OpenLiteSpeed (WebAdmin credentials, ESI injection, LiteSpeed Cache CVEs), WAF/ModSecurity detection + bypass testing, log injection + Log4Shell | ✅ Active |
| Supabase security audit | `supabase-security` | 20 check categories: RLS on all tables (null uid bypass, always-true policies, missing WITH CHECK), API key exposure (service_role in client code, keys in git), Postgres roles + privilege audit (anon over-permission, BYPASSRLS), security definer functions in public schema, JWT config (HS256 vs asymmetric, expiry, MFA enforcement), OAuth + redirect URL allowlist, Storage bucket policies (public bucket risks, missing storage.objects RLS), Edge Functions (service key usage, CORS, secrets in git), PostgREST/GraphQL exposure (introspection, exposed functions), Realtime channel auth, secrets management + Supabase Vault, database hardening (search_path injection, pg_net), multi-tenancy isolation, RLS performance (unindexed policy columns), auth hooks security, rate limiting, CORS config, backup/PITR/compliance (GDPR erasure, pgaudit), getSession vs getUser, raw_user_meta_data privilege escalation | ✅ Active |
| Backend contracts, REST rate limits | — | — | Planned |
| Security deep dive (OWASP, CVEs, dep scan) | — | — | Planned |
| Test quality (coverage, flaky, mutation) | — | — | Planned |
| Frontend components (render regression) | — | — | Planned |
| Deploy & infra (env hygiene, secrets in CI) | — | — | Planned |

---

## Worked examples

### Example A: single domain, clear

```
Request: "Test the login page on http://localhost:3000/login"
Keywords: "page", URL with path
Domain count: 1 → website-ui-deep-qa

Dispatch:
  /sys-admin:website-ui-deep-qa http://localhost:3000/login
```

### Example B: single domain, implicit

```
Request: "Our N+1 queries are killing performance"
Keywords: "N+1", "queries", "performance"
Domain count: 1 → sql-deep-qa

Dispatch:
  /sys-admin:sql-deep-qa ./src
```

### Example C: two domains

```
Request: "Audit our REST API and check if the database queries are safe"
Keywords: "REST API" → api-deep-qa, "database queries" → sql-deep-qa
Domain count: 2 → multi-domain

Dispatch order:
  1. /sys-admin:smart-todo      ← track multi-domain audit
  2. /sys-admin:sql-deep-qa     ← DB first (higher severity)
  3. /sys-admin:api-deep-qa     ← API second
```

### Example D: all domains

```
Request: "Full security audit before we ship — AI built this with Cursor"
Keywords: "security audit", "AI built" → all domains
Domain count: 3 → full stack

Dispatch order:
  1. /sys-admin:smart-todo
  2. /sys-admin:sql-deep-qa
  3. /sys-admin:api-deep-qa
  4. /sys-admin:website-ui-deep-qa
```

### Example E: no keywords

```
Request: "Something feels off with our app"
Keywords: none matched
Domain count: 0 → ask

Response:
  "What layer should I audit?
    A) Website / UI   B) Database   C) API   D) All of the above"
```

### Example F: implicit all-domains signal

```
Request: "Is this safe to deploy?"
Pattern match: "pre-deploy review"
Domain count: all → full stack

Dispatch order:
  1. /sys-admin:smart-todo
  2. /sys-admin:sql-deep-qa
  3. /sys-admin:api-deep-qa
  4. /sys-admin:website-ui-deep-qa
```

---

## Anti-patterns — never do these

| Wrong | Right |
|-------|-------|
| Pick one subskill when two keywords appear | Run both in dispatch order |
| Ask multiple clarifying questions | Ask exactly one question with A/B/C/D |
| Start work before smart-todo | smart-todo ALWAYS first — every task, no exceptions |
| Route "is it secure?" to only website-ui-deep-qa | Security = all three layers |
| Ignore "AI generated" signal | AI-generated code = assume all-domain issues |
| Skip smart-todo because "it's just a quick audit" | Every task → smart-todo first. No exceptions. |
| Skip smart-todo for a single-subskill dispatch | Still run smart-todo first. Always. |
