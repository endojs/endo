
Okay so your research in `TADA/21_genie_heartbeat_tick.md`:

- that all makes sense, let's go with your proposed side-channel Map solution

1. [x] create `TODO/` follow up task(s) planning out your changes needed, use your judgement as to how many tasks to break it down into
   - Created `TODO/23_genie_heartbeat_side_channel_map.md` — single
     implementation task with 6 steps covering the Map creation,
     onTick correlation IDs, message loop parsing, drain refactor,
     processHeartbeat signature update, and stale-message handling.

2. [x] create a further `TODO/` follow up task to plan out interval scheduler
   redesign for "Persist tick as an endo formula / pet name" as mentioned in
   the alternatives section in your research ; do not yet implement this plan,
   just do the design planning
   - Created `TODO/24_genie_interval_formula_design.md` — design-only
     task with 6 key design questions, a sketch of the formula-based
     flow, open questions about performance and lifecycle, and a note
     that this is the long-term replacement for the Map approach.

