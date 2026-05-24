---
name: ui-visual-qa
description: Use when a website or web app needs visual design quality testing — pixel regression, design system compliance, component state coverage, spacing grid, typography scale, color tokens, dark mode, animation quality, icon consistency, image quality, loading states, or industry benchmark comparison. Also triggers on: "does it look good?", "visual regression", "pixel diff", "design audit", "component states", "spacing is off", "design tokens", "UI looks bad", "compare to Stripe/Linear/Vercel", "dark mode broken", "font rendering". Run alongside website-ui-deep-qa for full UI coverage — this skill owns the visual layer, website-ui-deep-qa owns the functional layer.
---

# UI Visual QA

## Mission

Act as a strict visual QA engineer. Audit the visual design layer across three phases: **regression** (did anything break?), **design quality** (is it well-built?), and **industry benchmark** (how does it compare to Stripe, Linear, Vercel-level design?).

Use the `awesome-design-md` collection as a real-world reference library. When a visual defect is found, cite the matching industry pattern and suggest a concrete fix.

---

## Non-negotiable rules

- **Never mutate DOM or storage** without explicit confirmation.
- **Freeze animations** before snapshots — use `document.documentElement.style.setProperty('--animation-duration', '0s')` to get stable diffs.
- **Baseline updates** require `UPDATE_SNAPSHOTS=true` flag — never overwrite silently.
- **Read-only CSS inspection** only — no style injection into production pages.

---

## Mode detection

Detect execution mode before starting. State detected mode in the report header.

### Mode 1 — Playwright MCP (preferred)
Use when Playwright MCP server is connected and a running app URL is available.

```
→ Live browser, exploratory visual audit
→ Screenshot per viewport, inspect computed styles, check component states
→ Freeze animations before snapshot
```

### Mode 2 — Playwright Test (automated, repeatable)
Use when no MCP but a running app is available.

```bash
UPDATE_SNAPSHOTS=true BASE_URL=http://localhost:3000 npx playwright test tests/visual/
# First run: creates baselines
# Subsequent runs: diffs against baselines
```

Playwright `toHaveScreenshot()` with `maxDiffPixelRatio: 0.001` (0.1% threshold).

### Mode 3 — Static analysis (fallback)
Use when no running app is available. Inspect CSS files, component source, and token files.

```bash
# Find all CSS custom properties (design tokens)
grep -rn "var(--" src/ --include="*.css" --include="*.scss" --include="*.tsx" --include="*.ts"

# Find hardcoded color values (token drift)
grep -rn "#[0-9a-fA-F]\{3,6\}\|rgba\?\|hsl" src/ --include="*.css" --include="*.scss"

# Find touch targets below 44px
grep -rn "width.*[0-3][0-9]px\|height.*[0-3][0-9]px" src/ --include="*.css"

# Find line-height below 1.4 on body text
grep -rn "line-height" src/ --include="*.css" --include="*.scss"
```

---

## Initial assumptions to state

At the start of every audit, state:

- Target URL or component library
- Execution mode detected (MCP / Playwright Test / static)
- Product type detected (fintech / SaaS / dev tool / e-commerce / AI / general)
- Reference DESIGN.md selected (e.g. Stripe, Linear, Vercel)
- Viewports audited
- Which checks were skipped and why

---

## Phase 1 — Visual Regression

**Goal:** Catch any visual changes since baseline. Run this before Phase 2 to separate regressions from existing design debt.

### Check 1.1 — Baseline snapshot creation

For each page × viewport × browser, create a baseline if none exists.

```typescript
// Playwright Test
import { test, expect } from '@playwright/test';

test('visual baseline — home page', async ({ page }) => {
  await page.goto(process.env.BASE_URL + '/');
  // Freeze animations for stable snapshot
  await page.evaluate(() => {
    document.documentElement.style.setProperty('animation-duration', '0s', 'important');
    document.documentElement.style.setProperty('transition-duration', '0s', 'important');
    document.documentElement.style.setProperty('animation-delay', '0s', 'important');
  });
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('home-desktop.png', { maxDiffPixelRatio: 0.001 });
});
```

Update baselines only when changes are intentional:
```bash
UPDATE_SNAPSHOTS=true BASE_URL=http://localhost:3000 npx playwright test --update-snapshots
```

### Check 1.2 — Pixel diff comparison

Compare new screenshots against baselines. Flag any diff > 0.1%.

Diff output format:
```
REGRESSION-1 — /checkout | chromium-mobile-390 | 2.3% pixel diff
  Baseline: qa-artifacts/visual/baselines/checkout-mobile-390.png
  Current:  qa-artifacts/visual/screenshots/checkout-mobile-390.png
  Diff:     qa-artifacts/visual/diffs/checkout-mobile-390-diff.png
  Likely cause: animation frame captured / font swap / lazy image loaded late
```

### Check 1.3 — Cross-browser smoke

Run snapshots in Chromium, Firefox, and WebKit. Flag browser-specific rendering differences.

Common cross-browser visual bugs:
- Custom scrollbar styles (WebKit only)
- `backdrop-filter` support (Firefox)
- Font rendering differences (WebKit subpixel antialiasing)
- Grid/flex gaps (older Firefox)
- `color-mix()` support

### Check 1.4 — All 5 viewports

