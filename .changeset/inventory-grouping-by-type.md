---
'@endo/daemon': minor
'@endo/chat': minor
'@endo/cli': minor
---

Inventory grouping by formula type.

- `@endo/daemon`: `EndoHost.followNameChanges()` (and other directory-shaped
  followers) now annotates `add` events with a `type` field carrying the
  formula type of the named value (`handle`, `directory`, `worker`,
  `readable-blob`, etc., or `remote` for non-local values).
  The field is additive and appears only on `add` events; existing
  consumers that destructure only `add` or `remove` are unaffected.
- `@endo/chat`: the inventory pane groups top-level items into six
  collapsible sections in a fixed manual order — Handles, Directories,
  Values, Capabilities, Agents, and Personas — with item-count badges, a
  formula-type chip on each item, and the existing show-special toggle.
  Each header's count honors the show-special filter, so it matches the
  number of items the section actually shows when expanded; a group with
  no visible items is hidden.
- `@endo/cli`: `endo list` gains `--grouped`/`-g` to print items
  bucketed by the same six groups and `--type <formulaType>`/`-t` to
  filter to a single type. `--follow` output now tags each `+name` line
  with its type when available.
