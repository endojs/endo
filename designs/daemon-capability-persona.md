# Delegates and Epithets: Ideas and Directions

| | |
|---|---|
| **Date** | 2026-02-16 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

This document explores how an agent in Endo can create subordinate
agents — **delegates** — that carry obligatory, verifiable, deniable
claims about their relationships.  We call these claims **epithets**.

The motivating case is AI agents: Alice creates an agent Aifred with
the epithet "(assistant to Alice)."  Anyone Aifred interacts with can
verify this claim by asking Alice's Handle directly, and Alice can
deny it at her discretion.  But the mechanism is general — it applies
to any delegation relationship, not just AI assistants.

These ideas are at varying levels of maturity.  Some are near-term
(extending Handle to carry epithets, recursive epithet propagation).
Others are more speculative (cross-node epithet verification, platform
connector bridges).  The intent is to lay out the design space so that
contributors can pick one facet and write a concrete design for it.

## The Handle/Agent foundation

Understanding Endo's existing identity primitives is essential before
discussing delegates.

**Handle.**  A Handle (`packages/daemon/src/interfaces.js`,
`HandleInterface`) is a mailbox endpoint with two methods: `receive()`
accepts an incoming envelope, and `open()` verifies that the sender is
who they claim to be.  The envelope protocol prevents mail fraud — a
receiver calls `E(senderHandle).open(envelope)` to confirm the sender
recognizes the envelope, catching forgeries.  Every Handle has a
formula identifier, and the `handle` formula type links back to its
owning agent (`{ type: 'handle', agent: agentId }`).

**Agent.**  An Agent (Host or Guest) extends `EndoDirectory` — it *is*
a pet-name directory with mail operations.  The mail methods
(`send()`, `request()`, `reply()`) take **pet name paths** as
recipients, not raw addresses.  `send("bob", ...)` resolves "bob"
through the agent's directory to a formula identifier, looks up the
corresponding Handle, and delivers via the envelope protocol.  An
agent can only message names it holds — structural confinement is
already the default.

**Pet-name directories.**  Each agent's directory is a NameHub.  Pet
names are locally scoped and unforgeable — they are mappings the host
writes into the agent's pet store.  An agent cannot fabricate a pet
name; it can only use the names the host has granted.

**What's missing.**  Today a Handle is opaque.  You can send it mail
and verify that mail came from it, but you cannot ask it anything
*about itself*.  There is no way for Bob to ask Aifred's Handle "who
are you?" or "what is your relationship to Alice?"  And even if
Aifred's Handle self-reported a relationship, the claim would be
unverifiable — Aifred could lie.  The delegate/epithet model fills
this gap.

## Core ideas

### Delegates

A **delegate** is an agent (Handle + agency) created by another agent,
carrying obligatory epithets about its relationship to its creator.
This is attenuation applied to identity: the delegate has the powers
its creator grants it (directory entries, service connections), but it
also carries claims it cannot shed.

In the existing architecture, this is close to what happens when a
Host creates a Guest — the Guest gets a Handle, a pet-name directory,
and mail powers, scoped by what the Host writes into its directory.
A delegate extends this by adding epithets to the Guest's Handle.

The delegate's creator is its **principal**.  The principal's Handle is
referenced in the delegate's epithets.  This is not a configuration
or metadata annotation — it is a structural relationship that the
delegate cannot modify or remove, because the epithet is part of the
Handle's formula (set at creation, immutable to the evaluator).

### Epithets

An **epithet** is a structured claim carried by a Handle:

```
Epithet = {
  relationship: string,       // e.g., "assistant", "majordomo", "ci-runner"
  principal: Handle,          // the Handle this relationship is relative to
}
```

An epithet says: "this Handle stands in the named relationship to that
Handle."  The relationship is human-meaningful — it describes how the
delegate relates to its principal in terms that a person (or an LLM)
can understand.

Epithets are **obligatory**: the delegate's creator sets them at
creation time, and the delegate cannot remove or modify them.  They
are part of the Handle's identity, not a voluntary self-description.

Epithets are **verifiable**: anyone holding the principal's Handle can
ask it to confirm or deny the relationship.  The verification is a
direct interaction between the verifier and the principal — it does
not go through the delegate.

Epithets are **deniable**: the principal can deny the relationship
even if it is true.  This is not a flaw; it is a feature.  Alice
might create Aifred for a sensitive project and want to deny the
relationship to certain parties.  Deniability is under the
principal's control.