| Viewport | Width × Height | Catch |
|----------|---------------|-------|
| chromium-desktop-1440 | 1440×900 | Desktop layout, full navigation |
| chromium-laptop-1366 | 1366×768 | Laptop — most common desktop breakpoint |
| chromium-tablet-1024 | 1024×768 | Tablet landscape, collapsed nav |
| chromium-mobile-390 | 390×844 | iPhone 14 — primary mobile reference |
| chromium-mobile-360 | 360×640 | Android entry-level |

### Check 1.5 — Component state screenshots

For interactive components, trigger and screenshot each state:

```typescript
// Hover state
await page.hover('button[data-testid="primary-cta"]');
await expect(page.locator('button[data-testid="primary-cta"]')).toHaveScreenshot('btn-hover.png');

// Focus state (keyboard)
await page.keyboard.press('Tab');
await expect(page.locator(':focus')).toHaveScreenshot('focus-ring.png');

// Disabled state
await expect(page.locator('button[disabled]').first()).toHaveScreenshot('btn-disabled.png');
```

### Check 1.6 — Full-page + above-fold

Take both `fullPage: true` and default viewport crop. Catches:
- Content hidden below fold
- Footer design regressions
- Sticky header overlap

### Check 1.7 — Dark / light mode regression

```typescript
// Force dark mode
await page.emulateMedia({ colorScheme: 'dark' });
await expect(page).toHaveScreenshot('home-dark.png');

// Force light mode
await page.emulateMedia({ colorScheme: 'light' });
await expect(page).toHaveScreenshot('home-light.png');
```

### Check 1.8 — Reduced motion

```typescript
await page.emulateMedia({ reducedMotion: 'reduce' });
await expect(page).toHaveScreenshot('home-reduced-motion.png');
// Verify no animation-dependent layout
```

---

## Phase 2 — Design Quality Audit (14 categories)

**Goal:** Verify the UI is well-constructed — consistent spacing, correct typography, all component states present, no design debt.

---

### 2.1 Typography system

**What to check:**

| Property | Good practice | Common defect |
|----------|---------------|---------------|
| Type scale | Clear hierarchy: display → headline → body → caption | Random px values, no scale |
| Line-height body | 1.4–1.6 | Below 1.3 → cramped; above 1.8 → loose |
| Line-height display | 1.0–1.2 | Same as body → no visual hierarchy |
| Letter-spacing display | Negative (−0.5px to −3px at 56px+) | Positive or 0 at large sizes |
| Letter-spacing body | 0 or −0.01em | Positive tracking on body → harder to read |
| Font weights | 2–3 weights max | 4+ weights → inconsistent brand |
| Text overflow | `text-overflow: ellipsis` with `overflow: hidden` | Long text breaking layout |
| Max line length | 65–75ch for body copy | Too wide (>90ch) → hard to read |

**Playwright inspection:**
```typescript
const bodyStyle = await page.evaluate(() => {
  const el = document.querySelector('p, .body-text, main p');
  if (!el) return null;
  const s = getComputedStyle(el);
  return {
    fontFamily: s.fontFamily,
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing,
    fontWeight: s.fontWeight,
  };
});
```

**Static analysis:**
```bash
# Find all font-size values
grep -rn "font-size\|font-weight\|line-height\|letter-spacing" src/ --include="*.css" --include="*.scss" | sort | uniq
```

---

### 2.2 Color & contrast

**WCAG thresholds:**

| Level | Normal text | Large text (≥18pt or 14pt bold) |
|-------|------------|--------------------------------|
| AA (minimum) | 4.5:1 | 3:1 |
| AAA (enhanced) | 7:1 | 4.5:1 |

**Playwright contrast check:**
```typescript
// Check body text contrast
const contrast = await page.evaluate(() => {
  const el = document.querySelector('p, .body-text');
  if (!el) return null;
  const style = getComputedStyle(el);
  return {
    color: style.color,
    backgroundColor: style.backgroundColor,
    parentBg: getComputedStyle(el.parentElement!).backgroundColor,
  };
});
```

**Design token drift — static:**
```bash
# Find hardcoded hex colors outside token files
grep -rn "#[0-9a-fA-F]\{3,6\}" src/components/ src/pages/ \
  --include="*.css" --include="*.scss" --include="*.tsx" \
  | grep -v "tokens\|variables\|theme\|// " | head -40
```

**Common defects:**
- Placeholder text below 3:1 ratio
- Link color indistinguishable from body text
- Disabled button text below 3:1 (acceptable if clearly disabled visually)
- Hardcoded hex in components (not using `var(--color-*)`)
- Background color not switching in dark mode (hardcoded white)

---

### 2.3 Spacing grid

**8-point grid rule:** All margin, padding, gap, width, height values should be multiples of 8 (or 4 for tighter systems).

| Value | 4pt ✓ | 8pt ✓ | Neither ✗ |
|-------|-------|-------|-----------|
| 8px | ✓ | ✓ | |
| 12px | ✓ | | |
| 16px | ✓ | ✓ | |
| 10px | | | ✗ odd value |
| 7px | | | ✗ |

**Static inspection:**
```bash
# Find non-grid spacing values (not multiples of 4)
grep -rn "padding:\|margin:\|gap:" src/ --include="*.css" \
  | grep -E "[0-9]+px" \
  | grep -vE "\b(0|4|8|12|16|20|24|28|32|36|40|44|48|56|64|72|80|88|96|104|112|120|128)px\b"
```

