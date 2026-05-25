---
name: supabase-security
description: Use when auditing or hardening a Supabase project — RLS policies, API key exposure, auth configuration, storage buckets, Edge Functions, PostgREST exposure, JWT security, Realtime channel auth, Postgres roles, tenant isolation, or any Supabase-specific security concern. Triggers on: Supabase security, Supabase audit, RLS audit, row level security, Supabase RLS bypass, anon key exposed, service role key, SUPABASE_SERVICE_ROLE_KEY, Supabase auth, JWT Supabase, Supabase storage security, public bucket, Supabase Edge Functions security, PostgREST security, Supabase GraphQL, Supabase Realtime security, supabase_url exposed, SUPABASE_ANON_KEY, security definer Supabase, Supabase pgaudit, Supabase vault, Supabase PITR, Supabase compliance, Supabase hardening, multi-tenant Supabase, Supabase tenant isolation, Supabase rate limiting, Supabase CORS, Supabase migration secrets, Supabase MFA.
---

# Supabase Security Audit

## Mission

Act as a Supabase security engineer. Audit a Supabase project across 20 check categories: RLS policies, API keys, auth config, JWT security, storage, Edge Functions, PostgREST/GraphQL exposure, Realtime, Postgres roles, secrets management, tenant isolation, and compliance. Assume every project has gaps. Find them all. Produce a prioritised fix plan with exact SQL, config, and code snippets.

---

## Non-negotiable rules

- **Read-only audit** — never modify data, never drop policies, never ALTER tables directly. Output patches only; operator applies them.
- **Never log or echo secrets** — if you find an exposed key, note its location and that it must be rotated; never print the value.
- **Measure exactly** — quote exact table names, policy names, function names, and bucket names found.
- **Require confirmation for destructive RLS changes** — disabling RLS on a live table or dropping policies requires explicit user confirmation.

---

## Mode detection

State execution mode at the top of every report.

### Mode 1 — Live Supabase project (preferred)
Supabase project URL + service role key (read-only audit queries) or MCP Supabase tool connected. Runs SQL audit queries via `psql`, Supabase CLI, or MCP.

### Mode 2 — Source code audit
No live connection. Inspect codebase: `.env*`, `supabase/migrations/`, `supabase/functions/`, `src/`, client code.

### Mode 3 — Config + Dashboard review
No code, no live DB. Review exported schema, `supabase/config.toml`, and answers to structured questions.

---

## Initial state to declare

```
Target:      <project URL or repo path>
Mode:        <1 / 2 / 3>
Supabase CLI: <version or N/A>
Postgres ver: <version>
```

---

## Check 1 — RLS: tables without Row Level Security

**Risk: Critical** — unprotected tables expose all rows to anon and authenticated roles via PostgREST.

```sql
-- Find all tables in public schema with RLS disabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname IN ('public', 'storage', 'auth')
  AND rowsecurity = false
ORDER BY schemaname, tablename;

-- Cross-check: tables reachable via PostgREST (granted to anon or authenticated)
SELECT grantee, table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('anon', 'authenticated')
  AND table_schema = 'public'
  AND rowsecurity = false
ORDER BY table_name;
```

**What to look for:**
- Any row where `rowsecurity = false` AND table is in `public` schema
- Tables granted to `anon` without RLS = anyone on the internet can read/write all rows

**Fix:**
```sql
-- Enable RLS on every public table
ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.your_table FORCE ROW LEVEL SECURITY;  -- applies to table owner too

-- Minimum deny-all policy (add permissive policies on top)
CREATE POLICY "deny_all" ON public.your_table
  AS RESTRICTIVE TO PUBLIC USING (false);
```

---

## Check 2 — RLS: policy quality audit

**Risk: Critical** — enabled RLS with broken policies = false sense of security.

```sql
-- List all RLS policies with their definitions
SELECT
  schemaname, tablename, policyname,
  permissive, roles, cmd,
  qual AS using_expr,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Find policies with USING (true) — grants unrestricted access
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE qual = 'true' OR with_check = 'true'
  AND schemaname = 'public';

-- Find UPDATE policies missing WITH CHECK
SELECT tablename, policyname
FROM pg_policies
WHERE cmd = 'UPDATE'
  AND with_check IS NULL
  AND schemaname = 'public';
```

**Common policy bugs:**

