---
name: postgres-deep-qa
description: Use when the database is PostgreSQL and you need PostgreSQL-specific checks beyond generic SQL audit — XID wraparound, autovacuum tuning, WAL configuration, PgBouncer gotchas, partitioning, JSONB indexes, advanced index types (BRIN/GiST/GIN/Bloom), extended statistics, logical replication slot bloat, RLS bypass vectors, pg_maintain role, PG16/PG17 features, CVE exposure, postgresql.conf tuning formulas, backup strategy (pgBackRest/Barman/WAL-G), and PostgreSQL-specific anti-patterns (NOT IN with NULLs, SERIAL vs IDENTITY, trust auth, search_path in SECURITY DEFINER).
---

# PostgreSQL Deep QA

## Mission

Act as a PostgreSQL DBA/security auditor. Run every check below. Cover configuration, storage internals, replication, security, indexing, query patterns, and version-specific CVEs. Produce one finding per issue, with exact remediation SQL or config change.

Run `sql-deep-qa` first for generic SQL checks. This skill adds PostgreSQL-only checks that go deeper.

---

## Check 1 — Version, CVE Exposure, and PG17 Feature Gaps

### Version audit

```sql
SELECT version();
SHOW server_version;
SHOW server_version_num;
```

### CVE table — verify patch level

| CVE | CVSS | Affected | Impact | Fixed in |
|-----|------|---------|--------|---------|
| CVE-2025-1094 | 8.1 | ≤ 17.3, 16.7, 15.11, 14.16, 13.19 | libpq quoting injection via invalid multibyte characters | 17.4, 16.8, 15.12, 14.17, 13.20 |
| CVE-2024-10979 | 8.8 | ≤ 17.0, 16.4, 15.8, 14.13, 13.16 | `PL/Perl` can set arbitrary env vars (code execution) | 17.1, 16.5, 15.9, 14.14, 13.17 |
| CVE-2024-7348 | 8.8 | ≤ 16.3, 15.7, 14.12 | Race condition in `pg_dump` allows arbitrary SQL | 16.4, 15.8, 14.13 |
| CVE-2024-0985 | 8.8 | ≤ 16.1, 15.5, 14.10, 13.13, 12.17 | `MERGE` command allows wrong-user policy bypass | 16.2, 15.6, 14.11, 13.14 |
| CVE-2026-2004 | 9.8 | ≤ 17.4 (PG internal) | Extension privilege escalation via `search_path` confusion | Patch in progress |
| CVE-2026-2005 | 9.1 | pgcrypto ≤ 1.3.2 | Heap buffer overflow in `pgp_sym_decrypt` | Upgrade pgcrypto |
| CVE-2026-2006 | 7.5 | ≤ 17.4 | `pg_read_file()` path traversal via symlinks | Restrict `pg_monitor` grants |
| CVE-2026-6477 | 7.4 | ≤ 17.4, logical replication | Logical replication slot can replay commands as superuser | 17.5 |
| CVE-2026-6475 | 7.5 | PgBouncer ≤ 1.23 | Auth passthrough with `scram-sha-256-plus` degradation | PgBouncer 1.24 |

```sql
-- Check installed extension versions
SELECT name, default_version, installed_version
FROM pg_available_extensions
WHERE installed_version IS NOT NULL
ORDER BY name;
```

### PG17 features to adopt

| Feature | Why it matters | How to enable |
|---------|----------------|--------------|
| `transaction_timeout` | Kills stuck multi-statement transactions (complements `statement_timeout`) | `SET transaction_timeout = '30s';` or in `postgresql.conf` |
| `pg_maintain` role | Grant `VACUUM/ANALYZE/REINDEX/CLUSTER` without superuser | `GRANT pg_maintain TO app_user;` |
| `sslnegotiation=direct` | Skip SSL negotiation round-trip (faster TLS) | In `pg_hba.conf` and connection string |
| Incremental backup | `pg_basebackup --incremental` reduces backup size/time | Requires `summarize_wal = on` in `postgresql.conf` |
| Failover replication slots | Slots follow primary after failover | `CREATE REPLICATION SLOT ... WITH (failover = true)` |
| `gen_uuid_v7()` | Time-ordered UUIDs — better index locality than UUIDv4 | `SELECT gen_uuid_v7();` (built-in, no extension needed) |

---

## Check 2 — XID Wraparound and Autovacuum Health

**Risk:** Table freeze failure → database shutdown after 2 billion transactions.

### Check wraparound risk

