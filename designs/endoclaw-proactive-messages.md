# EndoClaw: Proactive Agent Messages

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-03 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Parent** | [endoclaw](endoclaw.md) |

## Summary

A design pattern — not a new capability — for agents that initiate
conversations with the host on a schedule. The agent composes Timer
(for scheduling) with existing messaging (`send`) and granted data
capabilities (email, calendar, filesystem) to produce periodic briefings,
reminders, and alerts.

## Pattern

```js
const setup = async (powers) => {
  const timer = await E(powers).lookup('timer');
  const gmail = await E(powers).lookup('gmail');
  const host = await E(powers).lookup('@host');

  // Morning briefing at 08:00 every day
  await E(timer).schedule('0 8 * * *', async () => {
    const unread = await E(gmail).fetch('/messages?q=is:unread&maxResults=5');
    const summary = await summarizeWithLLM(unread);
    await E(host).send('@host', summary);
  });
};
```

## How It Works

1. Agent receives a `Timer` capability (see
   [endoclaw-timer](endoclaw-timer.md)) and data source capabilities.
2. On each timer firing, the agent gathers data from its granted
   capabilities, synthesizes a message, and sends it to the host's inbox
   via `E(host).send()`.
3. The host sees the briefing as a normal inbox message — it can reply,
   dismiss, or interact with embedded references.

## Endo Idiom

No new mechanism is needed. This composes three existing Endo primitives:

- **Timer** for scheduling (capability-controlled frequency)
- **Data capabilities** for gathering information (OAuth, Dir, etc.)
- **Messaging** for delivering results (`send`, `package`)

The agent cannot exceed its granted capabilities — if it only has
read-only Gmail access, it cannot send emails. If its timer is capped
at once per hour, it cannot spam.

The Familiar's notification capability
([endoclaw-notifications](endoclaw-notifications.md)) can complement
this: the agent sends the briefing to the inbox and posts a desktop
notification to alert the user.

## Use Cases

- Morning briefing (unread emails, today's calendar, weather)
- Reminder for upcoming events
- Alert when a monitored file or service changes
- Periodic project status reports from git history

## Depends On

- [endoclaw-timer](endoclaw-timer.md) — scheduling capability
- Data source capabilities (OAuth, Dir, etc.) for gathering information
- Existing Endo messaging (`send`, `package`)
