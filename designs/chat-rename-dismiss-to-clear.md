# Rename dismiss-all to clear

| | |
|---|---|
| **Created** | 2026-03-03 |
| **Updated** | 2026-03-03 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |

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
