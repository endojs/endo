# OCapN op:flush — mechanized FIFO proof (Lean 4 + Veil)

This Lake project mechanizes the central per-reference FIFO claim of the
OCapN promise-shortening / `op:flush` proposal in the
[Veil framework](https://github.com/verse-lab/veil) on top of Lean 4.

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

- Concurrent flushes at multiple intermediaries (the n-party / 4-party
  concurrent case from the alternate proof report). The 3-party Sandwich
  Lemma reduces n-party serial shortenings to this case; the concurrent
  4-party "corner case" is out of scope.
- Carol-side traffic ordering and intra-phase FIFO. Both are immediate
  consequences of pairwise FIFO on the underlying channels and don't
  exercise the flush mechanic.
- Liveness. We verify safety only.
- Multi-sender: one logical sender (Bob) targeting the reference.

## How the proof is structured

`OcapnFlush/Flush.lean` declares a Veil transition system with:

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
