# Agent Guest Framework: Confined AI Assistant in Endo

| | |
|---|---|
| **Created** | 2026-02-27 |
| **Updated** | 2026-02-27 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Draft - Ready for Implementation |

This document proposes a concrete framework for granting AI coding agents access to Endo's capabilities in a confined, observable way. It builds on the existing daemon design, the persona/epithet model for verifiable delegation, and the virtual filesystem design for capability confinement. The goal is to provide AI agents with an external-visible identity, structured filesystem access, and mail-communicable agency, all while maintaining host control over identity and authority.

## Core Principles

1. **Identity is a verified epithet chain** — every externally-visible action carries its delegate relationship to the host.
2. **Structural confinement is enforced by capabilities** — agents can only operate on what is explicitly granted (filesystems, contacts, services).
3. **Host holds control facets** — permission toggles and revocation are host-managed, not agent-controlled.
4. **Identity and action are separated** — a guest may hold a Handle (action facet) with an epithet claim and a HandleControl (identity facet) that controls verification policy.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           HOST                                      │
│                                                                       │
│  ┌──────────────┐  ┌───────────────────┐  ┌─────────────────────┐   │
│  │ Pet-Name     │  │ HandleControl     │  │ Virtual Filesystem  │   │
│  │ Directory    │  │ (Guest Identity)  │  │ VFS Namespace       │   │
│  └──────┬───────┘  └────────┬──────────┘  └──────────┬──────────┘   │
│         │                   │                         │             │
│         └─────────┬─────────┴────────────┬────────────┘             │
│                   │                        │                        │
│         ┌─────────▼─────────┐  ┌──────────▼──────────┐             │
│         │  Handle Creation:  │  │ Capability Grants:  │             │
│         │  - Guest epithets  │  │ - Filesystem Dir    │             │
│         │  - Verification    │  │ - Mail pet names    │             │
│         │    policy          │  │ - Service connectors│             │
│         └─────────┬─────────┘  └──────────┬──────────┘             │
└───────────────────┼──────────────────────┼─────────────────────────┘
                    │                      │
                    ▼                      ▼
         ┌──────────────────────┐  ┌──────────────────────┐
         │       GUEST         │  │       SERVICES       │
         │                      │  │                      │
         │  ┌────────────────┐  │  │   Slack Bot         │
         │  │    Handle      │  │  │   (Handle → Bot     │
         │  │  + Epithets    │  │  │    Token)           │
         │  └────────────────┘  │  └──────────────────────┘
         │                      │  ┌──────────────────────┐
         │  ┌────────────────┐  │  │   GitHub App        │
         │  │    Dir         │  │  │   (Handle → API key)│
         │  │  (Filesystem)  │  │  └──────────────────────┘
         │  └────────────────┘  │  ┌──────────────────────┐
         │                      │  │   Google Service     │
         │  ┌────────────────┐  │  │   Account (email)    │
         │  │ Mail powers:    │  │  └──────────────────────┘
         │  │  - pet names    │
         │  │  - envelope     │
         │  └────────────────┘
```

## Key Components

### 1. Guest Creation with Epithets

A Guest is created using the existing `provideGuest` pattern but with explicit epithet configuration:

```js
const aifredHandle = await E(host).provideGuest('aifred', {
  epithets: [
    { relationship: 'AI assistant', principal: hostHandle }
  ],
  verificationPolicy: 'selective', // or 'confirm-all', 'deny-all'
  capabilities: {
    fs: rootDir, // FileSystem capability
    mail: petNames, // Pet-name directory for contacts
    services: [slackConnector, githubConnector]
  }
});
```

**Epithet chain propagation**: When sub-delegates are created, they inherit the entire epithet chain from the delegate and add their own relationship:

```
Alice creates Aifred:
  Aifred's epithets: [(AI assistant to Alice)]

Aifred creates Jarvis:
  Jarvis's epithets: [(Code reviewer for Aifred), (AI assistant to Alice)]
```

### 2. Handle + Epithet Interface

The guest's handle exposes both its identity claim and verification capability:

```js
// Guest reads its epithet chain
const myEpithets = await E(myHandle).epithets();
// Returns: [
//   { relationship: 'AI assistant to Alice', principal: aliceHandle }
// ]