```sql
-- Tables at risk: warn >150M, critical >500M, emergency >1.5B
SELECT
  schemaname,
  relname,
  age(relfrozenxid) AS xid_age,
  pg_size_pretty(pg_total_relation_size(oid)) AS size,
  CASE
    WHEN age(relfrozenxid) > 1500000000 THEN 'EMERGENCY'
    WHEN age(relfrozenxid) > 500000000  THEN 'CRITICAL'
    WHEN age(relfrozenxid) > 150000000  THEN 'WARNING'
    ELSE 'OK'
  END AS status
FROM pg_class
WHERE relkind IN ('r','t','m')
ORDER BY age(relfrozenxid) DESC
LIMIT 20;

-- Database-level check
SELECT datname, age(datfrozenxid) AS xid_age
FROM pg_database
ORDER BY age(datfrozenxid) DESC;
```

### Autovacuum activity

```sql
-- Last autovacuum per table
SELECT
  schemaname, relname,
  last_vacuum, last_autovacuum,
  last_analyze, last_autoanalyze,
  n_dead_tup, n_live_tup,
  round(n_dead_tup::numeric / NULLIF(n_live_tup,0) * 100, 2) AS dead_ratio_pct
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;

-- Tables skipped by autovacuum (too large, threshold too high)
SELECT relname, reloptions
FROM pg_class
WHERE reloptions::text LIKE '%autovacuum%'
ORDER BY relname;
```

### Recommended autovacuum tuning (postgresql.conf)

```ini
# Aggressive defaults for high-churn tables
autovacuum_vacuum_scale_factor = 0.01        # 1% dead rows (default 0.2)
autovacuum_analyze_scale_factor = 0.005      # 0.5% changed rows (default 0.1)
autovacuum_vacuum_cost_delay = 2ms           # Less throttling (default 2ms PG13+)
autovacuum_max_workers = 5                   # More parallel workers
autovacuum_naptime = 15s                     # Check more often (default 60s)

# Per-table override for hot tables
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_vacuum_threshold = 100,
  autovacuum_analyze_scale_factor = 0.005
);
```

### Bloat detection

```sql
-- Dead tuple bloat (requires pg_stat_user_tables)
SELECT
  relname,
  pg_size_pretty(pg_relation_size(oid)) AS table_size,
  n_dead_tup,
  round(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;

-- Index bloat via pgstattuple (install extension first)
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT * FROM pgstatindex('idx_orders_user_id');
-- avg_leaf_density < 50% = bloated index → REINDEX CONCURRENTLY
```

---

## Check 3 — WAL Configuration and Replication

### WAL settings audit

```sql
SHOW wal_level;          -- must be 'replica' or 'logical' for replication
SHOW max_wal_senders;    -- must be > 0 for streaming replication
SHOW wal_keep_size;      -- minimum WAL retained (PG13+, replaces wal_keep_segments)
SHOW archive_mode;       -- 'on' or 'always' for PITR
SHOW archive_command;    -- must succeed; empty = no archiving
```

### Replication lag monitoring

```sql
-- Primary: replication slot status
SELECT
  slot_name, plugin, slot_type, active,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS lag_size,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) AS flush_lag
FROM pg_replication_slots;

-- Primary: connected standbys
SELECT
  application_name, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
  write_lag, flush_lag, replay_lag,
  sync_state
FROM pg_stat_replication;

-- Standby: current lag
SELECT
  now() - pg_last_xact_replay_timestamp() AS replication_lag,
  pg_is_in_recovery() AS is_standby;
```

### Logical replication slot disk bomb

```sql
-- Inactive slots accumulate WAL — can fill disk
SELECT slot_name, active, pg_size_pretty(
  pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)
) AS retained_wal
FROM pg_replication_slots
WHERE NOT active;
```

**Fix:** Set `max_slot_wal_keep_size = 20GB` in `postgresql.conf`. Drop stale inactive slots:

```sql
SELECT pg_drop_replication_slot('stale_slot_name');
```

### WAL recommended settings

```ini
wal_level = replica                    # or logical if needed
max_wal_size = 4GB                     # prevent checkpoint floods
checkpoint_completion_target = 0.9     # spread checkpoint I/O
wal_buffers = 64MB                     # match with shared_buffers size
max_slot_wal_keep_size = 20GB          # CRITICAL: prevent disk bomb from lagging slots
archive_mode = on
archive_command = 'pgbackrest --stanza=main archive-push %p'
```

---

## Check 4 — PgBouncer Configuration and Gotchas

### Mode compatibility matrix

| Feature | Session mode | Transaction mode | Statement mode |
|---------|-------------|-----------------|----------------|
| `SET` config vars | ✅ | ❌ Use `SET LOCAL` | ❌ |
| `LISTEN/NOTIFY` | ✅ | ❌ | ❌ |
| Temp tables | ✅ | ❌ | ❌ |
| Advisory locks (session) | ✅ | ❌ Use `pg_advisory_xact_lock` | ❌ |
| Prepared statements | ✅ | ⚠️ Use `server_reset_query_always=yes` | ❌ |
| RLS `current_setting()` | ✅ | ❌ Must re-set each transaction | ❌ |
| `pg_backend_pid()` unique | ✅ | ❌ Shared connections | ❌ |