| Bug | Pattern | Risk |
|-----|---------|------|
| Always-true policy | `USING (true)` | All rows visible to everyone |
| Null UID bypass | `auth.uid() = user_id` without null check | Unauthenticated bypass when user_id IS NULL |
| UPDATE without WITH CHECK | `USING` only on UPDATE | Row can be updated to data user shouldn't own |
| Missing SELECT for UPDATE | No SELECT policy | UPDATE silently fails — no error, no data |
| User-modifiable claim | `raw_user_meta_data->>'role' = 'admin'` | User sets their own role |

**Fix patterns:**
```sql
-- Null-safe auth check (ALWAYS do this)
CREATE POLICY "users_own_rows" ON public.profiles
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- UPDATE must have both USING and WITH CHECK
CREATE POLICY "users_update_own" ON public.posts
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id)         -- can they touch this row?
  WITH CHECK (auth.uid() = author_id);   -- is the modified row still valid?

-- Use app_metadata (immutable) not user_metadata (user-modifiable) for roles
CREATE POLICY "admin_only" ON public.admin_table
  FOR ALL TO authenticated
  USING (
    (auth.jwt()->'app_metadata'->>'role')::text = 'admin'
  );
```

---

## Check 3 — API key exposure

**Risk: Critical** — service_role key bypasses all RLS; anon key in git = abuse.

```bash
# Search codebase for hardcoded keys
grep -rn "SUPABASE_SERVICE_ROLE_KEY\|service_role\|eyJhbGci" \
  --include="*.ts" --include="*.js" --include="*.py" --include="*.env" \
  --include="*.json" --include="*.yaml" --include="*.yml" \
  . | grep -v "node_modules\|.git\|\.example"

# Check .env files committed to git
git log --all --full-history -- "**/.env" "**/.env.local" "**/.env.production"
git log --all --full-history -- "**/supabase/.env"

# Check if anon key is in public-facing JS bundle
grep -rn "supabaseKey\|supabaseAnonKey\|NEXT_PUBLIC_SUPABASE" \
  --include="*.ts" --include="*.js" src/

# Check Supabase migration files for hardcoded secrets
grep -rn "password\|secret\|key\|token" supabase/migrations/ \
  --include="*.sql" | grep -v "-- "
```

**Rules:**
- `SUPABASE_SERVICE_ROLE_KEY` → server-only env var. Never in browser, never in Next.js `NEXT_PUBLIC_*`
- `SUPABASE_ANON_KEY` → safe in browser only IF RLS is enabled on all tables
- Both keys must be rotated if ever committed to git or exposed in logs

**Fix — Next.js:**
```typescript
// ❌ WRONG — service role key in browser
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!  // exposed!
);

// ✅ CORRECT — service role only in server-side code
// app/api/admin/route.ts (Next.js server)
import { createClient } from '@supabase/supabase-js';
const adminClient = createClient(
  process.env.SUPABASE_URL!,           // no NEXT_PUBLIC_
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

---

## Check 4 — Postgres roles and privilege audit

**Risk: High** — over-permissioned roles expose data beyond intended access.

```sql
-- Check what anon role can access
SELECT table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
ORDER BY table_schema, table_name;

-- Check what authenticated role can access
SELECT table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated'
ORDER BY table_schema, table_name;

-- Find BYPASSRLS roles (these skip ALL RLS)
SELECT rolname, rolbypassrls, rolsuper
FROM pg_roles
WHERE rolbypassrls = true OR rolsuper = true;

-- Find tables where anon has INSERT/UPDATE/DELETE without RLS
SELECT g.table_name, g.privilege_type
FROM information_schema.role_table_grants g
JOIN pg_tables t ON t.tablename = g.table_name AND t.schemaname = g.table_schema
WHERE g.grantee = 'anon'
  AND g.privilege_type IN ('INSERT','UPDATE','DELETE')
  AND t.rowsecurity = false;
```

**Fix — revoke unnecessary anon privileges:**
```sql
-- Only expose what anon actually needs
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Re-grant only required tables
GRANT SELECT ON public.products TO anon;        -- public catalog OK
GRANT SELECT ON public.blog_posts TO anon;      -- public content OK
-- NOT: user_profiles, orders, payments, etc.
```

---

## Check 5 — SECURITY DEFINER functions

**Risk: High** — runs as creator (often postgres superuser), bypasses RLS, can be called by anon.

```sql
-- Find all SECURITY DEFINER functions
SELECT
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef AS security_definer,
  p.provolatile,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.prosecdef = true
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, p.proname;