// Guest asks its principal to verify its epithet
const verified = await E(myHandle).verify(aliceHandle, 'AI assistant');
// Returns: true/false (or null if principal denies)
```

**HandleControl** for the principal holds verification policy:

```js
// Alice controls how Aifred's epithet is verified
const aifredControl = await E(host).lookup('HandleControl:aifred');
await E(aifredControl).setVerificationPolicy('deny-all'); // Full deniability
await E(aifredControl).setVerificationPolicy('confirm-all'); // Automatic verification
```

### 3. Virtual Filesystem for Confined Access

The guest receives a `Dir` capability scoped to a specific VFS namespace:

```js
const { dir, control } = await E(vfs).root();

// Grant full VFS access
E(host).grant('aifred', 'fs', dir);

// Or grant read-only
E(host).grant('aifred', 'fs', await E(dir).readOnly());

// Or grant scoped access
E(host).grant('aifred', 'fs', await E(dir).subDir('project/src'));
```

**Backend types** supported:

- **Physical backend** — OS directory with deny patterns for sensitive paths
- **Git tree backend** — Read-only access to specific commit branches
- **Memory backend** — Ephemeral scratch space
- **CAS backend** — Immutable content-addressed storage

**Materialization** for OS sandbox integration:

```js
const { physicalPath, syncBack } = await E(vfs).materialize(['project']);

// Pass to OS sandbox plugin
const sandbox = await E(sandboxMaker).describe({
  fs: [{ path: physicalPath, mode: 'read-write' }],
});
```

### 4. Mail and Pet-Name Directory

The guest's mail capabilities map to a pet-name directory:

```js
// Pet names configured by host
E(host).write(['aifred', 'bob'], bobHandle);
E(host).write(['aifred', 'carol'], carolHandle);
E(host).write(['aifred', 'design-channel'], channelHandle);

// Guest sends messages
await E(myMailPowers).send('bob', ['Fixed bug in abc123'], [], []);
await E(myMailPowers).request('carol', 'Please review PR #23', []);
```

**Envelope protocol** ensures identity and auth through token exchange:

```
Guest Send: (petName, envelope) → Daemon → Pet-Name Service → Send
Pet-Name Service: (envelope) → Guest receives (envelope with replyToken)
Guest Reply: (replyToken, envelope) → Daemon → Respondent receives
```

### 5. Service Connectors with Token Management

Connectors map handles to service-specific credentials:

```js
// Slack Bot connector
const slackConnector = {
  type: 'slack',
  handle: slackBotHandle,
  serviceToken: 'xoxb-slack-bot-token',
  verifyEpithet(handle, serviceToken) { /* ... */ }
};

