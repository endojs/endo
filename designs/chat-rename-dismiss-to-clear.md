# Rename dismiss-all to clear

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-05-19 |
| **Author** | Kris Kowal (prompted) |
| **Status** | **Complete** (PR [#93](https://github.com/endojs/endo-but-for-bots/pull/93), merged 2026-05-06) |

## Status

Landed in PR [#93](https://github.com/endojs/endo-but-for-bots/pull/93)
(merge commit `31df9e3cf`, merged 2026-05-06):

- **CLI**: `packages/cli/src/commands/dismiss-all.js` →
  `packages/cli/src/commands/clear.js`; `packages/cli/src/endo.js`
  registers `.command('clear').alias('dismiss-all')` so the original
  name remains available as a hidden backwards-compat alias during the
  deprecation period.
- **Chat**: `packages/chat/command-registry.js` exports `clear` as the
  canonical command (immediate mode, `category: 'messaging'`,
  `context: 'inbox'`); `packages/chat/command-executor.js` dispatches
  `case 'clear'` to `E(powers).dismissAll()`. The chat side did not
  retain a `/dismiss-all` alias — chat had not yet shipped the
  command pre-rename, so no deprecation surface was needed there.
- **Tab completion**: shortest-common-prefix advancement landed alongside
  the rename, but a follow-up audit would confirm it on the current
  chat-bar implementation.
- **Regression**: `packages/cli/test/clear-command.test.js` asserts the
  `clear|dismiss-all` pairing in `endo --help` and verifies that
  `endo dismiss-all --help` resolves through the alias.

The underlying daemon power remains `dismissAll()` — that is the
internal interface, not the user-facing command name, and out of
scope for the rename.

## Motivation

The `dismiss-all` command name is verbose and unfamiliar. `clear` is the
conventional term for this action (clearing an inbox, clearing notifications).
The rename should apply consistently across the chat UI command bar and the
CLI.

Additionally, `dismiss` and `dismiss-all` share a prefix, which makes tab
completion in the chat command bar awkward — typing `/dismiss` and pressing
tab cannot advance past the common prefix without an extra disambiguation
step. Renaming `dismiss-all` to `clear` eliminates the collision entirely.

## Changes

- **Chat**: Rename the `/dismiss-all` command to `/clear` in the command menu
  and command bar handler (`packages/chat/command-bar-component.js` or
  equivalent).
- **CLI**: Rename the `endo dismiss-all` subcommand to `endo clear`
  (`packages/cli/src/commands/`). Retain `dismiss-all` as a hidden alias
  during a deprecation period.
- **Tab completion**: Ensure that tab completion advances to the shortest
  common prefix of all matching candidates, so partial input resolves as far
  as possible before requiring further disambiguation.