### Critical gotchas

```sql
-- WRONG: RLS with transaction mode — config lost after transaction ends
SET app.current_user_id = 42;
CREATE POLICY user_isolation ON data
  USING (user_id = current_setting('app.current_user_id')::int);

-- CORRECT: Set at start of EVERY transaction
BEGIN;
SET LOCAL app.current_user_id = 42;
-- RLS evaluates current_setting() here — within same transaction
COMMIT;
```

```sql
-- WRONG: Session advisory locks with transaction mode PgBouncer
SELECT pg_advisory_lock(42);  -- lock released on connection return to pool

-- CORRECT: Transaction-scoped advisory locks
SELECT pg_advisory_xact_lock(42);  -- released on COMMIT/ROLLBACK
```

### PgBouncer audit queries

```ini
# pgbouncer.ini audit checklist
[pgbouncer]
pool_mode = transaction          # default for most apps
max_client_conn = 1000           # safe limit
default_pool_size = 25           # per database-user pair
auth_type = scram-sha-256        # NOT 'md5' or 'trust'
server_reset_query = DISCARD ALL # clean state between clients
ignore_startup_parameters = extra_float_digits  # common Rails/Go need
log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
```

---

## Check 5 — Table Partitioning Audit

### Discover partitioned tables

```sql
-- List partitioned tables and partition counts
SELECT
  p.schemaname, p.tablename,
  p.partitioned,
  count(c.relname) AS partition_count,
  pg_get_partkeydef(c.oid) AS partition_key
FROM pg_tables p
JOIN pg_class c ON c.relname = p.tablename
LEFT JOIN pg_inherits i ON i.inhparent = c.oid
LEFT JOIN pg_class cc ON cc.oid = i.inhrelid
WHERE c.relkind = 'p'
GROUP BY p.schemaname, p.tablename, p.partitioned, c.oid
ORDER BY partition_count DESC;
```

### Partition pruning validation

```sql
-- EXPLAIN must show "Partitions: ..." with subset, not full scan
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM orders_partitioned
WHERE created_at BETWEEN '2024-01-01' AND '2024-03-31';
-- Look for: "Partitions: orders_2024_q1" NOT "Partitions: all"
```

**Pruning failures:**
- Using `created_at::date` (cast prevents pruning — use direct range)
- Using `extract(year FROM created_at)` (function on partition key)
- `enable_partition_pruning = off` in `postgresql.conf`

### Partition-wise operations

```ini
# postgresql.conf — enable for large partition joins/aggregates
enable_partitionwise_join = on
enable_partitionwise_aggregate = on
```

```sql
-- Verify partition-wise join activates
EXPLAIN SELECT o.*, u.name
FROM orders_partitioned o
JOIN users_partitioned u ON u.id = o.user_id
WHERE o.created_at >= '2024-01-01';
-- Look for: "Parallel Hash" at partition level, not after merge
```

### Partition maintenance checklist

```sql
-- Detect missing future partitions (time-based)
-- Use pg_partman extension for automatic partition creation
CREATE EXTENSION IF NOT EXISTS pg_partman;
SELECT partman.create_parent(
  p_parent_table := 'public.orders',
  p_control := 'created_at',
  p_type := 'range',
  p_interval := 'monthly'
);
```

---

## Check 6 — JSONB and Advanced Indexing

### JSONB index strategy

```sql
-- jsonb_ops: supports @>, ?, ?|, ?& — larger index
CREATE INDEX idx_data_jsonb_ops ON events USING GIN (data);

-- jsonb_path_ops: supports @> only — 3-4× smaller, faster for containment
CREATE INDEX idx_data_path_ops ON events USING GIN (data jsonb_path_ops);

-- Expression index: for specific key access
CREATE INDEX idx_data_type ON events ((data->>'event_type'));
CREATE INDEX idx_data_user ON events ((data->'user'->>'id'));

-- JSONB path query — must use expression index
EXPLAIN SELECT * FROM events WHERE data->>'event_type' = 'click';
-- Expect: Index Scan on idx_data_type, NOT Seq Scan
```

### Index type selection guide

