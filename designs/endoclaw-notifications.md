# EndoClaw: Notification Capability

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-03 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Parent** | [endoclaw](endoclaw.md) |

## Summary

A `Notify` capability lets an agent post OS-level desktop notifications
through the Familiar's Electron `Notification` API. The host holds a
`NotifyControl` facet that sets rate limits and can revoke.

## Capability Shape

```ts
interface Notify {
  notify(title: string, body: string): Promise<void>;
  help(): string;
}

interface NotifyControl {
  setMaxPerMinute(n: number): void;
  revoke(): void;
  help(): string;
}
```

## How It Works

1. Host creates a `Notify` / `NotifyControl` pair and grants the
   `Notify` facet to an agent via pet name.
2. Agent calls `E(notify).notify('Task complete', 'Summary generated')`.
3. The Familiar's Electron main process receives the notification
   request over CapTP and calls `new Notification(title, { body })`.
4. Rate limiting is enforced in the `Notify` exo — calls exceeding
   the limit are silently dropped or queued.

## Endo Idiom

The agent cannot spam notifications because the `NotifyControl` facet
(held by the host) enforces rate limits. The agent cannot discover or
influence the control facet. Revocation is immediate — once revoked, all
future `notify()` calls throw.

In Docker/headless mode, notifications degrade to log entries or could
be forwarded to the Chat UI as system messages.

## Depends On

- Familiar (Electron) for desktop notifications
- No other designs required; standalone capability
