
- [x] read and review `PLAN/genie_loop_overview.md`, integrate **Answer**s to "Open questions"
  - [x] also revise `PLAN/genie_loop_architecture.md`
  - [x] and revise `PLAN/genie_loop_remote.md`

Summary of changes:

- `genie_loop_overview.md`: replaced "Open questions" (all
  questions now answered) with a "Decisions" section; rewrote the
  Implementation Plan entries to reflect each decision (plugin tool
  default = `['bash']`; per-sub-agent model overrides; keep `/`
  prefix pending integration-test validation; heartbeat gains
  background event visibility; remote-mode deferred).
- `genie_loop_architecture.md`: rewrote "Prefix choice" to commit to
  today's per-deployment defaults and defer any change until
  integration tests surface a problem; updated "Tool registry"
  defaults note (exec/git stay as attenuation examples, not on by
  default); added a "Model-override policy" subsection to "Agent
  pack"; extended "Observer/reflector parity" to cover the
  heartbeat sub-agent; converted "Heartbeat ownership" to a decided
  section and added "Convergence toward observer/reflector shape";
  updated "Minimum viable refactor" to include heartbeat in the
  background subscription.
- `genie_loop_remote.md`: added a prominent deferred-status banner
  at the top and reinforced it at the bottom of "Dependencies on
  other plan docs"; noted heartbeat subscription naturally falls
  out of the parity work.

