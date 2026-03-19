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

### **What is a capability?**

In the object capability (ocap) security model, a capability is a reference
that simultaneously serves two purposes:

1. **Identity**: The reference is a handle that identifies the object
2. **Authority**: The object's behavior, protected by interface guards, encodes what operations are permissible

**Key Principles of Capabilities:**

- **Reference as Authority**: A capability represents the *right* to perform an
  operation, not the ability to perform it. The capability holder can execute
  the protected operations, but cannot access the object's implementation.
- **Pass-by-reference**: Capabilities use pass-by-reference semantics—the
  reference (handle) itself is passed to grant access to the referenced
  object's protected behavior.
- **Encapsulation**: Only the holder of the capability can exercise its
  authority. No external code can bypass this protection because they never
  receive the capability reference.
- **Principle of Least Authority**: Caplets expose only the capabilities
  necessary for their functionality, nothing more. This minimizes the surface
  area for potential security issues.

**Capabilities vs Standard JavaScript Objects:**

- **Standard objects** are generic containers that can have any methods attached
- **Capabilities** are objects with *restricted* behavior determined by interface guards
- Capabilities encode *which operations are valid*, but restrict *how they're used*

In Endo's implementation, a **remotable object** (created with `Far()` or
`exo`) is a capability because:
- It can be passed across vat boundaries (Same or different machines) via CapTP
- Its behavior is protected by interface guards that validate inputs and prevent unauthorized access
- Its internal state cannot be accessed or modified by unauthorized code
- It represents a privileged operation or access to a specific resource

For example, a mint's `makePurse()` method returns a **capability** (a purse
object with deposit/withdraw methods)—not because the mint executes the
deposit/withdraw operation directly, but because the returned purse object
encodes the authority to perform deposits and withdrawals within the system's
security policy. Only someone holding the purse capability can call its
methods.

## runlet

A program that exports `main(powers)`, and is not expected to return anything,
and consequently, is not intended to exceed the life of the main. Whether to
wait for IO handles to close is debatable still—this consideration stems from the
fact that workers have their own isolated heap and can continue executing after the
external reference is revoked, whereas in-thread code would be cut off. This
debate relates to the live-ref garbage collection problem where external references
can keep code alive indefinitely, making it unclear when and how to safely terminate
a worker.

**Clarification: Worker Concept**

"Worker" has different meanings depending on the context:

## worklet

A caplet that is intended to run in a Worker.

**Note:** Workers can be co-tenant but YMMV what with availability and
HardenedJS not being quite bullet-proof for passable proxies. This is an active area of research.

## weblet

A caplet that runs in a `WebView`.

**WebView clarification**: A WebView is NOT an iframe component inside the browser DOM. Instead, it's a **separate, self-contained browser instance**—like a mini-browser window embedded in an application. In Endo, WebViews are used to execute weblets that need browser UI, with each view running its own isolated browser context independent of the main browser window.

Examples of WebView implementations:
- **Electron BrowserView**: A separate browser instance within Electron desktop apps (outside main DOM)
- **Chrome DevTools**: Embedded browser component for inspecting web pages
- **System WebViews**: Platform-specific APIs like iOS WKWebView or Android WebView
- **Embeddable browsers**: Standalone browser engines (Chromium, WebKit) embedded in other applications

