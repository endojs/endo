# EndoPi: Markdown Skill Format (agentskills.io)

| | |
|---|---|
| **Created** | 2026-05-15 |
| **Updated** | 2026-05-15 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Parent** | [endopi](endopi.md) |

## Motivation

The Endo design [endoclaw-skill-registry](endoclaw-skill-registry.md)
covers the daemon-side surface: skills are pet names in an EndoDirectory,
discovered via `list` and resolved via `lookup`. What it does not cover
is the *on-disk authoring* shape: a directory with a `SKILL.md` file at
its root, frontmatter declaring the skill's name and description,
free-form markdown body, optional helper scripts and reference docs
alongside.

Pi, Claude Code, and Codex have all adopted the [agentskills.io
specification](https://agentskills.io/specification) for this shape.
The result is that a skill written for any of those harnesses can be
loaded into the others. Endo joining this format means:

1. The Endo agent can consume skills written for other harnesses
   without translation (`~/.claude/skills`, `~/.codex/skills`).
2. A skill authored for Endo can be shared with users of other
   harnesses.
3. Progressive disclosure (descriptions in the system prompt; bodies
   read on demand by the agent) reduces context cost compared to
   inlining every skill.

## Design

### On-disk shape

```
my-skill/
├── SKILL.md              # required: frontmatter + body
├── scripts/              # optional: helper scripts the body references
│   └── process.sh
├── references/           # optional: details loaded on demand
│   └── api.md
└── assets/               # optional: templates, data
    └── template.json
```

### SKILL.md frontmatter (per agentskills.io)

```markdown
---
name: my-skill
description: What this skill does and when to use it.
license: MIT
compatibility: Requires git, bash.
allowed-tools: read bash
disable-model-invocation: false
---

# My Skill

## Usage

Run `./scripts/process.sh <input>`. See [API reference](references/api.md).
```

Validation:

- `name`: required, max 64 chars, lowercase a-z / 0-9 / hyphens, must
  match the parent directory name.
- `description`: required, max 1024 chars.
- All other fields optional.

Endo follows Pi's posture: warn on violations, but remain lenient so
foreign skills load.

### Loader

A new `packages/lal/skills.js` (or shared module) provides:

```js
// Discovery: scan paths, parse frontmatter, return Skill[]
const skills = await discoverSkills({
  paths: [
    '~/.pi/agent/skills',
    '~/.agents/skills',
    '~/.claude/skills',
    '.agents/skills', // walk up from cwd to repo root
    '.pi/skills',
  ],
});

// Inject into the system prompt
const systemPrompt = buildSystemPrompt({
  ...,
  skills,
});
```

The system prompt receives a compact descriptor list (name +
description) per skill. When the agent decides it needs the skill, it
uses `read` to load the full `SKILL.md`. The slash command
`/skill:my-skill` forces immediate load when the model does not do so on
its own.

### Integration with the daemon-side registry

The on-disk shape is the *authoring* surface. The
[endoclaw-skill-registry](endoclaw-skill-registry.md) EndoDirectory is
the *granting* surface. The bridge: a guest module that, given a
filesystem path to a skill directory, registers the skill as a daemon
formula and adds it to the agent's `skills/` EndoDirectory.

This composition means:

- A user authoring a skill at the command line creates files in their
  project's `.agents/skills/<name>/`. The agent loads them at startup.
- A user receiving a skill via the daemon's `request` mechanism receives
  a formula in their `skills/` directory, no filesystem write needed.

### Cross-harness compatibility

Pi documents adding `~/.claude/skills` to its settings. Endo does the
same in reverse: a setting (or default) instructs the agent to scan
`~/.claude/skills`, `~/.codex/skills`, and the Pi paths.

## Phased implementation

1. **Frontmatter parser + discovery walker.** Parse `SKILL.md`,
   validate, return `Skill[]`. No agent integration yet.
2. **System-prompt injection.** Compact descriptor list appears in the
   system prompt. The agent can `read` a skill by path on demand.
3. **Slash command (`/skill:name`).** Forces immediate load.
4. **Daemon-formula bridge.** A skill on disk can be granted as a
   daemon formula per [endoclaw-skill-registry](endoclaw-skill-registry.md).
5. **Cross-harness paths.** Default-enable scanning of Claude /
   Codex / Pi skill directories.

## Dependencies

| Design | Relationship |
|--------|--------------|
| [endoclaw-skill-registry](endoclaw-skill-registry.md) | Daemon-side complement (skills as EndoDirectory) |
| [endopi-extension-package-manifest](endopi-extension-package-manifest.md) | Skills shippable as packages |
| [lal-fae-form-provisioning](lal-fae-form-provisioning.md) | Skill grants part of provisioning |

## Open questions

- Where do project-local skills live? Pi uses `.pi/skills/` and
  `.agents/skills/`; Claude Code uses `.claude/skills/`. Endo can either
  pick one and document it, or scan all three.
- Does `allowed-tools` map onto capability grants? Today Pi treats it
  experimentally; in Endo, this could be a structural grant ("this
  skill only sees these capabilities"). The Endo answer is more
  rigorous than Pi's; the alignment is worth doing.
- Is the in-memory skill cache invalidated on file change? Pi
  hot-reloads via `/reload`. Endo can use the existing
  `filesystem-watchers` design once it lands.

## Citation

- [`packages/coding-agent/docs/skills.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md)
- [`packages/coding-agent/src/core/skills.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/skills.ts)
- [`packages/coding-agent/src/core/system-prompt.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/system-prompt.ts) (skill formatting block)
- [agentskills.io specification](https://agentskills.io/specification) (external)

## Prompt

> Extracted from [endopi](endopi.md) § *Skills system*. Bridges the
> daemon-side skill registry to the on-disk authoring format the
> broader coding-agent ecosystem has standardized on.