### Recursive epithet chains

When a delegate creates its own subordinate, the subordinate inherits
the delegate's entire epithet chain and must add at least one new
epithet describing its relationship to the delegate.  The chain
grows monotonically — it can never shrink.

```
Alice creates Aifred:
  Aifred's epithets: [(assistant to Alice)]

Aifred creates Jarvis:
  Jarvis's epithets: [(majordomo of Aifred), (assistant to Alice)]

Jarvis creates Minion:
  Minion's epithets: [(worker for Jarvis), (majordomo of Aifred), (assistant to Alice)]
```

The composite epithet reads naturally from left to right as a chain of
delegation: Minion is a worker for Jarvis, who is a majordomo of
Aifred, who is an assistant to Alice.  Each link is independently
verifiable by asking the referenced Handle.

This is the same attenuation pattern as Dir/File: a Dir can create a
subDir (narrowing scope) but cannot widen it.  A delegate can create
sub-delegates (adding epithets) but cannot remove inherited ones.
Authority over identity narrows as you go deeper in the delegation
tree.

#### Enforcement

The delegate's `provideGuest` (or equivalent creation method) must:

1. Accept the new epithet(s) for the subordinate.
2. Prepend them to the delegate's own epithet chain.
3. Store the composite chain in the subordinate's Handle formula.
4. The subordinate's Handle formula is immutable — the chain cannot
   be modified after creation.

The delegate cannot create a subordinate without propagating its own
chain, because the creation method is guarded by an interface that
requires the chain as input and the daemon (which writes the formula)
prepends the inherited epithets.  The delegate has no mechanism to
create a "clean" Handle — only the original Host can do that.

### Verification protocol

Bob holds a Handle for Aifred.  Aifred's Handle carries the epithet
"(assistant to Alice)."  Bob wants to verify this claim.

```
1. Bob inspects Aifred's Handle to read its epithet chain.
   → [(assistant to Alice)]
   → The epithet includes a reference to Alice's Handle.

2. Bob asks Alice's Handle: "Do you confirm that this Handle
   stands in the 'assistant' relationship to you?"
   → E(aliceHandle).verify(aifredHandle, "assistant")

3. Alice's Handle responds:
   → true:  "Yes, I created this delegate as my assistant."
   → false: "No, I deny this relationship."
   → (silence / throw): "I decline to answer."
```

The response is Alice's choice.  Her Handle might:

- Confirm automatically for all verifiers (public confirmation).
- Confirm selectively based on who's asking (requires knowing the
  verifier's identity — possible via the envelope protocol).
- Deny always (full deniability, even to legitimate verifiers).
- Delegate the confirmation decision to a separate facet (so Alice
  can grant Bob the ability to verify without granting Carol the same).

For the full chain, Bob verifies each link independently:

```
Jarvis's epithets: [(majordomo of Aifred), (assistant to Alice)]

Bob verifies link 1:
  E(aifredHandle).verify(jarvisHandle, "majordomo") → true/false

Bob verifies link 2:
  E(aliceHandle).verify(aifredHandle, "assistant") → true/false
```

Each link in the chain is a separate verification interaction with a
separate principal.  A break at any link means the chain is not fully
verified from that point onward.

### Handle extension

The existing `HandleInterface` has `receive()` and `open()`.
Epithets suggest two additions:

```js
// Reading epithets (anyone holding the Handle can do this)
epithets: M.call().returns(M.arrayOf(EpithetShape)),

// Verification (anyone holding the Handle can ask)
verify: M.call(M.remotable('Handle'), M.string())
  .returns(M.promise(M.boolean())),
```

`epithets()` returns the Handle's epithet chain.  This is a read
operation — the epithets are public to anyone who holds the Handle.
They are claims, not secrets.  Their value comes from verifiability,
not from concealment.

`verify(subordinateHandle, relationship)` asks: "Did you create this
Handle as your [relationship]?"  The response is at the discretion of
the Handle's owner.  The default implementation for a Host-created
delegate might confirm automatically; the Host could attenuate the
verification behavior.

#### Caretaker for verification policy

The Host (or delegate-creator) might want to control the verification
policy separately from the Handle itself.  The caretaker pattern
applies:

- **Handle** (delegate-held, publicly reachable): carries epithets,
  supports `verify()` with whatever policy the creator set.
