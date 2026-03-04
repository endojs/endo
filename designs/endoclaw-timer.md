# EndoClaw: Core Heartbeat Scheduler

|             |                            |
|-------------|----------------------------|
| **Created** | 2026-03-03                 |
| **Updated** | 2026-03-04                 |
| **Author**  | Kris Kowal (prompted)      |
| **Author**  | Joshua T Corbin (revamped) |
| **Status**  | Not Started                |
| **Parent**  | [endoclaw](endoclaw.md)    |

## Summary

An `IntervalScheduler` capability provides the core heartbeat ticks for an agent.
Key concerns are:
- a deadline for each heartbeat tick's execution
- consistent start-to-start timings, readily consumable as a stream of wakeups;
  this is more similar to a Golang `time.Ticker` or `tokio::time::Interval`
  than it is to a one-shot timer
- this is **not** a general purpose cron facility
- the time-until-first fire should be configurable, or 0 by default so that we get an immediate first-tick
  consistent tick interval can be saved and reloaded across agent restarts
- per-tick timeout option at construction, default to something reasonable like
  delay or delay/2
- each tick should be able to be either:
  1. resolved: everything worked out, or failed in a terminal manner, see you next tick
  2. transiently rescheduled: decline the tick wakeup, but request "soon"
     re-wake; scheduler should count these an provide exponential backoff
     within each interval period

## Capability Shape

```ts

interface IntervalScheduler {
    makeInterval(
        label: string,
        delay: number,
        // TODO timeout, defaults to delay or delay/2
        // TODO first-delay option?
    ): Interval; // Promise<> ?
}

interface Interval {
  label(): string;

  cancel(): void;

  setPeriod(delay: number); // since-last-start
  // TODO probably a getter also?

  tick(): AsyncIterator<Tick>;

  // TODO how does deadline work...
  // TODO behavior when missed
}

interface Tick {
    // when the interaval started
    start(): number;

    // when the scheduler will consider this run to be overdue
    deadline(): number;

    // finished successuflly
    resolve();

    // fast/ephemeral fail, please rescheudle (scheduler should implement a backoff counter up to deadline
    reschedule();
}

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