**Touch targets — mobile:**
```typescript
// Check all interactive elements on mobile viewport (390px)
const targets = await page.evaluate(() => {
  const interactive = document.querySelectorAll('button, a, input, select, textarea, [role="button"]');
  return Array.from(interactive).map(el => {
    const r = el.getBoundingClientRect();
    return { tag: el.tagName, width: r.width, height: r.height, text: el.textContent?.trim().slice(0, 30) };
  }).filter(t => t.width > 0 && (t.width < 44 || t.height < 44));
});
// Flag anything below 44×44px on mobile
```

---

### 2.4 Component states coverage

Every interactive component must have all required states. Missing states = visual bug.

| Component | Required states |
|-----------|----------------|
| Button | default, hover, focus, active/pressed, disabled, loading |
| Input | default, focus, filled, error, disabled, read-only |
| Link | default, hover, focus, active, visited |
| Checkbox / Radio | unchecked, checked, indeterminate, focus, disabled |
| Select / Dropdown | closed, open, option-hover, selected, disabled |
| Card (clickable) | default, hover, focus, selected, disabled |
| Tab | default, hover, active/selected, focus |
| Modal | open, close-animation |
| Toast | info, success, warning, error |

**Check method — Playwright MCP:**
For each component found on page, trigger states and screenshot:

```typescript
// Trigger hover and capture
const button = page.locator('button').first();
await button.hover();
// Screenshot and note computed background/border/shadow change

// Trigger focus
await button.focus();
// Check outline/ring visible and has sufficient contrast

// Check disabled
const disabled = page.locator('button[disabled], button[aria-disabled="true"]');
// Verify opacity ≤ 0.6 or distinct visual treatment
```

**Static check:**
```bash
# Find components missing hover states
grep -rn "\.btn\|\.button\|\.card\b" src/ --include="*.css" --include="*.scss" \
  | grep -v ":hover\|:focus\|:active\|:disabled"
```

---

### 2.5 Animation & motion quality

**Timing guidelines:**

| Animation type | Duration range | Easing |
|----------------|---------------|--------|
| Micro-interaction (button press) | 80–120ms | ease-out |
| State transition (tab switch) | 150–200ms | ease-in-out |
| Modal appear | 200–250ms | ease-out |
| Modal dismiss | 150–200ms | ease-in |
| Page transition | 250–350ms | ease-in-out |
| Skeleton pulse | 1.5–2s | ease-in-out infinite |

**Check for reduced motion support:**
```bash
grep -rn "prefers-reduced-motion" src/ --include="*.css" --include="*.scss"
# Every animation block must have a matching @media (prefers-reduced-motion: reduce) override
```

**Playwright jank detection:**
```typescript
// Check for CSS transitions on interactive elements
const transitions = await page.evaluate(() => {
  const els = document.querySelectorAll('button, a, input, .card, [class*="btn"]');
  return Array.from(els).slice(0, 20).map(el => ({
    tag: el.tagName,
    transition: getComputedStyle(el).transition,
    animation: getComputedStyle(el).animation,
  }));
});
// Flag: transition: none on elements that should animate
// Flag: duration > 500ms on micro-interactions
// Flag: linear easing on UI animations
```

---

### 2.6 Icon system consistency

**Rules to enforce:**

| Rule | Good | Bad |
|------|------|-----|
| Size grid | 16, 20, 24px only | 17px, 22px, random values |
| Color | Inherits from `currentColor` | Hardcoded fills |
| Format | SVG inline or sprite | PNG icons in scalable UI |
| Alignment | `vertical-align: middle` or flex center | Visually misaligned with text |
| Icon-only buttons | `aria-label` present + `min-width: 44px` | No label, too small |

**Static check:**
```bash
# Find PNG icons in UI components
find src/ -name "*.png" | grep -i "icon\|ico\|symbol"

# Find hardcoded icon colors
grep -rn "fill=\|stroke=" src/ --include="*.tsx" --include="*.jsx" \
  | grep -v "currentColor\|none\|inherit\|transparent"

# Find non-grid icon sizes
grep -rn "width.*\(1[^246]\|[02]\)px\|height.*\(1[^246]\|[02]\)px" src/ --include="*.css" \
  | grep -i "icon\|svg"
```

---

### 2.7 Image quality

**Checks:**

| # | Check | Command / method |
|---|-------|-----------------|
| 7a | Retina resolution | `naturalWidth ≥ 2 × displayWidth` for key images |
| 7b | Aspect ratio preserved | `object-fit: cover` or `contain` — no squished images |
| 7c | Lazy loading on below-fold | `loading="lazy"` on images below first viewport |
| 7d | Alt text presence | All `<img>` have non-empty `alt` (decorative = `alt=""`) |
| 7e | Broken image detection | `naturalWidth === 0` after `onload` |
| 7f | CLS prevention | Images have explicit `width` + `height` attributes |
| 7g | WebP format | Modern images use `<picture>` with WebP source |

**Playwright image audit:**
```typescript
const imageAudit = await page.evaluate(() => {
  return Array.from(document.images).map(img => ({
    src: img.src.split('/').pop(),
    alt: img.alt,
    displayWidth: img.width,
    naturalWidth: img.naturalWidth,
    isLazy: img.loading === 'lazy',
    hasDimensions: img.hasAttribute('width') && img.hasAttribute('height'),
    broken: img.naturalWidth === 0 && img.complete,
  }));
});

const retinaMissing = imageAudit.filter(i => i.naturalWidth > 0 && i.naturalWidth < i.displayWidth * 1.5);
const lazyMissing = imageAudit.filter(i => !i.isLazy); // filter to below-fold manually
const broken = imageAudit.filter(i => i.broken);
const missingAlt = imageAudit.filter(i => i.alt === undefined);
```

