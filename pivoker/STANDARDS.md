# Pivoker Coding Standards

## Platform & Runtime

- **Bash 4+** — all scripts target modern bash; no POSIX-only `sh` compatibility required
- **Linux + systemd only** — no Windows, no macOS, no alternative init systems
- Core utilities assumed present: `jq`, `git`, `curl`, `systemctl`

## Script Structure

- Shebang: `#!/usr/bin/env bash`
- Strict mode: `set -euo pipefail` for all scripts
- Source common utilities via directory-resolved path:
  ```bash
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
  ```

## Variable Naming

- **UPPERCASE** for exported / config-level variables: `NOTIFY`, `SESSION_STORE`, `TASKS_IN`
- **lowercase** for local / function-scoped variables: `task_file`, `start_time`, `store_file`
- Always quote variable expansions: `"$var"`, `"${array[@]}"`

## Functions & Error Handling

- Use `die()` from `common.sh` for fatal errors (prints to stderr, exits 1)
- Prefer early-return / guard-clause style over deep nesting
- Use `[[ ]]` for conditionals (bash-native, no word-splitting surprises)

## Arrays

- Declare with `declare -a`
- Expand with `"${array[@]}"` (quoted)
- Populate from command output with `readarray -t`

## Command Substitution & Quoting

- Always `$()` — never backticks
- Always quote: `"$(command)"`
- Brace-delimit when adjacent to other text: `"${var}_suffix"`

## Linting

- Run `shellcheck` on every script during development
- Resolve all warnings; use `# shellcheck disable=SCxxxx` only with a comment explaining why

## JSON

- Use `jq` for all JSON construction and parsing — no hand-rolled string concatenation
- Prefer `--arg` / `--argjson` for safe variable interpolation into jq filters
- Use `$ARGS.named` to collect all `--arg`/`--argjson` bindings into a single object — avoid manually building jq filter strings by concatenating `$key` references

## Notifications

- See [`notify.md`](notify.md) for the full notification protocol
- Use the `notify()` wrapper in `common.sh` — never call `notify.sh` directly from scripts
- Standard fields: `time`, `message`, `agent_name`, `status`
- Status lifecycle: `running` → `done` | `next` | `error`

## Git & Task Workflow

- Completed tasks move from `TODO/` to `TADA/`
- Use `may_commit()` from `common.sh` for conditional commits
- Commit messages should be concise and describe *why*, not *what*

## Debug Flags

- Each script has a corresponding `DEBUG_<NAME>` flag defined in `common.sh` (e.g. `DEBUG_EVOKE`, `DEBUG_RUN`, `DEBUG_NOTIFY`)
- Flags default to `false`; override to `true` in `evoke/config.sh` for per-project debugging
- Enable `set -x` (bash trace) **after** sourcing `common.sh` and parsing arguments, conditional on the flag:
  ```bash
  if $DEBUG_NOTIFY; then
    set -x
  fi
  ```
- Scripts may also use the flag to enable verbose tool options (e.g. `curl -v`)

## Safety

- This project is a **meta-system** — it drives the agent that edits it
- Never break `evoke.sh`, `common.sh`, or `run.sh` in ways that prevent the next evocation
- Test changes to core scripts carefully; a broken evocation loop cannot self-repair
