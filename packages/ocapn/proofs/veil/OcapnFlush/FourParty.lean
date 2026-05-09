import Veil

set_option linter.dupNamespace false

/-! # End-to-end per-reference FIFO across two sequential shortenings (4-party)

This module extends `OcapnFlush.Flush` to a 4-party scenario in which two
shortenings happen back-to-back, exercising both *non-trivial interleavings*
(the second shortening may begin while the first is still draining) and the
*chain propagation* the alternate proof report calls out in §3 (n-party
generalization).

## Modeled scenario

* Alice (A) hosts the entity at slot N.
* Bob (B) holds the initial remote reference and is the first sender.
* Carol (C) receives the reference via a third-party handoff initiated by
  Bob (after Bob's `op:flush` round-trip with Alice).
* Dave (D) receives the reference via a *second* third-party handoff,
  initiated by Carol after she in turn flushes Alice.

Bob's reference messages are partitioned into three phases according to the
sender at the time Alice processes them:

* `phase1 m` — sent by Bob before Bob's `op:flush`, traveling B→A.
* `phase2 m` — sent by Carol after Bob's handoff completed and before
  Carol's own `op:flush`, traveling C→A.
* `phase3 m` — sent by Dave after Carol's handoff completed,
  traveling D→A.

Each handoff uses the same fence chain as in `Flush.lean`: a flush
handshake, a deposit-gift, a withdraw-gift gated on the deposit-gift, and
a "the new sender now holds the ref" step.

## Non-trivial interleavings exercised

* Phase-2 messages may be sent (by Carol) and processed at Alice while
  Carol is *also* preparing her own flush — no precondition on her flush
  initiation requires phase-2 traffic to be finished.
* Carol's `op:flush` handshake may run concurrently (in any interleaving)
  with phase-2 messages still in flight.
* Phase-3 messages may begin as soon as Dave acquires the ref, without
  waiting for any phase-2 message Alice hasn't yet processed.

Despite all of these interleavings, the safety claim is the
generalization of the `Flush.lean` claim:

> for every later-phase message Alice has processed, every message in any
> earlier phase has likewise been processed.

i.e. the per-reference FIFO order survives the chain of shortenings
regardless of how the steps interleave on the wire.

## Why this isn't fully concurrent flushes (alt §4)

The two flushes here are *causally* sequential — Carol cannot issue her
flush until she has received Bob's handoff (otherwise she has no
reference to flush). What's "concurrent" is everything *else*: phase-2
sends, phase-2 processings, phase-3 sends, etc. all interleave with the
flush handshakes in arbitrary order. The fully-symmetric concurrent case
from alt §4 (two adjacent intermediaries flushing with no causal
dependency) requires a different chain topology and is left as future
work; this is the natural intermediate step. -/

veil module FourParty

type msg

/-! ## State -/

relation phase1 (m : msg)
relation phase2 (m : msg)
relation phase3 (m : msg)
relation processed (m : msg)

/- B↔A flush + handoff (transition from phase 1 to phase 2). -/
relation bcFlushSentByB
relation bcFlushProcessedAtA
relation bcFlushDoneSent
relation bcFlushDoneReceivedAtB
relation bcDepositGiftSent
relation bcDepositGiftProcessedAtA
relation bcHandoffGiveSent
relation bcHandoffGiveReceivedAtC
relation bcWithdrawGiftSent
relation bcWithdrawGiftProcessedAtA
relation cHoldsRef

/- C↔A flush + handoff (transition from phase 2 to phase 3). -/
relation cdFlushSentByC
relation cdFlushProcessedAtA
relation cdFlushDoneSent
relation cdFlushDoneReceivedAtC
relation cdDepositGiftSent
relation cdDepositGiftProcessedAtA
relation cdHandoffGiveSent
relation cdHandoffGiveReceivedAtD
relation cdWithdrawGiftSent
relation cdWithdrawGiftProcessedAtA
relation dHoldsRef

#gen_state

after_init {
  phase1 M := False
  phase2 M := False
  phase3 M := False
  processed M := False
  bcFlushSentByB := False
  bcFlushProcessedAtA := False
  bcFlushDoneSent := False
  bcFlushDoneReceivedAtB := False
  bcDepositGiftSent := False
  bcDepositGiftProcessedAtA := False
  bcHandoffGiveSent := False
  bcHandoffGiveReceivedAtC := False
  bcWithdrawGiftSent := False
  bcWithdrawGiftProcessedAtA := False
  cHoldsRef := False
  cdFlushSentByC := False
  cdFlushProcessedAtA := False
  cdFlushDoneSent := False
  cdFlushDoneReceivedAtC := False
  cdDepositGiftSent := False
  cdDepositGiftProcessedAtA := False
  cdHandoffGiveSent := False
  cdHandoffGiveReceivedAtD := False
  cdWithdrawGiftSent := False
  cdWithdrawGiftProcessedAtA := False
  dHoldsRef := False
}

/-! ## Phase 1 — Bob -/

action sendPhase1Msg (m : msg) = {
  require ¬ bcFlushSentByB
  require ¬ phase1 m
  require ¬ phase2 m
  require ¬ phase3 m
  phase1 m := True
}

