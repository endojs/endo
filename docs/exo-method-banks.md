# Exo Method Banks

## Overview

The daemon uses a two-layer pattern for defining exo behavior: a **method
bank** (a plain object of functions) and an **exo** (a hardened remotable
object created with `makeExo`). The method bank holds the implementation; the
exo wraps it with a schema guard and makes it passable over `E()`.

## Why Two Layers

An exo created with `makeExo(tag, interface, methods)` must have methods that
conform exactly to the `M.interface()` guard. The guard validates argument
shapes and return types at the boundary. But internally, methods often need to
call each other without this overhead, share closures, or use signatures that
differ slightly from the external interface (e.g., accepting a formula
identifier internally where the exo accepts a locator externally).

Separating the method bank from the exo allows:

1. **Internal composition** — methods call each other directly without guard
   overhead.
2. **Signature adaptation** — the exo can rename or wrap methods (e.g.,
   exposing `writeLocator` as `write`).
3. **Method inheritance** — higher-level agents (Host, Guest) destructure
   methods from lower-level objects (Directory, Mailbox) and carry them
   into their own method bank without re-implementing them.

## Method Bank Construction

A method bank is a plain object whose values are functions:

```js
const directory = {
  has,
  identify,
  locate,
  write,
  writeLocator,
  // ...
};
```

The exo wraps this, potentially renaming methods to match the interface:

```js
return makeExo('EndoDirectory', DirectoryInterface, {
  has,
  identify,
  locate,
  write: directory.writeLocator, // exo "write" accepts locators
  // ...
});
```

## Carrying Methods Up

Host and Guest agents compose behavior from Directory and Mailbox by
destructuring their method banks:

```js
// Destructure directory methods
const {
  has, identify, locate, reverseLocate,
  list, listIdentifiers, listLocators,
  lookup, reverseLookup,
  write, writeLocator, move, remove, copy,
  makeDirectory,
} = directory;

// Destructure mailbox methods
const {
  listMessages, followMessages,
  resolve, reject, adopt, dismiss,
  request, send, deliver,
} = mailbox;

// Compose into the agent's method bank
const host = {
  // From directory
  has, identify, locate, reverseLocate,
  list, listIdentifiers, listLocators,
  // From mailbox
  listMessages, followMessages,
  resolve, reject, adopt, dismiss,
  // Agent-specific
  evaluate, provideGuest, invite,
};
```

This pattern ensures each method is defined once, at the layer that owns
the logic, and carried up by reference.

## Iterator Wrapping

Async iterator methods require special handling at the exo boundary.
The method bank returns a raw async iterator, but the exo must wrap it
in `makeIteratorRef` to make it passable over `E()`:

```js
// Method bank returns raw iterator
const followNameChanges = async function* () {
  yield* petStore.followNameChanges();
};

// Exo wraps it
return makeExo('EndoDirectory', DirectoryInterface, {
  followNameChanges: () => makeIteratorRef(directory.followNameChanges()),
});
```

## Collection Wrapping

Guest methods are wrapped with `withCollection` to trigger garbage
collection after each call. The wrapping applies to the method bank
functions, not the exo methods, so the pattern is:

```js
const wrappedGuest = Object.fromEntries(
  Object.entries(guest).map(([name, fn]) => [
    name,
    unwrappedMethods.has(name) ? fn : withCollection(fn),
  ]),
);

return makeExo('EndoGuest', GuestInterface, {
  ...wrappedGuest,
  // Override iterator methods with makeIteratorRef wrapping
  followMessages: async () => {
    const iterator = guest.followMessages();
    await collectIfDirty();
    return makeIteratorRef(iterator);
  },
});
```
