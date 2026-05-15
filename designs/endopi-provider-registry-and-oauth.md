# EndoPi: Multi-Provider Registry and Subscription OAuth

| | |
|---|---|
| **Created** | 2026-05-15 |
| **Updated** | 2026-05-15 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed (partially satisfied) |
| **Parent** | [endopi](endopi.md) |

## Status

`packages/genie` (pre-release, 2026 Q2) already depends on
`@mariozechner/pi-ai` directly and ships an ollama provider adaptor
(`buildOllamaModel` in `packages/genie/src/agent/index.js`) that
masquerades the local ollama HTTP endpoint as the `openai-completions`
API style. Genie therefore exposes `pi-ai`'s full provider registry
inside Endo today, without the registry-shape refactor this design
proposes for Lal.

What this means for the milestone:

- **Registry shape (Phase 1).** Genie has a working consumer of
  `pi-ai`'s registry. Lal's static-dispatch refactor is still needed
  if Lal stays a parallel surface; the question is whether Lal should
  consolidate onto Genie's `pi-ai` dependency or keep its own
  per-provider modules. Recorded under *Open questions* below.
- **API-key providers (Phase 2).** Available via Genie today through
  `pi-ai`'s 30+ providers. The Phase-2 work for Lal becomes a question
  of "do we duplicate?" rather than "do we add?".
- **OAuth (Phases 3 to 4).** Genuinely missing. `pi-ai` itself ships
  OAuth scaffolding for subscription providers but its enablement in
  Genie is not wired through yet. Subscription OAuth remains the
  highest-leverage user-facing capability the milestone delivers.
- **Cross-provider handoff (Phase 5).** Missing. Genie inherits the
  registry but does not exercise mid-session provider switching.
- **Image input (Phase 6).** Inherits from `pi-ai`'s capability per
  provider; the Endo-side daemon-value-message plumbing is unchanged.

Net: this milestone's remaining scope reduces to (a) the OAuth flow,
(b) cross-provider handoff plumbing, (c) image input wiring, and
(d) the policy question of Lal-vs-Genie consolidation. The original
"30+ providers" framing is no longer the headline.

## Motivation

Lal's provider story today is one module per provider under
`packages/lal/providers/`, with Anthropic, OpenAI, Ollama, Gemini, and
Llama.cpp implemented. Adding a provider means dropping in a new module
and threading it through `createProvider`. This is fine when there are
five providers; it scales poorly when there are thirty.

Pi's `pi-ai` package supports 30+ providers through a registry shape:
each provider declares its API style (OpenAI-compatible, Anthropic-
compatible, Google, Bedrock, custom), its auth shape (API key, OAuth,
Vertex service account), and its tool-call format. A unified registry
hands the agent loop a provider-agnostic `complete(...)` / `stream(...)`
interface.

Pi's higher-leverage feature is the subscription-auth path: users with a
Claude Pro/Max, ChatGPT Plus/Pro, or GitHub Copilot subscription can use
the same account they already pay for, via OAuth, without acquiring a
separate API key. This dramatically lowers the barrier for users who
already have these subscriptions.

## Design

### Provider registry

Replace `packages/lal/providers/index.js`'s static dispatch with a
registry shape:

```js
const ProviderInterface = M.interface('Provider', {
  // Static metadata
  name: M.call().returns(M.string()),
  apiStyle: M.call().returns(M.string()), // 'openai' | 'anthropic' | 'google' | 'bedrock' | 'custom'
  authShape: M.call().returns(M.string()), // 'apiKey' | 'oauth' | 'vertex' | 'none'

  // Model discovery
  listModels: M.callWhen().returns(M.arrayOf(M.record())),

  // Completion
  complete: M.callWhen(M.record()).returns(M.record()),
  stream: M.callWhen(M.record()).returns(M.remotable('AsyncIterable')),
});
```

Providers register themselves at daemon start; new providers ship as
guest plugins per [endopi-extension-package-manifest](endopi-extension-package-manifest.md).

### Subscription OAuth

