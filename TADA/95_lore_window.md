- [x] work on `docs/daemon-lore.md`
  - [x] use your ongoing `~/void/INVESTIGATION.md` to answer and clarify anything that you can
  - [x] use updated `docs/mark_miller_thesis.md` to update `docs/mark_miller_thesis_summary.md` notes and further clarify

[x] Clarify the TODO around line 457 asking about "whose window" and weblets.

## Done

- Rewrote the "WebView Lifecycle and Identity" section in `daemon-lore.md` to clarify the three-layer ownership model (visual window / HTTP handler / formula identity) with a table showing owner, lifetime, and responsibilities
- Corrected inaccurate claims about browser state persistence (localStorage, IndexedDB are ephemeral to the browser window, not persistent across closes)
- Connected weblet incarnation model to Miller's vat model (§7.2, §14.1) with direct thesis quotes
- Resolved the TODO about chapter 14/16 invariants: documented temporal isolation invariant (a turn has exclusive access to its synchronous reach) and promise pipelining
- Added §12 (Vats and Temporal Isolation), §13 (Communicating Event-Loops), §14 (Promise Pipelining) to `mark_miller_thesis_summary.md` with Endo mappings
