# Genie sandbox — host-side worker residual exposure note

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Worker placement (host-side variant, the 3.5a
shape)_.

Per Decision 2 in TADA/22, the worker stays on the host; only tool
spawns route through the slice.
The residual exposure must be documented so operators understand what
3.5a does — and does not — confine.

- [ ] Add a "Sandboxed workspace" section to
  `packages/genie/README.md` that explains:
  - Node + daemon code on the host filesystem can still be touched by
    an LLM-misled `eval` path inside `main.js`'s tool / specials
    surface.
  - Only `bash` / `exec` / `git` (the
    `packages/genie/src/tools/command.js` chokepoint) are confined.
  - The `network: 'private'` profile still drops RFC 1918, host
    loopback, and VPN ranges from any tool-spawned process.
  - Cross-link to
    [`TADA/24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md`](../TADA/24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md)
    for the planned closure of this gap.

(This is a documentation deliverable; it overlaps with
[`41_endo_genie_sandbox_docs.md`](./41_endo_genie_sandbox_docs.md) but
is separate because the residual-exposure framing must land alongside
the 3.5a shape itself, not as a follow-up doc pass.)

Depends on:
[`35_endo_genie_sandbox_tool_spawn.md`](./35_endo_genie_sandbox_tool_spawn.md)
(don't ship the doc until the tool spawn is actually confined).
