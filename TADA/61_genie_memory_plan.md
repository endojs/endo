# Review and revise genie tiered memory architecture

1. [x] make sure that everything makes sense from a top-down view
  - reading `PLAN/genie_memory_overview.md` and then expanding to...
  - ✅ Overview is sound. Two-layer design (session + knowledge) is
    well-motivated. Pipeline diagram is accurate. Context injection
    order is correct for prompt-cache friendliness.

2. [x] ... review and revise `PLAN/genie_memory_implementation.md`
  - in particular the points around using separate PiAgent instances
  - and the open question around model selection
  - ✅ **Revised extensively.** Key changes:
    - Added "Code reality check" section grounding the plan in
      current codebase state (what exists, what's missing).
    - Added **Phase 0 — Prerequisites** for gaps that Phase 1
      depends on: search index initialization, token estimation,
      message history length exposure.
    - Clarified separate PiAgent instances are feasible today —
      `makePiAgent()` already accepts all needed options (model,
      tools, system prompt). No factory changes required.
    - Added detailed model selection strategy section: observer
      wants fast/cheap, reflector wants capable/reasoning,
      configurable via `observerModel`/`reflectorModel` options.
    - Resolved 4 open questions (FTS5/BM25, index rebuild, PARA
      dirs, PiAgent instances) — moved to "Resolved questions".
    - Added new open question about message history eviction
      strategy and idle-observer vs. early-reflector overlap.
    - Fixed typo: "refelectorModel" → "reflectorModel".
    - Noted that `convertToLlm` needs to become budget-aware in
      Phase 3 (currently just a role filter).

3. [x] finally close the loop, and make sure that this all makes
   sense from the bottom up, starting from the reality of where
   `packages/genie/` code is right now
  - ✅ Confirmed alignment. The most critical bottom-up finding:
    **PiAgent's message array grows unbounded with no eviction.**
    This is the #1 problem the memory system solves.
    Phase 0 prerequisites and Phase 1 observer are correctly
    prioritized to address this.
  - Other bottom-up findings folded into the revised implementation
    doc: search index init TODO, token estimation need, heartbeat
    integration path for reflector.
