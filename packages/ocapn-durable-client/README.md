# @endo/ocapn-durable-client

Durable composition helpers for `@endo/ocapn`.

This package composes the core OCapN client with a baggage-first table strategy
so session table state can survive client process restarts.

In durable mode, application references crossing the OCapN boundary are expected
to be durable objects (for example from `makeExo`), rather than ephemeral `Far`
objects.

Exports:

- `makeDurableClient(...)`
- `makeDurableOcapnTableFactory(...)`
- `makeInMemoryDurableBaggage()`
- `makeFsDurableBaggage({ filePath, ... })`