---

### 2.8 Responsive behavior

**Breakpoint transitions to verify:**

| From → To | Check |
|-----------|-------|
| 1440 → 1024 | Navigation collapse, sidebar collapse |
| 1024 → 768 | 3-col → 2-col layouts |
| 768 → 390 | 2-col → 1-col, hamburger menu, stacked forms |
| Any mobile | No horizontal scroll (`overflow-x: hidden` on body, no overflowing elements) |

**Playwright responsive checks:**
```typescript
// Check for horizontal scroll on mobile
await page.setViewportSize({ width: 390, height: 844 });
const hasHorizontalScroll = await page.evaluate(() => {
  return document.body.scrollWidth > window.innerWidth;
});

// Check minimum font size on mobile (should be ≥ 16px to prevent iOS zoom)
const smallText = await page.evaluate(() => {
  const all = document.querySelectorAll('input, select, textarea');
  return Array.from(all).filter(el => {
    const size = parseFloat(getComputedStyle(el).fontSize);
    return size < 16;
  }).map(el => ({ tag: el.tagName, fontSize: getComputedStyle(el).fontSize }));
});
// Inputs below 16px on iOS trigger auto-zoom — Major defect
```

**Static breakpoint check:**
```bash
# Find all media queries and breakpoints defined
grep -rn "@media\b" src/ --include="*.css" --include="*.scss" | grep -oP "\d+px" | sort -n | uniq -c | sort -rn
```

---

### 2.9 Dark mode / theme switching

**Rules:**

| Rule | Check | Flag |
|------|-------|------|
| CSS variable usage | All colors via `var(--color-*)` | Hardcoded hex in components |
| System preference | `@media (prefers-color-scheme: dark)` exists | Missing dark mode support |
| No pure white text on pure black | Background `≠ #000`, text `≠ #fff` | Pure black backgrounds |
| Image visibility | No light images becoming invisible on dark backgrounds | Missing dark-specific images |
| Shadow strategy | No drop-shadows on dark mode (surface ladder instead) | Shadows visible on dark surfaces |
| Toggle persistence | Theme choice saved to `localStorage` or cookie | Reset on page reload |

**Playwright dark mode check:**
```typescript
// Toggle and screenshot both modes
for (const scheme of ['light', 'dark'] as const) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.reload();
  await page.waitForLoadState('networkidle');
  
  // Check for hardcoded whites
  const hardcodedBg = await page.evaluate(() => {
    const els = document.querySelectorAll('*');
    return Array.from(els).filter(el => {
      const bg = getComputedStyle(el).backgroundColor;
      return bg === 'rgb(255, 255, 255)' && el.tagName !== 'BODY';
    }).slice(0, 5).map(el => el.className);
  });
  
  await expect(page).toHaveScreenshot(`home-${scheme}.png`);
}
```

**Static check:**
```bash
# Find hardcoded light colors in component files
grep -rn "background.*#fff\|background.*white\|color.*#000\|color.*black" \
  src/components/ src/pages/ --include="*.css" --include="*.scss" \
  | grep -v "tokens\|variables\|--"
```

---

### 2.10 Skeleton & loading states

**What to check:**

| Check | Target | Defect if |
|-------|--------|-----------|
| Skeleton present | All async data regions | Raw spinner only, or no loading state |
| Skeleton matches content | Skeleton height/width ≈ actual content | Skeleton collapses to 0 when loaded (CLS) |
| Shimmer animation | Pulse or wave animation | Static gray blocks |
| No CLS on load | Layout Stability score ≥ 0.9 | Elements shift when real content arrives |
| Timeout handling | Error state after N seconds | Skeleton spins forever |

**Playwright CLS measurement:**
```typescript
const cls = await page.evaluate(() => {
  return new Promise(resolve => {
    let clsValue = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => resolve(clsValue), 3000);
  });
});
// Flag: CLS > 0.1 (Poor), warn: CLS > 0.05
```

---

### 2.11 Error & empty states

**Required states for every data-driven UI:**

| State | Minimum requirements | Common defect |
|-------|---------------------|---------------|
| Empty list/table | Illustration or icon + headline + CTA | Blank space or raw "No results" text |
| Form validation error | Red border + error message below field + ARIA | Just red border, no message |
| Server error | Friendly message + retry button + support link | Raw "500 Error" text |
| Network offline | Offline indicator + last-known state | White screen |
| 404 page | On-brand design + navigation links + search | Default browser 404 |
| Zero state (first use) | Welcome message + onboarding CTA | Empty dashboard |

**Playwright empty state check:**
```typescript
// Intercept API to return empty data
await page.route('**/api/**', route => {
  route.fulfill({ status: 200, body: JSON.stringify({ data: [], items: [] }) });
});
await page.reload();
await expect(page).toHaveScreenshot('empty-state.png');
// Verify: not a blank region, has some visual content
```

---

### 2.12 Scroll behavior & sticky elements

**Checks:**

