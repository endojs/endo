# Trust-On-First-Bind for Capability Policy Bindings

| | |
|---|---|
| **Created** | 2026-05-08 |
| **Updated** | 2026-05-08 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |
| **Source** | PR #144 inline comment [discussion_r3212479564](https://github.com/endojs/endo-but-for-bots/pull/144#discussion_r3212479564) on `.changeset/agent-tools-http-client.md` |
| **Addendum to** | [endoclaw-network-fetch](endoclaw-network-fetch.md) and the PR #144 HttpClient design revision (HttpController split) |

## What is the Problem Being Solved?

A confined capability whose policy is "allowlist of permitted targets"
(an HTTP client allowlisted to a set of origins, a `Browser` exo
allowlisted to a set of origins, a `Shell` allowlisted to a set of
commands, a `Mount` allowlisted to a set of subpaths) has to answer
the same question every time it is handed a target outside its
allowlist:

- **Refuse** with a fault that the user has to resolve out of band (the
  agent stalls; the user opens a CLI and runs `endo http policy add
  https://api.example.com`; the agent retries).
- **Auto-add and continue** (least intrusive at the moment, but the
  allowlist is no longer a host-controlled artifact, and it grows
  without review).
- **Refer the decision** to a higher authority (the user, an attenuator
  the cap was minted with) and pin the answer for next time.

The third option is the well-known **trust-on-first-use (TOFU)**
pattern: SSH pins a host key the first time it sees one, browsers
prompt for notification permission the first time a site requests
one, and OS package managers ask before adding a new keyring.
The proposed pattern, **trust-on-first-bind**, is TOFU specialised
to a capability whose policy is itself a capability surface: the
"first use" is the first attempt to *bind* a policy slot (an origin,
a path, a command) at request time, and the pin is recorded into the
controller's policy storage where it is later inspectable, revocable,
and exportable.

The pattern is a **shared adapter for capability policy storage**, not
a feature of any one capability surface. PR #144's `HttpClient` raises
the question first because origin allowlists are the smallest concrete
example, but the same machine should plug into the `Browser` exo
([endoclaw-browser](endoclaw-browser.md)), the `Shell`/`Git` exos
([daemon-agent-tools](daemon-agent-tools.md)), and `Mount` deny-pattern
extensions ([daemon-mount](daemon-mount.md)).
This design describes the pattern once.

## Design

### State machine

A trust-on-first-bind controller holds a per-policy-slot state for
every target it has ever encountered:

```
        first encounter
   --------------------------->  Pending
                                    |
                                    | decision (allow / deny / always-deny)
                                    v
                              +-----+-----+
                              |           |
              Pinned-Allow    |   Pinned-Deny
                              |           |
                              v           v
                         (revocable)  (revocable)
```

The states:

- **Unknown.** Default for any target the controller has never seen.
  No record in policy storage.
- **Pending.** A request is in flight asking the higher authority to
  decide.
  Subsequent requests for the same target wait on the same pending
  decision (coalesced); they do not raise a second prompt.
- **Pinned-Allow.** Target is in the allowlist.
  Record carries provenance (who decided, when, by what mechanism).
- **Pinned-Deny.** Target was explicitly refused.
  Distinct from Unknown so a second request does not re-prompt.
  Promotable back to Unknown by the controller holder if the deny was
  a transient mistake.
- **Revoked.** Previously Pinned-Allow, now refused.
  In-flight requests that were already past the policy check abort.

The controller's `fetch`/`open`/`exec` entry point is
shaped as:

```js
const decideAndApply = async (target) => {
  const state = policy.get(target);
  if (state === 'Pinned-Allow') return proceed(target);
  if (state === 'Pinned-Deny' || state === 'Revoked') {
    throw makeError(X`policy denies ${q(target)}`);
  }
  // Unknown or Pending: ask the authority.
  const decision = await prompt(target); // coalesces concurrent
  policy.set(target, decision === 'allow' ? 'Pinned-Allow' : 'Pinned-Deny');
  if (decision === 'allow') return proceed(target);
  throw makeError(X`policy refused ${q(target)}`);
};
```

The `prompt` step is the only point of variation across deployment
modes; see "Decision modes" below.

### Decision modes

The controller is constructed with a `policyMode` enum that selects
the prompt implementation:

