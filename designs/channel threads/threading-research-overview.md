# Threading Research: Project Trajectory Overview

## For Contributors — March 2026

### What This Is

This document describes the intended direction of threading research on the Endo Petdaemon project and how it relates to the Muddle project. It's meant to orient contributors to the high-level arc rather than implementation details.

### The Two Projects

**Muddle** is a collaborative graph note-taking system. Notes form a recursive tree with parent-child relationships, progressive disclosure, inter-note links, and a breadcrumb system that tracks how the user navigated to their current view (not the hierarchy). It is designed to be useful for both humans and AI agents. Muddle is currently built on Automerge CRDTs.

**Endo Petdaemon** is a JavaScript-based distributed object-capability environment trending toward being an AI-agent-compatible chat interface. It supports passing around JavaScript objects, has a developing invitation and administration system, and will soon have network layer support.

### Why Synthesize Them

Muddle's Automerge foundation has persistent problems:

- The sync server has high latency for initial document synchronization when inviting new users. Once a client has a reference, live CRDT updates work well, but the initial handshake is slow and has resisted debugging.
- Automerge only supports read and write permissions. There is no read-only sharing. KeyHive (a forthcoming Automerge extension) may eventually address this, but it's not available yet.
- There is no edit provenance, no programmable attenuation, and limited broader programmability.

Endo addresses all of these gaps. Its object-capability model provides fine-grained permission control, its invitation system handles administration elegantly, and its secure ECMAScript compartments allow safe evaluation of custom attenuation logic.

The tradeoff: Endo does not have Automerge's real-time collaborative text editing within a single document block. This is a known cost.

### The Three Chat Types

The threading research proceeds through three progressively more collaborative interface types, each built on the Endo Petdaemon:

**Type 1 — Threaded Channel Chat** (functionally complete): Slack/Discord-like. Channels with threaded replies. Threads can nest to arbitrary depth, not just one level. This is the baseline.

**Type 2 — Real-Time Forum Chat** (next up): A hybrid of chat and Reddit-style threaded forum. The most recent active subtree floats to the bottom of the screen. Threads are collapsible inline and can be promoted to sidebar bookmarks, making any thread visitable as its own channel. The view is an inverted comment tree — latest activity at the bottom, ancestors above.

**Type 3 — Collaborative Outliner** (after Type 2): Not a chat at all. A collaboratively editable structured document inspired by Google Wave. All participants can edit, reorder, or hide any node. Edits carry provenance (visible as overlapping avatar arrays on each node). Viewers make subjective trust decisions — blocking a user slices out their mutations from the viewer's entire document state. This is effectively Muddle rebuilt on Endo, gaining its permission model, provenance, and programmable attenuation.

### The Throughline

The progression from Type 1 to Type 3 traces a path from "chat with threads" to "social outliner." Each step increases the collaborative editability of the shared space and the viewer's control over their own experience of it.

A recurring design principle across all three types: **messages are immutable at the protocol level**. Edits, moves, and deletions are new messages referencing previous objects. What the viewer sees is a function of their personal policy — which editors they trust, which mutations they accept. This reframes administration from "who is allowed to mutate" to "what policy gives this viewer the best experience of their community's ideas."

### Motivating Insight

The question of message mutability keeps surfacing (e.g., agents annotating "thinking" states before finalizing a reply). Rather than answering "who should be allowed to edit," the pet-name-centric, data-immutability approach says: all edits are just messages. The real question is what viewing policy best empowers each user to engage with their community in a way they find credible, consumable, and pleasant.

### Immediate Next Steps

1. Ensure standard Petdaemon commands work correctly within the Type 1 channels interface.
2. Build the Type 2 renderer (inverted tree, collapsible threads, sidebar promotion).
3. Begin Type 3 design once Type 2 is functional.

### Prior Art and Influences

- Slack and Discord (Type 1 baseline)
- Reddit comment threading (Type 2 layout, inverted)
- Google Wave (Type 3 collaborative editing model)
- Kialo (recursive debate/discussion structure, pro/con positioning)
- Roam Research and outliner-style note-taking (arbitrary nesting, internal syntaxes for debate)
- "My Convictions" — an earlier debate/discussion web app by the author
- Muddle's own graph note system