// GitHub App connector
const githubConnector = {
  type: 'github',
  handle: githubAppHandle,
  apiToken: 'ghp_github-app-token',
  verifyEpithet(handle, apiToken) { /* ... */ }
};
```

Service integration flow:

```
1. Guest sends message to contact
2. Daemon looks up contact's service connector
3. Connector verifies guest's epithet chain against service
4. Service performs action if authentication passes
5. Service response includes responseToken
6. Guest responds through envelope protocol
```

## Interface Definitions

### GuestEpithetI

```js
const GuestEpithetI = M.interface('GuestEpithet', {
  epithets: M.call().returns(M.promise(M.arrayOf(M.splitRecord({
    relationship: M.string(),
    principal: M.remotable('Handle')
  })))),
  verify: M.call(M.remotable('Handle'), M.string()).returns(M.promise(M.or(
    M.literal(true),
    M.literal(false),
    M.null()
  ))),
  help: M.call().returns(M.string())
});
```

### HandleI

```js
const HandleI = M.interface('Handle', {
  epithets: M.call().returns(M.promise(M.arrayOf(M.splitRecord({
    relationship: M.string(),
    principal: M.remotable('Handle')
  })))),
  verify: M.call(M.remotable('Handle'), M.string()).returns(M.promise(M.or(
    M.literal(true),
    M.literal(false),
    M.null()
  ))),
  help: M.call().returns(M.string())
});
```

### MailPowersI

```js
const MailPowersI = M.interface('MailPowers', {
  send: M.call(M.string(), M.remotable('Envelope')).returns(M.promise(M.remotable('ResponseToken'))),
  request: M.call(M.string(), M.string(), M.arrayOf(M.remotable('Attachment'))).returns(M.promise(M.remotable('RequestToken'))),
  reply: M.call(M.remotable('ResponseToken'), M.remotable('Envelope')).returns(M.promise(M.undefined())),
  receive: M.call(M.remotable('RequestToken')).returns(M.promise(M.splitRecord({
    envelope: M.remotable('Envelope'),
    headers: M.arrayOf(M.splitRecord({ key: M.string(), value: M.string() }))
  }))),
  markReceived: M.call(M.remotable('RequestToken')).returns(M.promise(M.undefined())),
  help: M.call().returns(M.string())
});
```

### DirI

(From filesystem design: navigation, mutation, attenuation)

### VfsI

```js
const VfsI = M.interface('VirtualFs', {
  mount: M.call(M.arrayOf(M.string()), M.remotable('Backend')).returns(M.promise(M.undefined())),
  root: M.call().returns(
    M.splitRecord({
      dir: M.remotable('Dir'),
      control: M.remotable('DirControl')
    })
  ),
  materialize: M.call(M.arrayOf(M.string())).returns(M.promise(M.splitRecord({
    physicalPath: M.string(),
    syncBack: M.remotable('SyncBack')
  }))),
  help: M.call().returns(M.string())
});
```

## Security Model

1. **Epithet verification must always be present** — service actions cannot bypass identity verification.
2. **Physical backend deny patterns are a defense-in-depth layer** — catch accidental permission errors.
3. **Control facets are never exposed to guests** — revocation and permission changes are host-only.
4. **Materialization is constrained** — materialized paths are scoped to the VFS subtree.

## Implementation Strategy

### Phase 1: Basic Guest Framework

- `provideGuest` extension with epithet configuration
- Handle + epithet interface
- VFS namespace for filesystem capabilities
- Pet-name directory integration

### Phase 2: Service Connectors

- Service connector interface design
- Token management for Slack, GitHub, Google
- Integration with actual services

### Phase 3: Complete Agent Support

- Full envelope protocol for mail
- LLM discoverability (help() text, interface guards)
- Example agent behaviors
- Testing and documentation

## Usage Example

```js
// Host creates VFS with project and scratch space
const vfs = makeVirtualFs({ policy: rootedPolicy });
vfs.mount(['project'], physicalBackend('/home/user/project'));
vfs.mount(['scratch'], memoryBackend());

// Create guest with verified epithet and capabilities
const { dir: rootDir, control: rootControl } = await E(vfs).root();
const hostHandle = await E(host).lookup('Handle:alice');

const aifred = await E(host).provideGuest('aifred', {
  epithets: [
    { relationship: 'AI assistant', principal: hostHandle }
  ],
  verificationPolicy: 'confirm-all',
  capabilities: {
    fs: rootDir,
    mail: await E(host).lookup('MailPowers:aifred'),
    services: [
      await E(host).lookup('SlackConnector'),
      await E(host).lookup('GitHubConnector')
    ]
  }
});

// Guest uses its capabilities
const epit = await E(aifred).epithets(); // Verify guest's identity
const [ep1] = epit;
E(ep1.principal).verify(aifred, ep1.relationship); // Verify with principal

// File operations
const srcDir = await E(rootDir).openDir('project/src');
const file = await E(srcDir).openFile('index.js');
const code = await E(file).readText();

// Mail operations
const contactHandle = await E(host).lookup('Handle:bob');
await E(mailPowers).send('bob', { body: `I analyzed ${code}`, attachments: [] });

// Service operations (would go through connector)
```

## Open Questions

- How to handle large-scale epithet verification for many service calls per request?
- Should service connectors cache verification tokens for efficiency?
- What should failure modes look like when verification fails?
- How to integrate with existing LLM agent frameworks?