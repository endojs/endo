
1. [x] review and revise `PLAN/genie_in_bottle.md`
  - [x] integrate **Answer**s provided to "Open questions"
  - [x] integrate the "Other Feedback" **Answer** about just using `endo run-daemon`
  - [x] integrate new **NOTE**s added to "Deployment scenarios" about provisioning simple/classic alternate users via `useradd`
  - [x] in particular, streamline and collapse everything around the approved "R2+R3" choice made to the main open question
  - done in WIP commit 98dcb79cb; this pass also tightened the
    Phase 2 label (was "(R3 + credentialing)" → "(credentialing)"
    with a one-line clarifier that R3's edge is already live from
    Phase 0 + Phase 1).

2. [x] create follow up `TODO/` tasks to build implementation phase 0 "bottle
   script as a dumb shell recipe" and verify it before handing back for human
   review and usage
  - [x] created [`TODO/81_genie_bottle_phase0_shell.md`](./81_genie_bottle_phase0_shell.md)
    covering the `packages/genie/scripts/bottle.sh` work items,
    verification checklist (libp2p / TCP / both, owner-accept,
    cleanup, re-run safety), and hand-off protocol.