| Index type | Use when | Key check |
|-----------|---------|-----------|
| **B-tree** | Equality, range, ORDER BY | Default — always start here |
| **GIN** | Array `@>`, JSONB, full-text `@@`, `ANY()` | Check `gin_pending_list_limit` for fast-update overhead |
| **GiST** | Geometric, range overlap, nearest-neighbor | `&&`, `@>`, `<->` operators |
| **SP-GiST** | Partitioned search spaces (IP ranges, phone trie) | `inet_ops`, `text_ops` |
| **BRIN** | Very large tables where column is physically ordered | ONLY effective when `correlation` in `pg_stats` ≥ 0.9 |
| **Hash** | Equality-only, no range/ORDER BY | Faster than B-tree for equality when no range needed |
| **Bloom** | Multi-column equality filter, high cardinality | Lossy — false positives, must recheck; use only when B-tree bloated |

```sql
-- Verify BRIN correlation before creating BRIN index
SELECT attname, correlation
FROM pg_stats
WHERE tablename = 'your_table' AND attname = 'your_column';
-- If correlation < 0.9, BRIN will scan most pages anyway → use B-tree
```

### Unused and duplicate indexes

```sql
-- Unused indexes (never scanned)
SELECT
  schemaname, tablename, indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname NOT IN ('pg_catalog','pg_toast')
ORDER BY pg_relation_size(indexrelid) DESC;

-- Duplicate indexes (same columns, same order)
SELECT
  indrelid::regclass AS table,
  array_agg(indexrelid::regclass) AS indexes,
  array_agg(indkey) AS key_sets
FROM pg_index
GROUP BY indrelid, indkey
HAVING count(*) > 1;
```

### Extended statistics for cross-column correlations

```sql
-- Without extended stats: planner assumes independence
CREATE STATISTICS orders_region_status (ndistinct, dependencies, mcv)
ON region, status FROM orders;

ANALYZE orders;

-- Verify stats used in plan
EXPLAIN (ANALYZE, FORMAT JSON)
SELECT * FROM orders WHERE region = 'EU' AND status = 'shipped';
-- Look for: "Statistics Used" in JSON output
```

---

## Check 7 — Full-Text Search Audit

```sql
-- Check tsvector columns exist
SELECT tablename, attname, atttypid::regtype
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
WHERE atttypid = 'tsvector'::regtype
  AND NOT attisdropped;

-- Verify GIN index on tsvector column
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexdef LIKE '%tsvector%' OR indexdef LIKE '%to_tsvector%';

-- Anti-pattern: computing tsvector at query time (no index use)
-- BAD:  WHERE to_tsvector('english', body) @@ plainto_tsquery('search')
-- GOOD: WHERE search_vector @@ plainto_tsquery('english', 'search')
--       (with GIN index on search_vector)

-- Check text search config
SELECT cfgname, cfgparser FROM pg_ts_config;
SHOW default_text_search_config;

-- Rank check: ts_rank or ts_rank_cd?
-- ts_rank_cd respects cover density (position proximity) — better for relevance
```

---

## Check 8 — Lock Monitoring and Deadlock Detection

```sql
-- Current blocked queries
SELECT
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_statement,
  blocking_activity.query AS current_blocking_stmt,
  now() - blocked_activity.query_start AS blocked_duration
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- Long-running transactions (holding locks)
SELECT pid, usename, state, query_start, now() - query_start AS duration, query
FROM pg_stat_activity
WHERE state != 'idle'
  AND (now() - query_start) > interval '5 minutes'
ORDER BY duration DESC;

-- Lock contention per table
SELECT relation::regclass, mode, count(*)
FROM pg_locks
WHERE granted
GROUP BY relation, mode
ORDER BY count DESC;
```

### Lock timeout enforcement

```sql
-- Verify timeout settings
SHOW lock_timeout;        -- should be > 0 in app sessions (e.g., '5s')
SHOW statement_timeout;   -- kill runaway queries
SHOW transaction_timeout; -- PG17+ kill stuck multi-statement transactions

-- Safe DDL pattern (zero-downtime migration)
SET lock_timeout = '2s';
SET statement_timeout = '30s';
ALTER TABLE orders ADD COLUMN processed_at TIMESTAMPTZ;  -- instant, no default
-- Adding NOT NULL DEFAULT inline in PG11+ is safe (metadata-only for literal defaults)
```

---

## Check 9 — Row Level Security (RLS) Bypass Vectors

**All 11 documented bypass vectors:**

