Work methodically one task at at a time, do not work on all tasks at once.

Be sure to keep your worktree clean, add files and commit to git coherently between each task.

# Tasks

- [ ] work on `docs/daemon-lore.md`, be sure to commit your intermediate work to git between steps:
  - [ ] update "Tasks" in `TODOs.md` here as you go
  - [ ] follow and update your "Research Plan: docs/daemon-lore.md" section below here in `TODOs.md` as you go
  - [ ] use your ongoing `~/void/INVESTIGATION.md` to answer and clarify anything that you can
  - [ ] research and clarify unclear concepts in daemon lore documentation
    1. [x] Clarify "what is a capability"; update `daemon-lore.md` and commit
    2. [x] Clarify "what is a Worker" (Agorician Worker vs JavaScript Worker); update `daemon-lore.md` and commit
    3. [x] Clarify WebView concept and use cases; update `daemon-lore.md` and commit

# Notes

Future research notes:
> - Research runlet lifecycle vs GC
> - Research HardenedJS details and co-tenancy
> - Research passable proxies
> - Research formula mechanism use cases
> - Research "going rogue" behavior in Graceful Teardown
> - Find and research Mark Miller chapter 14/16 invariants

# Research Plan: docs/daemon-lore.md

**Objective**: Research and clarify unclear concepts in the Endo Daemon lore to make it more comprehensible.

## Standards: Research Sources

For each topic, research from:
- Agoric research papers (if available)
- Mark Miller's capability security writings
- ENDO documentation on GitHub
- Existing knowledge in INVESTIGATION.md
- Cross-references across daemon-lore.md

Be sure to cite sources with URLs whenever possible; break URLs out into footnote sections.

## Standards: Documentation Updates

While researching update both the `daemon-lore.md` document, this research plan in `TODOs.md` and any relevant task above:
- Rewrite unclear paragraphs with clearer explanations
- Add examples for complex concepts
- Create cross-references to other docs
- Ensure all TODO labels are addressed
- Update `TODOs.md` with any remaining open questions
- Cite sources with URLs via footnotes

## Phase 1: Core Concepts (High Priority)

1. **"what is a capability?"**
   - Definition from Mark Miller's capability security model
   - How it relates to objects and references
   - Comparison to traditional access control
   - Endo-specific usage

2. **"what is a Worker" (Agorician Worker vs JavaScript Worker)**
   - JavaScript Worker API basics
   - Agoric Worker concept and implementation
   - Comparison: when to use each
   - Interoperability details

3. **Clarify WebView concept and use cases**
   - What is a WebView?
   - Browser integration patterns
   - Use cases in Endo ecosystem
   - Security implications

## Phase 2: Security & Isolation

4. **"why is that debatable?" (runlet lifecycle vs GC)**
   - Standard garbage collection mechanisms
   - How runlets manage object lifecycle differently
   - Potential pitfalls in runlet-based GC
   - Discussion in Agoric research papers

5. **HardenedJS details and co-tenancy**
   - What is HardenedJS?
   - How objects behave differently
   - Co-tenancy: sharing objects safely across boundaries
   - Use cases for co-tenancy

6. **"passable proxies" (relevancy)**
   - What are passable proxies?
   - Why are they important for distributed systems
   - Security considerations
   - Comparison to CapTP/TrapCaps

## Phase 3: Integration Details

7. **"going rogue" behavior in Graceful Teardown**
   - What constitutes "going rogue"?
   - How can objects become unresponsive/unsafe?
   - Detection mechanisms
   - Recovery strategies

8. **Research formula mechanism use cases**
   - What is the "formula" in Endo?
   - How formula-based code works
   - Use cases and advantages
   - Implementation details
