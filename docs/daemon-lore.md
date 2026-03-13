---
title: daemon-lore
group: Documents
category: Lore
---

# Endo Daemon Lore

This document will evolve to record jargon, terms, and explain concepts used
by, in, and around the `@endo/daemon`.

## Lore?

This document is called "lore" because the author (jcorbin) deos not yet know
how to group or otherwise organize it, and so hesitates to call this a "Guide"
or "Reference" documentation.

In fact this document will mostly grow by:
1. pasting in notes and snippets of chat conversation
2. telling an LLM-empowered-agent to rework it
3. then later reviewing or refining its progress

# Concepts

## caplet

A program that exports `make(powers)`, and returns a capability, and is
intended to live as long as that capability shall live.

**What is a capability?** In the object capability (ocap) security model,
a capability is a reference that authorizes the holder to perform an action or
access a resource. Capabilities are fundamental to secure, distributed computing:

- **Reference as authority**: A capability represents the *right* to perform an
  operation, rather than the ability to perform the operation itself
- **Pass-by-reference**: Capabilities use pass-by-reference semantics—the reference
  (handle) itself is passed, granting access to the referenced object's behavior
  (methods, state, etc.)
- **Encapsulation**: Only the holder of the capability can exercise its authority
- **Principle of least authority**: Caplets expose only the capabilities necessary
  for their functionality

In Endo's implementation, a **remotable object** (created with `Far()` or an
exo) is a capability because:
- It can be passed across vat boundaries (same or different machines)
- Its behavior is protected by interface guards that validate inputs
- Its internal state cannot be accessed or modified by unauthorized code
- It represents a privileged operation or access to a resource

For example, a mint's `makePurse()` method returns a **capability** (a purse
object with deposit/withdraw methods)—not because the method executes the
operation, but because the returned purse object encodes the authority to perform
deposits and withdrawals within the system's security policy.

## runlet

A program that exports `main(powers)`, and is not expected to return anything,
and consequently, is not intended to exceed the life of the main. Whether to
wait for IO handles to close is debatable still—this consideration stems from the
fact that workers have their own isolated heap and can continue executing after the
external reference is revoked, whereas in-thread code would be cut off. This
debate relates to the live-ref garbage collection problem where external references
can keep code alive indefinitely, making it unclear when and how to safely terminate
a worker.

Neither caplet nor runlet is a Worker.

### Why use workers?

**Workers** are separate JavaScript runtime processes that provide:

- **Isolation and Fault Containment**: Each guest runs in its own worker. If a guest
  crashes, it only affects that worker, not the main daemon or other guests
- **Security Boundary**: Workers operate under lockdown with separate compartments,
  preventing a compromised guest from accessing the daemon's internals
- **Concurrent Execution**: Multiple guests can compute simultaneously by running
  their workers in parallel
- **Resource Management**: Workers can be started, stopped, and scaled independently
  of the main daemon process
- **Guest Lifecycle Persistence**: Each worker can continue running past the main
  computation's lifetime, waiting to receive new requests or clean up resources

The daemon manages these workers through a formula lifecycle where each worker
has its own environment, network access, and storage namespace. Workers have their
own process, memory, and event loop, providing true isolation.

#### Worker Types

- **General Worker**: A standalone process hosting one or more guest computations
- **Isolated Worker**: A worker with restricted capabilities for security-critical
  operations
- **Shared Worker**: Workers that can communicate with each other via CapTP (rarely used)

## worklet

A caplet that is intended to run in a Worker.

**Note:** Workers can be co-tenant but YMMV what with availability and
HardenedJS not being quite bullet-proof for passable proxies.

> TODO **HardenedJS** — what's that? what's the relevance? say more about co-tenancy, maybe in a separate section below
> TODO **passable proxies** — what're those? the relevance?

## weblet

A caplet that runs in a `WebView`.

> TODO what is a WebView? is that inside the browser DOM? an electron thing outside of it?

Web views are not safely co-tenant.

> TODO there's that topic of co-tenancy again (like with worklet above), say more

They rely on same origin isolation.

> TODO this is about CSP right? say more.

They persist only so long as the window is open.

> TODO whose window? is that relevant? is each window-ified instance a separate "weblet" per-se? does "weblet" have stable identity separate from being enlivend thusly?

## Gateway

Hosts:
- Weblets of HTTP
- CapTP over WS
- `localhttp://` in familiar mode

**Weblet 2 modes:**
- Gateway provides demi-secure port hosting
- Familiar is more secure via `localhttp://`