-- Check if SECURITY DEFINER functions are in exposed schema (critical)
SELECT proname, nspname
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.prosecdef = true
  AND n.nspname = 'public';  -- public = exposed to PostgREST = DANGEROUS
```

**Rule:** Security definer functions in `public` schema are callable by anon via PostgREST. Move to unexposed schema or add explicit caller validation.

**Fix:**
```sql
-- Move security definer functions to private schema
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

-- Recreate function in private schema
CREATE OR REPLACE FUNCTION private.admin_action(...)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp  -- prevent search_path injection
AS $$
BEGIN
  -- Validate caller is actually admin
  IF (auth.jwt()->'app_metadata'->>'role') != 'admin' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  -- ... actual logic
END;
$$;
```

---

## Check 6 — JWT and Auth configuration

**Risk: Critical** — weak JWT config = token forgery, account takeover.

```bash
# Check JWKS endpoint for asymmetric keys (preferred over HS256)
curl -s "https://YOUR_PROJECT.supabase.co/auth/v1/.well-known/jwks.json" | \
  python3 -m json.tool

# Check auth settings via Supabase CLI
supabase projects list
supabase --project-ref YOUR_REF api

# Check if JWT secret is in .env files
grep -rn "JWT_SECRET\|SUPABASE_JWT_SECRET\|supabase_jwt" . \
  --include="*.env" --include="*.env.*" | grep -v ".example"
```

**What to check:**

| Setting | Secure | Insecure |
|---------|--------|---------|
| JWT signing | RSA/EC asymmetric (JWKS) | HS256 shared secret |
| JWT secret in code | Never | `process.env.JWT_SECRET` client-side |
| Token expiry | 1h or less | Never / 30 days |
| Refresh token rotation | Enabled | Disabled |
| Email enumeration | Disabled | Enabled (default) |
| MFA | Enforced for admin roles | Optional for all |
| Password strength | Min 8 chars + complexity | Any password |
| Magic link expiry | 1h or less | Default |

**Fix — Supabase Dashboard settings:**
```
Auth → Settings:
  ✓ Enable email confirmations
  ✓ Enable secure email change (confirmation required)
  ✓ Disable "Allow unconfirmed users" 
  ✓ Enable password strength meter
  ✓ JWT expiry: 3600 (1 hour)
  ✓ Refresh token rotation: Enabled
  ✓ Reuse interval: 10 seconds
  ✓ Leaked password protection: Enabled (HaveIBeenPwned)
```

**Fix — enforce MFA for admin actions:**
```sql
CREATE POLICY "admins_require_mfa" ON public.admin_table
  FOR ALL TO authenticated
  USING (
    (auth.jwt()->>'aal') = 'aal2'  -- requires MFA (TOTP or WebAuthn)
    AND (auth.jwt()->'app_metadata'->>'role') = 'admin'
  );
```

---

## Check 7 — Auth providers and OAuth

**Risk: High** — misconfigured OAuth = account takeover via email collision.

```bash
# Check which providers are enabled (Supabase CLI)
supabase --project-ref YOUR_REF get-config --experimental

# Or check via Management API
curl -s "https://api.supabase.com/v1/projects/YOUR_REF/config/auth" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**What to check:**
- Email + OAuth same account: if user signs up with email/password AND same email via Google OAuth → are they the same account? (Supabase default: yes — verify expected behavior)
- `link_all_providers` setting — if enabled, any OAuth with matching email links to existing account (IDOR risk if email not verified)
- Redirect URLs allowlist — wildcard `*` allows open redirect in OAuth flow
- App metadata set by hook — ensure `raw_app_meta_data` is only set server-side, never from client claims

**Fix — restrict redirect URLs:**
```
Auth → URL Configuration:
  Site URL: https://yourapp.com
  Redirect URLs: 
    https://yourapp.com/auth/callback      ✅
    https://app.yourapp.com/**             ✅
    *                                      ❌ NEVER
    http://                                ❌ (except localhost dev)
```

---

## Check 8 — Storage bucket security

**Risk: High** — public buckets expose all files; missing RLS on objects = any authenticated user accesses any file.

