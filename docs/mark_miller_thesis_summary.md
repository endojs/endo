# Mark Miller's Ph.D. Thesis: Robust Composition
## (Robust Composition: Towards a Unified Approach to Access Control and Concurrency Control)
**Author:** Mark Samuel Miller
**Date:** May 2006
**Institution:** Johns Hopkins University

---

## Overview

This is Mark Miller's Ph.D. dissertation that lays the foundation for the capability-based security work that inspired Endo and related projects. The thesis presents a framework for enabling robust composition of concurrent and potentially malicious components distributed over potentially malicious machines.

---

## Abstract

When separately written programs are composed so that they may cooperate, they may instead destructively interfere in unanticipated ways. These hazards limit the scale and functionality of the software systems we can successfully compose. This dissertation presents a framework for enabling those interactions between components needed for the cooperation we intend, while minimizing the hazards of destructive interference.

Great progress on the composition problem has been made within the object paradigm, chiefly in the context of sequential, single-machine programming among benign components. We show how to extend this success to support robust composition of concurrent and potentially malicious components distributed over potentially malicious machines.

[Source: http://erights.org/talks/thesis/index.html](http://erights.org/talks/thesis/index.html)

---

## Key Resources

### PDF Versions

1. **Current Version** (single spaced):
   - http://erights.org/talks/thesis/markm-thesis.pdf
   - Formatted for double-sided printing

2. **Official Dissertation** (double spaced):
   - https://www.cypherpunks.to/erights/talks/thesis/submitted/markm-thesis.pdf
   - Formatted for single-sided printing

These links have been added to the documentation for future reference, though network access has been problematic during initial scraping attempts.

---

## Relevant Concepts for daemon-lore.md Research

This thesis contains the foundational concepts referenced throughout the current TODOs. Key topics to extract for daemon-lore include:

### 1. What is a Capability?
- The role of capabilities as references that confer authority
- The distinction between identity (identifying an object) and authority (defining what operations are permitted)
- How capabilities differ from traditional access control mechanisms

### 2. Capability-Based Access Control
- Pass-by-reference semantics vs pass-by-value
- How capabilities provide fine-grained access control
- Encapsulation and the principle of least authority

### 3. Distributed Composition
- Strategies for composing components across network boundaries
- Concurrency control in distributed systems
- Fault containment and isolation

### 4. Access Control vs Concurrency Control
- The unified approach described in the thesis title
- How to prevent both malicious interference and concurrent data corruption

### 5. Robustness Principles
- Strategies for ensuring robust composition
- Safety guarantees in hostile environments

---

## Key Technical Concepts (from thesis content)

### 6. Object-Capability Model (§2.1)

The object-capability model restricts inter-object causality to flow only via messages sent
on references. Bob's authority is limited by the references he holds: if Bob cannot interact
with Carol unless he holds a reference to Carol, then the reference graph *is* the access
graph. When references can only be transmitted and acquired by the rules of the object
programming model, this yields the object-capability model.

A direct reference provides **unattenuated** authority: perpetual and unconditional ability
to invoke the target's public operations. Authority can be **attenuated** by interposing
intermediaries (facets, membranes) that restrict or transform the operations.

### 7. Vats and Distributed Objects (§7.2)

Objects are aggregated into **vats**. Each object exists in exactly one vat; a vat hosts many
objects. A vat is a platform and central point of failure for its objects.

> "A good first approximation is to think of a vat as a process full of objects — an address
> space full of objects plus a thread of control."

A process running a vat is an **incarnation** of that vat. The vat maintains its identity and
state as it passes serially through a sequence of incarnations (persistence across restarts).

**Endo mapping:** Daemon workers are vats. Weblets are vat-hosted objects whose identity
persists via the formula graph across browser session incarnations.

### 8. Distributed Pointer Safety (§7.3)

Each vat generates a public/private key pair on creation. The fingerprint of the public key
is the **VatID**. When VatC first exports a reference to Carol across the vat boundary, it
generates an unguessable random number — a **Swiss number** — to represent Carol.

To introduce Bob to Carol, VatA tells VatB a triple: VatC's VatID, VatC's search path,
and Carol's Swiss number. VatB authenticates VatC via key exchange, then reveals the Swiss
number over the secure pipe.

**Endo mapping:** The weblet's access token (first 32 chars of webletId) functions as a
Swiss number — unguessable, knowledge-grants-access. CapTP over WebSocket is the
authenticated pipe.

### 9. Bootstrapping Initial Connectivity (§7.4)

A newly launched vat has no online connections. It can generate a `captp://` URI string
encoding the VatID + search path + Swiss number triple. This string, conveyed securely
out-of-band, is an **offline capability** that bootstraps the first connection.

**Endo mapping:** `localhttp://<accessToken>` URLs are offline capabilities — conveyed
from daemon to browser to establish the initial CapTP session.

### 10. Permission vs Authority (§8.1–8.2)

**Permission** is a direct access right: a subject can invoke the behavior of an object.
**Authority** includes indirect effects: Bob may have no direct permission to write
`/etc/passwd`, but if he can ask Alice (who does have permission) to write arbitrary text
there, Bob has *authority* to write it. Authority derives from the structure of permissions
and the behavior of subjects on permitted causal pathways.

The **protection state** of a system is the topology of the access graph at an instant.
Whether Bob currently has permission depends only on this topology. Whether Bob has
authority depends also on the behavior of all reachable subjects.

### 11. Confinement (§11)

Object-capability confinement addresses the "overt" subset of Lampson's confinement
problem: cooperatively isolating an untrusted subsystem. Using abstraction, object-capability
practitioners solve selective revocation (withdrawing previously granted rights), overt
confinement (isolating untrusted code), and the *-properties (one-way communication
between clearance levels).

**Endo mapping:** Weblets are confined by the capabilities granted to them. The gateway's
hostname-based isolation ensures weblets cannot access each other's CapTP sessions.
SES lockdown + compartments provide the loader-level isolation.

### 12. Vats and Temporal Isolation (§14.1)

A **vat** is the combination of a stack, a pending-delivery queue, and the heap of objects
they operate on. Each E object lives in exactly one vat; a vat may host many objects.
A vat is the minimum unit of persistence, migration, partial failure, resource control,
preemptive termination/deallocation, and defense from denial of service.

Within a vat, E provides two ways to postpone plans:
- **Immediately** (`.` operator): Conventional call-return — postpone the rest of the current
  plan, execute the sub-plan, then resume.
- **Eventually** (`<-` operator): Queue a pending delivery on the to-do list — the sub-plan
  executes in a later **turn**.

A **turn** is E's unit of operation: dequeue a pending delivery, deliver its message, process
all resulting immediate calls to completion. Because each turn runs to completion before
the next is serviced, plans within a turn are **temporally isolated**.

**Key invariant**: A running turn has mutually exclusive access to everything it can
synchronously reach. Only eventual references cross vat boundaries, so concurrent turns
in different vats cannot interfere — they can only enqueue pending deliveries for each other.

**Endo mapping:** The daemon's event loop and each worker's event loop are vats. Eventual
sends via `E()` correspond to E's `<-` operator. A weblet's CapTP session maps a browser
turn onto the daemon's pending-delivery queue.

### 13. Communicating Event-Loops (§14.2)

When objects span vats (e.g., account on VatA, spreadsheet on VatS), only **eventual
references** cross the boundary. An eventual-send from VatA to VatS serializes the pending
delivery onto an encrypted, order-preserving byte stream. VatS unserializes and queues it
on its own pending-delivery queue.

Because only eventual references span vats, a turn in VatS cannot affect a turn
already in progress in VatA — VatA only queues the incoming pending delivery. Any actual
multi-vat computation is equivalent to some fully ordered interleaving of turns.

**Endo mapping:** CapTP over WebSocket between daemon and browser is the
encrypted, order-preserving byte stream. Each CapTP message becomes a pending delivery
in the receiving vat's queue.

### 14. Promise Pipelining (§16)

The return value of an eventual-send is a **promise** for the eventual result. A promise
starts as an eventual reference, so messages can be eventually-sent to it before resolution.
These messages are buffered in FIFO order and forwarded to the resolution once known.

**Pipelining** exploits this: if Alice sends `(bob <- x()) <- z(dave <- y())` and bob and
dave are both on VatB, all three requests are streamed to VatB immediately with no round
trip. This reduces the impact of network latency — pipes can be made wider but not shorter.

**Datalock** is the eventual-send analogue of deadlock: a circular dependency where a
promise can only be resolved by delivering a message buffered in that same promise.
Unlike deadlock, datalock bugs manifest reproducibly and are anecdotally very rare.

**Endo mapping:** `E(ref).method()` returns a promise; chaining `E(E(ref).x()).y()`
pipelines both sends. The daemon's CapTP implementation forwards buffered messages
on promise resolution, achieving the same latency reduction described by Miller.

---

## Research Notes

The full thesis text is now available in `docs/mark_miller_thesis.md`. The chapter
structure in the thesis does not align perfectly with the section numbering above (the thesis
uses a non-standard numbering scheme). Key chapters for further extraction:

1. **Chapters 1–3**: Foundation — composition problem, object paradigm, access control
2. **Chapter 7**: Distributed objects, pointer safety, CapTP bootstrapping
3. **Chapters 8–9**: Permission, authority, designation
4. **Chapter 11**: Confinement, overt isolation
5. **Chapter 14**: Vats, temporal isolation, communicating event-loops
6. **Chapters 16–17**: Promises, promise pipelining, far references, persistence

---

## Related References

- Mark Miller, "Distributed Confinement" (2002)
- Mark Miller, "Object Capabilities" (various presentations)
- E Language documentation and tutorials
- Endo project on GitHub (implementation of these concepts)

---

**Status:** Substantive content extracted from thesis PDF
**Date:** 2026-03-20
**Progress:** Key concepts (§2.1, §7.2–7.4, §8.1–8.2, §11, §14.1–14.2, §16) summarized with Endo mappings