> TODO is this about the instance <-> WebView locking questioned above?

> TODO does a gateway hosted weblet have any presence when not loaded in a live browser dom?

## Formula

A JSON spec for an object constructor:
- a readable blob is one of the most primitive types
- notably program source code gets stored in a blob
- evaluating a JS string in the presence of various dependencies

> TODO say more about these use cases, provide examples from your investigation

# System Internals

## Graceful Teardown

Design tensions with timely revocation. Need to ensure that:
- Some stuff cleans up
- Don't leave a hole open for something to go rogue

**What "going rogue" looks like:**

In a capability-based system, "going rogue" means a program that breaks isolation expectations:

1. **Escaped Capabilities**: A worker or guest uses a capability it shouldn't have access to,
   such as accessing the daemon's internal state or another guest's data through an unintended reference.

2. **Bypassed Revocation**: A capability remains active even after the original holder has explicitly
   given it up or revoked their permission. The program continues to use the capability beyond its
   intended lifetime.

3. **Time-Based Exploits**: A capability could be used after the intended revocation time or scenario,
   exploiting a "hole" in the revocation mechanism.

4. **Unsanctioned Communication**: A guest sends messages to other guests or the daemon at times
   when it shouldn't have network access or messaging privileges.

**What the "hole" looks like:**

The "hole" represents a security vulnerability in how references are managed:

1. **Dangling Reference**: A reference to a formula or object exists in memory or code, but the
   underlying resource (e.g., the formula JSON file) has been deleted or invalidated.
   When accessed, this causes a `ReferenceError("No reference exists at path...")`.

2. **Reference Leak**: A capability that should have been garbage collected remains valid,
   allowing a program to continue using resources it shouldn't have.

3. **Missing Revocation Signal**: A mechanism that should notify programs when a capability
   is revoked does not function correctly, leaving a time-based hole.

4. **Path-Based Leaks**: A reference may be identified by a filesystem path (formulaPath). When
   the corresponding file doesn't exist on disk, we have a "hole" where the reference doesn't
   match reality.

**Security Implications:**

- If a capability is accessible after its intended revocation period, an attacker could potentially
  use it if they capture it before revocation.
- A dangling reference could be a pointer to privileged internal state that no longer exists,
  but attempting to access it reveals an attack surface.
- Time-based holes allow unauthorized actions during transition periods between authorization states.

**Mitigation Strategies:**

- Ensure all references are checked for existence on disk before use
- Implement strong reference counting and automatic cleanup
- Use explicit revocation events that invalidate capabilities in all parties
- Log attempts to access revoked capabilities for audit purposes

## End-to-End Client Flow

The end-to-end flow shows how users interact with the Endo daemon from code execution to receiving capabilities:

### High-Level Flow

1. **Daemon Startup**: The Endo daemon runs in the background, managing worker processes
   and providing the gateway API and pet-name system

2. **CLI Commands**: Users interact with the daemon through the `endo` CLI tool:
   - `endo start` — Start the daemon
   - `endo run <file>` — Execute a script with powers
   - `endo install <file>` — Deploy a caplet or weblet in the daemon
   - `endo open <name>` — Open a web interface for a deployed application
   - `endo request` — Send requests to running agents and receive responses

3. **Guest Execution**: When a guest program is started:
   - It runs in a dedicated worker process
   - The daemon provides it with environment powers (storage, network, networked objects)
   - The guest communicates via CapTP (Capability Transport Protocol) for remote calls

4. **Form Interactions**: For structured user input, guests can send forms to agents:
   - Guest: `E(agent).form(title, fields)` sends a structured form request
   - User: Receives the form and fills in values (often through the Familiar Chat UI)
   - User: Submits values with `E(agent).submit(messageNumber, values)`
   - Result: Form `value` messages are sent back to the guest with user's answers

5. **Capability Distribution**: Capabilities are passed through:
   - Form submissions → structured user inputs
   - Package sends → executable code
   - Chat/inbox messages → arbitrary remote objects

### User-Agent Interaction Model

The flow centers on the Pet-name system for capability identification:
- Each capability (purses, pets, agents) gets a memorable pet name
- Users manage and share names instead of tracking IDs or addresses
- The daemon routes messages to the correct vat/process via the pet name

### Example: Publishing and Requesting

```
User executes:
  $ endo install cat.js --powers AGENT --listen 8920 --name cat
  $ endo open cat

The cat.js weblet:
1. Opens a WebView UI
2. Listens for requests via the gateway
3. Waits for user interactions
```

