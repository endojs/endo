# EndoPi: Prompt Templates

| | |
|---|---|
| **Created** | 2026-05-15 |
| **Updated** | 2026-05-15 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Parent** | [endopi](endopi.md) |

## Motivation

Reusable user-prompt scaffolds (a "code review" prompt, a "write a
PR description" prompt, a "summarize this thread" prompt) are a basic
ergonomic affordance every modern coding harness offers. Pi calls them
*prompt templates*: a markdown file with optional `{{var}}` placeholders,
expanded into the editor when the user types `/templatename`.

Endo's Chat UI has a command bar but no template expansion. This is a
small, self-contained gap.

## Design

### On-disk shape

```
~/.pi/agent/prompts/review.md          # global
.pi/prompts/review.md                  # project
```

A template file:

```markdown
<!-- ~/.pi/agent/prompts/review.md -->
Review this code for bugs, security issues, and performance problems.
Focus on: {{focus}}
```

Variables use Mustache-style `{{name}}` syntax. The Chat UI surfaces
them as form-field prompts when the template is invoked with no
arguments; bash-style positional arguments fill them in when the user
provides them on the slash command line.

### Discovery

The same walker that handles
[endopi-skills-markdown-format](endopi-skills-markdown-format.md)
scans a parallel set of paths for `*.md` files:

- `~/.pi/agent/prompts/*.md`
- `~/.agents/prompts/*.md` (cross-harness)
- `.pi/prompts/*.md`
- `.agents/prompts/*.md` (walk up from cwd)

### Slash-command integration

Templates appear in the autocomplete list under `/`. Selecting one
expands the template body into the editor; the agent loop does not run
until the user presses Enter. This matches Pi's UX: a template is
*editor expansion*, not *agent invocation*.

The variable-prompt UI (when arguments are missing) reuses the Chat UI's
existing form-rendering surface from
[lal-fae-form-provisioning](lal-fae-form-provisioning.md).

### Composition

A template body can reference a skill ("then use `/skill:gh-cli`"). The
agent loop processes the skill reference on submit, the same way it
processes any slash command in a user message.

## Dependencies

| Design | Relationship |
|--------|--------------|
| [chat-slot-slash-commands](chat-slot-slash-commands.md) | Sibling slash-command infrastructure |
| [endopi-skills-markdown-format](endopi-skills-markdown-format.md) | Shares the discovery walker |
| [lal-fae-form-provisioning](lal-fae-form-provisioning.md) | Variable-prompt UI |

## Phased implementation

1. **Loader + discovery.** Scan paths, parse, return `PromptTemplate[]`.
2. **Slash-command registration.** Templates appear in autocomplete.
3. **Variable substitution + argument prompts.** Form UI for missing
   variables.

## Out of scope

- **Template execution as agent prompts.** Templates expand the user's
  editor; they do not run autonomously. Autonomous prompts are
  endoclaw's proactive-messages territory.
- **Variable types beyond strings.** Pi keeps variables as plain string
  substitution; Endo follows.

## Citation

- [`packages/coding-agent/docs/prompt-templates.md`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/prompt-templates.md)
- [`packages/coding-agent/src/core/prompt-templates.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/prompt-templates.ts)

## Prompt

> Extracted from [endopi](endopi.md) § *Prompt templates*. Small,
> self-contained, low-risk; useful before larger workflow features
> land.