| # | Check | Method |
|---|-------|--------|
| 12a | Sticky header stays visible on scroll | Scroll 500px, check header still in viewport |
| 12b | Sticky header doesn't cover content | Check `scroll-margin-top` on anchored sections |
| 12c | Scroll-to-top button appears after scroll threshold | Scroll to 50%, look for scroll-up button |
| 12d | Modal scroll containment | Open modal, verify `body` has `overflow: hidden` |
| 12e | No double scrollbar | Modal + page don't both show scrollbars |
| 12f | Horizontal scroll only where intentional | No unwanted horizontal scroll on any viewport |
| 12g | Scroll shadows (depth cue) | Long lists show shadow when not at top/bottom |

```typescript
// Check sticky header
await page.evaluate(() => window.scrollTo(0, 500));
await page.waitForTimeout(300);
const header = await page.locator('header, nav, [role="banner"]').first();
const headerVisible = await header.isVisible();
const headerInViewport = await header.evaluate(el => {
  const rect = el.getBoundingClientRect();
  return rect.top >= 0 && rect.top < 100;
});
```

---

### 2.13 Z-index & stacking context

**Expected stacking order (low to high):**

```
Base content     (z-index: auto)
Sticky headers   (z-index: 10)
Dropdowns        (z-index: 100)
Tooltips         (z-index: 200)
Modals/Drawers   (z-index: 1000)
Toast/Snackbar   (z-index: 2000)
```

**Common defects:**
- Dropdown clipped by overflow:hidden parent
- Modal behind sticky header (header z-index > modal z-index)
- Tooltip cut off at viewport edge
- Second modal not above first modal
- Datepicker calendar behind form fields

**Static check:**
```bash
# Audit all z-index values
grep -rn "z-index" src/ --include="*.css" --include="*.scss" \
  | sort -t: -k3 -n | tail -20
# Look for: duplicated values at same layer, arbitrary large values (9999, 99999)
```

---

### 2.14 Font rendering & web fonts

**Checks:**

| Check | Target | Fix |
|-------|--------|-----|
| `font-display: swap` | All `@font-face` declarations | Prevents FOIT (invisible text during load) |
| `size-adjust` on fallback | Next to `font-display: swap` | Reduces CLS from font swap |
| `-webkit-font-smoothing: antialiased` | `body` element | Sharper rendering on Mac/iOS |
| `text-rendering: optimizeLegibility` | Body text blocks | Better kerning pairs |
| Web font subset | `unicode-range` or `?subset=latin` | Loads only needed glyphs |
| Preload critical font | `<link rel="preload" as="font">` | Prevents render-blocking |

**Static check:**
```bash
# Check font-display on all @font-face
grep -rn "@font-face" src/ public/ --include="*.css" -A5 | grep -A4 "@font-face" | grep "font-display"
# Every @font-face must have font-display: swap or optional

# Check antialiasing
grep -rn "font-smoothing\|text-rendering" src/ --include="*.css"
# Should find: -webkit-font-smoothing: antialiased on body

# Check font preloads in HTML
grep -rn "rel.*preload.*font\|as.*font" public/ src/ --include="*.html" --include="*.tsx"
```

---

## Phase 3 — Industry Benchmark

**Goal:** For every Phase 2 defect, cite a real industry reference from the 73-design awesome-design-md collection. Turns vague findings ("spacing is off") into actionable comparisons ("Stripe uses 8px base unit — you have 5px and 7px mixed").

Raw URL pattern for all references:
```
https://raw.githubusercontent.com/voltagent/awesome-design-md/main/design-md/{slug}/DESIGN.md
```

---

### Step 3.1 — Run the selection matrix

Use the multi-dimensional decision matrix below. Evaluate all four conditions and pick the row where the most conditions match.

**Condition 1 — Primary domain/vertical** (most weight)  
**Condition 2 — Visual tone** (dark-first vs light-first)  
**Condition 3 — Audience type** (developer / consumer / enterprise)  
**Condition 4 — UI density** (data-heavy / content-heavy / marketing)

---

### Full Design Reference Map (73 designs, all from awesome-design-md)

#### Fintech & Financial

| Best match when... | Slug | URL suffix |
|---|---|---|
| Payment infrastructure, invoicing, billing API, checkout | `stripe` | `design-md/stripe/DESIGN.md` |
| Neobank, multi-currency wallet, personal finance | `revolut` | `design-md/revolut/DESIGN.md` |
| Crypto trading, exchange, buy/sell crypto | `coinbase` | `design-md/coinbase/DESIGN.md` |
| High-volume crypto trading, futures, dark-dense UI | `binance` | `design-md/binance/DESIGN.md` |
| Crypto trading with dark terminal feel | `kraken` | `design-md/kraken/DESIGN.md` |
| International money transfers, FX rates | `wise` | `design-md/wise/DESIGN.md` |
| Global payments brand, enterprise financial | `mastercard` | `design-md/mastercard/DESIGN.md` |

**Condition refinements:**
- Light theme, clean, developer-facing → **Stripe**
- Dark theme, data-dense, trading UI → **Binance** or **Kraken**
- Consumer-facing, colorful, mobile-first → **Revolut**
- Simple wire transfer UX → **Wise**

---

#### SaaS & Productivity

