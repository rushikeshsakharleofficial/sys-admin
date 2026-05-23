---
name: smart-todo
description: MANDATORY for any task with 3+ steps — activate before starting work, not after. Use throughout to update status, add discovered steps, and surface blockers. Never skip for "simple" or "quick" work if it has 3+ steps.
---

# Smart Todo

## Core principle

One list per task session. Create it immediately. Update it in real time — never let the list lag behind the actual work.

## Lifecycle

```
Receive task → Decompose → Write list → Work item by item → Update status as you go → Report on completion
```

Never finish a step without marking it. Never discover a new step without adding it.

---

## Step 1 — Decompose before writing

Before writing the list, mentally verify:

- Each item is a single atomic action (one file, one command, one decision)
- Items are in dependency order (blockers listed before dependents)
- No item mixes "do X and Y" — split those
- Estimated size: 5–20 items is ideal; if >20, group into phases

## Step 2 — Write the list

Use TodoWrite. Format:

```
[PRIORITY] Description  (context: file or component if relevant)
```

Priority values:
- `[P1]` — must do, blocks everything else
- `[P2]` — core work
- `[P3]` — nice to have / cleanup
- `[BLOCKER]` — waiting on something external

Status values Claude Code uses: `pending`, `in_progress`, `completed`

**Rule: Only ONE item is `in_progress` at a time.** Set the previous to `completed` before starting the next.

## Step 3 — Update in real time

| Event | Action |
|-------|--------|
| Start an item | Set status → `in_progress` |
| Finish an item | Set status → `completed` immediately |
| Discover a new required step | TodoWrite: add it, set correct priority |
| Hit a blocker | Add `[BLOCKER]` item describing what's needed |
| Scope expands | Add new items; do NOT silently expand existing ones |
| Item turns out irrelevant | Mark `completed` with note "(skipped — not needed)" |

## Step 4 — Completion summary

When all `[P1]` and `[P2]` items are `completed`, report:

```
✅ Done: N items completed
⏭  Skipped: N items (reason)
🚧 Remaining: N items (P3 / deferred)
🔴 Blockers: N items (what's needed)
```

---

## Smart decomposition patterns

### For "build feature X"
```
[P1] Understand existing code shape (read relevant files)
[P1] Write failing test
[P1] Implement minimal code to pass test
[P1] Run tests — verify green
[P2] Handle edge cases
[P2] Add error handling
[P2] Update docs/types if affected
[P3] Refactor if needed
[P1] Commit
```

### For "fix bug X"
```
[P1] Reproduce the bug (confirm it exists)
[P1] Identify root cause (don't fix symptoms)
[P1] Write failing test that captures the bug
[P1] Fix
[P1] Verify test passes + no regressions
[P2] Check for same pattern elsewhere in codebase
[P1] Commit
```

### For "audit / review X"
```
[P1] Discover scope (list files/routes/tables to cover)
[P1] Phase 1 check: [specific category]
[P1] Phase 2 check: [specific category]
[P2] Phase N check: [specific category]
[P1] Write findings report
[P2] Prioritize findings by severity
```

### For "set up / configure X"
```
[P1] Verify prerequisites (versions, dependencies)
[P1] Install/configure
[P1] Verify works with minimal test
[P2] Configure for environment (dev/staging/prod differences)
[P2] Document what was set up and why
[P1] Commit config
```

---

## Rules that must not break

1. **Never work without a list** — if 3+ steps exist, list exists.
2. **Never let completed work stay `pending`** — update immediately or the list becomes noise.
3. **Never mark `completed` before the work is actually done** — no optimistic completion.
4. **One `in_progress` at a time** — parallel work confuses status.
5. **Add discovered items immediately** — don't hold them in memory.
6. **Blockers are explicit** — don't silently stall; add a `[BLOCKER]` item.

---

## Quick reference

```
Start session  → TodoWrite: full decomposed list, all pending
Start item     → TodoWrite: item → in_progress
Finish item    → TodoWrite: item → completed  ← do this BEFORE moving on
New discovery  → TodoWrite: add item
Blocked        → TodoWrite: add [BLOCKER] item
Done           → Report: completed / skipped / remaining / blockers
```
