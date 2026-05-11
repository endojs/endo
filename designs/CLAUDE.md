# Design Document Conventions

## Metadata Table

Every design document begins with a level-1 heading (the title), followed
immediately by a metadata table using this format:

```markdown
# Title

| | |
|---|---|
| **Created** | YYYY-MM-DD |
| **Updated** | YYYY-MM-DD |
| **Author** | Name (prompted) |
| **Status** | Not Started |
```

Required fields: **Created**, **Author**, **Status**.
**Updated** is included when the document has been revised after creation.

Optional fields (used when applicable):
- **Source** — provenance if extracted from another document (e.g., `Extracted from packages/chat/DESIGN.md`).
- **Supersedes** — path to the design this one replaces (e.g., `designs/chat-reply-chain-visualization.md`).

### Author convention

The author field uses the format `Name (prompted)` to indicate the document
was authored by a human directing an LLM.

### Date format

All dates use ISO 8601 (`YYYY-MM-DD`). Update the **Updated** field whenever
the document is materially revised.

## Status Values

| Status | Meaning |
|--------|---------|
| Not Started | Design written, no implementation work begun |
| Proposed | Design under discussion, not yet accepted |
| In Progress | Implementation underway |
| **Complete** | Fully implemented (bolded) |
| Implemented | Synonym for Complete (some docs use this) |
| Active | Living document, continuously maintained |
| Reference | Informational; not an implementation target |
| Deprecated | Superseded by another design |

Complete/Implemented status is sometimes bolded (`**Complete**`) for visual
emphasis in the metadata table and in the README summary table.

## Document Structure

After the metadata table, documents follow this general structure:

1. **Status section** (optional) — a prose `## Status` section appears after
   the metadata table in documents that have been partially or fully
   implemented. It lists what has been built, file paths, and any deviations
   from the original design.

2. **Problem statement** — typically `## What is the Problem Being Solved?`
   or `## Motivation`. Explains why the work is needed.

3. **Design** — the main body. Uses subsections, tables, and code blocks
   as needed. Code examples use the project's Hardened JavaScript conventions
   (see the root `CLAUDE.md`).

4. **Dependencies** — table of related designs and their relationship.

5. **Phased implementation** — numbered phases when the work can be
   delivered incrementally.

6. **Design Decisions** — numbered list of key choices and their rationale.

7. **Known Gaps and TODOs** — checklist items (`- [ ]`) for remaining work.
   Used sparingly; most documents do not have open checklists.

Not every document uses all sections. Simpler designs may omit phases,
dependencies, or gaps.

### Capturing the prompt

Each design document should include the prompt that was used to generate it,
typically as a blockquote or fenced block at the end of the document under
a `## Prompt` heading. This preserves the intent and context behind the
design for future readers.

## Progress Tracking

Progress is tracked at two levels:

### Per-document

- The **Status** field in the metadata table is the primary indicator.
- The optional `## Status` prose section provides implementation details:
  file paths built, design deviations, and what remains.

### Cross-document

- `designs/README.md` maintains a summary table of all designs with
  Created, Updated, and Status columns.
- The README also contains a Mermaid dependency graph, milestone tables
  with exit criteria, size/time estimates calibrated against observed
  velocity, and a Gantt timeline.
- **Any modification to a design document — especially its metadata —
  must be synchronized with `designs/README.md`.** Update the summary
  table row to reflect the current Status, Updated date, and any other
  changed fields.
- **New designs must be incorporated into the README plan.** This means:
  adding a row to the summary table, assigning the design to a milestone,
  adding it to the appropriate milestone table, inserting it into the
  dependency graph if it has dependencies or dependents, adding a
  per-design size/duration estimate, and updating the milestone totals
  and timeline if the new work changes the critical path.

