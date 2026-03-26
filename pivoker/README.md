# Pivoker

AI agent evocation harness --- runs coding agents on queued tasks as systemd services.

Push a task file to `TODO/`, and Pivoker picks it up, runs an AI agent on it, archives the result to `TADA/`, and moves on to the next one. Notifications fire at each step. A git post-receive hook can trigger runs automatically on push.

## Quick Start

```bash
# 1. Place a task
echo "# Fix the widget" > TODO/fix_widget.md

# 2. Run it
./pivoker/run.sh

# 3. Watch
journalctl --user -u evoke@<repo_name> -f
```

## How It Works

**evoke.sh** finds the next task, invokes the agent, commits changes, and archives the session. **run.sh** manages it as a systemd user service. **hook.sh** triggers runs on git push. **notify.sh** sends lifecycle notifications. **ctl.sh** manages agents across remote hosts.

See [DESIGN.md](DESIGN.md) for full architecture, configuration, and script documentation.

See [STANDARDS.md](STANDARDS.md) for coding conventions.

## Safety

Create `evoke/NOPE` to pause all evocations. Delete it to resume.
