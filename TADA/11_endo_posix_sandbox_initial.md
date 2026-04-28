## Design Endo Posix Sandbox Plugin

- make minor revisions to `PLAN/endo_posix_sandbox.md`:
  - [x] reorder the implementation phases:
    1. Phase 0 — driver interface design
    2. Phase 1 — bwrap driver on Linux
    3. Phase 1.5 — bwrap hardening passes
    4. Phase 2 — podman driver
    5. Phase 3 (**was phase 5, do this first before multi-platform**) — nested slices
    6. Phase 4 (**was phase 3, now combined with modern macos 15+ upgrade**) — macOS via lima and apple containerization
    7. Phase 6 (**was phase 4, now deferred**) — Windows via WSL2
    8. Phase 7 — focused tools and renderer integration
    - **Done:** rewrote the `## Implementation phases` section of
      `PLAN/endo_posix_sandbox.md` to match the new ordering;
      Phase 3 is now nested slices (with a forward-reference note
      that it was promoted from old-Phase-5);
      Phase 4 combines macOS via lima with the Apple
      `Containerization.framework` driver from old-Phase-5;
      Phase 6 is Windows via WSL2 with a deferral note;
      Phase 7 is the focused tools / renderer integration follow-up.
      Also fixed the "Decide alongside Phase 3" cross-reference for
      the long-lived guest VM lifecycle question to point at Phase 4.
      The driver table on lines 244-250 was already aligned with the
      new numbering; left as-is.

- [x] create follow-up `TODO/` tasks to scope out implementation of the first 4
  phases: 0, 1, 1.5, and 2 from the reordered list above, this gets us thru
  full Linux support with podman
  - **Done:** four follow-up TODOs created:
    - `TODO/12_endo_posix_sandbox_phase0_interfaces.md` — package
      skeleton, `M.interface()` guards, stub factory, daemon
      smoke test.
    - `TODO/13_endo_posix_sandbox_phase1_bwrap.md` — bwrap driver,
      cap-resolved mounts, `none` / `private` profiles, baseline
      seccomp, stdio bridge, dispose semantics.
    - `TODO/14_endo_posix_sandbox_phase1_5_bwrap_hardening.md` —
      `host-*` profiles, Landlock probe, seccomp rebase,
      `prlimit` / cgroup v2 caps, egress-filter regression suite.
    - `TODO/15_endo_posix_sandbox_phase2_podman.md` — podman
      driver, OCI image story (delegated, no embedded registry),
      podman-mapped network profiles, orphan-reap test.


