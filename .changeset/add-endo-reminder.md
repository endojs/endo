---
'@endo/reminder': minor
---

Add `@endo/reminder`, an unconfined Endo plugin that schedules messages per
`designs/endo-reminder.md`. A reminder service produces messages on
start-to-start periods and nothing else; policy about what to do on a schedule
belongs to the recipient. It carries the interval-scheduler mechanism of the
superseded `endoclaw-timer` design — one-shot per-message response,
resolve/reschedule with jittered exponential backoff, per-message timeout
auto-resolve, host limits, pause/resume/revoke, and startup recovery with
missed-message coalescing — repackaged as an unconfined caplet
(`make(powers, context, { env })`, provisioned via the generic `make-unconfined`
pathway) rather than a daemon formula.

Durable tracking lives on the platform virtual file system
(`@endo/platform/fs/extended`), backing-agnostic (host directory, in-memory,
daemon mount, or database) with write-then-`move` atomic replacement — no
`node:fs`, no daemon `filePowers`. Phase 2 delivery is the ungated
subscriber-capability baseline: an eventual-send to a recipient resolved by name
through `powers`, carrying the one-shot `ReminderResponse` on each message, so
delivery does not block on SturdyRef modelling. Per-reminder `catchUpPolicy`
(`coalesce` / `skip`), coalesced-message `annotation` (count / timestamps), and
named/persisted `backoff` parameters (with `consecutiveFailures`) are ported from
the reactor + schedule design. Wake-on-restart is integration-owned retention of
a live reference via the `@pins` recipe documented in the package README.
