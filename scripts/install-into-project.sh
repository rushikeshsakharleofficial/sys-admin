#!/usr/bin/env bash
# install-into-project.sh
#
# Copies the website-ui-deep-qa Playwright helpers and spec into a target
# project so the tests can be run from that project directory.
#
# Usage:
#   bash scripts/install-into-project.sh /path/to/target-project
#
# What it copies:
#   tests/deep-ui/             → <target>/tests/deep-ui/
#   playwright.config.ts       → <target>/playwright.config.ts (skipped if exists)
#   tsconfig.json              → <target>/tsconfig.json (skipped if exists)
#
# What it patches:
#   <target>/package.json      → adds @playwright/test and typescript devDependencies

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-}"

# ── Validation ────────────────────────────────────────────────────────────────

if [[ -z "$TARGET_DIR" ]]; then
  echo "Usage: bash scripts/install-into-project.sh /path/to/target-project"
  exit 1
fi

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "Error: target directory does not exist: $TARGET_DIR"
  exit 1
fi

echo "Installing website-ui-deep-qa into: $TARGET_DIR"
echo ""

# ── Copy test files ───────────────────────────────────────────────────────────

DEST_TESTS="$TARGET_DIR/tests/deep-ui"
mkdir -p "$DEST_TESTS/helpers"

cp -r "$SKILL_DIR/tests/deep-ui/." "$DEST_TESTS/"
echo "✓ Copied tests/deep-ui/ → $DEST_TESTS"

# ── Copy playwright.config.ts (skip if exists) ────────────────────────────────

if [[ -f "$TARGET_DIR/playwright.config.ts" ]]; then
  echo "⚠ playwright.config.ts already exists — skipped (review manually)"
else
  cp "$SKILL_DIR/playwright.config.ts" "$TARGET_DIR/playwright.config.ts"
  echo "✓ Copied playwright.config.ts"
fi

# ── Copy tsconfig.json (skip if exists) ──────────────────────────────────────

if [[ -f "$TARGET_DIR/tsconfig.json" ]]; then
  echo "⚠ tsconfig.json already exists — skipped (review manually)"
else
  cp "$SKILL_DIR/tsconfig.json" "$TARGET_DIR/tsconfig.json"
  echo "✓ Copied tsconfig.json"
fi

# ── Patch package.json devDependencies ───────────────────────────────────────

PKG="$TARGET_DIR/package.json"

if [[ ! -f "$PKG" ]]; then
  cat > "$PKG" <<'JSON'
{
  "name": "project",
  "version": "1.0.0",
  "scripts": {
    "test": "playwright test tests/deep-ui/ui-deep-qa.spec.ts",
    "test:chromium": "playwright test tests/deep-ui/ui-deep-qa.spec.ts --project=chromium-desktop-1440",
    "test:mobile": "playwright test tests/deep-ui/ui-deep-qa.spec.ts --project=chromium-mobile-390",
    "test:headed": "playwright test tests/deep-ui/ui-deep-qa.spec.ts --headed",
    "test:ci": "playwright test tests/deep-ui/ui-deep-qa.spec.ts --reporter=github",
    "report": "playwright show-report qa-artifacts/playwright-report",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@playwright/test": "latest",
    "typescript": "latest"
  }
}
JSON
  echo "✓ Created package.json with required scripts and devDependencies"
else
  # Use node to patch devDependencies if node is available
  if command -v node &>/dev/null; then
    node - "$PKG" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.devDependencies = pkg.devDependencies || {};
if (!pkg.devDependencies['@playwright/test']) {
  pkg.devDependencies['@playwright/test'] = 'latest';
  console.log('✓ Added @playwright/test to devDependencies');
} else {
  console.log('⚠ @playwright/test already in devDependencies — not changed');
}
if (!pkg.devDependencies['typescript']) {
  pkg.devDependencies['typescript'] = 'latest';
  console.log('✓ Added typescript to devDependencies');
}
pkg.scripts = pkg.scripts || {};
const scripts = {
  test: 'playwright test tests/deep-ui/ui-deep-qa.spec.ts',
  'test:chromium': 'playwright test tests/deep-ui/ui-deep-qa.spec.ts --project=chromium-desktop-1440',
  'test:mobile': 'playwright test tests/deep-ui/ui-deep-qa.spec.ts --project=chromium-mobile-390',
  'test:headed': 'playwright test tests/deep-ui/ui-deep-qa.spec.ts --headed',
  'test:ci': 'playwright test tests/deep-ui/ui-deep-qa.spec.ts --reporter=github',
  report: 'playwright show-report qa-artifacts/playwright-report',
  typecheck: 'tsc --noEmit',
};
let added = 0;
for (const [k, v] of Object.entries(scripts)) {
  if (!pkg.scripts[k]) { pkg.scripts[k] = v; added++; }
}
if (added) console.log(`✓ Added ${added} script(s) to package.json`);
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
NODE
  else
    echo "⚠ node not found — add @playwright/test and typescript to devDependencies manually"
  fi
fi

# ── Next steps ────────────────────────────────────────────────────────────────

echo ""
echo "Next steps:"
echo "  1. cd $TARGET_DIR"
echo "  2. npm install"
echo "  3. npx playwright install"
echo "  4. Edit tests/deep-ui/helpers/routes.ts → add your app's routes to seedRoutes[]"
echo "  5. BASE_URL=http://localhost:<port> npm test"
echo ""
echo "Done."
