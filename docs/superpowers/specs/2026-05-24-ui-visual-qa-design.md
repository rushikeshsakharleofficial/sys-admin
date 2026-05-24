# Design Spec: `ui-visual-qa` Skill

**Date:** 2026-05-24  
**Status:** Approved  
**Author:** Rushikesh Sakharle

---

## Summary

New standalone skill `ui-visual-qa` added to the `sys-admin` Claude Code plugin. Covers the visual layer of QA: pixel regression, design quality (14 categories), and industry benchmark comparison via awesome-design-md.

---

## Motivation

`website-ui-deep-qa` covers functional UI — forms work, a11y passes, network health, security headers. It does **not** deeply audit visual design quality: spacing systems, design token compliance, component state coverage, animation quality, pixel-perfect fidelity. This gap is the primary target.

---

## Scope

**In scope:**
- Visual regression (snapshot diffs across viewports/browsers)
- Design quality audit (14 categories)
- Industry benchmark via awesome-design-md (suggestion engine)
- Multi-mode execution: Playwright MCP → Playwright Test → static analysis

**Out of scope:**
- Functional correctness (covered by `website-ui-deep-qa`)
- Accessibility compliance (covered by `website-ui-deep-qa`)
- API/network layer (covered by `api-deep-qa`)

---

## Architecture

```
Skill invocation: /sys-admin:ui-visual-qa
Router aliases: visual-qa, pixel diff, design audit, design quality, component states, spacing grid, design tokens, visual regression, typography audit, color tokens, dark mode, animation quality, icon consistency

Mode detection:
  Mode 1 — Playwright MCP (preferred: live browser exploratory)
  Mode 2 — Playwright Test (automated: regression baselines)
  Mode 3 — Static analysis (fallback: CSS/source inspection)

3-phase structure:
  Phase 1 — Visual Regression (8 checks)
  Phase 2 — Design Quality Audit (14 categories)
  Phase 3 — Industry Benchmark (awesome-design-md suggestion engine)

Output artifacts:
  qa-artifacts/visual/
    screenshots/        per-viewport, per-page
    diffs/              pixel diff PNGs with highlighted regions
    phase2-audit.md     14-category findings
    benchmark.md        Phase 3 comparison vs reference DESIGN.md
    final-report.md     summary with severity table
```

---

## Phase 1 — Visual Regression

8 automated checks:
1. Baseline snapshot creation per page × viewport × browser
2. Pixel diff against baseline (threshold: 0.1% default, configurable)
3. Cross-browser smoke (Chromium + Firefox + WebKit)
4. All 5 viewports (1440, 1366, 1024, 390, 360)
5. Component state screenshots (hover, focus, active, disabled)
6. Full-page + above-fold crops
7. Dark/light mode toggle regression
8. Animation-frozen snapshots (set `--animation-duration: 0s` before snap)

---

## Phase 2 — Design Quality Audit (14 categories)

| # | Category | Key checks |
|---|----------|-----------|
| 2.1 | Typography system | Font scale, line-height, letter-spacing, weight, overflow |
| 2.2 | Color & contrast | WCAG AA/AAA, token consistency, semantic usage |
| 2.3 | Spacing grid | 8pt grid compliance, padding/margin, touch targets 44×44 |
| 2.4 | Component states | Hover, focus, active, disabled, loading, error, empty |
| 2.5 | Animation & motion | Duration, easing, jank, prefers-reduced-motion |
| 2.6 | Icon system | Size grid, color alignment, SVG quality, text alignment |
| 2.7 | Image quality | Retina resolution, aspect ratio, lazy loading, object-fit |
| 2.8 | Responsive behavior | Breakpoint transitions, no horizontal scroll, mobile text ≥16px |
| 2.9 | Dark mode / theme | CSS variables, no hardcoded colors, contrast in dark, prefers-color-scheme |
| 2.10 | Skeleton & loading | Content dimension match, no CLS, async data handling |
| 2.11 | Error & empty states | Clear messaging, actionable CTAs, 404 quality |
| 2.12 | Scroll behavior | Sticky elements, modal scroll containment, scroll axes |
| 2.13 | Z-index & stacking | Modal > dropdown > header > content, no bleed-through |
| 2.14 | Font rendering | font-display swap, fallback metrics, antialiasing |

---

## Phase 3 — Industry Benchmark

**Mechanism:** Suggestion engine — when a Phase 2 defect is found, cite the real-world reference and suggest fix.

**Reference mapping** (awesome-design-md, path: `design-md/{slug}/DESIGN.md`):

| Product type | Keywords | Reference |
|---|---|---|
| Fintech/payments | payment, billing, invoice, bank, crypto | `stripe` |
| SaaS/productivity | project, tasks, issues, workspace, linear | `linear.app` |
| Developer tools | terminal, CLI, API docs, SDK, deploy | `vercel` |
| Database/backend | database, postgres, redis, infra | `supabase` |
| E-commerce | shop, product, cart, checkout | `shopify` |
| Marketplace | listings, host, booking, rent | `airbnb` |
| AI/LLM | chat, AI, prompts, model, assistant | `claude` |
| Design tool | canvas, design, components, figma | `figma` |
| Social/media | feed, posts, playlist, music | `spotify` |
| CRM/support | tickets, customers, inbox | `intercom` |
| General SaaS | (default fallback) | `notion` |

**Raw URL pattern:** `https://raw.githubusercontent.com/voltagent/awesome-design-md/main/design-md/{slug}/DESIGN.md`

---

## Defect Format

```
VIS-DEFECT-N
Category: [phase 2 category name]
Phase: 1 | 2 | 3
Severity: Critical | Major | Minor | Info
Page: /path
Viewport: chromium-desktop-1440 | chromium-mobile-390 | ...
Description: [what is wrong]
Industry reference: [Company] uses [specific pattern]
Fix: [specific actionable change]
```

**Severity definitions:**
- **Critical**: Layout broken, content unreadable, overlapping elements blocking interaction
- **Major**: Visible design inconsistency, wrong color/spacing, missing required states
- **Minor**: Pixel-level misalignment, slight spacing inconsistency
- **Info**: Improvement suggestion vs industry reference (not a bug)

---

## Integration

- New directory: `skills/ui-visual-qa/SKILL.md`
- `install.sh`: new sync block after existing skill blocks
- `skills/sys-admin/SKILL.md`: new keyword row + domain map entry
- `README.md`: new row in skills table + new usage section

---

## Constraints

- Read-only mode by default — no DOM mutations without confirmation
- Animation-freeze technique used for stable snapshots only
- Baseline update command requires explicit `UPDATE_SNAPSHOTS=true` flag
- awesome-design-md fetched at runtime via raw GitHub URL (no local copy)
