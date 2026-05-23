# CLAUDE.md

This file guides Claude Code when working with this skill repository.

## Main skill

`SKILL.md` is the primary file Claude Code loads and uses. Keep the frontmatter valid:

```yaml
---
name: website-ui-deep-qa
description: ...
---
```

The body should stay operational, specific, and easy for weaker models to follow.

## Invocation

```text
/website-ui-deep-qa Test this app deeply with Playwright MCP.
```

## Repo structure

- `SKILL.md`: canonical skill instructions
- `AGENTS.md`: Codex/OpenAI-style repository guidance
- `agents/openai.yaml`: UI metadata for compatible agents
- `resources/`: checklists and templates referenced by the skill
- `tests/deep-ui/`: Playwright Test implementation
- `playwright.config.ts`: viewport and browser matrix

## Verification

Run:

```bash
npm install
npx playwright install
npm test
```

When editing only Markdown, review links, paths, and frontmatter manually.

## Quality bar

The skill must remain:

- explicit
- safe
- repeatable
- evidence-driven
- suitable for a weaker model
- honest about untested areas
