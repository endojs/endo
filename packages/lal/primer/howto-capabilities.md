# How-To: Working with Capabilities

Capabilities are references to objects that can do things —
directories, services, data stores, network endpoints. You
interact with them through pet names in your inventory.

## Inspecting a Capability

Before using an unfamiliar capability, inspect it:

As an agent: use `inspect("my-capability")`
Chat: `/show my-capability`
CLI: `endo show my-capability`

Inspection reveals the capability's methods and, if it
supports `help()`, a description of what it does.

## Giving a Capability to an Agent

The most common pattern: mount a directory, then send it.

1. Mount a filesystem path:
   ```
   /mount /Users/me/project -n project-dir
   ```

2. Send it to the agent:
   ```
   @lal Here is @project-dir — it contains the source code.
   ```

The agent can now read and write files in that directory
using its `readText`, `writeText`, and `list` tools.

## Requesting Capabilities You Don't Have

Ask your host or another agent:

```
/request @host I need access to the production database
```

Your host sees the request and can grant it with `/resolve`.

CLI: `endo request "I need the database" -t @host`

## Attenuation: Creating Less-Powerful Capabilities

Sometimes you want to give someone a restricted view of a
powerful capability. The define/endow pattern lets an agent
propose code that you run with your more powerful endowments,
producing a less powerful result.

**Example**: Ask an agent to propose a read-only wrapper.

```
@lal I have a read-write directory called project-dir.
Please propose code that creates a read-only view of it.
```

The agent uses `define()` to propose code with named slots:
```
define("E(dir).readOnly()", {
  "dir": {"label": "The directory to attenuate"}
})
```

You receive this as a definition message. In Chat, the
message card shows an inline form with a slot for each
named parameter. Fill in the pet name for each slot (e.g.,
bind `dir` to `project-dir`) and click Submit. The code
runs with your endowments and produces the attenuated
result, which you can then share:

```
@untrusted-agent Here is @read-only-view for you.
```

CLI equivalent:
```
endo endow <msgnum> dir=project-dir -n read-only-view
```

## Sharing Capabilities Across Networks

Generate a shareable locator:
```
/share my-value
```

The other party on another machine adopts it:
```
/adopt-locator <locator> -n their-name
```

This works across network boundaries using Endo's peer
protocols.

## Reading from a Readable Tree

A readable tree is an immutable directory snapshot (e.g.,
from `endo checkin`):

```
/ls my-tree
/view my-tree/README.md
```

CLI: `endo ls my-tree`, `endo cat my-tree/README.md`

To check out to disk (CLI only):
```
endo checkout my-tree ./local-dir
```

## Writing to a Mounted Directory

A mount is a live filesystem directory:

```
/ls my-mount
/view my-mount/config.json
/edit my-mount/config.json
```

Or send it to an agent who can use `readText` and `writeText`
tools to read and modify files.
