#!/usr/bin/env bash
# install.sh — installs sys-admin as a Claude Code plugin
#
# Plugin structure (enables namespaced skill invocation):
#   /sys-admin:sys-admin    — router skill
#   /sys-admin:website-ui-deep-qa   — UI testing subskill (46 helpers)
#
# Installs to: ~/.claude/plugins/cache/sys-admin/sys-admin/1.0.0/
# Registers in: ~/.claude/plugins/installed_plugins.json
# Registers in: ~/.claude/plugins/known_marketplaces.json
#
# To add a new subskill:
#   1. Create skills/<subskill-name>/SKILL.md in this repo
#   2. Run install.sh — it syncs all skills/ dirs to plugin cache
#   3. Add row to skills/sys-admin/SKILL.md routing table
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_CACHE="$HOME/.claude/plugins/cache/sys-admin/sys-admin/1.0.0"
PLUGINS_JSON="$HOME/.claude/plugins/installed_plugins.json"
MARKETS_JSON="$HOME/.claude/plugins/known_marketplaces.json"
NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

# ── 1. Plugin cache: skills ───────────────────────────────────────────────────
echo "→ Syncing plugin skills to cache..."
mkdir -p "$PLUGIN_CACHE/skills"

# sys-admin router skill
mkdir -p "$PLUGIN_CACHE/skills/sys-admin"
cp "$REPO_DIR/skills/sys-admin/SKILL.md" \
   "$PLUGIN_CACHE/skills/sys-admin/SKILL.md"

# website-ui-deep-qa subskill (SKILL.md only — test code lives in project)
mkdir -p "$PLUGIN_CACHE/skills/website-ui-deep-qa"
cp "$REPO_DIR/SKILL.md" \
   "$PLUGIN_CACHE/skills/website-ui-deep-qa/SKILL.md"

# sql-deep-qa subskill
mkdir -p "$PLUGIN_CACHE/skills/sql-deep-qa"
cp "$REPO_DIR/skills/sql-deep-qa/SKILL.md" \
   "$PLUGIN_CACHE/skills/sql-deep-qa/SKILL.md"

# smart-todo subskill
mkdir -p "$PLUGIN_CACHE/skills/smart-todo"
cp "$REPO_DIR/skills/smart-todo/SKILL.md" \
   "$PLUGIN_CACHE/skills/smart-todo/SKILL.md"

# api-deep-qa subskill
mkdir -p "$PLUGIN_CACHE/skills/api-deep-qa"
cp "$REPO_DIR/skills/api-deep-qa/SKILL.md" \
   "$PLUGIN_CACHE/skills/api-deep-qa/SKILL.md"

# marketplace subskill
mkdir -p "$PLUGIN_CACHE/skills/marketplace"
cp "$REPO_DIR/skills/marketplace/SKILL.md" \
   "$PLUGIN_CACHE/skills/marketplace/SKILL.md"

# postgres-deep-qa subskill
mkdir -p "$PLUGIN_CACHE/skills/postgres-deep-qa"
cp "$REPO_DIR/skills/postgres-deep-qa/SKILL.md" \
   "$PLUGIN_CACHE/skills/postgres-deep-qa/SKILL.md"

# ui-visual-qa subskill
mkdir -p "$PLUGIN_CACHE/skills/ui-visual-qa"
cp "$REPO_DIR/skills/ui-visual-qa/SKILL.md" \
   "$PLUGIN_CACHE/skills/ui-visual-qa/SKILL.md"

# Plugin CLAUDE.md
cat > "$PLUGIN_CACHE/CLAUDE.md" << 'CLAUDE_EOF'
# Sys Admin

Testing skills ecosystem.

- Multi-domain testing (UI + SQL + security): use `sys-admin:sys-admin`
- UI / web app testing only: use `sys-admin:website-ui-deep-qa`
- SQL / database testing: use `sys-admin:sql-deep-qa`

## MANDATORY RULE — Smart Todo

**For EVERY task with 3 or more steps, you MUST invoke `sys-admin:smart-todo` before starting work.**

This is not optional. No exceptions for "simple" tasks, "quick" fixes, or "just one thing" — if the work has 3+ steps, `sys-admin:smart-todo` activates first.

Use `sys-admin:smart-todo` to:
- Break the task into a tracked todo list immediately
- Update item status in real time as you work
- Add discovered subtasks the moment they appear
- Surface blockers explicitly rather than stalling silently
CLAUDE_EOF

