# EndoClaw: Webhook Gateway

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-03 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |
| **Parent** | [endoclaw](endoclaw.md) |

## Summary

The daemon gateway exposes per-agent webhook endpoints that route
incoming HTTP requests to an agent's inbox as messages. Each webhook is
a formula with a unique URL path and a pet name in the receiving agent's
directory. Enables event-driven automation (GitHub webhooks, payment
notifications, IoT events) without polling.

## Capability Shape

```ts
interface WebhookEndpoint {
  url(): string;       // full URL of this webhook
  secret(): string;    // HMAC secret for signature verification
  disable(): void;
  enable(): void;
  help(): string;
}

interface WebhookControl {
  setMaxPayloadBytes(n: number): void;
  setRateLimit(requestsPerMinute: number): void;
  revoke(): void;     // permanently deletes the endpoint
  help(): string;
}
```

## How It Works

1. Agent (or host on behalf of agent) creates a webhook:
   `const hook = await E(host).createWebhook('github-push')`.
2. The gateway registers a route:
   `POST /webhooks/<formula-id>`.
3. Agent retrieves the URL: `await E(hook).url()` →
   `https://my-daemon.example.com/webhooks/abc123...`.
4. Agent registers this URL with the external service (GitHub, Stripe,
   etc.).
5. When the service sends a POST, the gateway:
   - Validates the HMAC signature (if configured).
   - Enforces payload size and rate limits.
   - Delivers the payload as a `package` message to the agent's inbox
     with the HTTP body as the message text and headers as metadata.
6. The agent processes the webhook payload like any other inbox message.

## Endo Idiom

**Webhooks are formulas.** Each webhook endpoint is a durable formula in
the daemon store. It survives restarts and has a stable URL. The agent
holds it via pet name in its directory.

**Inbox delivery.** Webhook payloads arrive as normal inbox messages.
The agent processes them with the same `follow()` mechanism it uses for
human messages. No special webhook handler API — just messaging.

**Capability-controlled creation.** Not every agent can create webhooks.
The host grants webhook creation authority. An agent without this
authority cannot expose endpoints on the gateway.

**HMAC verification.** The webhook stores a secret that external services
use for payload signing (GitHub `X-Hub-Signature-256`, Stripe
`Stripe-Signature`). The gateway verifies signatures before delivery,
preventing spoofed events.

## Depends On

- [gateway-bearer-token-auth](gateway-bearer-token-auth.md) — gateway
  must accept remote connections for webhooks to be useful
- [daemon-docker-selfhost](daemon-docker-selfhost.md) — self-hosted
  daemon is the primary deployment for webhooks