| Mode | Prompt behaviour | Use case |
|---|---|---|
| `'strict'` | No prompt. Unknown targets raise a fault immediately. | Production daemons; the original behaviour PR #144 ships. |
| `'tofu-prompt'` | Prompt the controller's holder (the user, an agent in interactive mode) and record the answer. | Interactive sessions; the developer wants the cap to grow as they work without restarting. |
| `'tofu-auto'` | Auto-Pinned-Allow with audit-log entry and a reactive notification to the holder. | Trusted-environment internals; never the default for an HTTP client because it converts the allowlist into a write-once log. |
| `'tofu-attenuator'` | Forward the decision to a separately-supplied attenuator capability. | The cap was minted with a policy attenuator (e.g. a "ask the user via Chat" exo); the controller does not know what the prompt UI looks like. |

`'strict'` is the default.
The PR #144 changeset describes only `'strict'`; this design adds the
other three as opt-in.

### Who decides

The decision authority is a separate object from the controller, passed
in at construction:

```js
const { client, control } = makeHttpClientKit({
  allowedOrigins,
  policyMode: 'tofu-attenuator',
  policyAuthority, // a capability with .decide({ kind, target, context })
});
```

In `'tofu-prompt'` mode the daemon holds the authority and surfaces
the prompt through whatever channel the holder is connected through
(Chat message, CLI question, Familiar dialog).
In `'tofu-attenuator'` mode the holder supplies the authority when
they mint the cap, and it can be a Chat command bar slot, a form
([daemon-form-request](daemon-form-request.md)), or an external
service.
In `'tofu-auto'` mode the authority is a no-op `{ decide: async () =>
'allow' }` whose only side effect is the audit log entry; passing a
real authority is allowed and would amount to `'tofu-attenuator'` with
auto-allow as a default.

### Policy storage

The controller's `control` facet exposes the policy table:

```ts
interface HttpController {
  // existing PR #144 surface
  setAllowedOrigins(origins: string[]): void;
  // …
  // new with trust-on-first-bind
  listBindings(): Array<{
    target: string;
    state: 'Pinned-Allow' | 'Pinned-Deny' | 'Revoked';
    decidedAt: number;        // ms epoch
    decidedBy: string;        // human identifier (user pet name, etc.)
    decisionMode: 'strict' | 'tofu-prompt' | 'tofu-auto' | 'tofu-attenuator';
    note?: string;            // optional reviewer comment
  }>;
  revokeBinding(target: string): void;
  unpin(target: string): void; // demote to Unknown; next request re-prompts
  setPolicyMode(mode: 'strict' | 'tofu-prompt' | 'tofu-auto' | 'tofu-attenuator'): void;
}
```

`listBindings` is the audit surface; `revokeBinding` and `unpin` are
the two revocation knobs.
The distinction matters: `revokeBinding` records an active refusal
that survives a future prompt round (the holder said "never"),
`unpin` says "I was wrong, ask me again next time".

Storage lives wherever the controller's other policy lives.
For `HttpController` that is the same persisted state as
`allowedOrigins`/`maxRequestsPerMinute`, which means the SQLite-backed
formula store the daemon already uses for cap state.
No new persistence layer.

### Revocation interaction

Revocation in trust-on-first-bind has two scopes:

1. **Pin revocation** (`revokeBinding`).
   The pin moves to `Revoked`.
   In-flight requests that have already passed the policy check
   continue to completion; the request that triggered the pin is past
   the check before the network call begins.
   New requests for that target are refused.
2. **Cap revocation** (the existing `control.revoke()` from PR #144).
   The whole controller goes dead; in-flight requests abort via the
   existing AbortController plumbing PR #144 already wires.
   The policy table is preserved on disk so a future controller minted
   from the same configuration can re-load the bindings (or the holder
   can choose to discard them).

The "in-flight at the moment of pin revocation" case is intentionally
permissive: the alternative is to wire an AbortController per request
into the policy state, which complicates the request shape for an
edge case (a target was Pinned-Allow at request start; the holder
revoked it during the network roundtrip).
If the holder needs to abort in-flight requests, they revoke the cap.

### Audit trail

Every state transition appends an entry to a per-controller audit log:

```ts
type AuditEntry = {
  at: number;             // ms epoch
  target: string;
  fromState: 'Unknown' | 'Pinned-Allow' | 'Pinned-Deny' | 'Pending' | 'Revoked';
  toState: 'Pinned-Allow' | 'Pinned-Deny' | 'Pending' | 'Revoked' | 'Unknown';
  decisionMode: 'strict' | 'tofu-prompt' | 'tofu-auto' | 'tofu-attenuator';
  decidedBy: string;
  context?: { method?: string; userAgentNote?: string };
};
```

The log is bounded (most recent N entries, default 1024) and exposed
via `control.listAuditEntries({ since, limit })`.
Old entries roll off; the persistent `listBindings` table is the
durable record, the audit log is the change history.

### Composition with HttpController

The PR #144 review asks for an `HttpController`/`HttpClient` split (an
`http` subcommand with `mk` producing both, then sibling subcommands
that adjust policy through the named controller).
Trust-on-first-bind plugs into that split as a `policyMode` constructor
parameter on `HttpController`:

