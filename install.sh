#!/usr/bin/env bash
# install.sh — installs code-real-builder ecosystem to ~/.claude/skills/
#
# Installs TWO skills:
#   1. code-real-builder/   — parent router (concise, routes to domain files)
#   2. website-ui-deep-qa/  — full UI testing skill (invokable directly,
#                             includes Playwright spec, 46 helpers, reports)
#
# Future domains: add <domain>.md to skills/code-real-builder/ and add an
# rsync block below. install.sh auto-copies any .md in that dir to code-real-builder/.
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$HOME/.claude/skills"

# ── 1. code-real-builder (parent router) ────────────────────────────────────
echo "→ Installing code-real-builder (parent router)..."
mkdir -p "$SKILLS_DIR/code-real-builder"

# Routing SKILL.md
cp "$REPO_DIR/skills/code-real-builder/SKILL.md" "$SKILLS_DIR/code-real-builder/SKILL.md"

# UI domain reference (full website-ui-deep-qa SKILL.md, @-loadable)
cp "$REPO_DIR/SKILL.md" "$SKILLS_DIR/code-real-builder/ui-deep-qa.md"

# Any other domain files already written
for domain in backend security test-quality backtest ux frontend infra; do
  src="$REPO_DIR/skills/code-real-builder/${domain}.md"
  if [ -f "$src" ]; then
    cp "$src" "$SKILLS_DIR/code-real-builder/${domain}.md"
    echo "   + ${domain}.md"
  fi
done

# ── 2. website-ui-deep-qa (full UI skill — directly invokable) ───────────────
echo "→ Installing website-ui-deep-qa (full UI testing skill)..."
rsync -a --delete \
  "$REPO_DIR/" \
  "$SKILLS_DIR/website-ui-deep-qa/" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='qa-artifacts' \
  --exclude='docs' \
  --exclude='skills' \
  --exclude='install.sh'

echo ""
echo "✓ Done. Installed skills:"
echo "   ~/.claude/skills/code-real-builder/   (router — use for domain selection)"
echo "   ~/.claude/skills/website-ui-deep-qa/  (full UI testing — 46 helpers, Playwright spec)"
