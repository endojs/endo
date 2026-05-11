# EndoClaw: Channel Bridges

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-03 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Parent** | [endoclaw](endoclaw.md) |

## Summary

A channel bridge adapts an Endo agent (handle and mailbox) to an
external messaging platform, holding a particular account on that
platform. The bridge is a confined guest plugin that translates between
Endo's inbox messaging and the platform's message protocol. Each bridge
instance is scoped to one agent and one platform account.

The [`chat`](https://www.npmjs.com/package/chat) package (Vercel) is the
recommended foundation. It provides a unified adapter SDK: write bridge
logic once against `Chat` + `thread.post()` / `thread.subscribe()`, and
platform adapters handle protocol differences for Slack, Teams, Discord,
Telegram, Google Chat, GitHub, and Linear.

## The `chat` SDK

The `chat` package is a TypeScript SDK with an adapter pattern:

```ts
import { Chat } from 'chat';
import { createSlackAdapter } from '@chat-adapter/slack';

const bot = new Chat({
  userName: 'endo-bridge',
  adapters: { slack: createSlackAdapter() },
  state: createMemoryState(), // or Redis
});

bot.onNewMention(async (thread) => {
  await thread.subscribe();
  // Forward to Endo agent inbox
});

bot.onSubscribedMessage(async (thread, message) => {
  // Forward platform message → Endo inbox
  // Forward Endo reply → platform thread
});
```

### Available adapters

| Package | Platform | Features |
|---------|----------|----------|
| `@chat-adapter/slack` | Slack | Mentions, reactions, cards (Block Kit), modals, streaming, DMs, files |
| `@chat-adapter/teams` | Microsoft Teams | Mentions, cards (Adaptive Cards), DMs |
| `@chat-adapter/discord` | Discord | Mentions, reactions, cards, DMs |
| `@chat-adapter/telegram` | Telegram | Mentions, reactions, DMs |
| `@chat-adapter/gchat` | Google Chat | Mentions, reactions, cards, DMs |
| `@chat-adapter/github` | GitHub | Mentions, reactions (issues/PRs) |
| `@chat-adapter/linear` | Linear | Mentions, reactions (issues) |

### Key SDK features

- **Unified event model:** `onNewMention`, `onSubscribedMessage`,
  `onReaction`, `onButtonClick`, `onSlashCommand`
- **Thread abstraction:** `thread.post()`, `thread.subscribe()`,
  ephemeral messages, streaming
- **JSX card components:** Platform-agnostic cards that render as Block
  Kit (Slack), Adaptive Cards (Teams), or Google Chat Cards
- **State management:** `@chat-adapter/state-redis`,
  `@chat-adapter/state-memory`, `@chat-adapter/state-ioredis`

## Architecture

```
Platform (Slack, Telegram, ...)
    ↕  platform-specific protocol (handled by chat adapter)
[chat SDK — unified event model]
    ↕  thread.post() / onSubscribedMessage()
[Bridge Guest Plugin]
    ↕  E(host).send() / follow(inbox)
Endo Agent (handle + mailbox)
```

The bridge plugin is a standard Endo guest module (`make(powers)`) that:

1. Receives platform credentials as an opaque capability (OAuth or
   HttpClient) — the bridge never sees raw tokens directly.
2. Instantiates the `chat` SDK with the appropriate adapter.
3. On platform message → forwards to the Endo agent's inbox via
   `E(host).send(agentName, text)`.
4. Subscribes to the agent's inbox (`follow`) and forwards outgoing
   messages to the platform thread via `thread.post()`.
5. Maps Endo message types to platform features:
   - `package` messages → text with @-mentions for embedded references
   - `form` messages → platform cards (JSX) with input fields, or
     fallback to text prompts
   - `value` messages → text summary with a link back to the Chat UI
     for full inspection

### Message mapping

| Endo Message | Platform Rendering |
|--------------|--------------------|
| `package` (text + refs) | Text message; refs rendered as names |
| `form` (fields) | JSX card with input fields (Slack/Teams/Discord) or text prompt (Telegram/GitHub) |
| `value` (reply with value) | Text summary + Chat UI link for inspection |
| `request` (promise) | Text notification; resolution posted as reply |

### Form bridging

The `chat` SDK's JSX card system maps well to Endo's form fields:

```tsx
// Endo form fields → platform card
const renderForm = (fields) => (
  <Card>
    <Section>
      {fields.map(f => (
        <TextInput label={f.label} placeholder={f.example} id={f.name} />
      ))}
    </Section>
    <Actions>
      <Button action="submit">Submit</Button>
    </Actions>
  </Card>
);
```

On Slack and Teams, this renders as a native interactive card. On
Telegram and GitHub, where cards are limited, the bridge falls back to
a text prompt listing the fields, with the user replying in a structured
format.

## Endo Idiom

**Bridge is a confined guest.** The bridge plugin runs in a SES-locked
worker with only its granted capabilities. It cannot read other agents'
inboxes, access the filesystem, or make network requests outside the
platform API.

**One bridge per agent per account.** Each bridge instance is scoped to
a single Endo agent and a single platform account. The host decides
which agents are bridged and to which platforms. This avoids a single
bridge becoming a choke point with broad authority.

**Platform credentials are capabilities.** The bridge receives an
`OAuth` or `HttpClient` capability for the platform API — it never sees
the raw bot token. Revocation of the platform credential is instant via
`OAuthControl.revoke()`.

**State is Endo-native.** Rather than using the `chat` SDK's Redis state
adapter, the bridge can persist thread-to-inbox mappings in the Endo
formula store via pet names. Each platform thread maps to an Endo
message number.

## SES Compatibility

The `chat` SDK is a TypeScript package with dependencies on `unified`,
`remark-parse`, and `remark-stringify` (Markdown processing). These are
pure JavaScript and should be compatible with SES lockdown, but the
`chat` SDK itself has not been audited for SES compatibility. The bridge
plugin would need to:

1. Bundle the `chat` SDK and adapters via esbuild (same pattern as
   Lal/Fae bundling in [familiar-bundled-agents](familiar-bundled-agents.md)).
2. Test under SES lockdown for frozen-primordial compatibility.
3. Potentially shim or patch any SES-incompatible patterns (e.g.,
   mutable module-level state, prototype mutation).

If the `chat` SDK proves incompatible with SES, the bridge could run as
an unconfined plugin (like the web server) in an already-locked-down
worker, accepting the reduced confinement in exchange for ecosystem
access.

## Depends On

- [`chat`](https://www.npmjs.com/package/chat) (v4.x) and platform
  adapters (`@chat-adapter/slack`, etc.)
- [endoclaw-network-fetch](endoclaw-network-fetch.md) or
  [endoclaw-oauth](endoclaw-oauth.md) for platform API access
- Existing Endo messaging (`send`, `inbox`, `follow`)
- Guest plugin infrastructure (`endo install`)
