#!/usr/bin/env bash
# install.sh — sync skills to ~/.claude/skills/
# Installs: code-real-builder (parent router) + website-ui-deep-qa (UI subskill)
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$HOME/.claude/skills"

echo "→ Installing code-real-builder parent skill..."
mkdir -p "$SKILLS_DIR/code-real-builder"
rsync -a --delete \
  "$REPO_DIR/skills/code-real-builder/" \
  "$SKILLS_DIR/code-real-builder/"

echo "→ Installing website-ui-deep-qa subskill..."
rsync -a --delete \
  "$REPO_DIR/" \
  "$SKILLS_DIR/website-ui-deep-qa/" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='qa-artifacts' \
  --exclude='docs' \
  --exclude='skills' \
  --exclude='install.sh'

echo "✓ Done. Installed skills:"
echo "   ~/.claude/skills/code-real-builder/"
echo "   ~/.claude/skills/website-ui-deep-qa/"
