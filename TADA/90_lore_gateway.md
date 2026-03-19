- [x] work on `docs/daemon-lore.md`
  - [x] use your ongoing `~/void/INVESTIGATION.md` to answer and clarify anything that you can
  - [x] use updated `docs/mark_miller_thesis.md` to update `docs/mark_miller_thesis_summary.md` notes and further clarify

- [x] Clarify the TODOs in the "Gateway" section around lines 470-472.

## Done

- Resolved the weblet identity TODO (line 457): clarified that weblet identity is a formula-graph concept (stable, persistent) while browser windows are ephemeral incarnations — mapped to Miller's vat/incarnation model (thesis §7.2)
- Resolved "instance <-> WebView locking" TODO (line 470): the gateway has no instance tracking; it authenticates by network address + Host header, not by WebView identity — access tokens serve as Swiss numbers (thesis §7.3)
- Resolved "presence without live browser" TODO (line 472): formula persists + HTTP handler stays registered, but no daemon-side DOM state
- Updated `docs/mark_miller_thesis_summary.md` with substantive content from §2.1, §7.2–7.4, §8.1–8.2, §11, including Endo-specific mappings
