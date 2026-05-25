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

# seo-deep-qa subskill
mkdir -p "$PLUGIN_CACHE/skills/seo-deep-qa"
cp "$REPO_DIR/skills/seo-deep-qa/SKILL.md" \
   "$PLUGIN_CACHE/skills/seo-deep-qa/SKILL.md"

# ui-ux-designer subskill
mkdir -p "$PLUGIN_CACHE/skills/ui-ux-designer"
cp "$REPO_DIR/skills/ui-ux-designer/SKILL.md" \
   "$PLUGIN_CACHE/skills/ui-ux-designer/SKILL.md"

# webserver-security subskill
mkdir -p "$PLUGIN_CACHE/skills/webserver-security"
cp "$REPO_DIR/skills/webserver-security/SKILL.md" \
   "$PLUGIN_CACHE/skills/webserver-security/SKILL.md"

# supabase-security subskill
mkdir -p "$PLUGIN_CACHE/skills/supabase-security"
cp "$REPO_DIR/skills/supabase-security/SKILL.md" \
   "$PLUGIN_CACHE/skills/supabase-security/SKILL.md"

# Plugin CLAUDE.md
cat > "$PLUGIN_CACHE/CLAUDE.md" << 'CLAUDE_EOF'
# Sys Admin

Twelve QA, design, and productivity skills — invoke via the router or directly.

- Multi-domain audit (UI + SQL + API + SEO + visual + server): use `sys-admin:sys-admin`
- Build UI/UX, animations, 3D, scroll effects, design systems: use `sys-admin:ui-ux-designer`
- Functional UI / web app testing: use `sys-admin:website-ui-deep-qa`
- Visual design QA (regression + industry benchmark): use `sys-admin:ui-visual-qa`
- SEO page optimization audit: use `sys-admin:seo-deep-qa`
- SQL / database audit: use `sys-admin:sql-deep-qa`
- PostgreSQL-specific deep audit: use `sys-admin:postgres-deep-qa`
- REST / GraphQL / gRPC API testing: use `sys-admin:api-deep-qa`
- Web server security (Apache/Nginx/OpenLiteSpeed/any): use `sys-admin:webserver-security`
- Supabase security audit (RLS, keys, auth, storage, functions): use `sys-admin:supabase-security`
- Claude Code plugin lifecycle: use `sys-admin:marketplace`

## MANDATORY RULE — Smart Todo is always first

**For EVERY task — without exception — invoke `sys-admin:smart-todo` before any other action.**

This is the primary skill. It activates first, always. Not just for 3+ step tasks. Every task. Before reading files, before writing code, before using any tool.

No exceptions for:
- "Simple" tasks
- "Quick" fixes
- "Just one thing"
- "Just a question"
- Single-step work

`sys-admin:smart-todo` runs FIRST. Everything else runs after.

Use `sys-admin:smart-todo` to:
- Create a tracked list immediately (even single-item lists)
- Update item status in real time as you work
- Add discovered subtasks the moment they appear
- Surface blockers explicitly rather than stalling silently
CLAUDE_EOF

# .claude-plugin manifests (required by Claude Code plugin loader)
mkdir -p "$PLUGIN_CACHE/.claude-plugin"
cat > "$PLUGIN_CACHE/.claude-plugin/plugin.json" << 'PLUGIN_EOF'
{
  "name": "sys-admin",
  "description": "Twelve skills: UI/UX design builder, functional UI QA (Playwright, 46 helpers), visual design QA, SEO audit (21 categories), SQL audit (17 categories), PostgreSQL deep audit, API testing (18 categories), web server security (Apache/Nginx/OLS, 22 categories), Supabase security audit (20 categories: RLS/keys/auth/storage/functions), smart todo, marketplace guide.",
  "author": {
    "name": "Rushikesh Sakharle",
    "url": "https://github.com/rushikeshsakharleofficial"
  },
  "version": "1.0.0",
  "license": "MIT",
  "homepage": "https://github.com/rushikeshsakharleofficial/sys-admin",
  "repository": "https://github.com/rushikeshsakharleofficial/sys-admin",
  "keywords": ["testing", "qa", "ui", "web", "security", "playwright", "sql", "postgresql", "api", "seo", "visual", "design"]
}
PLUGIN_EOF

cat > "$PLUGIN_CACHE/.claude-plugin/marketplace.json" << 'MARKET_EOF'
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "sys-admin",
  "description": "Eleven skills: UI/UX design builder (3D/GSAP/Framer Motion), functional UI QA (Playwright, 46 helpers), visual design QA (pixel regression + 73-design benchmark), SEO audit (21 categories), web server security (Apache/Nginx/OLS, 22 categories: TLS, headers, traversal, DoS, RCE, WAF), SQL audit, PostgreSQL deep audit, API testing, smart todo, marketplace guide.",
  "owner": {
    "name": "Rushikesh Sakharle",
    "url": "https://github.com/rushikeshsakharleofficial"
  },
  "plugins": [
    {
      "name": "sys-admin",
      "description": "Eleven skills. Use sys-admin:webserver-security for Apache/Nginx/OLS hardening, sys-admin:ui-ux-designer to build UI/UX, sys-admin:sys-admin for multi-domain routing, sys-admin:website-ui-deep-qa for functional UI testing, sys-admin:ui-visual-qa for visual QA.",
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
echo "   /sys-admin:ui-ux-designer      — UI/UX design builder (3D, GSAP, Framer Motion, design systems)"
echo "   /sys-admin:website-ui-deep-qa  — UI QA subskill (46 helpers)"
echo "   /sys-admin:ui-visual-qa        — visual QA (regression + design quality + industry benchmark)"
echo "   /sys-admin:seo-deep-qa         — SEO audit (21 check categories)"
echo "   /sys-admin:sql-deep-qa         — SQL audit (17 categories)"
echo "   /sys-admin:postgres-deep-qa    — PostgreSQL deep audit (17 categories)"
echo "   /sys-admin:api-deep-qa         — API testing (18 categories)"
echo "   /sys-admin:webserver-security  — Apache/Nginx/OLS/any server security (22 categories)"
echo "   /sys-admin:supabase-security   — Supabase security audit (20 categories)"
echo "   /sys-admin:smart-todo          — task tracking (auto for 3+ step tasks)"
echo "   /sys-admin:marketplace         — Claude Code plugin lifecycle"
echo ""
echo "   Restart Claude Code to load the new plugin."
