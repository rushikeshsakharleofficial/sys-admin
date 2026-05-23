# Agent Allocation Rules

When dispatching sub-agents in this repo, pick the **most constrained agent that can do the job**.
Wider scope = more context = slower + more likely to drift. Match agent to task scope.

---

## Decision table

| Task | Agent | Why |
|------|-------|-----|
| Write or edit a single helper file (`helpers/*.ts`) | `caveman:cavecrew-builder` | Surgical 1-2 file scope; refuses to grow |
| Edit `ui-deep-qa.spec.ts` only | `caveman:cavecrew-builder` | Single file, bounded edit |
| Edit `fix-plan.ts` only | `caveman:cavecrew-builder` | Single file, bounded edit |
| Find where a function is defined / all callers | `caveman:cavecrew-investigator` | Read-only locator; returns file:line table |
| Locate a pattern across all helpers | `caveman:cavecrew-investigator` | Fan-out grep; no file dumps |
| Review a PR, diff, or single file for bugs | `caveman:cavecrew-reviewer` | One-line-per-finding; no scope creep |
| Write 2+ new files that interact (e.g. new helper + spec wiring) | `general-purpose` | Can coordinate multi-file context |
| Explore unknown area of codebase (broad, read-only) | `Explore` | Reads excerpts across many files; saves context |
| Design a new helper or refactor strategy | `Plan` | Architecture focus; no writes |
| Everything else | `claude` (default) | Catch-all |

---

## Hard rules

### 1. cavecrew-builder for all helper writes
**Always** use `caveman:cavecrew-builder` when the task is writing or editing files under
`tests/deep-ui/helpers/`. Even if the prompt looks complex — the agent hard-refuses 3+ file
scope, which is exactly right for a helper.

### 2. Never dispatch general-purpose for a single-file task
If the task is "edit X in file Y", that is `cavecrew-builder` scope.
Reaching for `general-purpose` on a 1-file edit wastes context and invites scope creep.

### 3. Parallel dispatch for independent helpers
When adding N independent helpers, dispatch N `cavecrew-builder` agents **in the same message**.
They run concurrently. Do NOT chain them (sequential is 3-5× slower).

```
# GOOD — 3 concurrent builders
Agent(sidebar.ts) + Agent(dialog-scroll.ts) + Agent(form-alignment.ts)  ← same message

# BAD — sequential
Agent(sidebar.ts) → wait → Agent(dialog-scroll.ts) → wait → Agent(form-alignment.ts)
```

### 4. Wiring is a main-thread job
After helpers are written by sub-agents, the **main thread** does the wiring:
- Import in `ui-deep-qa.spec.ts`
- Call site + variable extraction
- Markdown summary line
- `expect(...)` assertions
- `FIX_RECOMMENDATIONS` entries + ingest function + wire in `writeFixPlan`

Do NOT dispatch a builder agent to wire helpers — it will not have the context of what
other agents wrote simultaneously.

### 5. Always typecheck after wiring
```bash
npm run typecheck
```
Run this before rsync and before commit. A clean typecheck is the gate.

### 6. Always rsync after typecheck passes
```bash
rsync -a --delete /path/to/repo/ ~/.claude/skills/website-ui-deep-qa/ \
  --exclude='.git' --exclude='node_modules' --exclude='qa-artifacts'
```
The installed skill at `~/.claude/skills/website-ui-deep-qa/` must stay in sync.

---

## Helper prompt template (cavecrew-builder)

When dispatching a builder to write a new helper, include ALL of the following:

```
Write /path/to/helpers/<name>.ts

Export: `audit<Name>(page: Page, route: string): Promise<<Name>Report>`

Types to export:
  <Name>Finding: { severity: 'high'|'medium'|'low'|'info'; type: string; message: string; selector?: string }
  <Name>Report:  { route: string; <field>: ...; findings: <Name>Finding[] }

Checks:
1. [check description — what to detect, what selector/API to use]
2. ...

Rules:
- Early-exit guard: cheap `page.evaluate(() => document.querySelector(...) !== null)` first
- Batch all DOM reads into ONE page.evaluate() round-trip where possible
- Max 2 screenshots (screenshotStep): one on detection, one on first HIGH finding
- Never navigate, never submit forms, never create data
- Each check wrapped in try/catch — one failing check must not abort others
- Artifact: writeJsonArtifact('<folder>', `${routeName}-<name>.json`, report)
- Severity HIGH for: [list your HIGH conditions]
- Import: Page from @playwright/test; screenshotStep, writeJsonArtifact, normalizeRoute

Do not edit any other file.
```

---

## Scope escalation guide

If a builder agent returns "scope exceeds 2 files" or refuses:
1. Split the task — one agent per file
2. Or promote to `general-purpose` only if files genuinely cannot be split

Never force a builder to work outside its scope — it will produce lower quality output.