```sql
-- List all buckets and their public status
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY name;

-- Find storage policies
SELECT *
FROM storage.policies
ORDER BY bucket_id, name;

-- Check storage.objects RLS
SELECT rowsecurity
FROM pg_tables
WHERE schemaname = 'storage' AND tablename = 'objects';

-- Files in public buckets (check if sensitive)
SELECT bucket_id, COUNT(*) as file_count
FROM storage.objects
WHERE bucket_id IN (
  SELECT id FROM storage.buckets WHERE public = true
)
GROUP BY bucket_id;
```

**Public bucket risk matrix:**

| Bucket type | RLS on objects | Risk |
|-------------|---------------|------|
| Public | No | Critical — anyone reads any file by guessing path |
| Public | Yes | Medium — path enumerable but rows protected |
| Private | No RLS needed | Safe — requires signed URL |
| Private | No policies | Critical — authenticated users see all files |

**Fix — private bucket with user-scoped access:**
```sql
-- Users can only access their own folder: /user_id/filename
CREATE POLICY "user_owns_folder" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'user-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'user-uploads'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Block unauthenticated access to private bucket
REVOKE ALL ON storage.objects FROM anon;
```

---

## Check 9 — Edge Functions security

**Risk: High** — service role key in functions, secrets in git, CORS misconfiguration.

```bash
# Check Edge Functions for service role key usage
grep -rn "SUPABASE_SERVICE_ROLE_KEY\|service_role" supabase/functions/ \
  --include="*.ts" --include="*.js"

# Check if .env is gitignored
cat .gitignore | grep -i "\.env"
git ls-files supabase/functions/ | grep "\.env"

# List secrets (names only — never print values)
supabase secrets list --project-ref YOUR_REF

# Check for hardcoded URLs or keys in function code
grep -rn "https://.*supabase\.co\|eyJhbGci" supabase/functions/ \
  --include="*.ts"
```

**What to check:**
- `SUPABASE_SERVICE_ROLE_KEY` used where `SUPABASE_ANON_KEY` would suffice
- `.env` files inside `supabase/functions/` committed to git
- CORS `allowedOrigins: ['*']` in function responses
- No input validation before calling DB
- Secrets hardcoded in function source instead of `supabase secrets set`

**Fix — CORS in Edge Function:**
```typescript
// supabase/functions/my-function/index.ts
const ALLOWED_ORIGINS = [
  'https://yourapp.com',
  'https://app.yourapp.com',
];

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';

  // Reject unknown origins
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Forbidden', { status: 403 });
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Vary': 'Origin',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Prefer anon client (respects RLS) unless admin action required
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,    // NOT service_role
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  // ...
});
```

---

## Check 10 — PostgREST and GraphQL exposure

**Risk: High** — auto-exposed tables, unrestricted GraphQL introspection, function invocation.

```sql
-- Tables auto-exposed to PostgREST (in exposed schemas)
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Functions callable via RPC (PostgREST /rpc/ endpoint)
SELECT routine_name, routine_type, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- Views in public schema (views bypass RLS pre-PG15)
SELECT viewname, definition
FROM pg_views
WHERE schemaname = 'public';
```

**GraphQL introspection check:**
```bash
# Test if introspection is enabled for anon (exposes full schema)
curl -X POST "https://YOUR_PROJECT.supabase.co/graphql/v1" \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name } } }"}'
# If returns schema → introspection open to public
```

**Fix — restrict PostgREST exposure:**
```sql
-- Move sensitive tables to non-exposed schema
CREATE SCHEMA IF NOT EXISTS internal;
ALTER TABLE public.sensitive_table SET SCHEMA internal;

-- Or: disable PostgREST for specific tables by revoking grants
REVOKE ALL ON public.audit_log FROM anon, authenticated;

-- Views: enforce RLS on PG15+
CREATE VIEW public.safe_view
  WITH (security_invoker = true)    -- inherits caller's RLS context
AS SELECT id, name FROM public.profiles;
```

**Fix — restrict GraphQL introspection:**
```sql
-- Via Supabase Dashboard → API → GraphQL Settings:
-- Disable introspection for unauthenticated requests
-- Or via pg_graphql config:
SELECT graphql.set_config('max_rows', '100');  -- limit result sizes
```

---

## Check 11 — Realtime security

