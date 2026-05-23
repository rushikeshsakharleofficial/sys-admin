#!/usr/bin/env bash
# install.sh — installs code-real-builder ecosystem to ~/.claude/skills/
#
# Installs TWO skills:
#   1. code-real-builder/   — parent router, references subskills by name
#   2. website-ui-deep-qa/  — UI testing subskill (46 helpers, Playwright spec)
#
# Future subskills: build them, install to ~/.claude/skills/<name>/, add row
# to skills/code-real-builder/SKILL.md routing table, run install.sh.
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$HOME/.claude/skills"

# ── 1. code-real-builder (parent router) ────────────────────────────────────
echo "→ Installing code-real-builder (parent router)..."
mkdir -p "$SKILLS_DIR/code-real-builder"
cp "$REPO_DIR/skills/code-real-builder/SKILL.md" "$SKILLS_DIR/code-real-builder/SKILL.md"

# ── 2. website-ui-deep-qa (UI testing subskill) ─────────────────────────────
echo "→ Installing website-ui-deep-qa (UI subskill)..."
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
echo "✓ Done. Installed:"
echo "   ~/.claude/skills/code-real-builder/   (parent — routes to subskills)"
echo "   ~/.claude/skills/website-ui-deep-qa/  (UI subskill — 46 helpers)"
