# Daemon Guest Eval Simplification

| | |
|---|---|
| **Created** | 2026-03-21 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## Motivation

There are three configurations for agent authority over code evaluation:

1. **No eval** — the agent advises on code but cannot execute it.
   Mark Miller proposed this model early in Endo Familiar's development:
   reasoning about capability composition is tractable, so agents should
   be able to *advise* on code without running it.
   This remains useful for advisory-only roles.

2. **Eval with approval** — the agent proposes code, the user reviews
   and grants execution.
   This is the current `EndoGuest` behavior.
   In practice, the proposal/approval handshake for eval fatigues users.
   The hypothesis that approval adds safety has not been borne out —
   users approve reflexively, gaining neither security nor productivity.

3. **Eval with authority** — the agent evaluates freely, bounded only
   by reachable capabilities.
   This is the current `EndoHost` behavior and the model that
   `lal-fae-form-provisioning` agents already use via direct eval.
   Object-capability discipline already constrains what evaluated code
   can do.
   This is the practical default.

The eval-proposal message flow has not proven useful in practice.
`evaluate` is a "tool of tools" — having it drastically reduces the
need for special-purpose tools.
Ocap discipline is the safety boundary, not message approval.

## Design

`EndoGuest.evaluate()` should delegate to the same `formulateEval`
path that `EndoHost` uses today:

1. Resolve pet names in the guest's own namespace (preserving existing
   name resolution behavior).
2. Call `formulateEval()` directly with the resolved endowments and
   worker identifier.
3. Return the resulting value.

No message is created.
No proposal is sent.
No grant or counter-proposal flow is needed.

The guest's evaluate method becomes structurally identical to the
host's, differing only in which namespace is used for pet name
resolution (the guest's own, not the host's).

## What is Removed

- **`mail.evaluate()`** (the eval-proposal creation logic in `mail.js`)
  — currently creates a proposal message, sends it to the reviewer,
  and awaits a grant or counter-proposal.
- **`mail.grantEvaluate()` and `mail.counterEvaluate()`** — the
  reviewer-side grant and counter-proposal flows.
- **`EvalProposalReviewer` and `EvalProposalProposer`** message types.
- **`host.grantEvaluate()` and `host.counterEvaluate()`** in `host.js`
  — the host methods that handle eval proposal review.
- **The `Responder` exo** and its `resolveWithId` method — the
  intermediary that connects proposal responses to formula creation.
- **Related type definitions** in `types.d.ts` for the removed message
  types and proposal/reviewer interfaces.

## What is Preserved

- **Pet name resolution** in the guest's own namespace — the guest
  still resolves names against its own pet store.
- **`formulateEval()`** — the actual eval formula creation in the
  daemon, which compiles and evaluates code in a compartment with
  the specified endowments.
- **The worker constraint** — agents can only evaluate in workers they
  can access (e.g., `@main`).
  The worker reference is still resolved as a pet name.
- **All other message types** — request, package, value, and definition
  messages are unaffected.

## Design Decisions

1. **Ocap is the safety boundary, not message approval.**
   The capability model already constrains what evaluated code can
   access.
   An agent that can only reach `Dir` for `/project` cannot read
   `~/.ssh` regardless of whether eval is approved or direct.

2. **`evaluate` is a tool of tools.**
   With eval, an agent can compose capabilities programmatically,
   drastically reducing the need for special-purpose tools.
   Withholding eval forces building bespoke tools for each composition
   pattern.

3. **The three configurations remain possible at a higher level.**
   An attenuating proxy could withhold `evaluate` from a guest's
   facet, restoring the "no eval" or "eval with approval"
   configurations.
   But `EndoGuest` itself does not impose approval by default.

## Dependencies

| Design | Relationship |
|--------|-------------|
| [daemon-agent-tools](daemon-agent-tools.md) | Simplifies the tool surface — eval covers many tool patterns |
| [daemon-capability-bank](daemon-capability-bank.md) | Capability composition model that makes direct eval safe |
| [lal-fae-form-provisioning](lal-fae-form-provisioning.md) | Agents already use direct eval via this design |

## Prompt

> Early in Endo Familiar's development, the hypothesis was that AI
> agents should not be able to execute arbitrary code with their
> capabilities, since reasoning about capability composition is
> tractable.  Mark Miller proposed agents could *advise* on code without
> executing it.  In practice, the proposal/approval handshake for eval
> fatigues users.  The more useful configuration is one where agents
> evaluate code freely, constrained only by which capabilities they can
> reach.  `evaluate` is a "tool of tools" — having it drastically
> reduces the need for special-purpose tools.
>
> Design the simplification: EndoGuest and EndoAgent should have
> identical evaluate behavior — direct execution in a worker the agent
> can access (like `@main`), constrained only by the agent's reachable
> capabilities.  Remove the eval-proposal message flow
> (proposer/reviewer/grant/counter) from EndoGuest entirely.