- **HandleControl** (creator-held): can update the verification policy
  (e.g., switch from "confirm all" to "deny all" to "confirm
  selectively"), and can revoke the Handle entirely.

The delegate holds its Handle but cannot influence how its principal's
Handle responds to verification queries about it.  Alice controls
whether she confirms Aifred's epithet, not Aifred.

## Motivation: AI agents as the first application

The delegate/epithet model is general, but AI agents are the
motivating case and likely first implementation.

### The problem

AI coding agents today either act as the user (sending messages,
creating accounts, pushing code under the user's name) or have no
external identity at all.  Both are problematic:

- **Acting as the user** enables impersonation.  A prompt-injected
  agent sending Slack messages as "Alice" is indistinguishable from
  Alice herself.  Other humans cannot tell they are interacting with
  an AI.  This violates emerging norms around AI disclosure [1] and
  creates liability for the user.

- **No external identity** limits usefulness.  An agent that cannot
  join a Slack channel, file a GitHub issue, or send an email cannot
  serve as an effective assistant for collaborative work.

### How delegates solve it

Alice creates Aifred as a delegate with the epithet "(AI assistant to
Alice)."  Aifred's Handle structurally carries this claim.  Anyone
Aifred messages within Endo can see the epithet and verify it with
Alice.  The claim is not a policy Aifred follows — it is a property
of Aifred's Handle that Aifred cannot remove.

For external services, a **connector** bridges Aifred's Handle to a
platform API.  The connector reads Aifred's epithet chain and renders
it into the platform's identity fields (Slack bot name, email
signature, Discord bio).  The connector enforces that every message
carries the disclosure, because the connector — not Aifred — controls
the platform credential.  Aifred holds a Handle to the connector;
the connector holds the OAuth token.

### Anti-impersonation by construction

The invariant: **every externally visible action taken through a
delegate's Handle carries its epithet chain.**

This follows from three properties:

1. **Epithets are immutable.**  Set at Handle creation, stored in the
   formula, not modifiable by the delegate.

2. **Credentials are custodied.**  The delegate never holds raw tokens.
   The connector does, and the connector reads the epithet chain before
   forwarding.

3. **Profile editing is separated.**  The connector controls the
   external account's profile (display name, bio, avatar).  The
   delegate holds only the action facet — it can send messages but
   cannot modify identity fields.  This is the identity/action facet
   split, expressed through the Handle/HandleControl caretaker pattern.

A prompt-injected agent with full control of its delegate powers still
cannot send a message without its epithet chain, because the epithet
is not something the agent adds — it is something the Handle *is*.

## Service connectors

A service connector is a plugin that bridges Endo Handles to an
external platform.  From the agent's perspective, a connector is just
another pet name in its directory — a Handle it can `send()` messages
to.

### Connectors as Handle recipients

The agent uses the standard mail API:

```
Agent calls:
  E(agent).send("design-channel", ["Bug fixed in abc123"], [], [])

The agent's directory resolves "design-channel" to a Handle backed by
the Slack connector.  The connector:
  1. Receives the envelope via its Handle's receive()
  2. Opens and validates the message via E(senderHandle).open(envelope)
  3. Reads the sender's epithet chain via E(senderHandle).epithets()
  4. Renders the epithet chain into platform disclosure
  5. Posts to #design via the Slack API using the stored bot token
```

No platform-specific methods are needed on the agent side.  The
connector translates Endo mail into API calls.

### Connectors as hubs

Each connector maintains its own mapping from formula identifiers
(Handles it has created) to platform identifiers (Slack user IDs,
email addresses).  The connector guarantees **pass-invariant equality
of Handles**: requesting a Handle for the same backing identity
returns the same formula identifier.  This lets the agent's directory
reliably detect that two pet names point to the same person.

```js
const bobHandle1 = await E(slackConnector).handleFor('@bob');
const bobHandle2 = await E(slackConnector).handleFor('@bob');
// Same formula identifier — the agent can detect this via identify()
```

### Platform-specific notes

**Slack.**  Bot Token API is purpose-built for non-human actors.  Bot
display name includes the epithet chain (e.g., "Aifred [AI assistant
for Alice]").  Messages carry the BOT badge natively.

**Discord.**  Bot API with BOT badge.  Bio includes epithet chain.

**Google Workspace.**  Service accounts send from a structurally
distinct address (e.g., `aifred@project.iam.gserviceaccount.com`).
Display name includes epithet chain.

