# Evoke Service - Systemd One-Shot Unit

## Overview
Created a systemd user-level one-shot service to run `~/endo/evoke.sh` on-demand.
The script integrates with the `pi` coding agent to process tasks and automatically captures
session transcripts for complete audit trails.

## Configuration

**Unit File Location:** `~/endo/evoke.service`
**Symlink Location:** `~/.config/systemd/user/evoke.service`

## Key Settings Explained

### Service Settings

**Type=oneshot**
- Service type for one-time execution
- The service must complete successfully before systemd marks it as running

**RemainAfterExit=no**
- Critical setting for on-demand services
- Service is considered active while script is running
- Service is marked as stopped after script completion
- Allows repeated runs without re-enabling

**ExecStart=/home/danna/endo/evoke.sh**
- Path to the script to execute
- Ensure the script is executable with `chmod +x`

**ExecStop=/bin/true**
- Required when dealing with one-shot services
- Prevents systemd from looking for a stop capability that doesn't exist

> TODO is that true? what if we don't set this, will systemd just kill any running unit for us? that's pretty much all we need...

**StandardOutput=journal**
**StandardError=journal**
- Redirects output to systemd journal for easier viewing

### Unit Settings

> Future enhancement: Consider adding `ProtectSystem=strict` or `ProtectHome=yes` for enhanced security if needed

## Usage

### Enable for User Space (creates symlink)
```bash
systemctl --user enable evoke.service
```

### Run Immediately
```bash
systemctl --user start evoke.service
```

### Check Status
```bash
systemctl --user status evoke.service
```

### View Logs
```bash
# General logs
journalctl --user -u evoke.service

# Watch logs in real-time
journalctl --user -fu evoke.service

# View last 20 lines with system metadata
journalctl --user -u evoke.service -n 20

# View last 20 lines without systemd metadata
journalctl --user -u evoke.service -n 20 -o cat
```

### Check Active State
```bash
systemctl --user is-active evoke.service
```

### Reload Systemd Daemon (after changes to service unit)
```bash
systemctl --user daemon-reload
```

## Session Capture

When `evoke.sh` runs, it automatically:

1. **Captures start time** - Records when the session begins for precise file tracking
2. **Runs `pi`** - using `SOUL.md` and either `TODOs.md` or CLI-provided prompt
3. **Commits working tree** - Adds any leftover changes made to repository files during the run
4. **Copies new session file(s) to repository** - Copies session files from `~/.pi/agent/sessions/` to `~/endo/evoke/sessions/`
5. **Commits transcript** - Adds session files to git for observability, debugging, etc

### Example Flow
```bash
# Run evoke - session file gets captured
$ systemctl --user start evoke.service

# Session saved to evoke/sessions/
# Commit: "evoke: added session transcript 2024-03-12T15:30"

# Working tree changes also committed
# Commit: (file-specific message)
```

## Workflow

1. Create unit file at `~/endo/evoke.service`
2. Create symlink at `~/.config/systemd/user/evoke.service`
3. Reload systemd: `systemctl --user daemon-reload`
4. Run on demand: `systemctl --user start evoke.service`
5. Check status: `systemctl --user status evoke.service`

## Notes

- All commands use `--user` flag for user-level systemd
- No elevated access required to manage service units
- The service can be run repeatedly with `start` command only
- Output is logged to systemd journal for easier troubleshooting
