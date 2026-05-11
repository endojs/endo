# Pivoker Project Standards

See `STANDARDS/` at the monorepo root for general Bash, operational, and monorepo conventions. This file covers pivoker-specific rules only.

## Common Utilities

- Source shared functions via directory-resolved path:
  ```bash
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
  ```
- Use `die()` from `common.sh` for fatal errors
- Use `notify()` wrapper in `common.sh` — never call `notify.sh` directly
- Use `may_commit()` from `common.sh` for conditional commits

## Notifications

- See [`notify.md`](notify.md) for the full notification protocol
- Standard fields: `time`, `message`, `agent_name`, `status`
- Status lifecycle: `running` → `done` | `next` | `error`

## Debug Flags

- Each script has a corresponding `DEBUG_<NAME>` flag defined in `common.sh` (e.g. `DEBUG_EVOKE`, `DEBUG_RUN`, `DEBUG_NOTIFY`)
- Flags default to `false`; override to `true` in `evoke/config.sh` for per-project debugging

## Safety

- This project is a **meta-system** — it drives the agent that edits it
- Never break `pivoker/evoke.sh`, `pivoker/common.sh`, or `pivoker/run.sh` in ways that prevent the next evocation
- Test changes to core scripts carefully; a broken evocation loop cannot self-repair
