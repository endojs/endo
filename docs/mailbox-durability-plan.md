# Mailbox Durability Plan

## Context

Stable message identifiers depend on messages having identities that
persist.
Message identity in turn depends on mailbox state being durable: messages
and the mailbox's next-message counter must survive daemon restarts.
This plan outlines how to make mailbox state persist in storage between
daemon restarts, using the same patterns we already have (pet store,
formula graph).
We defer the question of stable message identifiers until after
durability is in place.

## Goal

- Mailbox state (the set of messages and the next-message counter)
  persists in daemon storage.
- After a daemon restart, each mailbox is rehydrated from storage: the
  same message numbers and message contents are available, and the next
  message number continues from the persisted counter.
- We use existing daemon patterns: a pet store for the mailbox's
  durable state, with the same naming and persistence behaviour as
  other pet stores.

## Storage shape: mailbox pet store

Each mailbox has its own **mailbox store**: a pet store (backed by
durable storage like the rest of the daemon) used only for that
mailbox's inbox state.

- **Message slots**: Each delivered message is stored under a name that
  is the decimal string of its message number: `"0"`, `"1"`, `"2"`, ...
  The value stored is the formula identifier of a persisted message
  (see below).
- **Next-message counter**: The name `"next-number"` in the same store
  holds the formula identifier of a value that represents the next
  message number to assign.
  After delivering a message with number `n`, we update the counter to
  `n + 1` and persist it under `"next-number"`.

So the mailbox store is a pet store whose names are exactly the decimal
digit strings for message numbers and the single reserved name
`"next-number"`.
We use the same pet store abstraction and persistence as elsewhere; the
only special aspect is the naming convention and the fact that this
store is dedicated to one mailbox.

## Persisted message content

Each message (request, package, eval-proposal-reviewer, eval-proposal-
proposer, and any future types like form-response) must be serializable
so we can persist it and rehydrate it after a restart.

- **Serializable fields**: Type, `from`, `to`, `date`, and type-specific
  fields (e.g. `description` for request; `strings`, `names`, `ids` for
  package; `source`, `codeNames`, `edgeNames`, etc. for eval-proposal)
  are stored.
- **Capability references**: Messages today contain live references
  (e.g. `responder`, `dismisser`).
  Persisting them means storing formula identifiers (or similar) so we
  can rehydrate references when loading the mailbox.
  Rehydration may require that those formulas (and their targets) still
  exist after restart; otherwise we persist what we can and document
  that in-flight requests or dismissers may need special handling
  (e.g. broken or recreated) after restart.
- **StampedMessage**: On rehydration we reconstruct `StampedMessage`
  (number, date, dismissed promise, dismisser exo) from the persisted
  record so that `listMessages` and `followMessages` continue to work.
  New dismissers created on rehydration are fresh; any pre-restart
  dismisser references held by clients become invalid or are
  re-established by convention.

The exact serialization format (e.g. a new formula type
`mailbox-message` whose payload is the serialized message, or reuse of
existing formula types) is left to the implementation.
The plan assumes we have a way to write a message payload to the formula
graph and store its formula id under the message-number name in the
mailbox store.

## Next-number counter

The name `"next-number"` in the mailbox store maps to a formula that
holds the next message number (a non-negative integer).
We need a formula type (or reuse) that can represent a single number so
that reading/writing `"next-number"` persists the counter.
Options include a small dedicated formula type (e.g. `number` or
`mailbox-counter`) or storing the number as text in a blob and
referencing that blob's formula id.
Implementation chooses the minimal approach that fits the existing
formula and persistence layers.

## Daemon and mailbox lifecycle

- **Mailbox creation**: When we create a mailbox (e.g. in host or guest
  setup), we also create or obtain its mailbox store (a pet store
  dedicated to this mailbox, with names `"0"`, `"1"`, ..., `"next-number"`).
  The mailbox store may be created by the same machinery that creates
  other numbered pet stores (e.g. a new formula for a pet-store used
  only for this mailbox), or by a dedicated "mailbox store" path or
  formula.
- **Initial load**: When the mailbox is created (or when the daemon
  starts and rehydrates the mailbox), we read `"next-number"` from the
  mailbox store to get the next message number.
  We then load all message slots `"0"` through `"next-number" - 1` (if
  any), deserialize each into a message payload, and build the in-memory
  `messages` Map and reconstruct StampedMessage objects (with new
  dismisser/promise per message).
  If the mailbox store is empty, next-number is 0 and the messages Map
  is empty.
- **Deliver**: When `deliver(envelope)` is called, we assign the next
  message number (from the counter), serialize the message to a formula
  (or equivalent), write that formula's id under the decimal name for
  that number in the mailbox store, then increment the counter and
  persist it under `"next-number"`.
  Then we update in-memory state (messages Map, messagesTopic) as today.
- **Dismiss**: When a message is dismissed, we remove it from the
  in-memory Map and resolve its dismissal promise as today.
  We also remove the corresponding name (e.g. `"42"`) from the mailbox
  store so that after a restart that message no longer appears.
  Alternatively we could mark the message as dismissed in the
  persisted payload and keep the slot; the plan prefers delete so the
  store does not grow without bound for dismissed messages.

## followMessages and rehydration

Today `followMessages()` yields existing messages then subscribes to the
topic for new ones.
After a restart there are no in-memory "existing" messages until we load
them from the mailbox store.
So on rehydration we first load all persisted messages into the Map and
reconstruct the topic's history or initial state.
New subscribers after restart will see the rehydrated messages (e.g. by
iterating the Map) then any new messages delivered after restart.
The exact behaviour of followMessages across restart (e.g. whether
subscribers created before restart are restored) is left to the
implementation; at minimum, listMessages and followMessages after
restart reflect the persisted state plus any new deliveries.

## Summary of changes

1. **Mailbox store**: Introduce a dedicated pet store per mailbox (same
   patterns as existing pet stores), with names `"0"`, `"1"`, ... for
   message slots and `"next-number"` for the counter.
2. **Message persistence**: Define (or reuse) a way to persist a message
   payload (serializable fields + capability references as formula ids)
   and to rehydrate it into a StampedMessage.
3. **Counter persistence**: Define (or reuse) a way to persist a single
   number under `"next-number"`.
4. **makeMailbox**: Accept or create a mailbox store; on init, load
   next-number and all message slots from the store; on deliver, persist
   the message and update next-number; on dismiss, remove the message
   slot from the store.
5. **Daemon wiring**: When creating a host or guest mailbox, create or
   obtain the mailbox store and pass it into makeMailbox so the mailbox
   can read/write it.

## Out of scope for this plan

- **Stable message identifiers**: This plan only makes mailbox state
  durable; it does not define a stable, externally visible message id
  (e.g. for form-response correlation).
  That can be addressed once durability is in place (e.g. message id =
  mailbox id + message number, or a dedicated id in the persisted
  message).
- **Responder / request resolution across restart**: In-flight requests
  hold a responder that the other side will call to resolve.
  If the daemon restarts before resolve, the responder reference may be
  invalid.
  Handling that (e.g. persisting request state and rehydrating
  responders, or documenting that in-flight requests are best-effort)
  is left to a later design.
- **Ordering and consistency**: The plan assumes we persist each message
  and the counter update in an order that leaves the store consistent
  (e.g. write message slot then bump next-number).
  Transactional or atomicity details are implementation-specific.