| # | Bypass vector | Detection query | Fix |
|---|--------------|----------------|-----|
| 1 | Superuser always bypasses RLS | `SELECT rolsuper FROM pg_roles WHERE rolname = 'app_user';` | Use non-superuser for app connections |
| 2 | Table owner bypasses unless FORCE | `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'users';` | `ALTER TABLE users FORCE ROW LEVEL SECURITY;` |
| 3 | `SECURITY DEFINER` view bypasses underlying table RLS | Inspect view definitions for SECURITY DEFINER | Change to `SECURITY INVOKER` or apply RLS to view |
| 4 | `COPY FROM` bypasses RLS (PG < 16) | `SHOW server_version_num;` | Upgrade to PG16+; restrict `pg_read_server_files` |
| 5 | PgBouncer transaction mode loses `SET` config | Check pool mode and RLS policy using `current_setting()` | Use `SET LOCAL` inside transaction |
| 6 | Missing `WITH CHECK` allows INSERT/UPDATE bypass | `SELECT polname, polcmd, polwithcheck IS NULL FROM pg_policy;` | Add `WITH CHECK` clause to INSERT/UPDATE policies |
| 7 | Non-`LEAKPROOF` functions expose data through error messages | `SELECT proname, proleakproof FROM pg_proc WHERE proname = 'sensitive_func';` | Mark functions `LEAKPROOF` or restructure |
| 8 | Multiple permissive policies evaluated with `OR` — one bypass = full bypass | `SELECT count(*) FROM pg_policy WHERE polpermissive GROUP BY polrelid HAVING count(*) > 1;` | Audit OR semantics; use `RESTRICTIVE` policy for deny rules |
| 9 | Materialized view refresh bypasses RLS | `SELECT matviewname FROM pg_matviews;` | Refresh only via privileged maintenance role |
| 10 | FK constraint leakage — error reveals existence of parent row | Test referential integrity errors from low-priv user | Add RLS to parent table too |
| 11 | Unique constraint leakage — conflict reveals existence of row | Test unique violation from low-priv user | Add RLS to table; consider `ON CONFLICT DO NOTHING` |

```sql
-- Quick RLS audit: tables without policies but with RLS enabled
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relrowsecurity = true
  AND oid NOT IN (SELECT polrelid FROM pg_policy)
  AND relkind = 'r';
-- These tables have RLS ON but no policies → DENY ALL (correct if intentional, dangerous if not)

-- Tables that should have RLS but don't
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'orders', 'messages', 'documents', 'profiles')
  AND tablename NOT IN (SELECT relname FROM pg_class WHERE relrowsecurity = true);
```

---

## Check 10 — Sequences and IDENTITY Columns

### Overflow detection

```sql
-- Sequences at risk of overflow
SELECT
  n.nspname AS schema,
  c.relname AS sequence_name,
  s.seqtypid::regtype AS data_type,
  s.seqmax AS max_value,
  last_value,
  round(last_value::numeric / s.seqmax * 100, 2) AS pct_used
FROM pg_sequence s
JOIN pg_class c ON c.oid = s.seqrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_sequences ps ON ps.sequencename = c.relname AND ps.schemaname = n.nspname
WHERE s.seqtypid = 'integer'::regtype  -- INT4 max = 2,147,483,647
ORDER BY pct_used DESC;

-- Tables using SERIAL (INT4 SERIAL → overflow at 2.1B rows)
SELECT tablename, attname, atttypid::regtype, attidentity, atthasdef
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_tables t ON t.tablename = c.relname
WHERE atttypid = 23  -- int4
  AND atthasdef = true
  AND attidentity = ''
  AND NOT attisdropped
  AND t.schemaname = 'public';
```

### SERIAL vs IDENTITY

```sql
-- WRONG: SERIAL (legacy, no SQL standard)
CREATE TABLE orders (id SERIAL PRIMARY KEY);

-- CORRECT: IDENTITY (SQL standard, PG10+)
CREATE TABLE orders (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY);

-- UUIDv7 (PG17+): time-ordered, better B-tree locality than UUIDv4
CREATE TABLE events (id UUID DEFAULT gen_uuid_v7() PRIMARY KEY);
```

---

## Check 11 — Foreign Data Wrappers (FDW) Security

```sql
-- Audit installed FDWs
SELECT fdwname, fdwhandler::regproc, fdwvalidator::regproc
FROM pg_foreign_data_wrapper;

-- Foreign server credentials — check for plaintext passwords
SELECT srvname, srvoptions  -- may show host/port but NOT password
FROM pg_foreign_server;

-- User mappings (can expose credentials to wrong users)
SELECT
  um.umuser::regrole AS mapped_user,
  fs.srvname AS server,
  um.umoptions  -- password may appear here if not using service files
FROM pg_user_mappings um
JOIN pg_foreign_server fs ON fs.oid = um.umserver
WHERE um.umuser != 0;

-- Check FDW access control
SELECT grantee, privilege_type
FROM information_schema.role_usage_grants
WHERE object_type = 'FOREIGN DATA WRAPPER';
```

**FDW security checklist:**
- [ ] No plaintext passwords in `umoptions` (use `.pgpass` or `pg_service.conf`)
- [ ] `USAGE` privilege on foreign server granted only to needed roles
- [ ] `postgres_fdw` with `fetch_size` set (default 100 rows per fetch — tune for bulk queries)
- [ ] `file_fdw` access restricted to `pg_read_server_files` role members only