**Risk: Medium–High** — channels without authorization expose cross-tenant data.

```sql
-- Check if Realtime is enabled on tables
-- (Check Supabase Dashboard → Database → Replication)
SELECT *
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';

-- Check Realtime RLS (broadcast channels use postgres RLS)
-- Tables in publication should have RLS enabled
SELECT p.tablename, t.rowsecurity
FROM pg_publication_tables p
JOIN pg_tables t ON t.tablename = p.tablename AND t.schemaname = p.schemaname
WHERE p.pubname = 'supabase_realtime';
```

**What to check:**
- Tables in `supabase_realtime` publication without RLS → **all changes broadcast to all subscribers**
- Broadcast channels: no built-in auth — any user can subscribe to any channel name
- Presence: user IDs and metadata visible to all channel members
- `private` vs `public` channel naming matters — not enforced by Supabase automatically

**Fix — Realtime RLS must be enabled:**
```sql
-- RLS on replicated tables applies to Realtime too
-- Users only receive changes for rows their policies allow
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_see_own_messages" ON public.messages
  FOR SELECT TO authenticated
  USING (auth.uid() = recipient_id OR auth.uid() = sender_id);
```

**Fix — channel authorization in client:**
```typescript
// ❌ Anyone can join any channel
const channel = supabase.channel('room:1234');

// ✅ Validate user has access before subscribing
const { data: membership } = await supabase
  .from('room_members')
  .select('room_id')
  .eq('room_id', roomId)
  .eq('user_id', userId)
  .single();

if (!membership) throw new Error('Access denied');
const channel = supabase.channel(`room:${roomId}`);
```

---

## Check 12 — Secrets management and Supabase Vault

**Risk: High** — hardcoded secrets in migrations = permanent exposure in git history.

```bash
# Search migrations for hardcoded secrets
grep -rn -i "password\|secret\|api_key\|token\|credential" \
  supabase/migrations/ --include="*.sql" | grep -v "^\s*--"

# Check if vault extension is installed
psql "$DATABASE_URL" -c "SELECT * FROM vault.secrets LIMIT 0;" 2>/dev/null && \
  echo "vault enabled" || echo "vault NOT enabled"

# Check for secrets in seed files
grep -rn "eyJ\|sk_live\|pk_live\|AKIA\|AIza" supabase/seed.sql 2>/dev/null
```

**Fix — use Supabase Vault for secrets:**
```sql
-- Enable vault extension
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Store secret in vault
SELECT vault.create_secret(
  'stripe_api_key',
  'sk_live_...',
  'Stripe API key for payment processing'
);

-- Access secret in function (never exposed to client)
CREATE OR REPLACE FUNCTION process_payment()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  stripe_key text;
BEGIN
  SELECT decrypted_secret INTO stripe_key
  FROM vault.decrypted_secrets
  WHERE name = 'stripe_api_key';
  -- use stripe_key...
END;
$$;
```

---

## Check 13 — Database hardening

**Risk: Various** — search_path injection, dangerous extensions, unpatched Postgres.

```sql
-- Check Postgres version
SELECT version();

-- Check installed extensions (risk: pg_net can make outbound HTTP, pgsocket for network access)
SELECT name, default_version, installed_version, comment
FROM pg_available_extensions
WHERE installed_version IS NOT NULL
ORDER BY name;

-- Check search_path setting (injection risk if set to user-controlled value)
SHOW search_path;
SELECT current_setting('search_path');

-- Check for functions missing SET search_path (vulnerable to Trojan horse attack)
SELECT proname, nspname, prosrc
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.prosecdef = true
  AND NOT EXISTS (
    SELECT 1 FROM pg_proc_secdef_search_path pp
    WHERE pp.oid = p.oid  -- simplified; check proconfig for search_path
  );

-- Simplified version:
SELECT proname, proconfig
FROM pg_proc
WHERE prosecdef = true
  AND (proconfig IS NULL OR NOT (proconfig::text LIKE '%search_path%'));
```

**Fix — always set search_path in security definer functions:**
```sql
CREATE OR REPLACE FUNCTION public.safe_function()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp  -- ALWAYS include this line
AS $$
BEGIN
  -- your code
END;
$$;
```

**Fix — restrict dangerous extensions:**
```sql
-- pg_net (outbound HTTP) — restrict to private schema
REVOKE USAGE ON SCHEMA net FROM anon, authenticated;
-- Only allow from specific functions that validate input
```