A separate auth-storage exo holds OAuth credentials per provider, keyed
by provider name and account ID. The OAuth flow is the standard
authorization-code-with-PKCE path; the redirect URI is a Familiar pane
(in the Electron build) or a local HTTP listener bound to `127.0.0.1`
(in the daemon-only build, per
[gateway-bearer-token-auth](gateway-bearer-token-auth.md)).

Credentials are stored encrypted at rest, in the same store as the
formula graph, with the encryption key derived from the host's
passphrase or a hardware key per the existing daemon pattern.

### Cross-provider handoff

Pi supports mid-session handoff (e.g., start on a fast model for
exploration, switch to a slow reasoning model for the hard part). Lal's
in-memory transcript already supports this in shape; the daemon-side
plumbing is missing. The registry above is the substrate.

## Phased implementation

1. **Registry shape, existing five providers re-registered.** No new
   provider yet; the goal is to retire the static dispatch and prove
   the registry surface.
2. **API-key providers via the registry.** Add 5 to 10 new providers
   (DeepSeek, Mistral, Groq, Cerebras, xAI, OpenRouter, Vercel AI
   Gateway). Each is a small module.
3. **OAuth: Claude subscription.** First subscription provider. Defines
   the OAuth-flow plumbing.
4. **OAuth: ChatGPT Plus (Codex), GitHub Copilot.** The remaining two
   subscription providers Pi supports.
5. **Cross-provider handoff.** `/model` mid-session switches the agent
   to a new provider; the transcript carries forward.
6. **Image input.** Where the provider supports it, image attachments on
   user messages flow through to the LLM. (Endo's
   [daemon-value-message](daemon-value-message.md) carries the
   payload shape.)

## Dependencies

| Design | Relationship |
|--------|--------------|
| [lal-fae-form-provisioning](lal-fae-form-provisioning.md) | Provides the provisioning surface for picking a provider |
| [daemon-value-message](daemon-value-message.md) | Image payloads on user messages |
| [endopi-extension-package-manifest](endopi-extension-package-manifest.md) | Lets new providers ship as packages |
| [gateway-bearer-token-auth](gateway-bearer-token-auth.md) | OAuth-redirect endpoint for the daemon-only build |

## Out of scope

- **Pi-compatible OAuth credential file**. Pi stores OAuth tokens under
  `~/.pi/agent/auth/`; Endo's store lives in the formula graph. We do
  not import Pi's auth file shape because the secrets boundary is
  different (the Endo store is encrypted; Pi's may or may not be).
- **Vercel AI Gateway / Cloudflare AI Gateway as Endo-side
  infrastructure.** Endo registers them as providers if a user wants
  them; we do not host our own gateway.

## Open questions

- **Lal vs Genie consolidation.** Genie depends on `@mariozechner/pi-ai`
  directly and ships an ollama adaptor on top. Lal carries its own
  per-provider modules. The options are: (a) Lal consolidates onto
  Genie's `pi-ai` dependency, retiring `packages/lal/providers/`; (b)
  Lal and Genie coexist with separate registries; (c) the registry
  lives in a new shared `@endo/ai` package that both depend on. The
  decision affects Phases 1 and 2 directly. Recommend deferring to
  the maintainer after the OAuth flow's package-placement is settled.
- Should the registry live in `@endo/lal` or in a new `@endo/lal-ai`
  package mirroring Pi's split? Splitting lets a non-Lal consumer reuse
  the providers; staying co-located avoids a package proliferation.
- Does subscription auth widen Endo's attack surface? Subscription
  tokens have broader scope than API keys (account-level, not
  workspace-level). Suggest: a UI confirmation step on first use, plus
  documentation that subscription tokens are equivalent to logging in
  on the web.

## Citation

- [`packages/ai/README.md`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/README.md)
- [`packages/ai/src/api-registry.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/api-registry.ts)
- [`packages/ai/src/oauth.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/oauth.ts)
- [`packages/ai/src/models.ts`](https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/models.ts)
- [`packages/ai/src/providers/`](https://github.com/badlogic/pi-mono/tree/main/packages/ai/src/providers) (30+ provider modules)

## Prompt

> Extracted from [endopi](endopi.md) § *Multi-provider LLM API*. The
> registry shape is a refactor of existing Lal code; the subscription-
> OAuth path is the new user-facing capability.