---

## Check 12 — Extensions Audit

```sql
-- All installed extensions
SELECT name, default_version, installed_version, comment
FROM pg_available_extensions
WHERE installed_version IS NOT NULL
ORDER BY name;
```

### High-risk extensions

| Extension | Risk | Check |
|----------|------|-------|
| `plpythonu` / `plperlU` / `pltclu` | Untrusted procedural languages — can execute arbitrary OS commands | Should not exist in production unless explicitly required |
| `dblink` | Can connect to other databases; security definer functions | Restrict via `pg_hba.conf` per-database; audit `dblink_connect` calls |
| `file_fdw` | Reads files from server filesystem | Only grant `USAGE` to privileged roles |
| `pg_read_server_files` | Reads arbitrary files via `COPY FROM` | Should not be granted to app roles |
| `adminpack` | Admin functions including server file access | Remove if not used by DBA only |

### Recommended extensions

```sql
-- pg_stat_statements: query performance tracking (MUST have)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- Add to postgresql.conf:
-- shared_preload_libraries = 'pg_stat_statements'
-- pg_stat_statements.track = all

-- pgcrypto: cryptographic functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_trgm: trigram similarity for LIKE/ILIKE speedup
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_name_trgm ON users USING GIN (name gin_trgm_ops);
-- Now: WHERE name ILIKE '%search%' uses index

-- pgvector: vector embeddings for AI features
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX idx_embeddings_hnsw ON items USING hnsw (embedding vector_cosine_ops);
```

---

## Check 13 — Monitoring Queries

```sql
-- Cache hit rate (must be > 99%)
SELECT
  sum(heap_blks_read) AS heap_read,
  sum(heap_blks_hit) AS heap_hit,
  round(sum(heap_blks_hit) * 100.0 / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) AS cache_hit_pct
FROM pg_statio_user_tables;

-- Connection saturation
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE state = 'active') AS active,
  count(*) FILTER (WHERE state = 'idle') AS idle,
  count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_tx,
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections,
  round(count(*) * 100.0 / (SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 2) AS pct_used
FROM pg_stat_activity
WHERE pid != pg_backend_pid();

-- Slowest queries (pg_stat_statements required)
SELECT
  round(mean_exec_time::numeric, 2) AS avg_ms,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  rows,
  substring(query, 1, 120) AS query
FROM pg_stat_statements
WHERE calls > 100
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Table sizes with dead tuple overhead
SELECT
  relname,
  pg_size_pretty(pg_total_relation_size(oid)) AS total_size,
  pg_size_pretty(pg_relation_size(oid)) AS table_size,
  pg_size_pretty(pg_total_relation_size(oid) - pg_relation_size(oid)) AS index_size
FROM pg_class
WHERE relkind = 'r'
  AND relnamespace = 'public'::regnamespace
ORDER BY pg_total_relation_size(oid) DESC
LIMIT 20;

-- Unused indexes (cost with no benefit)
SELECT
  indexrelname,
  relname AS table,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
JOIN pg_index USING (indexrelid)
WHERE idx_scan < 50
  AND NOT indisunique
  AND NOT indisprimary
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

## Check 14 — Backup Strategy Audit

### Tool comparison

| Tool | Best for | Key features |
|------|---------|-------------|
| `pg_dump` / `pg_restore` | Logical backup, selective restore | SQL/custom format, parallel `-j`, cross-version restore |
| `pg_basebackup` | Physical streaming backup | `--incremental` (PG17), `--checkpoint=fast`, WAL streaming |
| **pgBackRest** | Production primary choice | Parallel compress, full/diff/incr, S3/Azure/GCS, retention policies, repo encryption |
| **Barman** | Enterprise PostgreSQL backup | Catalog-based, SSH or streaming, WAL streaming + archiving, PG17 incremental |
| **WAL-G** | Cloud-native, lightweight | S3/GCS/Azure, wal-push/wal-fetch integration, delta backup, Go binary |

### Backup audit queries

```sql
-- Check archive status
SELECT archived_count, last_archived_wal, last_archived_time,
       failed_count, last_failed_wal, last_failed_time
FROM pg_stat_archiver;
-- failed_count > 0 = CRITICAL — WAL gaps possible