| Best match when... | Slug | URL suffix |
|---|---|---|
| Issue tracking, sprints, engineering workflow | `linear.app` | `design-md/linear.app/DESIGN.md` |
| Docs, notes, wikis, all-in-one workspace | `notion` | `design-md/notion/DESIGN.md` |
| Database-as-app, spreadsheet/grid hybrid | `airtable` | `design-md/airtable/DESIGN.md` |
| Scheduling, calendar booking, availability | `cal` | `design-md/cal/DESIGN.md` |
| Email client, inbox, email productivity | `superhuman` | `design-md/superhuman/DESIGN.md` |
| Team chat, messaging, channels | `slack` | `design-md/slack/DESIGN.md` |
| Automation, workflow builder, no-code integrations | `zapier` | `design-md/zapier/DESIGN.md` |
| Whiteboard, diagrams, real-time collaboration canvas | `miro` | `design-md/miro/DESIGN.md` |
| CRM, customer support, live chat widget | `intercom` | `design-md/intercom/DESIGN.md` |

**Condition refinements:**
- Dark-first, minimal, engineering team → **Linear**
- Light, content-rich, general audience → **Notion**
- Grid/table data UI → **Airtable**
- Consumer-friendly scheduling → **Cal**

---

#### Developer Tools & Platforms

| Best match when... | Slug | URL suffix |
|---|---|---|
| Deployment, hosting, CI/CD, edge functions | `vercel` | `design-md/vercel/DESIGN.md` |
| AI code editor, coding assistant, IDE-like | `cursor` | `design-md/cursor/DESIGN.md` |
| Terminal, CLI tool, developer shell | `warp` | `design-md/warp/DESIGN.md` |
| Mobile/cross-platform dev, React Native | `expo` | `design-md/expo/DESIGN.md` |
| Technical documentation site, API docs | `mintlify` | `design-md/mintlify/DESIGN.md` |
| AI-powered code generation, web IDE | `opencode.ai` | `design-md/opencode.ai/DESIGN.md` |
| Productivity launcher, spotlight-like, command palette | `raycast` | `design-md/raycast/DESIGN.md` |
| Open API integrations, agent tooling, composability | `composio` | `design-md/composio/DESIGN.md` |
| Infra-as-code, secrets, vault, DevOps | `hashicorp` | `design-md/hashicorp/DESIGN.md` |

**Condition refinements:**
- Light, clean marketing site → **Vercel** or **Mintlify**
- Dark, terminal-native → **Warp** or **Cursor**
- Dense developer dashboard → **Vercel** or **Raycast**
- Agent/automation developer tool → **Composio**

---

#### Database, Backend & DevOps

| Best match when... | Slug | URL suffix |
|---|---|---|
| BaaS, Postgres, real-time, auth, storage | `supabase` | `design-md/supabase/DESIGN.md` |
| Document database, NoSQL, Atlas | `mongodb` | `design-md/mongodb/DESIGN.md` |
| Analytical database, OLAP, ClickHouse-style | `clickhouse` | `design-md/clickhouse/DESIGN.md` |
| Product analytics, event tracking, funnels, heatmaps | `posthog` | `design-md/posthog/DESIGN.md` |
| Error monitoring, crash reporting, observability | `sentry` | `design-md/sentry/DESIGN.md` |
| Headless CMS, content modeling, structured content | `sanity` | `design-md/sanity/DESIGN.md` |

**Condition refinements:**
- Dark-first, open-source-adjacent developer tool → **Supabase** or **PostHog**
- Enterprise, large dataset analytics → **ClickHouse**
- Error/ops dashboard → **Sentry**
- CMS with rich content editing → **Sanity**

---

#### AI & LLM Platforms

| Best match when... | Slug | URL suffix |
|---|---|---|
| Conversational AI, chatbot interface, assistant | `claude` | `design-md/claude/DESIGN.md` |
| Enterprise NLP, text AI, B2B AI APIs | `cohere` | `design-md/cohere/DESIGN.md` |
| Open-source LLM platform, model hosting | `mistral.ai` | `design-md/mistral.ai/DESIGN.md` |
| LLM inference cloud, model API marketplace | `together.ai` | `design-md/together.ai/DESIGN.md` |
| ML model hosting, run any model via API | `replicate` | `design-md/replicate/DESIGN.md` |
| Generative video/image/audio, creative AI | `runway-ml` | `design-md/runway-ml/DESIGN.md` |
| Local LLM runner, offline AI, model management | `ollama` | `design-md/ollama/DESIGN.md` |
| AI hardware vendor, GPU/CUDA platform, enterprise AI | `nvidia` | `design-md/nvidia/DESIGN.md` |
| Grok-style AI, Twitter-integrated AI | `x.ai` | `design-md/x.ai/DESIGN.md` |
| Multimodal AI, video+audio generation | `minimax` | `design-md/minimax/DESIGN.md` |
| AI agent platform, multi-agent orchestration | `voltagent` | `design-md/voltagent/DESIGN.md` |

**Condition refinements:**
- Clean chat interface, consumer/pro user → **Claude**
- Dark developer-console AI → **Together.ai** or **Replicate**
- Enterprise AI, B2B pitch → **Cohere** or **NVIDIA**
- Creative generative media → **Runway ML**
- Local-first, command-line AI → **Ollama**

---

#### Design & Creative Tools

| Best match when... | Slug | URL suffix |
|---|---|---|
| UI/UX design tool, component library, design system | `figma` | `design-md/figma/DESIGN.md` |
| No-code interactive web, scroll animations | `framer` | `design-md/framer/DESIGN.md` |
| No-code CMS web builder, headless e-commerce | `webflow` | `design-md/webflow/DESIGN.md` |
| AI web/app builder, prompt-to-UI, vibe coding | `lovable` | `design-md/lovable/DESIGN.md` |
| Clay-like UI, rich cards, data enrichment | `clay` | `design-md/clay/DESIGN.md` |