> Read more: [WebView - Wikipedia](https://en.wikipedia.org/wiki/WebView)

Web views are **not safely co-tenant** when there's no isolation between them. In Endo's implementation, each WebView provides independent separation from main browsers and other WebViews, which is why they can run weblets in parallel.

**Co-Tenancy Considerations**:
Like workers, webviews have limited co-tenant capabilities. While they are isolated from the main browser and each other, they share certain JavaScript runtime aspects. The isolation is not as strong as the process isolation provided by daemon workers. Co-tenancy here means:
- Multiple webviews can run concurrently, each with its own isolated JavaScript context
- Each webview maintains separate state and session data
- Access between webviews requires explicit, controlled communication

**Content Security Policy (CSP) Importance**:
CSP is a critical security mechanism for webviews and browsers. It defines:
- **Allowed Sources**: Where scripts can come from (e.g., `script-src 'self'`)
- **Execution Policies**: Allowed MIME types and script types
- **Inline Restrictions**: Preventing inline script execution (preventing `eval()`, `onclick` handlers)
- **Mixed Content**: Enforcing HTTP/HTTPS separation

In the Endo ecosystem:
- CSP is enforced at the WebView configuration level
- Each weblet in a webview gets its own CSP policy appropriate to its security profile
- CSP violations are captured and reported, not silently allowed

**WebView Lifecycle and Identity — "Whose Window?"**

A weblet's "window" is owned at three distinct layers, each with different
responsibilities and lifetimes:

| Layer | Owner | Lifetime | Responsibilities |
|-------|-------|----------|------------------|
| **Visual window** | Electron `BrowserWindow` (or standalone browser tab) | Ephemeral — opens and closes with user action | Renders DOM, runs the web-page JavaScript, owns browser-side state (DOM, localStorage, IndexedDB) |
| **HTTP handler** | Daemon gateway (`web-server-node.js`) | Registered at `makeWeblet()`, deleted when `webletCancelled` fires | Serves the weblet's HTML bundle, establishes per-connection CapTP sessions, enforces CSP |
| **Formula identity** | Daemon formula graph | Persistent — survives browser closes and daemon restarts | Stores the weblet's `webletId`, its bundle, its granted powers, and its pet-store entry |

**Key consequence:** Closing the browser window destroys only the visual layer. The
daemon's HTTP handler remains registered and ready to serve new connections, and the
formula identity is never lost. Reopening the URL starts a fresh CapTP session on the
same persistent weblet identity.

- **No daemon-side DOM state**: The daemon stores no browser/UI state. Memory, localStorage,
  and IndexedDB all belong to the browser process and are lost when the window closes — unless
  the weblet explicitly saves data through Endo capabilities (e.g., writing to a pet-store value).
- **Enlivenment**: A weblet "comes alive" when a browser loads its URL and the resulting
  CapTP session connects to the daemon. This is an ephemeral incarnation of the persistent
  formula, not a durable activation.

> **Identity Principle**: Weblet identity is a **formula-graph concept, not a window
> concept**. The daemon creates a weblet by calling `makeWeblet(bundle, powers,
> requestedPort, webletId, webletCancelled)` on the `@apps` WebletService. The
> resulting formula is stored persistently and addressed by its `webletId` token.
> Each browser window that loads the weblet URL opens an **independent CapTP session**;
> the gateway does not track or restrict how many concurrent windows connect to the
> same weblet.

This maps directly to Miller's vat model (thesis §7.2, §14.1):

- The daemon's formula gives the weblet **stable identity** across browser opens/closes —
  analogous to a vat maintaining its identity across incarnations.
- Each window/WebView is a **separate ephemeral incarnation** of that vat. The weblet
  keeps its identity and persistent capabilities as it passes through a sequence of browser
  sessions, just as "a vat maintains its identity and state as it passes serially through a
  sequence of incarnations" (thesis §7.2).
- Multiple windows can load the same weblet URL simultaneously; each gets its own
  independent CapTP session with no shared browser state — analogous to multiple
  connections to the same vat via different CapTP pipes.

# Gateway

The gateway (`web-server-node.js`, formulated as `@apps`) is the daemon's HTTP/WebSocket
front-end. It serves two purposes:

1. **HTTP hosting for weblets** — serves the weblet's HTML bundle and injects CSP headers.
2. **CapTP over WebSocket** — establishes CapTP sessions so browser-side code can call
   into daemon capabilities via `E()`.

The gateway runs as an **unconfined** caplet in the daemon's MAIN worker, receiving
full ENDO powers. It creates a `localGateway` Far object whose `provide(token)` method
resolves formula IDs to live references, rate-limited per source IP.

**Two hosting modes:**

| Mode                         | Isolation mechanism    | URL shape                                | Use case                                                                                                                    |
|------------------------------|------------------------|------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| **Unified server** (default) | Host header / hostname | `localhttp://<accessToken>`              | Familiar (Electron) — more secure because `localhttp://` is a custom protocol that cannot be navigated to by external pages |
| **Dedicated port**           | URL path prefix        | `http://127.0.0.1:<port>/<accessToken>/` | Standalone / CLI — demi-secure because the port is reachable by any local process                                           |

In unified mode, Electron's custom `localhttp://` protocol handler
(`packages/familiar/src/protocol-handler.js`) proxies requests to the daemon's gateway
port, setting the weblet's access token as the `Host` header. The gateway routes
incoming requests by matching the hostname against its `webletHandlers` Map.

**No instance ↔ WebView locking:** The gateway has zero concept of WebView instances.
It authenticates connections by network address (CIDR allowlist) and Host header
matching, not by WebView identity. Multiple independent WebSocket/CapTP connections
to the same weblet are accepted concurrently. This is analogous to Miller's vat model
(thesis §7.3): identity is cryptographic (the access token acts as a Swiss number), not
tied to a particular process or window.

**Weblet presence without a live browser:**

- **Formula level (persistent):** The weblet's formula remains in the daemon's formula graph
  and pet store. It can be looked up by ID and re-instantiated at any time.
- **HTTP handler (ephemeral):** The weblet's handler in `webletHandlers` is registered when
  `makeWeblet()` is called and deleted when the weblet's cancellation promise fires
  (`cancelled.catch(() => webletHandlers.delete(accessToken))`). While registered, the
  handler is ready to serve requests even if no browser is currently connected.
- **No daemon-side DOM state:** The daemon stores no browser/UI state. A fresh CapTP
  session is opened on each page load.

So a gateway-hosted weblet has a **persistent formula identity** and a **registered HTTP
handler** even when no browser window is open — but it has no live computation or DOM
state on the daemon side.

# Formula

A JSON spec for an object constructor:
- a readable blob is one of the most primitive types (like `ReadableStream`, or other binary/large data structures)
- notably program source code gets stored in a blob
- evaluating a JS string in the presence of various dependencies

## Formula Use Cases

**1. Dynamic Code Loading**
Formulas enable dynamic code loading in sandboxed environments:
```json
{
  "dependencies": ["@endo/compartment-utils"],
  "source": "const {E} = require('@endo/compartment-utils'); export const init = async () => { ... }",
  "params": { "config": { "key": "value" } }
}
```
- Dependencies are resolved and included at formula evaluation time
- Source code is isolated in its own compartment
- Parameters are passed to the formula constructor

**2. Encapsulated Caplets**
Formulas encapsulate entire capabilities in a single, portable unit:
```json
{
  "constructor": "caplet",
  "dependencies": ["@endo/caplet", "@endo/promise"],
  "source": "export const make = (powers) => { const api = powers; return { ... } }",
  "params": { }
}
```

**3. Interop Between JS, WASM, and Other Modules**
Formulas can evaluate code in the presence of multiple module systems:
- ES modules (`import`, `export`)
- CommonJS (`require`, `module.exports`)
- WASM modules
- Other plugin architectures

**4. On-demand Evaluation**
Formulas enable lazy evaluation and script execution:
- Delay runtime code execution until dependencies are available
- Execute code in a controlled sandbox environment
- Cache compiled modules for reuse
- Handle versioning and dependency resolution

**Comparison: Blob vs String**
- **Blob**: Used for binary data, large files, or when memory mapping is preferred
- **String**: Used for human-readable code (JavaScript, JSON, configuration)
- Both can represent "program source", but they serve different use cases and have different memory characteristics

## Formula Security Principles

**1. Isolation**
- Each formula is evaluated in its own compartment
- No access to the formula-evaluating environment's global state
- Clean slate for dependencies (no prototype pollution)

**2. Controlled Dependencies**
- Dependencies are specified in JSON, not inline code
- Version constraints ensure consistent behavior
- Access to ambient authority is explicitly controlled

**3. Version Resolution**
- Formula JSON includes dependency specifications
- A dependency manager resolves versions at runtime
- Resolutions are cached and predictable

**4. Error Isolation**
- Failures in one formula don't crash the evaluator
- Errors are caught and returned as standardized error objects
- Failure modes are predictable and recoverable

# End-to-End Client Flow

The end-to-end flow shows how users interact with the Endo daemon from code execution to receiving capabilities:

## High-Level Flow

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

## User-Agent Interaction Model

The flow centers on the Pet-name system for capability identification:
- Each capability (purses, pets, agents) gets a memorable pet name
- Users manage and share names instead of tracking IDs or addresses
- The daemon routes messages to the correct vat/process via the pet name

## Example: Publishing and Requesting

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

## Key Components Involved

| Component         | Role                                           |
|-------------------|------------------------------------------------|
| **Daemon**        | Host for workers, gateway API, pet-name system |
| **CLI**           | User interface to the daemon                   |
| **Worker**        | Isolated runtime for guest computations        |
| **Guest**         | User's code running in isolation               |
| **Gateway**       | HTTP/WebSocket endpoint for web access         |
| **Familiar Chat** | UI for forms, requests, and replies            |

## Security Property: The Human in the Loop

The end-to-end flow emphasizes security by keeping humans in critical decision points:
- Forms allow users to review and validate structured requests before forwarding
- Capability requests can be audited and accepted/rejected by the user
- Each distributed system boundary has a human verification step

This ensures that capabilities cannot be silently forwarded between strangers,
maintaining the principle of least authority throughout the flow.

# HardenedJS

**HardenedJS** is a security-focused JavaScript environment based on SES (Secure ECMAScript).
It provides foundations for capability-based security and supply chain attack resistance.

## Core Concepts

- **Lockdown**: A process that freezes the JavaScript runtime, making it tamper-resistant
- **Compartments**: Isolated execution contexts with their own global scope, sharing only
  a frozen set of intrinsics (arrays, objects, built-ins) to maintain identity
- **Hardened Objects**: Objects that cannot be modified once frozen, serving as capabilities
- **Principle of Least Authority**: Components only have the capabilities they explicitly need

## Security Model

1. **No Ambient Authority**: By default, compartments have no built-in capabilities like
   `fetch`, `http`, or `fs`. They must accept only the specific powers they require.

2. **Tamper Resistance**: Once `lockdown()` is called, the runtime cannot be reconfigured
   or altered. Modifications to prototypes, globals, or intrinsics are detected and throw errors.

3. **Capability-Based Security**: Capabilities are objects with methods that can only be
   invoked. They cannot be forged, as a useful object cannot be created unless explicitly
   provided to the compartment.

4. **Interoperable Intrinsics**: By freezing and sharing intrinsics like `Array`, `Object`,
   and `Function`, programs running in different compartments can recognize instances of
   the same JavaScript types, maintaining identity and compatibility.

## Why HardenedJS Matters in Endo

1. **Supply Chain Attack Mitigation**: Third-party plugins and dependencies cannot silently
   modify the runtime to compromise the host. Every modification is detected and blocked.

2. **Isolation for Guests**: When running user code in a worker, HardenedJS ensures that
   the guest cannot:
   - Read or modify the daemon's internal state
   - Use capabilities it wasn't provided
   - Access sensitive APIs or private data

3. **Secure Co-Tenancy**: Workers can share a HardenedJS runtime, but with careful
   compartment setup to prevent cross-guest attacks.

4. **Compliance with Modern Standards**: HardenedJS is based on SES, an ECMAScript proposal
   for secure JavaScript execution with strict standards compliance.

## How Endo Uses HardenedJS

- **Workers**: Each daemon worker uses HardenedJS to isolate guest computations
- **Compartment Maps**: Endo builds compartment maps for Node.js applications, creating
  separate compartments for each dependency with minimal necessary authorities
- **Bundle System**: Endo's bundler includes HardenedJS as a core dependency, ensuring
  execution in a locked-down runtime

## Limitations and Trade-offs

While HardenedJS provides strong security guarantees, there are practical considerations:

- **Performance Overhead**: Lockdown and compartment creation add some runtime cost
- **Prototype Pollution Prevention**: Many common JavaScript patterns that mutate
  prototypes are rejected
- **Compatibility**: Some existing libraries may not work without modification
- **Learning Curve**: Developers must think in capability terms rather than
  relying on global state

## See Also

- [SES README](../../packages/ses/README.md) — Complete SES specification and usage
- [Lockdown Documentation](../../packages/ses/docs/guide.md) — How to lock down a JavaScript environment
- [@endo/ses](../../packages/ses) — SES implementation package

# Understanding "HardenedJS" and "Co-Tenancy"

**What is HardenedJS?**

HardenedJS is a security-focused JavaScript environment based on SES (Secure ECMAScript). It provides foundations for capability-based security and supply chain attack resistance.

## HardenedJS Core Concepts

- **Lockdown**: A process that freezes the JavaScript runtime, making it tamper-resistant
- **Compartments**: Isolated execution contexts with their own global scope, sharing only
  a frozen set of intrinsics (arrays, objects, built-ins) to maintain identity
- **Hardened Objects**: Objects that cannot be modified once frozen, serving as capabilities
- **Principle of Least Authority**: Components only have the capabilities they explicitly need

## HardenedJS Security Model

1. **No Ambient Authority**: By default, compartments have no built-in capabilities like
   `fetch`, `http`, or `fs`. They must accept only the specific powers they require.

2. **Tamper Resistance**: Once `lockdown()` is called, the runtime cannot be reconfigured
   or altered. Modifications to prototypes, globals, or intrinsics are detected and throw errors.

3. **Capability-Based Security**: Capabilities are objects with methods that can only be
   invoked. They cannot be forged, as a useful object cannot be created unless explicitly
   provided to the compartment.

4. **Interoperable Intrinsics**: By freezing and sharing intrinsics like `Array`, `Object`,
   and `Function`, programs running in different compartments can recognize instances of
   the same JavaScript types, maintaining identity and compatibility.

## What is Co-Tenancy?

Co-tenancy refers to the practice of running multiple guests (computation contexts) in the same isolated runtime environment.

### How Co-Tenancy Works in Endo

1. **Shared Runtime**: Multiple guests can share a HardenedJS-managed runtime
2. **Compartment Maps**: Each guest gets its own compartment with limited authorities
3. **Isolation Guarantees**: Compartment maps ensure that each compartment cannot access another's intrinsics or state
4. **Shared Intrinsics**: Only frozen, safe intrinsics (like `Array`, `Object`, `Function`) are shared, maintaining identity across compartments

### Benefits of Co-Tenancy
- **Resource Efficiency**: Single process handles multiple guests
- **Memory Sharing**: Intrinsics shared, reducing memory overhead
- **Deployment Simplification**: Fewer processes to manage

### Limitations and Risks
- **Complexity**: Requires careful compartment map construction
- **Inter-guest Communication**: Must use safe message-passing instead of direct state access
- **State Isolation**: Each guest must manage its own persistent state carefully
- **Timeouts**: Long-lived computations in one guest can affect others

### When is Co-Tenancy Safe?
Co-tenancy is safe when:
- Each guest's compartment is properly isolated via compartment maps
- No guest can affect another's intrinsics
- Communication uses only authorized, defined interfaces

### When is Co-Tenancy Risky?
Co-tenancy is risky when:
- Compartment maps are weak or incorrect
- Guests share mutable resources directly
- Timeouts aren't implemented properly

## Why HardenedJS Matters in Endo

1. **Supply Chain Attack Mitigation**: Third-party plugins and dependencies cannot silently
   modify the runtime to compromise the host. Every modification is detected and blocked.

2. **Isolation for Guests**: When running user code in a worker, HardenedJS ensures that
   the guest cannot:
   - Read or modify the daemon's internal state
   - Use capabilities it wasn't provided
   - Access sensitive APIs or private data

3. **Secure Co-Tenancy**: Workers can share a HardenedJS runtime, but with careful
   compartment setup to prevent cross-guest attacks.

4. **Compliance with Modern Standards**: HardenedJS is based on SES, an ECMAScript proposal
   for secure JavaScript execution with strict standards compliance.

## How Endo Uses HardenedJS

- **Workers**: Each daemon worker uses HardenedJS to isolate guest computations
- **Compartment Maps**: Endo builds compartment maps for Node.js applications, creating
  separate compartments for each dependency with minimal necessary authorities
- **Bundle System**: Endo's bundler includes HardenedJS as a core dependency, ensuring
  execution in a locked-down runtime

## Limitations and Trade-offs

While HardenedJS provides strong security guarantees, there are practical considerations:

- **Performance Overhead**: Lockdown and compartment creation add some runtime cost
- **Prototype Pollution Prevention**: Many common JavaScript patterns that mutate
  prototypes are rejected
- **Compatibility**: Some existing libraries may not work without modification
- **Learning Curve**: Developers must think in capability terms rather than
  relying on global state

## Why HardenedJS Not "Bullet-Proof" for Passable Proxies?

This is a known area where additional research is needed. The challenge is maintaining security guarantees when:
- Proxies must serialize and deserialize
- Interface guards must still validate invocations across process boundaries
- The complexity of co-tenancy makes it harder to prove isolation

Mark Miller's thesis (Robust Composition) and later ENDO documentation discuss these trade-offs in depth.

## See Also
- [SES README](../../packages/ses/README.md) — Complete SES specification and usage
- [Lockdown Documentation](../../packages/ses/docs/guide.md) — How to lock down a JavaScript environment
- [@endo/ses](../../packages/ses) — SES implementation package
- [Mark Miller's Thesis: Robust Composition](../../docs/mark_miller_thesis.md)

# Understanding "Passable Proxies"

**What are passable proxies?**

Passable proxies are a fundamental concept in capability-based systems. A proxy is a special object that:
1. **Adopts Behavior**: Implements the same interface as the referenced object
2. **Delegates Invocations**: Forwards method calls to the underlying object
3. **Preserves Identity**: Maintains the capability relationship with the original object

**Why passable in distributed systems?**
In CapTP-style distributed communication, passable proxies allow capabilities to:
- Be serialized and sent across process boundaries
- Remain functional and authoritative in the receiving process
- Maintain their security properties (interface guard protected authorization)

**How they work in Endo**
- A `Far()` call creates a proxy with an interface guard that validates calls
- When sent to another process, the proxy is serialized
- On receipt, CapTP reconstructs the proxy, re-applying the interface guard
- The remote invocation proceeds with all security guarantees intact

**Security Implications**
- Only objects with properly defined interface guards become passable proxies
- The proxy cannot reveal implementation details
- Access control is enforced at the proxy, not the implementation

> See also: [[HardenedJS details and co-tenancy]](#hardenedjs-details-and-co-tenancy) | [Mark Miller's Thesis](../../docs/mark_miller_thesis.md)?

# Stuff

### JavaScript Worker (Standard API)

**JavaScript Workers** are a browser/sandbox API for off-main-thread JavaScript execution:

- **Implementation**: Workers are *threads* (lightweight OS processes) that share the same memory space as the main thread
- **API**: Created via `new Worker('worker.js')` using the browser/Worker API
- **Communication**: Uses `postMessage()` with Transferable objects for efficient copying
- **Context**: Runs in a separate global scope (`DedicatedWorkerGlobalScope` with `self`)
- **Isolation**: Limited isolation - workers share memory but cannot access DOM directly

> Read more: [Web Workers - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)

### Agoric/Endo Worker

**Endo Workers** are separate *OS process* runtimes managed by the daemon:

- **Implementation**: Each worker is its own process with independent memory, file system access, and OS identity
- **Management**: Daemon manages worker lifecycle via formula-based configuration
- **Communication**: Uses CapTP (Capability Transport Protocol) for cross-process message passing
- **Environment**: Workers run in a HardenedJS lockdown environment with compartment isolation
- **Isolation**: True isolation - compromised workers cannot affect the daemon or other workers

**Key Differences:**

| Aspect            | JavaScript Worker                       | Endo Worker                                           |
|-------------------|-----------------------------------------|-------------------------------------------------------|
| **Isolation**     | Thread-level (shared memory)            | Process-level (separate memory, file system, network) |
| **Communication** | `postMessage()` with Transferables      | CapTP with passable proxies                           |
| **Lifecycle**     | Created on-demand, GC'd automatically   | Formula-managed, daemon controls termination          |
| **Security**      | Browser sandbox (CSP, DOM restrictions) | HardenedJS lockdown, compartment maps                 |
| **Use Case**      | UI/UX, long-running computations        | Guest computation isolation, secure sandboxing        |

### When to Use Each

- **JavaScript Worker**: Use for UI responsiveness, complex client-side computations that don't require deep isolation or external resources
- **Endo Worker**: Use for guest computations requiring:
  - Complete process isolation
  - Access to external resources (files, network)
  - HardenedJS security guarantees
  - Capability-based access control

**Interoperability**:
Endo workers are *not* the same as JavaScript Workers. An Endo worker cannot be instantiated via the standard `new Worker()` API because they are separate process types managed by the daemon, not browser APIs. However, Endo can potentially spawn JavaScript Workers within a Worker process for specific use cases (requiring careful isolation analysis).

> See also: [[HardenedJS details and co-tenancy]](#hardenedjs-details-and-co-tenancy)

Neither caplet nor runlet is a Worker.

### Co-Tenancy: Running Multiple Guests Safely

**What is co-tenancy?**
Co-tenancy refers to the practice of running multiple guests (computation contexts) in the same isolated runtime environment. This is particularly relevant when:
- Multiple applications share a single worker process
- Workers share a HardenedJS lockdown environment
- Memory or resources are shared efficiently across guests

**How Co-Tenancy Works in Endo**

1. **Shared Runtime**: Multiple guests can share a HardenedJS-managed runtime
2. **Compartment Maps**: Each guest gets its own compartment with limited authorities
3. **Isolation Guarantees**: Compartment maps ensure that each compartment cannot access another's intrinsics or state
4. **Shared Intrinsics**: Only frozen, safe intrinsics (like `Array`, `Object`, `Function`) are shared, maintaining identity across compartments

**Benefits of Co-Tenancy**
- **Resource Efficiency**: Single process handles multiple guests
- **Memory Sharing**: Intrinsics shared, reducing memory overhead
- **Deployment Simplification**: Fewer processes to manage

**Limitations and Risks**
- **Complexity**: Requires careful compartment map construction
- **Inter-guest Communication**: Must use safe message-passing instead of direct state access
- **State Isolation**: Each guest must manage its own persistent state carefully
- **Timeouts**: Long-lived computations in one guest can affect others

**Co-Tenancy is Safe When:**
- Each guest's compartment is properly isolated via compartment maps
- No guest can affect another's intrinsics
- Communication uses only authorized, defined interfaces

**Co-Tenancy is Risky When:**
- Compartment maps are weak or incorrect
- Guests share mutable resources directly
- Timeouts aren't implemented properly

Co-tenancy represents an advanced topic in distributed systems design. It balances efficiency with isolation - a hallmark of robust systems architectures.

> See also: [[HardenedJS details and co-tenancy]](#hardenedjs-details-and-co-tenancy)

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