-- Verify continuous archiving
SELECT pg_current_wal_lsn(), pg_walfile_name(pg_current_wal_lsn());
```

### Backup checklist

- [ ] Physical backup tested for restore (not just backup — test `pg_restore`)
- [ ] PITR recovery tested: restore to point 1 hour ago
- [ ] `pg_stat_archiver.failed_count = 0`
- [ ] RPO documented and backup frequency matches
- [ ] Backup encryption enabled (pgBackRest `repo-cipher-type=aes-256-cbc`)
- [ ] Backup stored off-site or in separate cloud region
- [ ] `pg_basebackup --summarize-wal = on` if using PG17 incremental

---

## Check 15 — postgresql.conf Tuning Audit

```sql
-- Check current settings vs recommended
SELECT name, setting, unit, context
FROM pg_settings
WHERE name IN (
  'shared_buffers', 'work_mem', 'maintenance_work_mem',
  'effective_cache_size', 'wal_buffers', 'max_connections',
  'checkpoint_completion_target', 'max_wal_size',
  'random_page_cost', 'effective_io_concurrency',
  'log_min_duration_statement', 'log_lock_waits',
  'log_temp_files', 'log_checkpoints',
  'ssl', 'password_encryption', 'transaction_timeout'
)
ORDER BY name;
```

### Tuning formulas

```ini
# MEMORY (adjust to total RAM)
shared_buffers = 25% RAM                 # e.g., 8GB on 32GB server
effective_cache_size = 75% RAM           # planner estimate of OS+PG cache
work_mem = RAM / (max_connections * 3)   # e.g., 32GB / (100*3) = ~100MB
maintenance_work_mem = 512MB             # for VACUUM, CREATE INDEX

# WAL AND CHECKPOINTS
wal_buffers = 64MB
max_wal_size = 4GB
checkpoint_completion_target = 0.9
wal_compression = on                     # reduces WAL size ~50% for most workloads

# SSD TUNING
random_page_cost = 1.1                   # default 4.0 is for spinning disks
effective_io_concurrency = 200           # SSD IOPS / parallel workers

# LOGGING (required for audit compliance)
log_min_duration_statement = 1000        # log queries > 1s
log_lock_waits = on
log_temp_files = 0                       # log all temp file creation
log_checkpoints = on
log_autovacuum_min_duration = 1000

# SECURITY
ssl = on
password_encryption = scram-sha-256
transaction_timeout = 30s               # PG17+
```

---

## Check 16 — PostgreSQL-Specific Anti-Patterns

| Anti-pattern | Impact | Fix |
|-------------|--------|-----|
| `NOT IN` with nullable column | Returns 0 rows if subquery has any NULL | Use `NOT EXISTS` or `... IS DISTINCT FROM` |
| `timestamp without time zone` for global apps | DST bugs, ambiguous during clock changes | `TIMESTAMPTZ` everywhere; convert at UI layer |
| `BETWEEN` with timestamps | Inclusive end causes off-by-one (`BETWEEN '2024-01-01' AND '2024-01-31'` misses end of day) | Use `>= '2024-01-01' AND < '2024-02-01'` |
| `SERIAL` for primary keys | INT4 overflows at 2.1B; not SQL standard | `BIGINT GENERATED ALWAYS AS IDENTITY` |
| `trust` auth in pg_hba.conf | Any OS user can connect as any PG user | `scram-sha-256` mandatory |
| Missing `search_path` in `SECURITY DEFINER` functions | Attacker creates malicious object in user's schema | Add `SET search_path = pg_catalog, public` in function header |
| Session advisory locks with PgBouncer transaction mode | Lock released when connection returned to pool | `pg_advisory_xact_lock()` instead |
| `SELECT COUNT(*)` for existence check | Full table scan or full index scan | `SELECT EXISTS(SELECT 1 FROM t WHERE ...)` |
| `OFFSET` for deep pagination | Full table scan to skip rows | Keyset pagination (`WHERE id > last_seen_id`) |
| `CREATE INDEX` (blocking) on live table | Blocks all writes until complete | `CREATE INDEX CONCURRENTLY` |
| `ALTER TABLE ADD COLUMN DEFAULT expr` (PG < 11) | Table rewrite — full lock | PG11+: literal defaults are metadata-only; expressions still rewrite |
| Implicit type coercion in WHERE (e.g., `WHERE id = '42'`) | Index unusable if column is integer | Match types exactly; use `::` cast in bind params |
| `SELECT *` in application queries | Over-fetches data, breaks column rename safety | Enumerate required columns |
| Unlogged tables for non-temporary data | Data lost on crash/failover | Only use for true temporary/cache data |

```sql
-- Detect NOT IN with nullable: check if subquery column is nullable
SELECT
  t.tablename, a.attname, a.attnotnull
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_tables t ON t.tablename = c.relname
WHERE NOT a.attnotnull
  AND NOT a.attisdropped
  AND t.schemaname = 'public'
ORDER BY t.tablename, a.attnum;
-- Review application code for NOT IN using these nullable columns

-- Detect timestamp without time zone columns
SELECT
  table_name, column_name, data_type