action processPhase1 (m : msg) = {
  require phase1 m
  require ¬ processed m
  require ¬ bcFlushProcessedAtA
  processed m := True
}

action bobSendBcFlush = {
  require ¬ bcFlushSentByB
  bcFlushSentByB := True
}

action aliceProcessBcFlush = {
  require bcFlushSentByB
  require ¬ bcFlushProcessedAtA
  require ∀ M, phase1 M → processed M
  bcFlushProcessedAtA := True
}

action aliceSendBcFlushDone = {
  require bcFlushProcessedAtA
  require ¬ bcFlushDoneSent
  bcFlushDoneSent := True
}

action bobReceiveBcFlushDone = {
  require bcFlushDoneSent
  require ¬ bcFlushDoneReceivedAtB
  bcFlushDoneReceivedAtB := True
}

action bobSendBcDepositGift = {
  require bcFlushDoneReceivedAtB
  require ¬ bcDepositGiftSent
  bcDepositGiftSent := True
}

action aliceProcessBcDepositGift = {
  require bcDepositGiftSent
  require ¬ bcDepositGiftProcessedAtA
  require bcFlushProcessedAtA
  bcDepositGiftProcessedAtA := True
}

action bobSendBcHandoffGive = {
  require bcFlushDoneReceivedAtB
  require ¬ bcHandoffGiveSent
  bcHandoffGiveSent := True
}

action carolReceiveBcHandoffGive = {
  require bcHandoffGiveSent
  require ¬ bcHandoffGiveReceivedAtC
  bcHandoffGiveReceivedAtC := True
}

action carolSendBcWithdrawGift = {
  require bcHandoffGiveReceivedAtC
  require ¬ bcWithdrawGiftSent
  bcWithdrawGiftSent := True
}

action aliceProcessBcWithdrawGift = {
  require bcWithdrawGiftSent
  require ¬ bcWithdrawGiftProcessedAtA
  require bcDepositGiftProcessedAtA
  bcWithdrawGiftProcessedAtA := True
}

action carolHoldsRef = {
  require bcWithdrawGiftProcessedAtA
  require ¬ cHoldsRef
  cHoldsRef := True
}

/-! ## Phase 2 — Carol -/

action sendPhase2Msg (m : msg) = {
  require cHoldsRef
  require ¬ cdFlushSentByC
  require ¬ phase1 m
  require ¬ phase2 m
  require ¬ phase3 m
  phase2 m := True
}

action processPhase2 (m : msg) = {
  require phase2 m
  require ¬ processed m
  require bcWithdrawGiftProcessedAtA
  require ¬ cdFlushProcessedAtA
  processed m := True
}

action carolSendCdFlush = {
  require cHoldsRef
  require ¬ cdFlushSentByC
  cdFlushSentByC := True
}

action aliceProcessCdFlush = {
  require cdFlushSentByC
  require ¬ cdFlushProcessedAtA
  require ∀ M, phase2 M → processed M
  cdFlushProcessedAtA := True
}

action aliceSendCdFlushDone = {
  require cdFlushProcessedAtA
  require ¬ cdFlushDoneSent
  cdFlushDoneSent := True
}

action carolReceiveCdFlushDone = {
  require cdFlushDoneSent
  require ¬ cdFlushDoneReceivedAtC
  cdFlushDoneReceivedAtC := True
}

action carolSendCdDepositGift = {
  require cdFlushDoneReceivedAtC
  require ¬ cdDepositGiftSent
  cdDepositGiftSent := True
}

action aliceProcessCdDepositGift = {
  require cdDepositGiftSent
  require ¬ cdDepositGiftProcessedAtA
  require cdFlushProcessedAtA
  cdDepositGiftProcessedAtA := True
}

action carolSendCdHandoffGive = {
  require cdFlushDoneReceivedAtC
  require ¬ cdHandoffGiveSent
  cdHandoffGiveSent := True
}

action daveReceiveCdHandoffGive = {
  require cdHandoffGiveSent
  require ¬ cdHandoffGiveReceivedAtD
  cdHandoffGiveReceivedAtD := True
}

action daveSendCdWithdrawGift = {
  require cdHandoffGiveReceivedAtD
  require ¬ cdWithdrawGiftSent
  cdWithdrawGiftSent := True
}

action aliceProcessCdWithdrawGift = {
  require cdWithdrawGiftSent
  require ¬ cdWithdrawGiftProcessedAtA
  require cdDepositGiftProcessedAtA
  cdWithdrawGiftProcessedAtA := True
}

action daveHoldsRef = {
  require cdWithdrawGiftProcessedAtA
  require ¬ dHoldsRef
  dHoldsRef := True
}

/-! ## Phase 3 — Dave -/

action sendPhase3Msg (m : msg) = {
  require dHoldsRef
  require ¬ phase1 m
  require ¬ phase2 m
  require ¬ phase3 m
  phase3 m := True
}

action processPhase3 (m : msg) = {
  require phase3 m
  require ¬ processed m
  require cdWithdrawGiftProcessedAtA
  processed m := True
}