```bash
endo http mk my-http \
  --origins https://api.github.com \
  --policy-mode tofu-prompt
```

After the cap is minted, the holder can:

```bash
endo http policy list my-http             # listBindings
endo http policy add my-http <origin>     # explicit Pinned-Allow
endo http policy revoke my-http <origin>  # Pinned-Deny via revokeBinding
endo http policy unpin my-http <origin>   # back to Unknown
endo http policy mode my-http strict      # setPolicyMode
endo http policy log my-http --since 1h
```

The `endo http` subcommand surface is the revised PR #144 design's
responsibility; this design only specifies the verbs trust-on-first-
bind contributes.

### Failure modes

- **Holder rejects.** The request fails with `policy refused
  <target>`; the requester can retry, in which case the pin is read
  from policy and the request fails again immediately.
  The requester is responsible for not retry-storming.
- **Prompt times out.** The controller is constructed with a
  `policyPromptTimeoutMs` (default 30 s, separate from the request
  timeout); if the authority does not respond, the binding stays
  `Pending` for that interval and then the request fails with
  `policy decision timed out`.
  The binding returns to `Unknown`; next request re-prompts.
  The audit log records the timeout.
- **Network goes down during prompt.** Orthogonal: the network is
  not consulted until the policy check passes.
  If the network is down when the request is allowed to proceed, the
  request fails on connect; the pin remains.
- **Authority capability revoked mid-prompt.** The pending prompt
  rejects with the upstream error; the binding stays `Unknown` so a
  later request can be re-prompted via a freshly-supplied authority
  (set with `setPolicyAuthority`).
- **Concurrent first requests.** The controller coalesces concurrent
  requests for the same Unknown target into a single Pending
  decision; all callers wait on that one prompt and observe the same
  outcome.
  This avoids stacking prompts on the holder for what is one decision.

## Alternatives considered

### Refuse and document

