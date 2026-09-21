# Agent guidance

Shared source for Codex/ChatGPT and Claude Code. `README.md` remains the
functional reference for the project; this file only holds working invariants.

## Skill discovery

Before hand-rolling a specialized, repeatable task (testing, UI design, deploy,
docs, PR review), use the `find-skills` skill. It is vendored in
`.agents/skills/find-skills/` and `.claude/skills/find-skills/`, so both Claude
Code and Codex/ChatGPT read it from this repository.

- When: the ask starts with "how do I X", "is there a skill for X" or "can you
  X", or you are about to reimplement a workflow that likely already ships as a
  skill.
- What it does: searches https://skills.sh (`npx skills find <query>`), checks
  install count, source and repo stars, and proposes the install command.
- Limit: never install without explicit approval. The skill proposes; adding a
  dependency to the environment is the repo owner's call.
- Precedence: project-local skills (those already under `.agents/skills/`) win
  over any external skill.
