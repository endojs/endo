# Pivoker Design

Pivoker is a task-queue automation system that evokes AI coding agents to work on tasks, one at a time, as managed systemd services. Tasks live as files in a directory; completed tasks are archived; notifications fire at lifecycle boundaries.

## Architecture Overview

```
                 git push
                    |
                    v
              +----------+
              | hook.sh  |  post-receive: detects task file changes
              +----+-----+
                   |
                   v
              +----------+
              |  run.sh  |  starts/schedules systemd service
              +----+-----+
                   |
                   v
              +----------+
              | evoke.sh |  finds next task, runs agent, archives session
              +----+-----+
                   |
          +--------+--------+
          |                 |
          v                 v
    +-----------+     +-----------+
    |   agent   |     | notify.sh |  lifecycle notifications
    | (claude)  |     +-----------+
    +-----------+

              +----------+
              |  ctl.sh  |  remote multi-host control plane
              +----------+
```

## Task Lifecycle

1. A task file appears in `TODO/` (pushed via git, or placed manually)
2. `evoke.sh` picks it up via `next_task()` (alphabetical sort order)
3. The agent receives a prompt pointing at the task file
4. On completion, the task moves from `TODO/` to `TADA/`
5. If more tasks remain, a systemd timer schedules the next run after `NEXT_TASK_DELAY` (default 1m)
6. Notifications are sent at each transition: `running`, `done`, `done-next`, `error`

An alternative single-file mode uses `TASK_FILE` (default `TODOs.md`) instead of the directory-based queue.

## Scripts

### evoke.sh --- Main Evocation Engine

Invokes an AI coding agent on the next task or an ad-hoc prompt.

**Two modes:**
- **Task mode** (no args): finds the next task file via `next_task()`, prompts the agent, then moves the completed task to `TADA/`
- **Direct mode** (with args): passes arguments verbatim as a user prompt

**Workflow:**
1. Commits any pre-existing dirty state ("pre leftovers")
2. Runs the agent with the system prompt from `SOUL_FILE`
3. Commits task file updates
4. Commits any remaining changes ("post leftovers")
5. Archives agent session transcripts into `SESSION_STORE/<timestamp>/`
6. If more tasks remain, schedules next via `run.sh --after $NEXT_TASK_DELAY`

### run.sh --- Systemd Service Manager

Runs `evoke.sh` as a managed systemd user service.

**Usage:** `./run.sh [--after DURATION]`

- Creates a `evoke@.service` template unit under `~/.config/systemd/user/`
- Generates per-repo drop-in overrides for `WorkingDirectory` and `ExecStart` when the template defaults don't match the actual repo path or script location
- Immediate start: `systemctl --user start evoke@<repo_name>`
- Delayed start: `systemd-run --user --on-active=DURATION`

The unit name is `evoke@<repo_name>` where `<repo_name>` is the repo path relative to `$HOME` with `/` replaced by `-`.

### hook.sh --- Git Post-Receive Hook

Triggers evocation when task files change via git push.

**Install:** `ln -s /path/to/pivoker/hook.sh <repo>/.git/hooks/post-receive`

On each push to the current HEAD branch:
1. Updates the worktree (`git checkout -f`)
2. Diffs old..new for changes to `TASK_FILE` or `TASKS_IN/`
3. If task files changed, calls `run.sh` to start evocation
4. Respects the killswitch

### notify.sh --- Notification Dispatcher

Sends structured JSON notifications about evocation status. See [notify.md](notify.md) for the full protocol specification.

**Dispatch backends** (selected by `NOTIFY` config):
- Empty: print to stdout
- `http://` / `https://`: POST JSON
- `file:///path`: write to file, directory, pipe, or socket
- Repo-local script: delegate entirely

### ctl.sh --- Multi-Host Control Plane

Remote management of pivoker agents across SSH hosts.

Discovers remotes that have a `.pivoker` git config entry, then provides:
- `vokers` --- list configured remote agents
- `within [names] -- <cmd>` --- run a command on remotes via SSH
- `status [name]` --- check systemd service status
- `log [name]` --- view journal logs
- `run [name]` --- trigger evocation remotely

### common.sh --- Shared Configuration & Utilities

Sourced by all scripts. Provides:

**Configuration defaults** (overridable via `evoke/config.sh`):

| Variable           | Default               | Purpose                              |
|--------------------|-----------------------|--------------------------------------|
| `SESSION_STORE`    | `evoke/sessions`      | Where session transcripts are stored |
| `SOUL_FILE`        | `evoke/SOUL.md`       | Agent system prompt                  |
| `TASK_FILE`        | `TODOs.md`            | Single-file task source              |
| `TASKS_IN`         | `TODO`                | Pending tasks directory              |
| `TASKS_OUT`        | `TADA`                | Completed tasks directory            |
| `KILLSWITCH_FILE`  | `evoke/NOPE`          | Pause file --- existence halts runs  |
| `NOTIFY`           | *(empty)*             | Notification backend                 |
| `NEXT_TASK_DELAY`  | `1m`                  | Delay before scheduling next task    |
| `AGENT_NAME`       | `claude`              | Agent identifier                     |
| `AGENT_IDENTITY`   | `user@host`           | Sender identity for notifications    |

**Utility functions:** `notify()`, `die()`, `check_killswitch()`, `chase_file()`, `may_commit()`

## Per-Project Configuration

Each repository can override defaults by placing an `evoke/config.sh` in the repo root. This file is sourced after defaults are set, so any variable assignment takes effect. Example:

```bash
NOTIFY=http://127.0.0.1:8077/chat
AGENT_NAME='claude'
NEXT_TASK_DELAY=2m
```

## Configuration Precedence

Resolution order (highest wins), per `STANDARDS/operations.md`:

1. Environment variables (`PIVOKER_*`, applied after `config.sh` is sourced)
2. Per-project config file (`evoke/config.sh`)
3. Hardcoded defaults in `common.sh`

Every documented config variable has a matching `PIVOKER_<NAME>` env var
(e.g. `PIVOKER_TASKS_IN`, `PIVOKER_AGENT_NAME`, `PIVOKER_NEXT_TASK_DELAY`).
`PIVOKER_AGENT_ARGS` is split on whitespace into the `AGENT_ARGS` array.
This mirrors devoker's `DEVOKER_*` env var layer.

## Safety: Killswitch

Create `evoke/NOPE` to pause all evocations. All scripts check this file before proceeding. Delete it to resume.

## Repository Layout

```
<repository>/
├── TODO/                 # Pending task files (one per task)
├── TADA/                 # Completed task files (archived by evoke.sh)
├── evoke/
│   ├── SOUL.md           # Agent system prompt
│   ├── config.sh         # Per-project config overrides
│   ├── NOPE              # Killswitch (create to pause)
│   └── sessions/         # Archived agent session transcripts
│       └── <timestamp>/
├── pivoker/              # Pivoker scripts (or submodule)
│   ├── evoke.sh
│   ├── run.sh
│   ├── hook.sh
│   ├── notify.sh
│   ├── ctl.sh
│   ├── common.sh
│   └── STANDARDS.md      # Coding standards
└── TODOs.md              # Alternative single-file task source
```

## Companion: notify-server

An optional Go HTTP service (`notify_server/`) that acts as a notification proxy. It receives POSTs from `notify.sh`, persists them to a durable queue, and dispatches to configured backends (HTTP endpoints, shell commands, files) with retry logic. See [`notify_server/DESIGN.md`](../notify_server/DESIGN.md) for details.