**Generic OAuth.**  Connector wraps API calls, prepends/appends
epithet chain to message text on platforms without structured metadata.

### Credential custody

The daemon holds credentials on behalf of connectors.  The delegate
never sees raw tokens, API keys, or passwords.  It holds Handles that
interact with connectors that use credentials internally.

```
Credential Store (daemon-internal, connector-scoped)
 ├─ "aifred/slack/bot-token"  → "xoxb-..."   (held by Slack connector)
 ├─ "aifred/google/svc-key"   → "{...}"      (held by Google connector)

Delegate's directory (pet names):
 ├─ "bob"              → Handle (Slack connector resolves to @bob)
 ├─ "design-channel"   → Handle (Slack connector resolves to #design)
 ├─ "carol"            → Handle (Google connector resolves to carol@acme.com)
    ↑ all Handles — delegate never touches credentials
```

## Handle-mediated interaction

Endo's existing architecture already provides the confinement property
that the agent can only interact with contacts it holds pet names for.
`send()`, `request()`, and `reply()` all take pet name paths.  The
agent resolves these through its directory, and if the name doesn't
resolve, the call fails.

This prevents data exfiltration, social engineering of strangers, and
contact enumeration — not through a policy, but through the structural
absence of a way to address arbitrary recipients.

The host populates the delegate's directory using standard `write()`:

```js
const bobHandle = await E(slackConnector).handleFor('@bob');
await E(host).write(['aifred', 'bob'], bobHandle);
```

### Multi-service contacts

A single person may have accounts on multiple services.  The host can
group per-service Handles under a directory prefix:

```
"bob/"
  ├─ "slack"    → Handle (Slack connector)
  ├─ "email"    → Handle (Google connector)
  └─ "github"   → Handle (GitHub connector)
```

The agent uses `send(["bob", "slack"], ...)` using the existing
multi-segment path support.  Cross-service identity — "bob-on-slack
is the same person as bob-on-email" — is an assertion the host makes
by grouping handles under the same prefix.

### Corroboration and temporal identity

The grouping of handles under a directory prefix is **inherently
temporal** — it reflects who controls those accounts *now*, not
forever.  When Bob leaves the company and his Slack is reassigned,
the host removes "bob/slack" from the delegate's directory.

This is distinct from Keybase-style self-asserted proofs.  Endo
identity groupings are **host-asserted** (the principal manages the
directory) and **locally scoped** (the delegate sees only the names
the host has written).  This is appropriate because the delegate
operates within the host's authority.

## Discovery

When a delegate starts up, it discovers its own identity through
standard operations:

```js
// Read own epithet chain
const myHandle = await E(powers).lookup('SELF');
const myEpithets = await E(myHandle).epithets();
// [(AI assistant to aliceHandle)]

// Discover contacts
const contacts = await E(powers).list();
// ["bob", "carol", "design-channel", ...]
```

The delegate's system prompt (for an LLM-backed agent) should include
its epithet chain:

```
## Your Identity

You are Aifred (AI assistant to Alice Chen).
You can send messages to: bob, carol, design-channel.
All messages carry your epithet chain. You cannot suppress it.
```

## Possible interface changes

These are suggestive, not settled.

### Handle extension

```js
const EpithetShape = M.splitRecord({
  relationship: M.string(),
  principal: M.remotable('Handle'),
});

// HandleInterface gains two methods:
//   epithets() — read the epithet chain
//   verify(handle, relationship) — confirm/deny a subordinate's claim

// Alternatively, these could be a separate facet (EpithetInterface)
// layered on top of HandleInterface, to avoid changing the existing
// interface.  Any Handle could optionally support epithets.
```

### HandleControl extension

```js
// The creator holds HandleControl with verification policy:
const HandleControlI = M.interface('HandleControl', {
  setVerificationPolicy: M.call(
    M.or(M.literal('confirm-all'), M.literal('deny-all'), M.literal('selective')),
  ).returns(M.undefined()),
  revoke: M.call().returns(M.undefined()),
  help: M.call().returns(M.string()),
});
```

### Delegate creation

```js
// A delegate creates a sub-delegate.  The daemon enforces
// epithet chain propagation:
const jarvis = await E(aifred).provideGuest('jarvis', {
  epithets: [{ relationship: 'majordomo', principal: aifredHandle }],
  // Daemon prepends Aifred's own chain automatically:
  // Result: [(majordomo of Aifred), (AI assistant to Alice)]
});
```

