# Tool Reference

## Self-documentation

- `help(methodName?)` — Get documentation for your capabilities

## Directory Operations (managing named references)

- `list(name?)` — List your directory, or list contents of any
  capability by pet name
- `has(petNamePath)` — Check if a name exists
- `lookup(petNameOrPath)` — Get a value by name from your directory
- `remove(petNamePath)` — Remove a name
- `move(fromPath, toPath)` — Rename/move a reference
- `copy(fromPath, toPath)` — Copy a reference
- `makeDirectory(petNamePath)` — Create a subdirectory

## Mail Operations

- `listMessages()` — List inbox messages (includes BOTH sent and
  received messages). Each message has a messageId (unique
  identifier) and optionally a replyTo (messageId of the parent
  message). Use these to understand conversation threading.
- `adopt(messageNumber, edgeName, petName)` — Adopt a value
  from a message
- `dismiss(messageNumber)` — Remove a message from inbox
- `request(recipientName, description, responseName?)` — Request
  a capability
- `resolve(messageNumber, petNameOrPath)` — Respond to a request
- `reject(messageNumber, reason?)` — Decline a request
- `reply(messageNumber, strings, edgeNames, petNames)` — Reply
  to a message (PREFERRED for responses)
- `send(recipientName, strings, edgeNames, petNames)` — Send a
  NEW message (only for initiating conversations)

## Identity

- `locate(petNamePath)` — Get the locator URL for a name
  (returns an `endo://...` URL, NOT a raw ID). Works with both
  special names (`@self`, `@host`) and pet names (`my-counter`).
- Compare message `from` field to your @self locator to determine
  if you sent or received a message
- IMPORTANT: Only call `locate()` with names you know exist.
  Call `list()` first to see your pet names; special names like
  `@self` and `@host` always exist.

## Capability Operations

- `inspect(petNameOrPath)` — Call `help()` on a capability and
  list its methods. IMPORTANT: Always call `inspect()` before
  using `evaluate()` on an unfamiliar capability. The response
  includes method signatures with argument types. Do NOT guess
  method names or argument shapes — read the help text first.
- `readText(petNameOrPath, fileName)` — Read text content from a
  capability (ReadableTree, WritableTree, etc.)
- `writeText(petNameOrPath, fileName, content)` — Write text
  content to a capability (WritableTree, etc.)

## Code Evaluation

- `define(source, slots)` — Propose code with named slots for the
  host to fill (PREFERRED)
- `evaluate(workerName?, source, codeNames, edgeNames, resultName)`
  — Evaluate code directly using your own capabilities

## Prefer Direct Tools Over Code

IMPORTANT: Always prefer direct tool calls over `evaluate()` or
`define()`. Many tasks can be accomplished without code execution:

- Use `list()` to enumerate names in your directory or any capability
- Use `list("capName")` to list contents of a ReadableTree or
  WritableTree capability
- Use `readText("capName", "file.txt")` to read text from a
  capability
- Use `writeText("capName", "file.txt", content)` to write text
  to a capability
- Use `lookup()` to inspect values
- Use `has()` to check existence
- Use `inspect()` to discover a capability's methods and
  documentation
- Use `send()`, `reply()`, `request()`, `resolve()` for messaging
- Use `adopt()`, `move()`, `copy()`, `remove()` for managing
  references

`evaluate()` executes code directly. `define()` sends code to
the host with capability slots for them to fill. Only use code
evaluation when the task genuinely requires computation that
cannot be done with the other tools.
