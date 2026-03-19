# Genie sandbox — host-side worker residual exposure note

Sub-task of
[`TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md`](../TADA/22_endo_posix_sandbox_phase3_5a_genie_workspace.md)
§ "Deliverables" — _Worker placement (host-side variant, the 3.5a
shape)_.

Per Decision 2 in TADA/22, the worker stays on the host; only tool
spawns route through the slice.
The residual exposure must be documented so operators understand what
3.5a does — and does not — confine.

- [x] Add a "Sandboxed workspace" section to
  `packages/genie/README.md` that explains:
  - [x] Node + daemon code on the host filesystem can still be touched
    by an LLM-misled `eval` path inside `main.js`'s tool / specials
    surface.
    Landed at `packages/genie/README.md` § "Residual exposure (the
    3.5a shape)" — lists the LLM-misled `eval` / dynamic-`import` path
    and direct `fs` / `child_process` calls written into a tool that
    bypass the `command.js` chokepoint.
  - [x] Only `bash` / `exec` / `git` (the
    `packages/genie/src/tools/command.js` chokepoint) are confined.
    Landed at `packages/genie/README.md` § "Residual exposure (the
    3.5a shape)" — names the chokepoint file and the three tools.
  - [x] The `network: 'private'` profile still drops RFC 1918, host
    loopback, and VPN ranges from any tool-spawned process.
    Landed at `packages/genie/README.md` § "Sandboxed workspace" —
    the paragraph immediately before "Residual exposure" enumerates
    RFC 1918, host loopback, and known VPN ranges as drops applied to
    every tool-spawned process, and notes the worker process retains
    host network access by virtue of running on the host.
  - [x] Cross-link to
    [`TADA/24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md`](../TADA/24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md)
    for the planned closure of this gap.
    Landed at the bottom of the "Residual exposure (the 3.5a shape)"
    subsection — the cross-link names the follow-up explicitly as the
    planned closure (worker-inside-slice).

(This is a documentation deliverable; it overlaps with
[`41_endo_genie_sandbox_docs.md`](./41_endo_genie_sandbox_docs.md) but
is separate because the residual-exposure framing must land alongside
the 3.5a shape itself, not as a follow-up doc pass.)

Depends on:
[`TADA/35_endo_genie_sandbox_tool_spawn.md`](../TADA/35_endo_genie_sandbox_tool_spawn.md)
(don't ship the doc until the tool spawn is actually confined) —
landed 2026-04-30, so the residual-exposure framing now matches the
shipped chokepoint.

## Status

- 2026-04-30: All deliverables landed.  `packages/genie/README.md`
  § "Sandboxed workspace" describes the slice-backed boot shape
  (workspace `Mount` over `GENIE_WORKSPACE`, `sandbox-factory`
  registration, `main-genie-sandbox` slice with `/workspace` and
  `network: 'private'`, `bash` / `exec` / `git` routed through
  `E(slice).spawn(...)`).  The "Residual exposure (the 3.5a shape)"
  subsection enumerates the unconfined surface — Node + daemon code
  on the host filesystem reachable from the `main-genie` worker via
  an LLM-misled `eval` / dynamic-`import` path, plus direct `fs` /
  `child_process` calls written into a tool that bypass the
  `command.js` chokepoint — and cross-links to
  [`TADA/24_…worker_inside_slice.md`](../TADA/24_endo_posix_sandbox_phase3_5a_worker_inside_slice.md)
  for the planned closure.  The `network: 'private'` paragraph notes
  the egress filter applies to everything spawned through the slice
  but not to the worker process itself.  No README change required —
  the prose was already present from the 3.5a integration pass; this
  task verified it covers the residual-exposure framing the parent
  TADA called out.