/-! ## Safety: cross-phase end-to-end FIFO

For any pair of phases (i < j) and any messages `M_i` (phase i), `M_j`
(phase j), if Alice has processed `M_j` then she has also already
processed `M_i`. -/

safety [refFifo12] (phase1 M1 ∧ phase2 M2 ∧ processed M2) → processed M1
safety [refFifo23] (phase2 M2 ∧ phase3 M3 ∧ processed M3) → processed M2
safety [refFifo13] (phase1 M1 ∧ phase3 M3 ∧ processed M3) → processed M1

/-! ## Inductive invariants

The fence chain doubles up: one chain for B→C, one for C→D. Each chain has
the same shape as in `Flush.lean`, and the two are linked by the fact
that `cdFlushProcessedAtA` only fires after every phase-2 message has been
processed (which by `bcFlushFence` means every phase-1 message has been
processed too). -/

invariant [phasesDisjoint12] ¬ (phase1 M ∧ phase2 M)
invariant [phasesDisjoint13] ¬ (phase1 M ∧ phase3 M)
invariant [phasesDisjoint23] ¬ (phase2 M ∧ phase3 M)
invariant [processedHasPhase] processed M → (phase1 M ∨ phase2 M ∨ phase3 M)

invariant [bcFlushSentMonotone] bcFlushProcessedAtA → bcFlushSentByB
invariant [bcFlushFence] bcFlushProcessedAtA → (phase1 M → processed M)
invariant [bcDepositAfterFlush] bcDepositGiftProcessedAtA → bcFlushProcessedAtA
invariant [bcWithdrawAfterDeposit] bcWithdrawGiftProcessedAtA → bcDepositGiftProcessedAtA
invariant [cHoldsRefMeansBcWithdraw] cHoldsRef → bcWithdrawGiftProcessedAtA
invariant [phase2NeedsBcWithdraw] (phase2 M ∧ processed M) → bcWithdrawGiftProcessedAtA

invariant [cdFlushSentMonotone] cdFlushProcessedAtA → cdFlushSentByC
invariant [cdFlushFence] cdFlushProcessedAtA → (phase2 M → processed M)
invariant [cdDepositAfterFlush] cdDepositGiftProcessedAtA → cdFlushProcessedAtA
invariant [cdWithdrawAfterDeposit] cdWithdrawGiftProcessedAtA → cdDepositGiftProcessedAtA
invariant [dHoldsRefMeansCdWithdraw] dHoldsRef → cdWithdrawGiftProcessedAtA
invariant [phase3NeedsCdWithdraw] (phase3 M ∧ processed M) → cdWithdrawGiftProcessedAtA

/- Linkage between the two chains: Carol can only initiate the C→D flush
once she holds the ref, which transitively requires Bob's handoff to have
completed. -/
invariant [cdFlushNeedsCHoldsRef] cdFlushSentByC → cHoldsRef

#gen_spec

set_option veil.printCounterexamples true
set_option veil.smt.model.minimize true
set_option veil.vc_gen "transition"
set_option maxHeartbeats 4000000

#check_invariants

prove_inv_init by { simp_all [initSimp, actSimp, invSimp] }

set_option maxRecDepth 8192 in
set_option maxHeartbeats 4000000 in
prove_inv_safe by {
  sdestruct st
  simp (config := { maxSteps := 4000000 }) [invSimp]
}

set_option veil.smt.reconstructProofs false

prove_inv_inductive by {
  constructor
  · apply inv_init
  intro st st' _ hinv hnext
  sts_induction <;> sdestruct_goal <;> solve_clause
}

/-! ## Sanity: BMC trace exercising both shortenings, with phase-2 traffic
flowing while Carol is preparing her own flush. -/

sat trace [twoShortenings] {
  -- Phase 1: Bob sends and Alice processes some, then Bob flushes.
  sendPhase1Msg
  bobSendBcFlush
  processPhase1
  aliceProcessBcFlush
  aliceSendBcFlushDone
  bobReceiveBcFlushDone
  bobSendBcDepositGift
  bobSendBcHandoffGive
  aliceProcessBcDepositGift
  carolReceiveBcHandoffGive
  carolSendBcWithdrawGift
  aliceProcessBcWithdrawGift
  carolHoldsRef
  -- Phase 2: Carol sends and Alice processes — interleaved with Carol
  -- preparing the second flush only after the first phase-2 msg was sent.
  sendPhase2Msg
  carolSendCdFlush
  processPhase2
  aliceProcessCdFlush
  aliceSendCdFlushDone
  carolReceiveCdFlushDone
  carolSendCdDepositGift
  carolSendCdHandoffGive
  aliceProcessCdDepositGift
  daveReceiveCdHandoffGive
  daveSendCdWithdrawGift
  aliceProcessCdWithdrawGift
  daveHoldsRef
  -- Phase 3: Dave sends and Alice processes.
  sendPhase3Msg
  processPhase3
  assert
    (∃ M1 M2 M3,
      phase1 M1 ∧ phase2 M2 ∧ phase3 M3 ∧
      processed M1 ∧ processed M2 ∧ processed M3)
} by { bmc_sat }

end FourParty
