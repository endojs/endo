User-visible changes in `@endo/captp`:

# v4.4.0 (2024-10-10)

- Add optional configuration `makeCapTPImportExportTables` for external management of import/export tables.

# v4.3.0 (2024-08-23)

- Relax typing of `send` to allow `async` functions, and abort the connection if the `send` function returns a rejected promise.

# v3.1.0 (2023-04-14)

- Disable GC by default to work around known issues with dropping
  still-referenced objects.

# v2.0.19 (2022-12-23)

- Remote objects now reflect methods present on their prototype chain.
- Serialization errors now serialize.

# v1.2.0 (17-Dec-2019)

* use @agoric/eventual-send HandledPromise interface (#6)

Moved from https://github.com/Agoric/captp into the `packages/captp/`
directory in the monorepo at https://github.com/Agoric/agoric-sdk .

# v1.8.0

* introduce TrapCaps for synchronous "kernel trap" interfaces (see the
  README.md).