---

## Check 14 — Multi-tenancy and tenant isolation

**Risk: Critical** — missing tenant_id check = cross-tenant data leak.

```sql
-- Find tables likely used for multi-tenancy (have org_id / tenant_id / account_id)
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('org_id','tenant_id','account_id','workspace_id','team_id','company_id')
ORDER BY table_name;

-- Check these tables have RLS policies referencing tenant column
SELECT p.tablename, p.policyname, p.qual
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND p.tablename IN (
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE column_name IN ('org_id','tenant_id','account_id')
      AND table_schema = 'public'
  );

-- Find tables with tenant column but no RLS policy mentioning it
SELECT t.tablename
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_name = t.tablename
      AND c.column_name IN ('org_id','tenant_id','account_id')
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.tablename = t.tablename
      AND (p.qual ILIKE '%org_id%' OR p.qual ILIKE '%tenant_id%')
  );
```

**Fix — tenant isolation policy:**
```sql
-- Ensure every tenant-scoped table checks org membership
CREATE POLICY "org_isolation" ON public.documents
  FOR ALL TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

-- Index for performance (CRITICAL — unindexed policy = full table scan per request)
CREATE INDEX idx_documents_org_id ON public.documents(org_id);
CREATE INDEX idx_org_members_user_id ON public.org_members(user_id);
```

---

## Check 15 — RLS performance (unindexed policy columns)

**Risk: Medium + DoS** — unindexed policy columns cause full-table scans; can degrade to DoS under load.

```sql
-- Find policy columns missing indexes
-- Get all columns referenced in RLS policies
WITH policy_cols AS (
  SELECT
    tablename,
    regexp_matches(qual, '(\w+)\s*=\s*auth\.uid\(\)', 'g') AS col
  FROM pg_policies
  WHERE schemaname = 'public'
)
SELECT
  pc.tablename,
  pc.col[1] AS policy_column,
  EXISTS (
    SELECT 1 FROM pg_indexes pi
    WHERE pi.tablename = pc.tablename
      AND pi.indexdef ILIKE '%' || pc.col[1] || '%'
  ) AS has_index
FROM policy_cols pc
WHERE NOT EXISTS (
  SELECT 1 FROM pg_indexes pi
  WHERE pi.tablename = pc.tablename
    AND pi.indexdef ILIKE '%' || pc.col[1] || '%'
);
```

**Fix — add indexes for every RLS policy column:**
```sql
-- Every column used in USING/WITH CHECK needs an index
CREATE INDEX idx_profiles_user_id   ON public.profiles(user_id);
CREATE INDEX idx_posts_author_id    ON public.posts(author_id);
CREATE INDEX idx_messages_recipient ON public.messages(recipient_id);

-- INCLUDE primary data columns to enable index-only scans
CREATE INDEX idx_posts_author_published
  ON public.posts(author_id, published_at)
  WHERE deleted_at IS NULL;
```

---

## Check 16 — Auth hooks security

**Risk: High** — insecure hook payload verification = JWT claim injection.

```bash
# Check if webhook signature verification is implemented in HTTP hooks
grep -rn "webhook-signature\|StandardWebhooks\|verifyWebhook\|x-supabase-signature" \
  supabase/functions/ --include="*.ts"

# Check for security_definer on hook functions (avoid — gives postgres superuser privs)
grep -rn "SECURITY DEFINER" supabase/migrations/ --include="*.sql" | \
  grep -i "hook\|custom_access_token\|send_email"
```

**What to check:**
- HTTP auth hooks must verify `webhook-id`, `webhook-timestamp`, `webhook-signature` headers
- PostgreSQL auth hooks should NOT use `SECURITY DEFINER` (grants excessive postgres role permissions)
- Custom Access Token hooks: only add claims from `raw_app_meta_data` (immutable), never `raw_user_meta_data`
- Hooks in public schema callable by anon via PostgREST — move to private schema

**Fix — Custom Access Token hook:**
```sql
-- Put in private schema, not public
CREATE OR REPLACE FUNCTION private.custom_access_token_hook(event jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  -- NO SECURITY DEFINER — run as calling user
  STABLE
AS $$
DECLARE
  claims jsonb;
  org_role text;
BEGIN
  claims := event->'claims';

  -- Only read from app_metadata (immutable, server-set)
  -- NEVER from user_metadata (user-modifiable)
  org_role := (event->'user_metadata'->'app_metadata'->>'org_role');

  IF org_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{org_role}', to_jsonb(org_role));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
```