Ship only `'strict'` mode (PR #144's behaviour) and require the holder
to mutate the allowlist out of band.
This is the do-nothing alternative and it is the right default.
The argument for trust-on-first-bind as an opt-in is that interactive
agent development is the primary use case for these caps in the near
term, and a strict-only cap means the developer alt-tabs to a CLI for
every new origin they discover.

### Auto-add with audit log

Always auto-add and log; rely on the holder to review the audit log.
This is `'tofu-auto'` as the only mode.
Rejected as a default because it converts the allowlist from a
host-controlled artifact into a write-once side-effect log; the
allowlist no longer protects against agent compromise (a compromised
agent can extend its own reach by attempting requests).
Acceptable as opt-in for environments where the agent is trusted but
the allowlist's role is operational accounting.

### Per-request prompts (no pinning)

Prompt every time, never pin.
Rejected because the prompt cost dominates: a chat agent fetching
five pages from `api.example.com` would issue five identical prompts.
TOFU pins the answer; that is the whole point.

### TLS certificate pinning

A different problem: TOFU on a server's TLS public key, not its
allowlist membership.
Adjacent and useful but out of scope for the policy-binding question
here; documented as future work below.

## Out of Scope, Future Work

- **Per-target attenuators inside a binding.** A binding could carry
  per-method limits (allow GET but not POST), per-path limits (allow
  `/repos/*` but not `/users/*`), or per-time-of-day limits.
  This design treats a binding as a binary gate; richer per-binding
  policy is a follow-on.
- **Cross-controller policy sharing.** Two `HttpController` instances
  may want to share a policy table (the user's "trusted origins" set).
  Out of scope; addressable by minting both controllers from a shared
  policy-store capability.
- **TLS certificate pinning.** Discussed under alternatives; tracked
  separately if and when it becomes a question.
- **Default-allow with deny-list.** The inverse posture (start open,
  pin denials).
  Not in this design because the capabilities under discussion
  (HTTP, browser, shell, mount) are explicitly default-deny by
  taste; an inverted controller is a different design.

## Open Questions

1. **Should `'tofu-prompt'` survive across daemon restart for a
   pending decision?**
   If the holder is offline when a prompt arrives, the prompt times
   out (per failure modes above) and the binding stays Unknown.
   An alternative is to persist the pending state and re-prompt on
   reconnect; this is a UX call and depends on whether holders stay
   connected for hours or seconds.
2. **Is the audit log per-controller or per-host?**
   Per-controller is the simpler model and matches the rest of PR
   #144's policy storage.
   Per-host (one log across every controller the host owns) gives a
   single pane of glass but couples controllers that should be
   independent.
3. **What does the prompt UI look like in `'tofu-prompt'` mode by
   default?**
   PR #144 ships a CLI; a CLI prompt blocks the running command.
   In Chat the prompt could be a [daemon-form-request](daemon-form-request.md);
   in Familiar an Electron dialog.
   The decision mode names abstract the surface, but the daemon needs
   one concrete default for `'tofu-prompt'`.
4. **Should the audit log entries be exportable as a structured
   stream** (event-stream subscription) so a higher-level monitoring
   capability can observe policy decisions across many controllers?
   Adjacent to the per-host question; deferable.
5. **Naming.** `trust-on-first-bind` is descriptive but is not yet a
   term of art.
   Alternatives considered: "ask-and-pin", "lazy allowlist",
   "deferred policy".
   Settled on `trust-on-first-bind` for this design because it
   evokes TOFU and "bind" matches the capability-system vocabulary
   for "the moment a name resolves to a target".

## Dependencies

| Design | Relationship |
|---|---|
| [endoclaw-network-fetch](endoclaw-network-fetch.md) | The originating motivation; HttpClient is the first surface that adopts trust-on-first-bind. |
| PR #144 HttpController revision | The split between `HttpClient` and `HttpController` provides the policy facet that this design extends. The revision PR will be linked here once it opens. |
| [endoclaw-browser](endoclaw-browser.md) | Same allowlist shape, same prompt-and-pin questions; should adopt this pattern. |
| [daemon-agent-tools](daemon-agent-tools.md) | `Shell` command allowlists and `Git` repo gates are candidates; the same audit-and-revoke surface applies. |
| [daemon-mount](daemon-mount.md) | Mount deny-patterns and allow-patterns are a policy surface; trust-on-first-bind for path opens is a future application. |
| [daemon-form-request](daemon-form-request.md) | The prompt UI for `'tofu-prompt'` and `'tofu-attenuator'` in Chat reuses this. |

## Test plan

- Pin a target via `'tofu-prompt'`; second request for the same
  target does not re-prompt.
- Two concurrent requests for the same Unknown target produce one
  prompt, both observe the same outcome.
- A `Pinned-Deny` target throws `policy refused`; a later `unpin`
  followed by a request re-prompts and can be allowed.
- A `revokeBinding` on a `Pinned-Allow` target moves it to `Revoked`;
  next request fails.
- Prompt timeout (`policyPromptTimeoutMs`) leaves the binding as
  `Unknown` and produces a `policy decision timed out` error; audit
  log records the timeout.
- `listBindings` returns the same content after a controller restart
  (state is persisted) for `'tofu-prompt'` and `'tofu-auto'` modes.
- `setPolicyMode('strict')` after some bindings exist preserves the
  bindings; new Unknown targets refuse without prompting.
- `'tofu-attenuator'` mode with a no-op attenuator that always
  rejects produces `Pinned-Deny` for every fresh target.
- Audit log roll-off: filling past the configured cap drops the
  oldest entries while preserving `listBindings`.

## Prompt

> Please dispatch a designer to propose a design for trust-on-first-bind
> as an addendum. Link forward from the TODO.

(PR #144 inline comment [discussion_r3212479564](https://github.com/endojs/endo-but-for-bots/pull/144#discussion_r3212479564)
on `.changeset/agent-tools-http-client.md` line 27.)