### Connector interface

```js
const ConnectorI = M.interface('ServiceConnector', {
  handleFor: M.call(M.string()).returns(M.promise(M.remotable('Handle'))),
  listAvailable: M.call().returns(M.promise(M.arrayOf(M.string()))),
  help: M.call().returns(M.string()),
});
```

## Relationship to existing Endo abstractions

**Formula identifiers.**  A delegate's Handle formula could carry the
epithet chain: `{ type: 'handle', agent, epithets }`.  The epithets
are formula fields — immutable, set at creation.  This is the simplest
approach: no new formula type, just an extension to the handle formula.

**Mail system.**  The envelope protocol is unchanged.  `send()`
resolves pet names, looks up Handles, delivers via `receive()`/
`open()`.  The only addition is that a recipient can inspect the
sender's epithets after receiving a message.

**Pet-name directories.**  Delegates use the standard directory for
contacts.  The host writes Handles into the delegate's directory.
No new naming abstraction is needed.

**Guest creation.**  `provideGuest()` on Host already creates an agent
with a Handle and a pet-name directory.  Delegate creation extends
this by accepting epithets and storing them in the Handle formula.
The daemon enforces chain propagation.

**LAL agent.**  The LAL agent would `lookup('SELF')` and call
`epithets()` on its own Handle to discover its identity and delegation
chain.

## Security considerations

- **Epithet stripping.**  The primary threat is a delegate finding a
  way to create a subordinate without propagating its epithet chain.
  The defense is that `provideGuest` is implemented by the daemon, not
  the delegate.  The daemon prepends the inherited chain.  The delegate
  has no creation method that bypasses this.

- **Credential exfiltration.**  If the delegate can extract a raw
  connector credential, it can make unmediated API calls that bypass
  epithet rendering.  Credential custody (never exposing raw tokens)
  is critical.

- **Verification oracle.**  If Alice's `verify()` always returns true,
  a rogue agent could claim any relationship to her.  But the rogue
  cannot set Alice's Handle as its principal — only Alice (via
  `provideGuest` on her Host) can create a Handle whose formula
  references her Handle in its epithet chain.  Self-asserted epithets
  are meaningless without a formula created by the alleged principal.

- **Revocation.**  When Alice revokes Aifred's Handle (via
  HandleControl), all of Aifred's subordinates' epithet chains become
  unverifiable at the Aifred link.  Bob verifying Jarvis's chain
  would find that the "(majordomo of Aifred)" link fails because
  Aifred's Handle is revoked.  The chain breaks cleanly.

- **Social engineering.**  Even with epithets, an AI delegate could
  be used for social engineering.  Epithets mitigate (the recipient
  knows it's an AI) but do not eliminate the risk.

## Open Questions

- Should `epithets()` and `verify()` be added to `HandleInterface`
  directly, or should they be a separate optional facet?  Adding to
  Handle is simpler; a separate facet avoids changing the existing
  interface for Handles that don't participate in delegation.
- Should the relationship string be free-form or drawn from a
  controlled vocabulary?  Free-form is more flexible; a vocabulary
  makes verification more meaningful.
- How should epithet chains be displayed in UIs?  The recursive
  "(X of Y (Z of W))" format is readable but might get unwieldy for
  deep chains.
- Should a principal be able to retroactively add epithets to an
  existing delegate, or only at creation time?
- How should epithet verification work across OCapN node boundaries?
  The verifier needs to reach the principal's Handle, which may be
  on a remote node.
- Should connectors be required to verify the full epithet chain
  before bridging, or is it sufficient to verify only the immediate
  link?
- Can a delegate opt to add voluntary epithets (self-descriptions)
  alongside its obligatory ones?  If so, recipients need to
  distinguish obligatory from voluntary epithets.

## References

[1]: Executive Order 14110, "Safe, Secure, and Trustworthy Development
and Use of Artificial Intelligence," October 2023, and subsequent NIST
guidance on AI transparency and disclosure.

[2]: Slack API documentation, "Bot Users."
https://api.slack.com/bot-users

[3]: Discord Developer documentation, "Bots."
https://discord.com/developers/docs/topics/oauth2#bots

[4]: Google Cloud documentation, "Service Accounts."
https://cloud.google.com/iam/docs/service-accounts