# .claude-plugin manifests (required by Claude Code plugin loader)
mkdir -p "$PLUGIN_CACHE/.claude-plugin"
cat > "$PLUGIN_CACHE/.claude-plugin/plugin.json" << 'PLUGIN_EOF'
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "sys-admin",
  "displayName": "Sys Admin",
  "description": "Testing skills ecosystem. UI/web testing with 46 helpers, multi-domain testing router, SQL audit (17 categories), API testing (18 categories), smart todo, and Claude Code marketplace guide.",
  "author": {
    "name": "Rushikesh Sakharle",
    "url": "https://github.com/rushikeshsakharleofficial"
  },
  "version": "1.0.0",
  "license": "MIT",
  "homepage": "https://github.com/rushikeshsakharleofficial/sys-admin",
  "repository": "https://github.com/rushikeshsakharleofficial/sys-admin",
  "keywords": ["testing", "qa", "ui", "web", "accessibility", "security", "playwright", "sql", "api", "marketplace"]
}
PLUGIN_EOF

cat > "$PLUGIN_CACHE/.claude-plugin/marketplace.json" << 'MARKET_EOF'
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "sys-admin",
  "description": "Testing skills ecosystem for websites and web apps. UI deep QA with 46 helpers covering layout, accessibility, forms, network, security, responsive design, SEO, CSRF, auth, and flow bypass.",
  "owner": {
    "name": "Rushikesh Sakharle",
    "url": "https://github.com/rushikeshsakharleofficial"
  },
  "plugins": [
    {
      "name": "sys-admin",
      "description": "Testing skills ecosystem. Use sys-admin:sys-admin for multi-domain testing, sys-admin:website-ui-deep-qa for UI/web testing.",
      "source": "./",
      "category": "testing",
      "homepage": "https://github.com/rushikeshsakharleofficial/sys-admin"
    }
  ]
}
MARKET_EOF

# Marketplace directory (mirrors cache manifests)
MARKETPLACE="$HOME/.claude/plugins/marketplaces/sys-admin"
mkdir -p "$MARKETPLACE/.claude-plugin"
cp "$PLUGIN_CACHE/.claude-plugin/plugin.json" "$MARKETPLACE/.claude-plugin/plugin.json"
cp "$PLUGIN_CACHE/.claude-plugin/marketplace.json" "$MARKETPLACE/.claude-plugin/marketplace.json"

# ── 2. Register in installed_plugins.json ────────────────────────────────────
echo "→ Registering plugin..."
python3 - << PYEOF
import json, sys

plugins_file = "$PLUGINS_JSON"
markets_file = "$MARKETS_JSON"
now = "$NOW"
install_path = "$PLUGIN_CACHE"

# installed_plugins.json
with open(plugins_file) as f:
    plugins = json.load(f)

key = "sys-admin@sys-admin"
plugins["plugins"][key] = [{
    "scope": "user",
    "installPath": install_path,
    "version": "1.0.0",
    "installedAt": plugins.get("plugins", {}).get(key, [{}])[0].get("installedAt", now),
    "lastUpdated": now
}]
with open(plugins_file, "w") as f:
    json.dump(plugins, f, indent=4)

# known_marketplaces.json
with open(markets_file) as f:
    markets = json.load(f)

markets["sys-admin"] = {
    "source": {
        "source": "github",
        "repo": "rushikeshsakharleofficial/sys-admin"
    },
    "installLocation": "$HOME/.claude/plugins/marketplaces/sys-admin",
    "lastUpdated": now
}
with open(markets_file, "w") as f:
    json.dump(markets, f, indent=4)

print("registered")
PYEOF

# ── 3. Enable the plugin (in case it was installed as disabled) ──────────────
echo "→ Enabling plugin..."
claude plugin enable sys-admin@sys-admin 2>&1 || true

echo ""
echo "✓ Done. Plugin installed and enabled as: sys-admin@sys-admin"
echo ""
echo "   Invoke via:"
echo "   /sys-admin:sys-admin           — routing skill (multi-domain dispatch)"
echo "   /sys-admin:website-ui-deep-qa  — UI QA subskill (46 helpers)"
echo "   /sys-admin:sql-deep-qa         — SQL audit (17 categories)"
echo "   /sys-admin:postgres-deep-qa    — PostgreSQL deep audit (17 categories)"
echo "   /sys-admin:api-deep-qa         — API testing (18 categories)"
echo "   /sys-admin:smart-todo          — task tracking (auto for 3+ step tasks)"
echo "   /sys-admin:marketplace         — Claude Code plugin lifecycle"
echo "   /sys-admin:ui-visual-qa        — visual QA (regression + design quality + industry benchmark)"
echo ""
echo "   Restart Claude Code to load the new plugin."
