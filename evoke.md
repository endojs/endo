# Pi Servitor Evoker

## Overview

- `evoke-run.sh` creates an ephemeral systemd exec unit that runs
- `~/endo/evoke.sh` runs Pi with a given prompt or canned `TODOs.md` prompt

**Working Directory:** `/home/danna/endo`
**System Prompt:** comes form `SOUL.md`
**Task Queue:** kept in `TODOs.md`

## Directory Structure

```
~/endo/
├── evoke/
│   └── sessions/          # Captured session files
└── evoke.md               # This documentation
├── evoke.sh               # Main execution script
├── evoke-run.sh           # Ephemeral systemd runner
```

## Usage: Run Evoke (Interactively)

If you want to watch it go:
```bash
$ ./evoke.sh
... proceeds to work on TODOs.md tasks as assigned
```

If you have specific thing:
```bash
$ ./evoke.sh 'Please do this specific thing for me'
... crimes as foretold
```

## Usage: Run Evoke (Detached as Background Service)

If you don't care to watch, or need to kick it off from a hook:
```bash
# Runs evoke.sh in an ephemeral background service
$ ./evoke-run.sh
```

**Behind the Scenes:**
- Creates user-level systemd unit `evoke.service`
- Runs `evoke.sh` in the background with automatic cleanup
- Collects and commits session files to git
- Commits any working tree changes

## Component: `evoke.sh`

**Purpose:** Main script for task execution and session capture

**Features:**
- Captures start time for session tracking
- Runs PI with `SOUL.md` when available
- Processes `TODOs.md` or CLI-provided prompts
- Commits working tree changes automatically
- Captures and commits Pi session file(s)

**Usage:**
```bash
./evoke.sh [prompt...]

# Without arguments: processes TODOs.md
./evoke.sh

# With arguments: passes them to PI
./evoke.sh "Do some specific task"
```

## Component: `evoke-run.sh`

**Purpose:** Creates ephemeral systemd units for safe long-running processes

**Features:**
- Creates user-level background slice unit
- Sets environment appropriately
- Provides automatic signal handling and cleanup
- Redirects output for debugging

## Workflow

1. **Navigate to project directory:**
   ```bash
   cd ~/endo
   ```

2. **Execute evoke:**
   ```bash
   ./evoke.sh
   ```

## Check Logs

```bash
# View systemd journal for the ephemeral unit
journalctl --user -u evoke

# Watch logs in real-time
journalctl --user -u evoke -f
```

## Git Integration

1. **Working Tree Changes:**
   - Any files modified during the run are automatically added and committed
   - Commit message: `[evoke] leftovers`

2. **Session Files:**
   - Session files from `~/.pi/agent/sessions/` are copied to `evoke/sessions/`
   - Newly created files are added and committed
   - Commit message format: `[evoke] sessions since 2024-03-12T15:30`

## Systemd Issues Troubleshooting

```bash
# Verify systemd is running
systemctl --user status

# Failed ephemeral unit(s) should be automatically GC'd, but...
systemctl --user reset-failed
```
