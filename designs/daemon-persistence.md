# Formula Persistence (Pass by Construction)

## Abstract

Formula Persistence is a persistence strategy for the Endo Daemon's petname
database and object capability system. It occupies a distinctive position in the
design space between orthogonal persistence with masked partition and revival (as
in the Waterken server) and exposed partition and revival at every reference (as
in Mark Miller's E language). Rather than persisting live heap state or requiring programs to
defensively recover broken reference chains, Formula Persistence records *how to
reconstruct* a capability from a graph of formulas, discarding and rebuilding
entire cohorts of live references when partition occurs.

## The Problem: Persistence in Distributed Capability Systems

### Two entangled dimensions

Distributed capability systems must choose along two entangled dimensions: how
to present partition and revival to application programs, and how to persist
state across restarts and upgrades. These dimensions are entangled — choices
about partition visibility constrain persistence strategy and vice versa — but
they are not the same axis. Formula Persistence is distinctive in making a
different choice on each.

### Masked partition and revival (Waterken model)

At one end of the spectrum, the system masks partition and revival. All
loss of connectivity is treated as temporary. The program never observes a broken
reference; it simply waits. Waterken achieves this by combining Joe-E (a
capability-safe subset of Java) as its local object-capability language with its
own live crypto-cap protocol in the CapTP family.

This enables orthogonal persistence: the system can snapshot the heap and restart
from that snapshot, possibly on a different host, without the program's
knowledge. Because the program never distinguishes between "slow" and
"partitioned," the system can be made deterministic over all communicating
programs.

**Advantages:**
- Simpler programming model: no defensive code against partition
- Determinism across communicating programs
- Transparent relocation

**Disadvantages:**
- Sacrifices availability: a single partitioned dependency stalls all dependents
- Entangled distributed heaps require distributed garbage collection
- Differences in incentives among participants necessitate market-based
  approaches to garbage collection (see "The market-sweep algorithms" in Drexler
  and Miller, "Incentive Engineering for Computational Resource Management,"
  1988)
- Upgrading programs in flight is difficult; the heap snapshot encodes
  assumptions about program behavior that the upgrade may violate

### Exposed partition and revival per-reference (E model)

At the other end, partition and revival are exposed at every individual reference. A
program must be written so that any dereference or message send to a potentially
remote reference might fail due to partition. Recovery requires reconstructing
the chain of computation that led to the broken reference, after partition heals.

**Advantages:**
- Simpler runtime implementation
- Does not sacrifice availability to the extent of the Waterken model
- No obligation to retain "offline capabilities" (sturdyrefs and out-of-band
  URL-like references) indefinitely. Both are necessarily weak references.
  Sturdyrefs are like out-of-band references but can participate in "distributed
  confinement" without revealing cryptographic material to a confined program
  with parts running on multiple peers.

**Disadvantages:**
- More complex programming model: every dependent computation must handle
  mid-process recovery
- Programs must reconstruct chains of computation defensively

### The common substrate: URL-like references

Both models share the notion of a URL or URL-like reference (sturdy reference,
locator) that weakly retains a capability on a peer and can be redeemed for a
live reference. In the Waterken model, these must be persisted indefinitely, or
all dependent distributed processes are silently corrupted (they continue waiting
for references that will never return). In E, sturdy references and locators
serve as the basis for restoring connectivity after partition heals.

In both models, petname systems are expected to be built *on top of* these
reference mechanisms.

## Formula Persistence: Inverting the Relationship

Formula Persistence inverts the relationship between petnames and the underlying
reference mechanism. The petname database is not built on top of sturdy
references; instead, it *is* the persistence system.

### The petname graph as persistence root

The petname database is a graph database mapping human-readable, self-assigned
names to capabilities. It maps a tree of named paths to locators. As in E, a
locator serves to re-establish connectivity — but here, to the latest
*incarnation* of a capability, via a level of indirection through the formula
graph. The locators refer to nodes in a graph of formulas.

### Formulas as reconstruction recipes

Each formula describes:
- How to arrive at a live reference for a capability
- How to construct the capability's dependencies

A formula is not a snapshot of state. It is a recipe for producing state. The
system persists *construction*, not *content*.

### Destruction by cohort, reconstruction on demand

A capability is a member of a cohort: itself and the live references for its
transitive dependencies. The system responds to partition with **destruction by
cohort**: when any reference in the cohort becomes partitioned, the entire
subgraph of dependent live references is collectively destroyed. The system then
offers **reconstruction on demand**: the affected capabilities may later be
reincarnated from their formulas when partition heals and a consumer requests
them.

This is the "pass by construction" property: rather than attempting to patch a
partially broken graph of live references, the system destroys the affected
cohort and rebuilds from formulas on demand.

When a cohort is destroyed, the system provides a window for the hosting process
to shut down gracefully — flushing external storage, releasing resources. During
this window, partition of individual references becomes observable. However, the
moment the daemon has committed to the disincarnation of a reference, the
incarnation lives only in limbo — it cannot be reached through the daemon. Its
severance is, from that point on, inconsequential.

Rather than obligate the code to react to partition, we automate reconstruction.
We require the code to manually persist anything that might need to survive
reconstruction, and provide formula-based storage mechanisms to that end. We
find this burden tolerable given that every system in which software can be
upgraded necessarily has the same obligation.

### The live reference graph and the formula graph

The live reference graph passes through the heaps of distributed processes. It
contains a mix of references that correspond to formulas and references that do
not. Both kinds — formula-backed and ephemeral — can pass over CapTP among
processes.

Ephemeral references are bounded by sessions and can suffer partition.
Formula-backed references can be reconstructed after partition, but only because
someone previously arranged for the formula to exist.

Creating a formula is not a matter of mere message passing. It requires appealing
to a user agent — typically by proposing code that can construct the live
reference, then persisting that code along with its petnamed dependencies. This
is a deliberate act of policy, not an automatic consequence of holding a
reference.

Consequently, Formula Persistence does not entirely avoid the problem of
programming explicitly against partition. Programs must still be aware that
ephemeral references can vanish. What it offers is a more ergonomic way to do so:
the formula graph provides a declarative substrate for recovery, and the petname
database provides a human-legible map of what has been made durable and why.

This is very much a hybrid approach. It sits between systems that mask partition
and revival entirely and systems that expose them at every reference.

### Graph structure and garbage collection

The formula graph and the ephemeral reference graph have complementary structural
properties:

- The **formula graph is acyclic**. It can be collected with simple, local
  reference counting. No distributed garbage collection protocol is needed.
- The **ephemeral reference graph may be cyclic**. It is scoped to sessions.
  Cyclic relationships are permitted in the ephemeral layer.

The formula graph is acyclic across peers, but admits limited cycles among
certain groups of formulas that must present unique, unforgeable identifiers to
the network while being constructed as facets of a shared underlying capability.
These include promise-and-resolver pairs and agent handle pairs.

### Mitigating heap bloat

Because values incarnated from formula can be reincarnated on demand, the user
can observe that a connected peer is imposing an undue burden to retain ephemeral
state and intervene:

- The user can force the offending worker to restart, discarding its ephemeral
  heap. Any formula-backed values will be reconstructed on demand.
- The operating system can obligate a worker to restart as a matter of
  out-of-memory mitigation, with the same consequence.
- If neither is sufficient, the user can manually sever the offending peer.

Heap bloat in the ephemeral layer is mitigated by interventions one layer down,
in the formula graph. The formula graph provides the floor from which the system
can always recover.

### Timely revocation through local reachability

The acyclicity of the formula graph enables timely destruction and severance of
capabilities the user has revoked.

Once a reference is locally unreachable in the petname graph, the corresponding
live reference can be made immediately unreachable and gracefully destroyed.
All heaps that refer to it and all CapTP sessions that retain it can be
terminated or severed. There is no need to wait for distributed garbage
collection to propagate; the user agent controls local reachability and acts on
it directly.

This "timely revocation" is a key user interface affordance of the Endo Daemon,
Chat, and Familiar system. The user agent gives the user a place to stand to
locally control reachability of local resources, while allowing the system to
participate in a distributed or decentralized network of references. The user
does not need to trust the distributed system to honor revocation — revocation is
enforced locally, at the persistence layer, before any distributed protocol is
consulted.

### Coordinated retention across peers

When two peers are introduced to each other's petname formula databases, each
must coordinate local retention on behalf of the remote peer. The local user
retains agency over what they retain on behalf of the remote user, even when the
peers are partitioned or have no active sessions between them. These mirrored
retention roots must be able to diverge — each serves as a local retention root
— and when the peers reconnect, connectivity to previously authorized
capabilities can resume.

In the formula persistence model, the petname database models these mirrored
retention roots with local user agency as a CRDT, kept in sync when a session is
open between peers.

#### Introduction and the four tables

Connections between peers are arranged through an out-of-band mechanism of
introduction via a third party. One party creates an invitation for a specific
guest; the guest accepts the invitation.

- The **inviting party** designates a petname for the guest at the time of
  constructing a formula representing the invitation.
- The **accepting party** designates a petname for the host at the time of
  acceptance.

This constructs coordinated storage for both parties: a local table and a remote
table on each side, for a total of four tables. Each local table serves the
agency of its user. The remote table is never consulted for local retention
decisions — the local user always has the final word on what is retained locally,
regardless of what the remote peer expects.

## The System Formula Persistence Is Designed to Suit

The Endo Daemon is a user agent for distributed capabilities. Capabilities pass
to peers, bots, and applications with the user's informed consent and the right
to timely revocation of any reference going forward. The persistence system must
serve this role without degrading the user's experience.

### Ephemeral clients and fast convergence

The primary constraint is that nodes — especially clients — go on and offline
frequently. An ephemeral client needs to quickly recover access to capabilities
it was previously granted. It cannot afford to replay a transcript of prior
interactions or to restore a heap snapshot containing large numbers of
capabilities unrelated to the task at hand. The system must converge quickly to a
usable state as nodes rejoin.

Formulas solve this directly: when a client restarts, the formula graph describes
how to reconstruct exactly the capabilities the client needs, and only those
capabilities, without replaying history.

### Retaining policy without fatiguing the user

If a user has granted a capability to a peer or application in a previous
incarnation, that grant should be honored in subsequent incarnations without
re-prompting the user. Repeatedly asking the user to re-authorize capabilities
that were already granted — "harassing the user" — erodes trust and makes the
system unusable in practice.

Formula-based retention of policy enables this. The formula graph encodes not
just how to reconstruct a capability but the fact that it was authorized. When an
ephemeral session is re-established, the system can re-derive the authorized
capabilities from their formulas, restoring the user's prior policy decisions
without requiring the user to re-confirm them.

### Revocation by withdrawal of construction

Formula Persistence introduces a revocation mechanism distinct from the three
identified in the existing literature (inline caretakers, revocation lists, and
expiry): **revocation by withdrawal of the constructor**. Removing or
invalidating a formula withdraws the recipe for constructing the capability.
This cascades into the disincarnation of the corresponding live reference and
anything that depends upon it for its own construction.

Because the formula graph is acyclic and locally managed, this revocation is
immediate and requires no distributed protocol (as described above in "Timely
revocation through local reachability").

## Why Not Orthogonal Persistence?

### The upgrade problem dissolves the distinction

As noted above, the obligation to manually persist important state is shared by
Formula Persistence and any orthogonally persistent system that must support
upgrades. An upgrade may invalidate assumptions encoded in a heap snapshot; the
program must reconstruct its working state from durable inputs afterward. The
orthogonal persistence machinery provides comfort during normal operation but
does not eliminate the need for reconstruction logic.

Formula Persistence accepts this reality as a starting point rather than
discovering it as a consequence.

### Instant restart

Because the formula graph encodes how to reconstruct all capabilities, a node
in the distributed system can restart instantly. There is no heap snapshot to
load, no replay log to process. The formulas are evaluated lazily as
capabilities are demanded.

### What is sacrificed

- **Determinism:** Reconstruction from formula may produce observably different
  results from one incarnation to the next (e.g., if a dependency's behavior
  has changed).
- **Ephemeral state:** Heap state that is not captured in a formula or in
  manually persisted storage is lost across incarnations.

## Formula Persistence as a Choice within Endo

The Endo Daemon implements Formula Persistence, but Formula Persistence is not
intrinsic to Endo. Endo provides a shared model for passable values (data and
capabilities), patterns, and message passing. Other systems built on the same
Endo components make different choices along the entangled dimensions:

- The choice of **CapTP** determines message ordering.
- The choice of a **Network** determines the range within which pass-invariant
  equality can be relied upon.
- The **Daemon** chooses Formula Persistence.

For example, the Agoric chain uses Endo components with orthogonal persistence to
ensure that all honest validators produce the same deterministic computation,
independent of whether they crashed and restarted or simply continued. Formula
Persistence is a design choice particular to the user agent, where the priorities
are fast convergence of ephemeral clients, user agency over retention, and timely
revocation — not determinism across validators.

That said, the Daemon can host a worker that is itself constrained to
determinism and keeps its own replay transcript. The Daemon serves as its host
for the purpose of connecting it to the broader network and vending capabilities,
without imposing its own persistence model on the worker's internals.

## Formula Persistence and the 6/7 Aspects of Sharing

Karp, Stiegler, and Close identify six aspects of sharing that a capability
system must support, illustrated by a single scenario:

> Due to an emergency (**dynamic**), Bob asks Alice to have her son
> (**cross-domain**, **chained**) put Bob's car in Carol's garage
> (**composable**), all while being unable to open the car's trunk
> (**attenuated**) yet being held responsible for mishaps (**accountable**).
>
> — Karp, Stiegler, Close,
> ["Not One Click for Security"](https://cups.cs.cmu.edu/soups/2009/posters/p2-karp.pdf)
> (HP Labs, 2009)

Karp adds a seventh — **revocable** — for contexts where delegation
relationships are dynamic and long-lived. A persistence strategy must not
impede any of these aspects, and in several cases Formula Persistence has
something specific to contribute.

1. **Dynamic** — The formula graph and petname database are mutable. Formulas
   can be created and destroyed by the user agent without administrator
   intervention. Persistence does not ossify sharing relationships; it records
   them in a form that can be revised.

2. **Chained** — Formula dependencies encode chains of delegation. A formula can
   describe a capability derived from another capability, which is itself
   derived from another, without privileging any link in the chain.

3. **Cross-domain** — The coordinated retention mechanism enables peers with
   independent petname databases to maintain mirrored retention roots across
   administrative boundaries, synchronized as a CRDT when sessions are open.

4. **Composable** — A formula can depend on multiple independent formulas from
   different grantors. A process can hold and combine references constructed
   from unrelated parts of the formula graph.

5. **Attenuated** — A formula can describe a capability that is a restricted
   facet of a dependency. The construction recipe can encode attenuation as part
   of the formula, ensuring that the attenuated form is what gets reconstructed
   across incarnations.

6. **Accountable** — The petname graph provides a human-readable record of what
   was granted, to whom, and through what chain of dependencies. Because
   formulas encode their dependencies, the delegation structure is inspectable.

7. **Revocable** — Formula Persistence introduces revocation by withdrawal of
   the constructor: removing a formula cascades into the disincarnation of
   dependent capabilities. This is immediate, local, and requires no distributed
   protocol — a stronger guarantee than caretakers (which must remain alive),
   revocation lists (which must propagate), or expiry (which is coarse-grained).

## Position in the Design Space

| Property | Waterken (masked partition/revival) | E (exposed partition/revival) | Formula Persistence |
|---|---|---|---|
| Partition and revival | Masked | Exposed per-reference | Exposed per-cohort |
| Persistence mechanism | Orthogonal | Manual + sturdy refs | Formula graph |
| Programming model | Simple (no partition code) | Defensive (per-reference) | Moderate (cohort-aware) |
| Restart cost | Snapshot restore | Reference re-establishment | Formula evaluation (lazy) |
| Upgrade story | Difficult (heap assumptions) | Natural (references re-resolve) | Natural (formulas re-evaluate) |
| Retention: live references | Indefinite (partition masked) | Distributed acyclic GC | Scoped to cohort |
| Retention: durable references | Indefinite (web-keys) | Weak (sturdyrefs) | Local reference counting (formula graph) |
| Availability | Sacrificed for consistency | Maintained per-reference | Maintained per-cohort |
| Petname relationship | Built on top of references | Built on top of references | Petnames *are* the persistence root |

## Related Work

### Waterken server

Tyler Close's Waterken server is a Java-based capability platform providing
orthogonal persistence and masked partition and revival. Objects are made accessible to
HTTP clients via "web-keys" — HTTPS URLs containing an unguessable cryptographic
fragment that serves as a transferable capability. Each distinct permission is
assigned a distinct web-key, enabling fine-grained delegation. The ref_send API
provides asynchronous messaging with orthogonal persistence across network
boundaries. The Waterken model treats all loss of connectivity as temporary; the
program never observes partition or revival.

- Waterken server: <https://waterken.sourceforge.net/>
- Web-keys: <https://waterken.sourceforge.net/web-key/>

### E language and CapTP

Mark Miller's E programming language is a distributed, persistent, secure
language designed for concurrent and potentially malicious components distributed
over potentially malicious machines. E introduces CapTP (Capability Transport
Protocol) for distributed capability messaging, and defines a hierarchy of
reference types: live references for immediate use, sturdy references ("offline
capabilities") for persistence across partition, and locators for re-establishing
connectivity. Partition and revival are exposed at the level of individual references,
requiring programs to handle partial failure explicitly.

- E language: <https://erights.org/> (certificate may be expired; content
  archived at <https://web.archive.org/web/2024*/erights.org>)
- CapTP: <https://erights.org/elib/distrib/captp/index.html>
- Robust Composition (Miller's dissertation, 2006): covers E's distributed
  persistence model in depth.
  <http://papers.agoric.com/papers/robust-composition/abstract/>

### Concurrency Among Strangers

Miller, Van Cutsem, et al. (2005) describe how the E language addresses the
joint challenges of concurrency and security by changing only a few concepts of
conventional sequential object programming. The paper addresses Internet-scale
computing where machines proceed concurrently and interact across barriers of
large latencies and partial failure — the same environment that motivates Formula
Persistence.

- <http://papers.agoric.com/papers/concurrency-among-strangers/abstract/>

### Market-based distributed garbage collection

Drexler and Miller (1988) propose market-based mechanisms for computational
resource management, including a distributed garbage collection algorithm able to
collect unreferenced loops that cross trust boundaries through decentralized
market negotiations. This addresses the problem that orthogonal persistence with
entangled distributed heaps entrains an obligation for distributed garbage
collection, and that differences in incentives among participants necessitate
market-based solutions. Formula Persistence sidesteps this obligation by keeping
the formula graph acyclic and locally reference-counted.

- Incentive Engineering for Computational Resource Management:
  <http://papers.agoric.com/papers/incentive-engineering-for-computational-resource-management/abstract/>
- Markets and Computation: Agoric Open Systems:
  <http://papers.agoric.com/papers/markets-and-computation-agoric-open-systems/abstract/>

### Distributed Electronic Rights in JavaScript

Miller, Van Cutsem, and Tulloh (2013) demonstrate extending JavaScript into a
distributed, secure, persistent, and ubiquitous computational fabric — enabling
mutually suspicious parties to cooperate safely through the exchange of rights.
This work is an ancestor of the Endo/Agoric platform on which Formula Persistence
is built.

- <http://papers.agoric.com/papers/distributed-electronic-rights-in-javascript/abstract/>

### Petname systems

Marc Stiegler's petname systems describe a naming architecture with three
components: petnames (self-assigned, human-readable, memorable names chosen by
the user), nicknames (human-readable names proposed by the named party, not
necessarily unique or trustworthy), and keys (globally unique, cryptographically
secure identifiers, not human-readable). Formula Persistence places petnames at
the root of the persistence system rather than layering them on top of an
existing reference mechanism.

- Petname Systems (Stiegler, 2005), HP Labs Technical Report HPL-2005-148:
  <https://shiftleft.com/mirrors/www.hpl.hp.com/techreports/2005/HPL-2005-148.html>
- Petnames: A Humane Approach to Secure, Decentralized Naming (Lemmer-Webber,
  Miller, Larson, Sills, Yaacoby):
  <https://files.spritely.institute/papers/petnames.html>

## Conclusion

Formula Persistence inverts the traditional relationship between petnames and
the underlying capability reference mechanism. Where other systems build petname
databases on top of sturdy references or web-keys, Formula Persistence makes the
petname graph the persistence root and derives everything else from it.

This design accepts two realities. First, that the need to upgrade software in
flight imposes the same obligation on orthogonally persistent programs that
Formula Persistence imposes by design: manually persisting important state and
reconstructing from durable inputs. Second, that a user agent must prioritize the
user's agency — fast convergence of ephemeral clients, retention of policy
without user fatigue, and timely revocation without distributed coordination.

The result is a system that persists *construction, not content*. Capabilities
are destroyed by cohort and reconstructed on demand. The formula graph is
acyclic, locally reference-counted, and amenable to a novel form of revocation
by withdrawal of the constructor. The user stands at the root of the graph, with
local control over what is retained, what is shared, and what is severed.

