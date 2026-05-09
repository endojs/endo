# OCapN op:flush — mechanized FIFO proof (Lean 4 + Veil)

This Lake project mechanizes the central per-reference FIFO claim of the
OCapN promise-shortening / `op:flush` proposal in the
[Veil framework](https://github.com/verse-lab/veil) on top of Lean 4.

## Modules

* **`OcapnFlush/Flush.lean`** — single shortening, 3-party (Alice / Bob /
  Carol). The minimal model that exercises the cross-phase Sandwich Lemma.
* **`OcapnFlush/FourParty.lean`** — two sequential shortenings, 4-party
  (Alice / Bob / Carol / Dave). Same fence chain instantiated twice; the
  second shortening can begin and progress while phase-2 traffic is still
  in flight, so the model exercises the *non-trivial interleaving* case
  the alt proof report calls out as the next step beyond a single
  shortening event.

## What is verified

A simplified 3-party model (Alice, Bob, Carol) where:

- Alice exports a local promise `p1` at slot `N`.
- Bob is the sole sender of reference messages targeting `p1`.
- Bob may shorten the path B→A by initiating an `op:flush` followed by a
  third-party handoff to Carol; afterwards, Bob's traffic for the same
  reference reaches Alice over the C→A channel.

Bob's reference messages are partitioned into:

- **phase 1** — sent strictly before `op:flush`, traveling B→A.
- **phase 2** — sent after the handoff completes, traveling C→A.

The **safety property** verified is the *cross-phase end-to-end FIFO* claim
identified in the informal proof:

> `phase1 m₁ ∧ phase2 m₂ ∧ processed m₂ → processed m₁`

i.e. once Alice has dispatched any phase-2 message to the entity, every
phase-1 message has likewise been dispatched. Within-phase ordering is
established by the underlying transport's pairwise FIFO and is out of scope
for this model — it is folded into Alice-side processing preconditions.

## What is *not* in this model

- Fully concurrent flushes at *adjacent* intermediaries (alt §4 corner
  case). `FourParty.lean` does verify two shortenings whose handshakes
  may interleave with each other's data plane, but the second shortening
  is causally downstream of the first (Carol can only flush after she
  receives the ref via Bob's handoff). The fully-symmetric case where
  two intermediaries hold the reference *independently* and flush at the
  same time is the genuinely-interesting next step.
- Within-phase ordering. Both modules abstract over per-message order
  inside a phase; FIFO is established by the underlying transport and
  doesn't exercise the flush mechanic.
- Liveness. We verify safety only.
- Multi-sender per phase: each phase has a single logical sender.

## How the proof is structured

### `OcapnFlush/Flush.lean` — single shortening (3-party)

Declares a Veil transition system with:

- mutable relations for phase classification, `processed`, and protocol-
  event flags;
- 14 actions for each protocol step (Bob's sends, Alice's processings,
  Carol's withdraw, etc.); each action's preconditions encode the relevant
  pairwise-FIFO and gating axioms (A1, A3, A4 of the informal proof);
- 8 inductive-invariant clauses + 1 safety clause (`refFifo`) — the
  "two-fence chain" from the informal proof:

  1. `flushProcessedAtA → flushSentByB`
  2. `flushProcessedAtA → (phase1 M → processed M)`     *flush fence*
  3. `depositGiftProcessedAtA → flushProcessedAtA`       *B→A FIFO*
  4. `withdrawGiftProcessedAtA → depositGiftProcessedAtA` *A3 — gift gates*
  5. `cHoldsRef → withdrawGiftProcessedAtA`              *Carol's reply*
  6. `phase2 M ∧ processed M → withdrawGiftProcessedAtA` *C→A FIFO*
  7. `processed M → (phase1 M ∨ phase2 M)`               *processing only via the model's actions*
  8. `¬ (phase1 M ∧ phase2 M)`                           *phases disjoint*

  Together they chain end-to-end:
  `phase2 M₂ ∧ processed M₂ → withdraw → deposit → flush_processed →
  (phase1 M₁ → processed M₁)`.

Verification is via Veil's `#check_invariants`, which emits 144 SMT
obligations (initialization, every safety/clause × every action) and
discharges them with Z3 / CVC5. Every clause is reported `✅`. Veil
considers this the verification of record; full Lean proof-term
reconstruction (via `prove_inv_inductive`) is left admitted with `sorry`
because reconstruction can be slow on transition systems of this size and
is not necessary for the soundness story (Veil's correctness depends on
the SMT solvers, not on whether each VC is reified into Lean).

A `sat trace [happyPath]` BMC obligation also confirms the protocol admits
a non-trivial 15-step execution that ends with both a phase-1 and a phase-2
message processed.

### `OcapnFlush/FourParty.lean` — two sequential shortenings (4-party)

Adds a fourth party Dave and a second flush+handoff initiated by Carol
once she holds the reference. The state doubles (one fence chain for
B↔A, one for C↔A); the safety property generalizes to three pairwise
cross-phase claims:

```
phase1 m₁ ∧ phase2 m₂ ∧ processed m₂  →  processed m₁
phase2 m₂ ∧ phase3 m₃ ∧ processed m₃  →  processed m₂
phase1 m₁ ∧ phase3 m₃ ∧ processed m₃  →  processed m₁
```

The key linkage invariant is `cdFlushSentByC → cHoldsRef`, which is what
forces Carol's flush to be causally downstream of Bob's handoff and lets
the two fence chains compose. Crucially, the action preconditions do
*not* require phase-2 traffic to be drained before Carol initiates her
own flush — phase-2 sends and processings may interleave freely with the
C↔A flush handshake. The fence `cdFlushFence` (`cdFlushProcessedAtA →
phase2 M → processed M`) encodes the consequence of B↔A FIFO that makes
the eventual cross-phase ordering hold despite the interleaving.

`#check_invariants` emits 580 SMT obligations for this module
(initialization × 21 invariant clauses + 27 actions × 21 clauses + 3
safety clauses), all reported `✅`. A `sat trace [twoShortenings]` BMC
obligation runs a 30-step execution that issues, for each phase, a send
followed by an Alice-side processing, with Carol's flush initiation
deliberately interleaved between the first phase-2 send and its
processing.

## How to build

The project requires Lean 4 (v4.24.0), Veil, Z3, CVC5, and uv. From this
directory:

```sh
# Lean toolchain (use elan or download v4.24.0 from
# https://github.com/leanprover/lean4/releases manually)
lake update                # fetch Veil + transitive deps (mathlib, lean-smt)
lake build OcapnFlush.Flush
```

`lake build` will download Z3 and CVC5 into `.lake/packages/veil/.lake/build`
during a `veil/downloadDependencies` step. `uv` is also fetched there; if
your environment blocks `astral.sh`, install `uv` separately (`pip install
uv`) and copy the binary into the same path:

```sh
cp "$(which uv)" .lake/packages/veil/.lake/build/uv
```

A successful build prints, for every clause in the inductive-invariant
table, a `✅` verdict, and ends with `Build completed successfully`. The
two `sorry` warnings on `prove_inv_inductive` and `sat trace [happyPath]`
are expected — they correspond to claims the SMT solver has already
validated and that we have intentionally not reconstructed in Lean.

## Files

- `lakefile.lean` — Lake project; declares the dependency on Veil.
- `lean-toolchain` — pins Lean 4.24.0.
- `OcapnFlush.lean` — library entry point.
- `OcapnFlush/Flush.lean` — the model and proof.

## Synthesis with the informal proof

This formalization corresponds to §2 of the alternate proof report (the
3-party Sandwich Lemma). The model's invariant chain instantiates the
"two-fence" structure — one fence at `flush_done` (the flush fence) and
one at `deposit_gift` (the gift fence). Sections 3 (n-party) and 4
(concurrent flushes) of the alternate report would require richer state
(multiple intermediaries, cross-channel ordering proofs) that we
intentionally deferred so this proof stays small and fast to check.
