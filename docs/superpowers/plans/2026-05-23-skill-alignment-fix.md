# Skill Alignment Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all documentation mismatches between SKILL.md, CLAUDE.md and the actual helper files on disk.

**Architecture:** Documentation-only fixes across two files. No TypeScript changes. All 5 mismatches are in SKILL.md and CLAUDE.md; zero code changes needed.

**Tech Stack:** Markdown only — Edit tool, no npm/tsc required.

---

## Mismatch Summary

| # | File | Mismatch |
|---|------|----------|
| 1 | SKILL.md:8 | Table title "40 helper categories" — should be "44" |
| 2 | SKILL.md:10–52 | Quick Reference table missing sidebar, dialog-scroll, form-alignment, typography rows |
| 3 | SKILL.md:1197 | Early-exit list missing sidebar, dialog-scroll, form-alignment |
| 4 | SKILL.md:1209–1218 | Deferred helpers table missing sidebar, dialog-scroll, form-alignment |
| 5 | CLAUDE.md:33–51 | Architecture helpers list missing 30+ helpers added post-initial-commit |

---

### Task 1: Fix Quick Reference table title + add 4 missing rows

**Files:**
- Modify: `SKILL.md` (lines 8, 51 area)

- [ ] **Step 1: Fix the title count**

In `SKILL.md`, change line 8:

```
## Quick Reference — 40 helper categories
```
to:
```
## Quick Reference — 44 helper categories
```

- [ ] **Step 2: Add 4 missing rows to the Quick Reference table**

In `SKILL.md`, the table currently ends at line 52 with:
```
| Print media | print-media.ts | print-media/ | — |
```

Add these 4 rows immediately after that line, before the blank line:
```markdown
| Sidebar | sidebar.ts | sidebar/ | ✅ |
| Dialog scroll | dialog-scroll.ts | dialog-scroll/ | ✅ |
| Form alignment | form-alignment.ts | form-alignment/ | ✅ |
| Typography | typography.ts | typography/ | ✅ |
```

- [ ] **Step 3: Verify count**

Count rows in the table (excluding header + separator). Should be exactly 44.

```bash
grep -c "^|" SKILL.md | head -1
# Not accurate — better:
grep "^| " SKILL.md | grep -v "Category\|---" | wc -l
# Expected: 44
```

- [ ] **Step 4: Commit**

```bash
git add SKILL.md
git commit -m "docs: fix Quick Reference table — 40→44 categories, add sidebar/dialog-scroll/form-alignment/typography rows"
```

---

### Task 2: Fix SKILL.md early-exit helper list

**Files:**
- Modify: `SKILL.md` (line 1197)

- [ ] **Step 1: Extend the early-exit list**

In `SKILL.md`, change line 1197:
```
Apply this pattern to: carousels, media players, tables, forms, toasts, overlays, search, auth surface.
```
to:
```
Apply this pattern to: carousels, media players, tables, forms, toasts, overlays, search, auth surface, sidebar, dialog scroll, form alignment.
```

- [ ] **Step 2: Commit**

```bash
git add SKILL.md
git commit -m "docs: add sidebar/dialog-scroll/form-alignment to early-exit pattern list"
```

---

### Task 3: Add 3 entries to SKILL.md deferred helpers table

**Files:**
- Modify: `SKILL.md` (lines 1209–1218)

- [ ] **Step 1: Add deferred helper rows**

In `SKILL.md`, the deferred helpers table currently ends with:
```
| `auditToasts` | toast/alert role element detected |
```

Add 3 rows immediately after:
```markdown
| `auditSidebar` | sidebar/nav element (`aside`, `[role="navigation"]`, `[class*="sidebar"]`) detected |
| `auditDialogScroll` | dialog/modal element (`[role="dialog"]`, `dialog`, `[class*="modal"]`) detected |
| `auditFormAlignment` | form element (`form`, `[role="form"]`) detected |
```

- [ ] **Step 2: Commit**

```bash
git add SKILL.md
git commit -m "docs: add auditSidebar/auditDialogScroll/auditFormAlignment to deferred helpers table"
```

---

### Task 4: Update CLAUDE.md architecture helpers list

**Files:**
- Modify: `CLAUDE.md` (lines 33–51)

- [ ] **Step 1: Replace the incomplete helpers list**

In `CLAUDE.md`, replace the current helpers block:
```
  helpers/
    routes.ts           ← seedRoutes[], discoverLinks(), normalizeRoute()
    screenshots.ts      ← screenshotStep(), fullPageScreenshot(), visualRegression()
    network.ts          ← attachNetworkMonitor(), scanResponsesForLeaks(), assertNetworkHealthy()
    storage.ts          ← collectStorageState(), writeStorageReport()
    layout.ts           ← collectLayoutIssues()
    interactions.ts     ← testVisibleButtons(), testVisibleLinks()
    accessibility.ts    ← collectAccessibilityIssues(), collectKeyboardFocusOrder()
    console.ts          ← attachConsoleMonitor(), severeConsoleFindings()
    performance.ts      ← collectPerformanceSnapshot(), poorWebVitals()
    forms.ts            ← auditForms(), triggerAndCaptureValidation()
    overlays.ts         ← discoverAndAuditOverlays()
    seo.ts              ← auditSeo()
    security.ts         ← auditDomSecurity(), auditSecurityHeaders(), auditMixedContent()
    report.ts           ← appendMarkdownReport(), writeJsonArtifact()
```

