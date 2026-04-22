
- working on `TADA/81_genie_bottle_phase0_shell.md`, changes made by human reviewer:
  - [x] pruned `--transport wireguard` and `--transport tailscale`
  - [x] **No** `--state-dir`
  - [x] **No** cleanup, daemon should outlive bottle turn-up
  - [x] **No** purge on start
  - [x] **No** throwaway

- **feedback**: you over matched on the integration script, the goal here was
  never to make a throwaway script to run under the operator's own account

- [x] make sure the rest of the bottle plan is updated to correct any throwaway assumptions builtin
  - `PLAN/genie_in_bottle.md` § "Phase 0: bottle script as a dumb shell
    recipe" rewritten to the `invoke`/`evoke` two-subcommand shape with
    explicit "no throwaway state dir; the daemon is meant to survive
    the script" language.
  - `PLAN/genie_in_bottle.md` § "Phase 3: install story" updated to
    acknowledge that the bring-your-own-repo push mode and the
    yarn-global alternative have _already_ landed in Phase 0's
    `evoke`; Phase 3's remaining job is hardening yarn-global in a
    clean VM and picking the canonical documented install.
  - `TADA/81_genie_bottle_phase0_shell.md` rewritten end-to-end:
    scope split into Invoke / Evoke sections, work-items reshaped
    around the two modes, verification checklist extended with
    `Evoke push` and `Evoke idempotency` rows.
  - `packages/genie/scripts/README.md` rewritten to describe the
    two-mode recipe and explicitly contrast with
    `test/integration.sh` as the throwaway template we are _not_
    following.

- [x] modify the phase0 shell script in `packages/genie/scripts/bottle.sh` is insufficient
  - modified in place to a single script with subcommand dispatch
    (`invoke` / `evoke`) rather than a second script; `--help` works
    at any level.
  - `invoke` is the inside-the-bottle mode (the pre-existing shape,
    with the state-dir / purge / cleanup logic pruned).
  - `evoke` is the new operator-side mode: SSH target positional,
    `--install=(push|yarn-global|none)` (default `push`),
    `--ref` / `--branch` / `--remote-bare` / `--remote-work` flags,
    `--` passthrough forwarded verbatim to the remote invoke via
    `printf '%q '` quoting, `exec ssh -t` hand-off so the operator's
    terminal stays attached to the remote invoke.