---

## Check 17 — CORS and network configuration

**Risk: Medium–High** — wildcard CORS + credentials = cross-origin data theft.

```bash
# Test CORS on Supabase REST API
curl -sI \
  -H "Origin: https://evil.com" \
  -H "apikey: YOUR_ANON_KEY" \
  "https://YOUR_PROJECT.supabase.co/rest/v1/your_table" \
  | grep -i "access-control"

# Check allowed CORS origins in Supabase config
# Dashboard → Settings → API → Allowed Origins
```

**Fix:**
```
Supabase Dashboard → Settings → API → Allowed Origins:
  ✅ https://yourapp.com
  ✅ https://app.yourapp.com
  ❌ * (wildcard — never for production)
  ❌ http:// origins (except localhost)
```

---

## Check 18 — Rate limiting and abuse prevention

**Risk: Medium** — no rate limiting = auth endpoint brute force, data scraping.

```bash
# Test if auth endpoints have rate limiting
for i in $(seq 1 10); do
  code=$(curl -so /dev/null -w "%{http_code}" -X POST \
    "https://YOUR_PROJECT.supabase.co/auth/v1/token?grant_type=password" \
    -H "apikey: YOUR_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrongpassword"}')
  echo "Attempt $i: $code"
done
# Expected: 429 after ~5 attempts. If always 400 → rate limit may be off.
```

**Supabase built-in rate limits (verify these are NOT disabled):**
```
Auth → Rate Limits (Dashboard):
  Email/SMS sending: 4 per hour (default)
  Token refresh: 360 per hour (default)
  Magic link: 4 per hour (default)
  Anonymous sign-ins: 30 per hour (default)
```

**Fix — custom rate limiting via pre-request function:**
```sql
CREATE OR REPLACE FUNCTION public.check_rate_limit()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
DECLARE
  client_ip text := current_setting('request.headers', true)::json->>'x-forwarded-for';
  request_count int;
BEGIN
  SELECT COUNT(*) INTO request_count
  FROM public.rate_limit_log
  WHERE ip_address = client_ip
    AND created_at > NOW() - INTERVAL '1 minute';

  IF request_count > 100 THEN
    RAISE EXCEPTION 'Rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.rate_limit_log (ip_address) VALUES (client_ip);
END;
$$;
```

---

## Check 19 — Backup, PITR, and compliance

**Risk: Medium (data loss) + Compliance**

```bash
# Check Supabase plan for PITR availability
# PITR available on Pro plan and above
supabase --project-ref YOUR_REF get-config --experimental | grep -i "pitr\|backup"

# Check if Supabase Audit Logs are enabled (Dashboard → Logs → Audit)
# Check if pgaudit extension installed
psql "$DATABASE_URL" -c "SELECT * FROM pg_extension WHERE extname = 'pgaudit';"

# Check for compliance flags in schema (GDPR: user deletion, data export)
grep -rn "delete_user\|export_data\|gdpr\|right_to_erasure" \
  supabase/functions/ supabase/migrations/ --include="*.ts" --include="*.sql"
```

**Compliance checklist:**

| Requirement | Check | Fix |
|-------------|-------|-----|
| GDPR right to erasure | `delete_user` function exists | Create function that deletes all user data |
| GDPR data export | User data export endpoint | Edge Function returning all user data |
| Audit log | pgaudit or Supabase Audit enabled | Enable in Dashboard → Logs |
| PITR | Point-in-time recovery enabled | Upgrade to Pro+ plan |
| Encryption at rest | Enabled by default on Supabase cloud | Verify for self-hosted |
| TLS in transit | Supabase enforces TLS | Verify `?sslmode=require` in DB strings |

**Fix — GDPR user deletion:**
```sql
CREATE OR REPLACE FUNCTION public.delete_user()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  -- Verify caller is deleting themselves
  DELETE FROM public.profiles WHERE user_id = auth.uid();
  DELETE FROM public.user_content WHERE author_id = auth.uid();
  -- Anonymize where hard delete breaks foreign keys
  UPDATE public.orders
  SET user_id = NULL, email = 'deleted@deleted.invalid'
  WHERE user_id = auth.uid();
  -- Trigger auth.users deletion (Supabase handles cascade)
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_user() TO authenticated;
```