with the complete list:
```
  helpers/
    routes.ts                ← seedRoutes[], discoverLinks(), normalizeRoute()
    screenshots.ts           ← screenshotStep(), fullPageScreenshot(), visualRegression()
    network.ts               ← attachNetworkMonitor(), scanResponsesForLeaks(), assertNetworkHealthy()
    storage.ts               ← collectStorageState(), writeStorageReport()
    layout.ts                ← collectLayoutIssues()
    interactions.ts          ← testVisibleButtons(), testVisibleLinks()
    accessibility.ts         ← collectAccessibilityIssues(), collectKeyboardFocusOrder()
    console.ts               ← attachConsoleMonitor(), severeConsoleFindings()
    performance.ts           ← collectPerformanceSnapshot(), poorWebVitals()
    forms.ts                 ← auditForms(), triggerAndCaptureValidation()
    overlays.ts              ← discoverAndAuditOverlays()
    seo.ts                   ← auditSeo()
    security.ts              ← auditDomSecurity(), auditSecurityHeaders(), auditMixedContent()
    report.ts                ← appendMarkdownReport(), writeJsonArtifact()
    broken-images.ts         ← auditBrokenImages()
    lazy-images.ts           ← auditLazyImages()
    zoom-scroll.ts           ← testZoomScroll()
    theme-comparison.ts      ← testThemeComparison()
    reduced-motion.ts        ← testReducedMotion()
    responsive-behavior.ts   ← auditResponsiveBehavior()
    toasts.ts                ← auditToasts()
    tables.ts                ← auditTables()
    pwa.ts                   ← auditPWA()
    auth.ts                  ← auditAuthSurface()
    back-forward.ts          ← testBackForwardNavigation()
    edge-states.ts           ← auditEdgeStates()
    placeholder-content.ts   ← auditPlaceholderContent()
    link-checker.ts          ← auditLinks()
    cookie-consent.ts        ← auditCookieConsent()
    html-validation.ts       ← auditHtmlValidation()
    media-player.ts          ← auditMediaPlayers()
    carousel.ts              ← auditCarousels()
    print-media.ts           ← auditPrintMedia()
    csrf.ts                  ← auditCsrf()
    sitemap.ts               ← auditSitemapAndRobots()
    search.ts                ← auditSearch()
    scroll-axes.ts           ← auditScrollAxes()
    button-animations.ts     ← auditButtonAnimations()
    popup-quality.ts         ← auditPopupQuality()
    content-clipping.ts      ← auditContentClipping()
    user-lifecycle.ts        ← auditUserLifecycle()
    sidebar.ts               ← auditSidebar()
    dialog-scroll.ts         ← auditDialogScroll()
    form-alignment.ts        ← auditFormAlignment()
    typography.ts            ← auditTypography()
    fix-plan.ts              ← writeFixPlan()
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md architecture helpers list — add all 44 helpers + fix-plan"
```

---

### Task 5: Push and sync installed skill

- [ ] **Step 1: Push all commits**

```bash
git push origin main
```

Expected: `main -> main` with 4 commits (one per task above).

- [ ] **Step 2: Sync installed skill**

```bash
rsync -a --delete \
  /home/rushikesh.sakharle/Projects/website-ui-deep-qa-skill/ \
  /home/rushikesh.sakharle/.claude/skills/website-ui-deep-qa/ \
  --exclude='.git' --exclude='node_modules' --exclude='qa-artifacts' --exclude='docs'
```

- [ ] **Step 3: Verify Quick Reference row count**

```bash
grep "^| " /home/rushikesh.sakharle/.claude/skills/website-ui-deep-qa/SKILL.md \
  | grep -v "Category\|---\|All artifacts" | wc -l
# Expected: 44
```

- [ ] **Step 4: Verify CLAUDE.md helper count**

```bash
grep "← audit\|← test\|← write\|← append\|← attach\|← collect\|← discover\|← seed\|← screenshot\|← normaliz" \
  /home/rushikesh.sakharle/Projects/website-ui-deep-qa-skill/CLAUDE.md | wc -l
# Expected: 45 (44 helpers + fix-plan)
```

---

## Self-Review

**Spec coverage:**
- Task 1 → mismatch 1 (title) + mismatch 2 (missing table rows) ✅
- Task 2 → mismatch 3 (early-exit list) ✅
- Task 3 → mismatch 4 (deferred helpers table) ✅
- Task 4 → mismatch 5 (CLAUDE.md helpers list) ✅
- Task 5 → sync + verification ✅

**Placeholder scan:** No TBDs, no "implement later", all edits are exact text replacements shown in full.

**Type consistency:** Documentation only — no types to check.

No gaps found.
