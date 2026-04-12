# Endo CLI Reference

The Endo CLI is invoked as `endo <command>` from the terminal.

The `-a`/`--as` flag on any command means "pose as named agent"
(operate as another persona). To name a result, use
`-n`/`--name`.

## Daemon Management

- `endo start` — Start the daemon
- `endo stop` — Stop the daemon
- `endo restart` — Restart the daemon
- `endo status` — Show daemon status
- `endo ping` — Check if daemon is responsive
- `endo log` — Show daemon logs (`-f` to follow)
- `endo where` — Show paths (state, cache, socket, logs)
- `endo clean` — Erase ephemeral state
- `endo purge` — Erase all persistent state

## Inventory (Names and Values)

- `endo list` / `endo ls` — List names in inventory
- `endo show <name>` — Print a named value
- `endo cat <name>` — Dump a blob's contents
- `endo follow <name>` — Subscribe to a stream of values
- `endo store -n <name>` — Store a value (from stdin,
  file, or JSON)
- `endo checkin <dir> -n <name>` / `endo ci` — Check in a
  local directory as a readable tree
- `endo checkout <name> <dir>` / `endo co` — Check out a
  readable tree to a local directory
- `endo mount <path> -n <name>` — Mount a filesystem
  directory
- `endo mktmp -n <name>` — Create a scratch directory
- `endo locate <name>` — Get the locator URL for a value
- `endo remove <name>` / `endo rm` — Remove a name
- `endo move <from> <to>` / `endo mv` — Rename a value
- `endo copy <from> <to>` / `endo cp` — Copy a name
- `endo mkdir <name>` — Create a subdirectory
- `endo cancel <name>` — Cancel a formula

## Messaging

- `endo inbox` — List messages in your inbox
- `endo send <to> <text>` — Send a message. Embed values
  as `@pet-name` or `@pet-name:edge-name` in the text.
- `endo reply <msgnum> <text>` — Reply to a message
- `endo send-value <msgnum> <name>` — Reply with a retained
  value
- `endo dismiss <msgnum>` — Dismiss a message
- `endo clear` — Dismiss all messages
- `endo request <description> -t <to>` — Request a
  capability (`-t` names the recipient; default: HOST)
- `endo resolve <msgnum> <name>` — Grant a request
- `endo reject <msgnum>` — Deny a request
- `endo adopt <msgnum> <edge> [-n <name>]` — Adopt a value
  from a message. Without `-n`, uses the edge name.
- `endo form <to> <title> <fields...>` — Send a structured
  form
- `endo submit <msgnum> <values...>` — Submit form values
- `endo define <source> --slots <name=label>...` — Propose
  code with capability slots
- `endo endow <msgnum> <slot=name>...` — Bind capabilities
  to a definition and evaluate

## Execution

- `endo eval <source> [name:petname...] -n <result>` —
  Evaluate JavaScript code. Endowments are positional pairs
  like `counter:my-counter`.
- `endo run [--UNCONFINED] <file> [--powers <name>]` — Run a
  program.
- `endo make <specifier> [--UNCONFINED]` — Make a
  plugin/caplet
- `endo spawn [names...]` — Create a worker
- `endo bundle <file> [-n <name>]` — Bundle a program

## Agents / Profiles / Personas / Other parties

- `endo mkhost <handle-name> [agent-name]` — Create a host
  (separate mailbox and storage)
- `endo mkguest <handle-name> [agent-name]` — Create a guest
- `endo invite <guest>` — Create an invitation
- `endo accept <guest-name>` — Accept an invitation