And:

```
User executes:
  $ endo request --as feline 'pet me'

The system:
1. Resolves the request in the daemon's Chat UI
2. Returns the result (e.g., 42) back to the CLI process
```

### Key Components Involved

| Component | Role |
|-----------|------|
| **Daemon** | Host for workers, gateway API, pet-name system |
| **CLI** | User interface to the daemon |
| **Worker** | Isolated runtime for guest computations |
| **Guest** | User's code running in isolation |
| **Gateway** | HTTP/WebSocket endpoint for web access |
| **Familiar Chat** | UI for forms, requests, and replies |

### Security Property: The Human in the Loop

The end-to-end flow emphasizes security by keeping humans in critical decision points:
- Forms allow users to review and validate structured requests before forwarding
- Capability requests can be audited and accepted/rejected by the user
- Each distributed system boundary has a human verification step

This ensures that capabilities cannot be silently forwarded between strangers,
maintaining the principle of least authority throughout the flow.

# CLI and User Experience

# Notes Circa Endo Sync 2026-03-11

Josh
> also I'm 80% confident that I'll be taking some hedge trimmers to the entire
> cli's commander saga:
> - break things up into topic sections: stop making me read about message,
>   values, and pets, when I'm just trying to scan for "How Does Daemon
>   Operate" commands
> - add all the parts you didn't like:
>   - `endo ps` -- list running wokers? anyone? beuller?
>   - `endo status` -- your ping is cute, but like you have ephemeral state to
>     be reading and reporting back for me
>   - `endo config` -- this is a big one imo, we really want a
>     `~/.config/endo/make_the_env_madness_stop.json` imo
>   - hell I'm even dreaming of `endo enter` -- so you know how `docker enter`
>     will put you in a bash repl for a container name space? give. js. repl.
>     now. wen. debug port in any year, at least opt-in-able when in dev mode
>     o... Read more
>
> I bet that debug port thing needs your exo stream work in the full course of
> time, and is quite a large elephant... but a folk can dream 😉

Kris
> Might be a thing now. We were held back for a long time because Node.js REPL
> entrains "domains", which are like oil and water when it comes to running
> under lockdown.
>
> Yeah, don't worry about streams. We have a stopgap in place that works, just
> not ideal.

Kris
> Adding subcommand sections to the CLI help would be welcome as long as they
> don't deepen the ergonomics unnecessarily. Like "endo ls" not "endo inventory
> ls" plz.

Kris
> Yeah, I haven't even really settled on a conceptual framework for graceful
> teardown because there are design tensions with timely revocation. We just
> need to ensure that some stuff cleans up, but also don't want to leave a hole
> open for something to go rogue. It might be that some workers don't get an
> opportunity to cleanup. They should at least be immediately isolated with the
> closure of open sessions. That puts them in a weird hell where the only thing
> they can do is teardown, and everything they touch remotely throws an async
> error.
>
> If we do add a REPL, it does mean we have CLI, REPL, *and* Chat to keep in
> sync when the command vocabulary evolves. I don't think we can get down to
> just 1, but staying at 2 until the vocabulary settles has been prudent so
> far.
>
> If we go up to 3, it would behoove us to have a framework in place so we only
> need to maintain one set of commands for both REPL and CLI. And also, find
> the right strike between build and buy on that front. I've — so far — managed
> to have the restraint not to go down the "make a new command line flag
> parser" bunny hole.

Kris
> The vernacular is still squishy. So, don’t think of this explanation as a
> defense of the names, just an inventory of the concepts that (maybe) don’t
> even need names.
>
> - A caplet is a program that exports make(powers), and returns a capability,
>   and is intended to live as long as that capability shall live.
> - A runlet is a program that exports main(powers), and is not expected to
>   return anything, and consequently, is not intended to exceed the life of
>   the main. Whether to wait for IO handles to close is debatable still.
>
> Neither caplet nor runlet is a Worker.

Kris
> Pressing enter on this a bit late:
>
> - A worklet is a caplet that runs in a Worker. Workers can be co-tenant but
>   YMMV what with availability and HardenedJS not being quite bullet-proof for
>   passable proxies.
> - A weblet is a caplet that runs in a WebView. Web views are not safely
>   co-tenant. They rely on same origin isolation. They persist only so long as
>   the window is open.

- [ ] TODO find and research these:
  - [ ] Mark Miller chapter 14/16 invariants
  - [ ] Mark's paper on distributed confinement
