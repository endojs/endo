# `@endo/cli`

Command line interface for the Endo daemon.

## Overview

The `endo` command provides a user interface for managing the Endo daemon,
a persistent host for guest programs running in Hardened JavaScript.
Through the CLI, users can run confined programs, manage named values, send
messages, and control the daemon lifecycle.

See [`@endo/daemon`](../daemon/README.md) for more about the underlying daemon.

## Getting Started

This package is not yet published to npm.
To use it locally, clone the Endo repository and run from the workspace:

```sh
git clone https://github.com/endojs/endo.git
cd endo
yarn install
cd packages/cli
yarn start        # Start the daemon
yarn endo --help  # Run CLI commands
```

Or invoke the CLI directly:

```sh
node packages/cli/bin/endo --help
```

## Daemon Lifecycle

Start, stop, and manage the Endo daemon:

```sh
endo start    # Start the daemon
endo stop     # Stop the daemon
endo restart  # Restart the daemon
endo ping     # Check if the daemon is responsive
endo log -f   # Follow the daemon log
```

Reset state:

```sh
endo clean  # Erase ephemeral state (logs, sockets)
endo purge  # Erase all persistent state (requires confirmation)
```

## Running Programs

Run a confined program:

```sh
endo run program.js
endo run program.js --powers NONE   # No special powers (default)
endo run program.js --powers AGENT  # All of the primary user's agency
endo run program.js --powers ENDO   # All of the power of the daemon
```

Make a persistent worker wherein programs can run:

```sh
endo make worker.js --name my-worker
endo make worker.js --worker existing-worker  # Reuse a worker
```

Bundle a program for later use:

```sh
endo bundle ./app --name my-bundle
endo run --bundle my-bundle
```

## Managing Names

Endo uses petnames to refer to values.
Each agent has its own namespace of names.
A path of names can traverse into nested namespaces.

```sh
endo list                    # List known names (or: endo ls)
endo list some-directory     # List names in a directory
endo list path.to.directory  # List names in a deeply nested directory
endo show my-value           # Print a value
endo cat my-blob             # Dump blob contents
endo remove old-name         # Forget a name (or: endo rm)
endo move old-name new-name  # Rename (or: endo mv)
endo copy src-name dst-name  # Duplicate a name (or: endo cp)
```

Store values:

```sh
endo store --name my-blob --path ./file.txt    # Store a file
endo store --name my-text --text "hello"       # Store text
endo store --name my-data --json '{"a":1}'     # Store JSON
echo "data" | endo store --name piped --stdin  # Store from stdin
```

Create directories for organizing names:

```sh
endo mkdir my-directory
```

## Evaluating Expressions

Evaluate JavaScript in a worker:

```sh
endo eval '1 + 1' --name two
endo eval 'a + b' a b --name sum  # With named values as arguments
endo eval 'x * 2' \
  --worker my-worker \
  --name doubled
```

## Agents and Messages

Endo supports multiple agents (personas, profiles) that can exchange messages
and capabilities.
These personas can be held by people, confined programs, bots, or AI agents.
People can have more than one.

Create agents:

```sh
endo mkhost alice  # Create a host agent (unlimited local authority)
endo mkguest bob   # Create a guest agent (limited authority)
```

Send messages with embedded references (alice the host sends to bob the guest):

```sh
endo send bob "Here is @my-value for you" --as alice
endo send bob "Take @this-thing:your-name" --as alice  # bob sees it as "your-name"
```

Check inbox and handle messages (bob the guest receives from alice):

```sh
endo inbox --as bob               # List bob's received messages
endo inbox --follow --as bob      # Follow messages as they arrive
endo adopt 1 value-name --as bob  # Adopt a value from message #1
endo dismiss 1 --as bob           # Delete message #1
```

Request and grant capabilities:

```sh
# bob (guest) requests a capability from alice (host)
endo request "I need access to the database" --as bob --to alice

# alice (host) reviews inbox and grants or rejects
endo inbox --as alice                      # See bob's request
endo resolve 1 database-ref --as alice     # Grant request #1 with a named value
endo reject 1 "Not authorized" --as alice  # Or reject it
```

Act as a different agent:

```sh
endo list --as alice
endo list --as bob
```

## Workers

Spawn a new worker process:

```sh
endo spawn --name my-worker
```

## Locating Files

Find daemon-related paths:

```sh
endo where state  # State directory
endo where sock   # Unix socket / named pipe
endo where log    # Log file
endo where cache  # Cache directory
endo where run    # PID file directory
```

## License

[Apache-2.0](./LICENSE)