**Condition refinements:**
- Component library showcase → **Figma**
- Portfolio/marketing with animations → **Framer**
- Content marketing site → **Webflow**
- AI-generated app → **Lovable**

---

#### E-Commerce & Retail

| Best match when... | Slug | URL suffix |
|---|---|---|
| E-commerce platform, storefront builder, Shopify-adjacent | `shopify` | `design-md/shopify/DESIGN.md` |
| Sports/lifestyle brand, product landing page | `nike` | `design-md/nike/DESIGN.md` |
| Consumer retail brand, loyalty, warm/cozy aesthetic | `starbucks` | `design-md/starbucks/DESIGN.md` |

**Condition refinements:**
- Operator-facing admin/dashboard → **Shopify**
- Bold brand marketing, high-impact visuals → **Nike**
- Warm, community-driven consumer brand → **Starbucks**

---

#### Marketplace & Mobility

| Best match when... | Slug | URL suffix |
|---|---|---|
| Two-sided marketplace, listings, booking, hospitality | `airbnb` | `design-md/airbnb/DESIGN.md` |
| Ride-sharing, on-demand delivery, mobility app | `uber` | `design-md/uber/DESIGN.md` |

---

#### Media & Publishing

| Best match when... | Slug | URL suffix |
|---|---|---|
| Music/podcast streaming, media player, playlist UI | `spotify` | `design-md/spotify/DESIGN.md` |
| Consumer tech brand, premium product pages | `apple` | `design-md/apple/DESIGN.md` |
| Visual discovery, pins, image grid, mood board | `pinterest` | `design-md/pinterest/DESIGN.md` |
| Tech editorial, news site, magazine-style layout | `the-verge` | `design-md/the-verge/DESIGN.md` |
| Long-form tech journalism, editorial design | `wired` | `design-md/wired/DESIGN.md` |
| Gaming platform, console UI, game storefront | `playstation` | `design-md/playstation/DESIGN.md` |

**Condition refinements:**
- Dark player UI, immersive media → **Spotify** or **PlayStation**
- Premium hardware marketing → **Apple**
- Editorial long-form → **Wired**

---

#### Automotive & Aerospace

| Best match when... | Slug | URL suffix |
|---|---|---|
| EV brand, tech-forward auto, minimal clean | `tesla` | `design-md/tesla/DESIGN.md` |
| Luxury German auto, premium performance brand | `bmw` | `design-md/bmw/DESIGN.md` |
| M-series racing-inspired, sport performance | `bmw-m` | `design-md/bmw-m/DESIGN.md` |
| Prancing horse luxury, heritage Italian supercar | `ferrari` | `design-md/ferrari/DESIGN.md` |
| Raging bull hypercar, extreme luxury, bold | `lamborghini` | `design-md/lamborghini/DESIGN.md` |
| Ultra-exclusive hypercar, speed-first brand | `bugatti` | `design-md/bugatti/DESIGN.md` |
| Mass-market European auto, functional design | `renault` | `design-md/renault/DESIGN.md` |
| Aerospace, rockets, sci-fi dark UI, mission control | `spacex` | `design-md/spacex/DESIGN.md` |
| Telecom, connectivity, consumer+enterprise | `vodafone` | `design-md/vodafone/DESIGN.md` |

---

#### Enterprise & Infrastructure

| Best match when... | Slug | URL suffix |
|---|---|---|
| Enterprise software, B2B, conservative + trusted | `ibm` | `design-md/ibm/DESIGN.md` |
| Social platform, feed, profile, social graph | `meta` | `design-md/meta/DESIGN.md` |
| Transactional email API, developer email | `resend` | `design-md/resend/DESIGN.md` |

---

### Step 3.2 — Condition-based tie-breaker rules

When multiple references match, apply these rules in order:

1. **Visual tone match wins over domain match.** A dark-first crypto product audited against Stripe (light-first) produces bad suggestions — prefer Binance or Kraken even if Stripe has a more complete DESIGN.md.

2. **Audience alignment beats category.** A developer-facing SaaS → prefer Vercel/Supabase over Notion even if both are "SaaS". Consumer-facing SaaS → prefer Notion/Slack.

3. **UI density match is third priority.** Data-dense dashboards → PostHog, ClickHouse, Airtable. Marketing sites → Vercel, Stripe, Framer. Content-heavy → Notion, Mintlify, Wired.

4. **When in doubt — default fallback by visual tone:**
   - Dark-first UI → **Linear**
   - Light-first UI → **Stripe**
   - No clear tone → **Notion**

---

### Step 3.3 — Fetch reference DESIGN.md

```
https://raw.githubusercontent.com/voltagent/awesome-design-md/main/design-md/{slug}/DESIGN.md
```

If the URL returns 404: the slug may use different casing or separator. Try:
- Lowercase + hyphen: `the-verge`, `runway-ml`, `bmw-m`
- Dot-separated: `linear.app`, `mistral.ai`, `together.ai`, `x.ai`
- No separator: `opencode` if `opencode.ai` fails

State which DESIGN.md was fetched in the report header.

---

### Step 3.4 — Benchmark comparison

After fetching, extract and compare:

