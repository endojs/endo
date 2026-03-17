DONE: `packages/cli/src/commands/log.js` now detects when `endo.log` is absent
and `journalctl` is available, and uses `journalctl --user-unit=endo-daemon`
instead of `tail` to show daemon logs. This handles the case where the daemon
runs under systemd and logs go to the journal rather than to a file.

Changes made:
- Added `hasProgram()` helper to check for executables on PATH
- Added `fileExists()` helper
- Modified the log-viewing spawn logic to prefer `journalctl` when the log file
  is missing and journalctl is available; otherwise falls back to `tail` as before
- Added `// @ts-check` to the file header

---

Future work (from original notes):
- Could also tee daemon output so logs go to both stdout and a log file,
  using `ENDO_DAEMON_LOG_FILE` set inside daemon `start()` via `env`