---

## Check 20 — Common Supabase CVEs and known attack patterns

**Risk: Critical when applicable**

```bash
# Check for exposed .supabase directory
find . -name "*.json" -path "*/.supabase/*" | head -10
git ls-files | grep "\.supabase/"

# Check for Supabase URL in client-side code (expected for anon key, not service key)
grep -rn "supabase\.co" src/ --include="*.ts" --include="*.js" | \
  grep -v "anon\|NEXT_PUBLIC\|public" | head -20

# Check for auth.users direct access (RLS doesn't apply to auth schema)
grep -rn "from auth.users\|auth\.users" supabase/migrations/ \
  --include="*.sql" | grep -v "^\s*--"
```

**Known attack patterns:**

| Pattern | Risk | Fix |
|---------|------|-----|
| `SELECT * FROM auth.users` in app | Exposes auth internals | Use `auth.uid()` + public profiles table |
| `raw_user_meta_data` for roles | User escalates own privileges | Use `raw_app_meta_data` — set server-side only |
| Signed URL with no expiry | Permanent file access link | Set short expiry: `expiresIn: 3600` |
| Service role in browser bundle | Full DB access client-side | Move to server/Edge Function |
| `LIMIT` without `OFFSET` on RLS-protected table | Row count oracle | Use cursor pagination |
| `count=exact` on large tables | DoS via full count scan | Use `count=planned` or `count=estimated` |
| Realtime on sensitive table, no RLS | All changes broadcast | Enable RLS on replicated tables |
| `supabase.auth.getUser()` vs `getSession()` | `getSession()` doesn't validate JWT server-side | Use `getUser()` for server-side auth checks |

**Critical: `getSession()` vs `getUser()`:**
```typescript
// ❌ WRONG for server-side — getSession() trusts client-sent JWT without re-validation
const { data: { session } } = await supabase.auth.getSession();

// ✅ CORRECT for server-side — getUser() calls Supabase Auth server to re-validate
const { data: { user }, error } = await supabase.auth.getUser();
if (error || !user) return new Response('Unauthorized', { status: 401 });
```

---

## Quick audit command bundle

```bash
TARGET_DB="postgresql://postgres:[password]@db.YOUR_PROJECT.supabase.co:5432/postgres"

echo "=== TABLES WITHOUT RLS ==="
psql "$TARGET_DB" -c "
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;"

echo "=== SECURITY DEFINER FUNCTIONS IN PUBLIC SCHEMA ==="
psql "$TARGET_DB" -c "
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prosecdef = true;"

echo "=== ALWAYS-TRUE POLICIES ==="
psql "$TARGET_DB" -c "
SELECT tablename, policyname FROM pg_policies
WHERE (qual = 'true' OR with_check = 'true') AND schemaname = 'public';"

echo "=== PUBLIC STORAGE BUCKETS ==="
psql "$TARGET_DB" -c "
SELECT id, name FROM storage.buckets WHERE public = true;"

echo "=== ANON GRANTS (tables anon can access) ==="
psql "$TARGET_DB" -c "
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public';"

echo "=== EXPOSED FUNCTIONS (rpc callable) ==="
psql "$TARGET_DB" -c "
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public';"
```

---

## Defect format

```
SUPA-DEFECT-N
Category:  [RLS | API Keys | Auth | Storage | Functions | PostgREST | Realtime | Roles | Secrets | Tenancy | Performance | Compliance]
Severity:  [Critical | High | Medium | Low | Info]
Check:     [Check number and name]
Location:  [table name / function name / file path]
Finding:   [exact finding — table name, policy name, key location]
Impact:    [what attacker can do]
Fix:       [SQL or code snippet ready to apply]
```

---

## Report structure

```
## Supabase Security Report — [project] — [date]

Mode: [1/2/3]  Postgres: [version]  Checks: [N/20]

### Critical findings (fix before next deploy)
### High findings (fix this sprint)
### Medium findings (fix this quarter)
### Low / Info

### Fix plan — ordered by severity
[SQL + code patches for each finding]

### Verification queries
[Re-run these after fixes to confirm remediation]
```