| Dimension | Extract from DESIGN.md | Compare against Phase 2 findings |
|---|---|---|
| Spacing base unit | `Base unit: Xpx` | Flag different base unit |
| Typography scale | Full scale table | Compare heading hierarchy, line-heights, tracking |
| Color strategy | Semantic token count, dark/light approach | Flag missing tokens or hardcoded hex |
| Button shape | Pill (9999px), rounded-md (8px), square (4px) | Flag inconsistent radius |
| State coverage | Do/Don't list | Flag missing states |
| Dark mode approach | Surface ladder vs CSS variables vs themes | Compare approach |
| Spacing scale values | xxs → section values | Flag non-grid values |

---

### Step 3.5 — Add industry reference to each defect

When reporting Phase 2 defects, append the benchmark reference:

```
VIS-DEFECT-3
Category: Spacing grid
Phase: 2
Severity: Major
Page: /dashboard
Description: Card padding is 10px and 14px — not on 8pt grid
Industry reference: Stripe uses 8px base unit, scale: xxs(2)·xs(4)·sm(8)·md(12)·lg(16)·xl(24)·xxl(32)
Fix: Standardize — padding-sm: 8px, padding-md: 16px, padding-lg: 24px via CSS custom properties
```

Example with dark-first reference:
```
VIS-DEFECT-7
Category: Dark mode / theme
Phase: 2
Severity: Critical
Page: all pages
Description: White (#ffffff) hardcoded on 14 components — invisible in dark mode
Industry reference: Linear uses 4-step surface ladder (#010102→#191a1b) — no hardcoded whites anywhere
Fix: Replace all #ffffff background values with var(--color-surface-0) token
```

---

## Defect format

Every finding uses this format:

```
VIS-DEFECT-[N]
Category: [Phase 2 category or "Regression"]
Phase: 1 | 2 | 3
Severity: Critical | Major | Minor | Info
Page: /path (or "all pages")
Viewport: [chromium-desktop-1440 | chromium-mobile-390 | all]
Description: [what is wrong — specific, measurable]
Industry reference: [Company] uses [specific pattern] — [DESIGN.md citation]
Fix: [specific, actionable change — CSS property, token name, or component update]
```

---

## Severity definitions

| Severity | Visual impact | Examples |
|----------|--------------|---------|
| **Critical** | Layout broken, content unreadable, interaction blocked | Text overflows container; modal covers entire screen; buttons overlap on mobile |
| **Major** | Visible design defect, missing required state, significant inconsistency | Button has no hover state; 2.1:1 contrast ratio; no error state on form |
| **Minor** | Pixel-level misalignment, minor inconsistency | 2px spacing deviation; icon 1px off-center; slightly different border-radius |
| **Info** | Improvement suggestion vs industry standard | Using 6px base unit vs Stripe's 8px; no gradient mesh on marketing hero |

---

## Final report format

```markdown
# UI Visual QA Report — [target URL or project name]
**Date:** YYYY-MM-DD
**Mode:** [Playwright MCP | Playwright Test | Static Analysis]
**Product type:** [detected type]
**Industry reference:** [chosen DESIGN.md]
**Viewports audited:** 1440, 1366, 1024, 390, 360

---

## Phase 1 — Visual Regression Summary
| Page | Viewport | Browser | Diff % | Status |
|------|----------|---------|--------|--------|
| /home | chromium-desktop-1440 | Chromium | 0.0% | ✅ Pass |
| /checkout | chromium-mobile-390 | Chromium | 2.3% | ❌ REGRESSION |

---

## Phase 2 — Design Quality Audit Summary
| # | Category | Findings | Critical | Major | Minor | Info |
|---|----------|----------|----------|-------|-------|------|
| 2.1 | Typography | 2 | 0 | 1 | 1 | 0 |
| 2.2 | Color & Contrast | 3 | 1 | 2 | 0 | 0 |
| ... | | | | | | |
| **TOTAL** | | **N** | **C** | **M** | **m** | **I** |

---

## Phase 3 — Industry Benchmark Summary
**Reference:** [Company] ([DESIGN.md URL])
| Dimension | Reference | Target | Gap |
|-----------|-----------|--------|-----|
| Spacing base | 8px | 5px | ❌ |
| Typography weights | 2 (300, 400) | 5 | ❌ |
| Button radius | pill (9999px) | 4px | Major gap |
| Dark mode | ✅ | ❌ | Critical gap |

---

## All Defects

[VIS-DEFECT-1 through VIS-DEFECT-N in severity order]

---

## Priority fix list

| Priority | Defect | Effort | Impact |
|----------|--------|--------|--------|
| P1 | VIS-DEFECT-2: contrast 2.1:1 on body text | Low | Critical |
| P1 | VIS-DEFECT-5: no hover state on primary CTA | Low | Major |
| P2 | VIS-DEFECT-8: spacing not on 8pt grid | Medium | Major |
| P3 | VIS-DEFECT-12: no dark mode support | High | Info |
```

---

## Anti-patterns — never do these

| Wrong | Right |
|-------|-------|
| Use Playwright to write CSS fixes | Report only — never inject styles |
| Update baselines without `UPDATE_SNAPSHOTS=true` | Always require explicit flag |
| Rate a missing dark mode as Critical | Dark mode = Info unless explicitly required |
| Skip Phase 1 because "no baseline exists" | Create baseline on first run, note it |
| Flag all `Info` items as blockers | Info = improvement, not a defect |
| Fetch awesome-design-md and rewrite the whole skill's output in that brand's style | Reference only — suggest, don't impose |
| Report vague defects ("spacing looks off") | Always include specific values and expected values |
| Run Phase 3 before Phase 2 | Always Phase 1 → 2 → 3 in order |
