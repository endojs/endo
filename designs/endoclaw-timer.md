# EndoClaw: Timer / Scheduler Capability

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-03 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Parent** | [endoclaw](endoclaw.md) |

## Summary

A `Timer` capability lets an agent schedule recurring or one-shot
callbacks with host-controlled limits on frequency, concurrency, and
total active timers. Prerequisite for proactive agent behavior (morning
briefings, reminders, monitoring). Listed in the
[daemon-capability-bank](daemon-capability-bank.md) taxonomy.

## Capability Shape

```ts
interface Timer {
  schedule(cron: string, label: string): Promise<TimerHandle>;
  delay(ms: number, label: string): Promise<TimerHandle>;
  list(): Promise<TimerEntry[]>;
  help(): string;
}

interface TimerHandle {
  cancel(): void;
  label(): string;
  nextFire(): Promise<number>;  // epoch ms
}

interface TimerControl {
  setMaxActive(n: number): void;
  setMinIntervalMs(ms: number): void;
  pause(): void;     // suspends all timers
  resume(): void;
  revoke(): void;    // cancels all and invalidates
  help(): string;
}

type TimerEntry = {
  label: string;
  cron: string | undefined;
  nextFire: number;
};
```

## How It Works

1. Host creates a `Timer` / `TimerControl` pair and grants `Timer` to
   an agent.
2. Agent schedules a cron job:
   `const h = await E(timer).schedule('0 8 * * *', 'morning-briefing')`.
3. When the cron fires, the daemon delivers a `timer-fire` event to the
   agent's worker. The agent's event loop picks it up and executes the
   associated logic (gather data, compose message, send to host).
4. `TimerControl` enforces limits: max 5 active timers, minimum 60s
   between firings, pause/resume all.

## Endo Idiom

**Timers are durable formulas.** Scheduled timers survive daemon
restarts. The cron expression and next-fire time are persisted in the
formula store. On restart, the daemon re-arms all active timers.

**Host-controlled limits.** The agent cannot create unbounded timers.
`TimerControl.setMaxActive(5)` caps the total; `setMinIntervalMs(60000)`
prevents sub-minute polling. The host can `pause()` all timers (e.g.,
during maintenance) and `resume()` later.

**No ambient setTimeout.** SES lockdown removes `setTimeout` and
`setInterval` from the global scope. The `Timer` capability is the only
way for an agent to schedule future execution, making timer authority
explicit and revocable.

**Caretaker revocation.** `revoke()` cancels all active timers and
invalidates the capability. The agent's scheduled work stops immediately.

## Depends On

- Cron parsing library (e.g., `cron-parser`)
- Daemon formula store for durable timer persistence
- Agent worker event loop for timer-fire delivery
- No other EndoClaw designs required; standalone capability