FROM information_schema.columns
WHERE data_type = 'timestamp without time zone'
  AND table_schema = 'public'
ORDER BY table_name;
```

---

## Check 17 — Compliance and Audit Logging

```sql
-- Check pgaudit is installed and configured
SHOW pgaudit.log;         -- should include: 'ddl, write, role'
SHOW pgaudit.log_level;   -- 'log' or 'warning'
SHOW pgaudit.log_client;

-- Verify audit logging reaches log file (not just syslog)
SHOW log_destination;
SHOW logging_collector;
SHOW log_directory;

-- Required pgaudit settings for compliance
-- postgresql.conf:
-- shared_preload_libraries = 'pgaudit'
-- pgaudit.log = 'ddl, write, role, connection'
-- pgaudit.log_catalog = on
-- pgaudit.log_relation = on
-- pgaudit.log_parameter = on
```

### Compliance requirement map

| Regulation | Minimum logging | Retention |
|-----------|----------------|-----------|
| PCI DSS 4.0 | All admin access, all queries on cardholder data tables | 12 months |
| HIPAA | PHI table access (read + write), role changes, login failures | 6 years |
| SOC 2 Type II | DDL, DML on sensitive tables, role changes, login success/fail | 12 months |
| GDPR | Personal data read/write, data exports, deletion, role grants | Documentation required; no fixed term |

---

## Defect format

```md
### PG-DEFECT-<number>: <title>

Category:
<Check number: e.g., Check 2 — XID Wraparound>

Severity:
<Critical / High / Medium / Low>

PostgreSQL version:
<version>

Evidence:
- Query run: ...
- Result: ...

Expected:
...

Actual:
...

Risk:
...

Fix:
<exact SQL or postgresql.conf change>

Verify with:
<verification query or command>
```

---

## Severity definitions

**Critical:**
- XID wraparound imminent (age > 1.5B)
- Inactive replication slot filling disk
- `trust` auth on network-accessible host
- CVE unpatched with CVSS ≥ 8.0
- `pg_stat_archiver.failed_count > 0` (WAL gaps)
- RLS bypassed for multi-tenant application

**High:**
- XID age > 500M
- INT4 SERIAL sequence > 80% used
- `max_slot_wal_keep_size` not set
- Superuser used for application connections
- No backup or backup not tested
- LEAKPROOF not set on RLS security functions

**Medium:**
- Autovacuum not running on high-churn tables
- Unused large indexes
- BRIN index on low-correlation column
- Missing extended statistics causing bad plans
- PgBouncer transaction mode with `SET` instead of `SET LOCAL`
- `work_mem` default (4MB) on complex query workload

**Low:**
- `SERIAL` instead of `BIGINT GENERATED ALWAYS AS IDENTITY`
- `timestamp without time zone` in non-critical tables
- Missing `log_min_duration_statement`
- pgaudit not installed (non-compliance-regulated environment)

---

## Final report format

```md
# PostgreSQL Deep QA Report

Target database: <connection string, no password>
PostgreSQL version: <version>
Date: <date>
Run by: <role>

## Summary

| Category | Status | Critical | High | Medium | Low |
|----------|--------|---------|------|--------|-----|
| Check 1 — Version/CVE | ... | ... | ... | ... | ... |
| Check 2 — XID/Autovacuum | ... | ... | ... | ... | ... |
| Check 3 — WAL/Replication | ... | ... | ... | ... | ... |
| Check 4 — PgBouncer | ... | ... | ... | ... | ... |
| Check 5 — Partitioning | ... | ... | ... | ... | ... |
| Check 6 — Indexes/JSONB | ... | ... | ... | ... | ... |
| Check 7 — Full-Text Search | ... | ... | ... | ... | ... |
| Check 8 — Lock Monitoring | ... | ... | ... | ... | ... |
| Check 9 — RLS Bypass Vectors | ... | ... | ... | ... | ... |
| Check 10 — Sequences/IDENTITY | ... | ... | ... | ... | ... |
| Check 11 — FDW Security | ... | ... | ... | ... | ... |
| Check 12 — Extensions | ... | ... | ... | ... | ... |
| Check 13 — Monitoring | ... | ... | ... | ... | ... |
| Check 14 — Backup | ... | ... | ... | ... | ... |
| Check 15 — postgresql.conf | ... | ... | ... | ... | ... |
| Check 16 — Anti-patterns | ... | ... | ... | ... | ... |
| Check 17 — Compliance/Audit | ... | ... | ... | ... | ... |

## Defects

[PG-DEFECT-1 through PG-DEFECT-N ordered by severity]

## Fix priority order

[P1: Critical fixes with exact SQL]
[P2: High fixes]
[P3: Medium and Low fixes]

## Not tested

[List any checks skipped and why]
```
