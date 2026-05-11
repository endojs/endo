# EndoDirectory - A naming hub for managing pet names and references.

A directory maps pet names to formula identifiers (internal references).
Pet names are strings like "my-worker", "counter", or "index.html".
Special names are @-prefixed like "@self", "@host", or "@agent".

Use lookup() to get a value by name, list() to see available names,
and storeIdentifier() or storeLocator() to store new references.

## help(methodName?) -> string

Get documentation for this interface or a specific method.
- help() returns an overview of the interface
- help("lookup") returns documentation for the lookup method

## has(...petNamePath) -> Promise<boolean>

Check if a pet name exists in this directory.
- has("counter") checks if "counter" exists
- has("subdir", "value") checks if "value" exists in subdirectory "subdir"

## identify(...petNamePath) -> Promise<string | undefined>

Get the formula identifier for a pet name path.
Returns undefined if the name doesn't exist.
Formula identifiers are internal references used by Endo.

## locate(...petNamePath) -> Promise<string | undefined>

Get a locator string for a pet name path.
Locators include the formula type and can be used for reverse lookups.

## reverseLocate(locator) -> Promise<string[]>

Find all pet names that refer to a given locator.
Returns an array of names (may be empty if no names exist).

## followLocatorNameChanges(locator) -> AsyncIterator

Subscribe to name changes for a specific locator.
Yields events when names are added or removed for the locator.
Use with for-await-of to receive updates.

## list(...petNamePath?) -> Promise<string[]>

List all pet names in this directory or a subdirectory.
- list() returns names in this directory
- list("subdir") returns names in the subdirectory "subdir"

## listIdentifiers(...petNamePath?) -> Promise<string[]>

List all unique formula identifiers in this directory.
Multiple names may refer to the same identifier.

## followNameChanges() -> AsyncIterator

Subscribe to all name changes in this directory.
First yields existing names, then yields diffs as names change.
Use with for-await-of to receive updates.

## lookup(petNameOrPath) -> Promise<any>

Resolve a pet name or path to its value.
- lookup("counter") gets the value named "counter"
- lookup(["subdir", "value"]) gets "value" from subdirectory "subdir"
Throws if the name doesn't exist.

## reverseLookup(value) -> Promise<string[]>

Find all pet names that refer to a given value.
Useful for discovering what names exist for an object you have.

## storeIdentifier(petNameOrPath, formulaId) -> Promise<void>

Store a formula identifier with a pet name.
- storeIdentifier("my-name", id) stores id as "my-name"
- storeIdentifier(["subdir", "name"], id) stores in a subdirectory
Overwrites any existing value at that name.

## storeLocator(petNameOrPath, locator) -> Promise<void>

Store an endo:// locator with a pet name.
- storeLocator("my-name", locator) stores locator as "my-name"
- storeLocator(["subdir", "name"], locator) stores in a subdirectory
The locator must be an endo:// URL. Overwrites any existing value.

## remove(...petNamePath) -> Promise<void>

Remove a pet name from this directory.
The underlying value is not deleted, just the name mapping.

## move(fromPath, toPath) -> Promise<void>

Move/rename a reference from one name to another.
- move(["old-name"], ["new-name"]) renames within this directory
- move(["a"], ["subdir", "b"]) moves to a subdirectory
The original name is removed after the move.

## copy(fromPath, toPath) -> Promise<void>

Copy a reference from one name to another.
Both names will refer to the same underlying value.

## makeDirectory(petNamePath) -> Promise<EndoDirectory>

Create a new subdirectory at the given path.
Returns the new directory object.

## readText(petNameOrPath) -> Promise<string>

Read text content by pet name or path.
For a single name, reads the blob's text content.
For a multi-segment path, reads through the mount.
Example: readText(["my-blob"])
Example: readText(["my-mount", "config.json"])

## maybeReadText(petNameOrPath) -> Promise<string | undefined>

Read text content, returning undefined if not found.
Same as readText but returns undefined instead of throwing.

## writeText(petNameOrPath, content) -> Promise<void>

Write text content by pet name or path.
For a single name, creates a ReadableBlob and binds the name.
For a multi-segment path, writes through the mount.
Example: writeText(["my-blob"], "hello")
Example: writeText(["my-mount", "output.txt"], "hello")

# Mail Operations - Send and receive messages between agents.

Messages can be requests (asking for a capability) or packages (sending values).
Each message has a number, sender, recipient, and content.

Use followMessages() to receive messages, send() to send packages,
and request() to ask for capabilities.

## handle() -> Handle

Get this agent's mailbox handle.
The handle is used internally for receiving messages.

## listMessages() -> Promise<Message[]>

List all messages in the inbox.
Each message has: number, date, from, to, type, and content.

## followMessages() -> AsyncIterator<Message>

Subscribe to incoming messages.
First yields existing messages, then yields new ones as they arrive.
Use with for-await-of:
  for await (const message of E(guest).followMessages()) { ... }

## resolve(messageNumber, petNameOrPath) -> Promise<void>

Respond to a request message by providing a named value.
- resolve(0, "my-counter") responds to message 0 with the value named "my-counter"
The requester receives the resolved value.

## reject(messageNumber, reason?) -> Promise<void>

Decline a request message.
- reject(0) declines message 0
- reject(0, "Not available") declines with a reason
The requester receives an error.

## adopt(messageNumber, edgeName, petName) -> Promise<void>

Adopt a value from an incoming package message, giving it a pet name.
- adopt(0, "gift", "my-new-thing") takes "gift" from message 0, names it "my-new-thing"
Edge names are the labels the sender attached to values in the package.

## dismiss(messageNumber) -> Promise<void>

Remove a message from the inbox.
Use after you've processed a message.

## dismissAll() -> Promise<void>

Remove all messages from the inbox.

## request(recipientName, description, responseName?) -> Promise<any>

Send a request to another agent asking for a capability.
- request("@host", "a counter") asks @host for "a counter"
- request("@host", "a counter", "my-counter") also stores the response as "my-counter"
The recipient sees your request and can resolve or reject it.

## send(recipientName, strings, edgeNames, petNames) -> Promise<void>

Send a package message with values to another agent.
- strings: Text fragments that form the message
- edgeNames: Labels for the values being sent
- petNames: Names of values to include

Example: send("@host", ["Here is ", " for you"], ["gift"], ["my-counter"])
  Sends: "Here is @gift for you" where @gift refers to "my-counter"

## storeValue(value, petNameOrPath) -> Promise<void>

Store a passable value in the agent's directory.
Values must be passable (numbers, strings, arrays, records, etc.).

## sendValue(messageNumber, petNameOrPath) -> Promise<void>

Reply to any message with a retained value from your pet store.

- messageNumber: The inbox message number to reply to
- petNameOrPath: Pet name (or path) of the value to send

Example: sendValue(0, "my-counter")

## deliver(message) -> void

Internal method to deliver a message to this mailbox.
Typically not called directly by users.

# EndoGuest - A confined agent with directory and mail capabilities.

A guest can:
- Manage pet names for values (directory operations)
- Send and receive messages (mail operations)
- Request capabilities from its host

Special names available:
- @self: This guest's own handle
- @host: The host that created this guest
- @agent: This guest's formula identifier

Use help("methodName") for details on specific methods.

## help(methodName?) -> string

Get documentation for this interface or a specific method.
- help() returns an overview of the guest capabilities
- help("request") returns documentation for the request method
- help("send") returns documentation for send method

## reverseIdentify(formulaId) -> string[]

Find all pet names that refer to a given formula identifier.
Synchronous version of reverse lookup by identifier.

## define(source, slots) -> Promise<any>

Propose code with named capability slots for the host to endow.
The guest specifies code and named slots with descriptions.
The host sees the code and slot descriptions, then decides which capabilities
to provide for each slot using the endow() command.

- source: JavaScript code to evaluate
- slots: Record of slot descriptions, e.g. { counter: { label: "A counter to increment" } }

The host reviews the code and slots, then calls endow() to bind capabilities
and trigger evaluation. This separates code proposal from capability binding.

Example: define("E(counter).incr()", { counter: { label: "A counter capability" } })

## form(recipientName, description, fields) -> Promise<void>

Send a structured form to another agent.
The form appears in the recipient's inbox. They can submit values using submit().

- recipientName: Pet name of the recipient (e.g., "@host")
- description: Human-readable description of the form
- fields: Array of field definitions, e.g. [{ name: "email", label: "Your email" }]

Example: form("@host", "Configure settings", [{ name: "name", label: "Your name" }])

## storeBlob(readerRef, petName?) -> Promise<EndoReadable>

Store binary data as a blob with a pet name.
- readerRef: An async iterator yielding base64-encoded strings
- petName: Name to store the blob under
Returns a readable blob reference.

## storeValue(value, petNameOrPath) -> Promise<void>

Store a passable value (number, string, array, record, etc.) in your directory.
- storeValue(42, "answer") stores the number 42 as "answer"
- storeValue({x: 1, y: 2}, "point") stores a record as "point"
- storeValue(["a", "b"], ["subdir", "items"]) stores in a subdirectory
Values must be passable (no functions or non-transferable objects).

## submit(messageNumber, values) -> Promise<void>

Submit values for a form message. Each call creates a new value message
in reply to the form, allowing multiple submissions.

- messageNumber: The inbox message number of the form
- values: A record with keys matching the form's field definitions

Example: submit(0, { name: "Alice", age: 30 })

## sendValue(messageNumber, petNameOrPath) -> Promise<void>

Reply to any message with a retained value from your pet store.

- messageNumber: The inbox message number to reply to
- petNameOrPath: Pet name (or path) of the value to send

Example: sendValue(0, "my-counter")

## readText(petNameOrPath) -> Promise<string>

Read text content by pet name or path.
For a single name, reads the blob's text content.
For a multi-segment path, reads through the mount.
Example: readText(["my-blob"])
Example: readText(["my-mount", "config.json"])

## maybeReadText(petNameOrPath) -> Promise<string | undefined>

Read text content, returning undefined if not found.
Same as readText but returns undefined instead of throwing.

## writeText(petNameOrPath, content) -> Promise<void>

Write text content by pet name or path.
For a single name, creates a ReadableBlob and binds the name.
For a multi-segment path, writes through the mount.
Example: writeText(["my-blob"], "hello")
Example: writeText(["my-mount", "output.txt"], "hello")

# EndoHost - A privileged agent with full Endo capabilities.

A host has all guest capabilities plus:
- Create workers for running code
- Evaluate JavaScript code
- Create confined guests
- Store blobs and values
- Make unconfined or bundled caplets
- Manage network peers

Use help("methodName") for details on specific methods.

## help(methodName?) -> string

Get documentation for this interface or a specific method.
- help() returns an overview of the host capabilities
- help("evaluate") returns documentation for code evaluation

## storeBlob(readerRef, petName) -> Promise<EndoReadable>

Store binary data as a blob with a pet name.
- readerRef: An async iterator yielding base64-encoded strings
- petName: Name to store the blob under
Returns a readable blob reference.

## storeValue(value, petNameOrPath) -> Promise<void>

Store a passable value (number, string, array, record, etc.) with a name.
- storeValue(42, "answer") stores the number 42
- storeValue({x: 1, y: 2}, "point") stores a record

## provideGuest(petName?, options?) -> Promise<EndoGuest>

Create or retrieve a confined guest agent.
- provideGuest() creates an anonymous guest
- provideGuest("my-guest") creates/retrieves a named guest
Options: { introducedNames: { guestName: hostName } }

## provideHost(petName?, options?) -> Promise<EndoHost>

Create or retrieve another host agent.
- provideHost() creates an anonymous host
- provideHost("my-host") creates/retrieves a named host

## provideWorker(petNamePath) -> Promise<EndoWorker>

Create or retrieve a worker for running code.
Workers are isolated JavaScript environments.

## evaluate(workerName, source, codeNames, petNames, resultName?) -> Promise<any>

Evaluate JavaScript code in a worker with named endowments.
- workerName: Worker to use (undefined for new worker)
- source: JavaScript code string
- codeNames: Names visible in the code
- petNames: Pet names providing values for those names
- resultName: Optional name to store the result

Example: evaluate(undefined, "x + y", ["x", "y"], ["a", "b"], ["result"])
  Runs "x + y" where x=lookup("a"), y=lookup("b"), stores result as "result"

## makeUnconfined(workerName, specifier, options?) -> Promise<any>

Load and instantiate an unconfined module (has access to Node.js APIs).
- workerName: Worker to use (undefined for new worker)
- specifier: Module path or URL
- options: Optional object with:
  - powersName: Pet name of the powers to grant (default: '@none')
  - resultName: Pet name or path to store the result
  - env: Environment variables as { KEY: "value" } record

The module's make(powers, context, { env }) function is called.

## makeArchive(workerName, archiveName, options?) -> Promise<any>

Instantiate a module from a source-only ZIP archive (a
`compartment-map.json` plus modules in their original mjs/cjs
sources, with no precompiled module formats).
- workerName: Worker to use (undefined for new worker)
- archiveName: Pet name of the readable blob holding the archive
- options: Optional object with:
  - powersName: Pet name of the powers to grant (default: '@none')
  - resultName: Pet name or path to store the result
  - env: Environment variables as { KEY: "value" } record

The module's make(powers, context, { env }) function is called.
The archive bytes are streamed to the worker and parsed via
`@endo/compartment-mapper`'s `parseArchive`.  The Rust supervisor's
workers read the same archive content directly from the CAS.

## cancel(petNameOrPath, reason?) -> Promise<void>

Cancel a value, triggering cleanup and releasing resources.
Cancellation propagates to dependent values.

## greeter() -> Promise<EndoGreeter>

Get the greeter for accepting network connections.

## gateway() -> Promise<EndoGateway>

Get the gateway for providing values to remote peers.

## getPeerInfo() -> Promise<{node: string, addresses: string[]}>

Get this node's peer information for sharing with others.

## addPeerInfo(peerInfo) -> Promise<void>

Add information about a remote peer.
peerInfo: { node: string, addresses: string[] }

## locateForSharing(...petNamePath) -> Promise<string | undefined>

Locate a formula and return a locator URL with connection hints.
The returned locator includes network addresses from all registered netlayers,
allowing remote peers to connect and access the value.
Example: locateForSharing("my-channel") returns a shareable locator URL.

## adoptFromLocator(locator, petNameOrPath) -> Promise<void>

Adopt a value from a locator that includes connection hints.
Parses the locator to extract peer info, establishes a connection if needed,
and writes the formula ID into the local pet store.
Example: adoptFromLocator("endo://node...?id=...&type=channel&at=...", "remote-channel")

## invite(guestName) -> Promise<Invitation>

Create an invitation for a guest to connect.

## accept(invitationId, guestHandleId, guestName) -> Promise<void>

Accept an invitation, creating a connection.

## endow(messageNumber, bindings, workerName?, resultName?) -> Promise<void>

Bind capabilities to a guest's code definition and evaluate it.
This is the host-side counterpart to the guest's define() method.

- messageNumber: The definition message number
- bindings: Record mapping slot names to pet names, e.g. { counter: "my-counter" }
- workerName: Optional worker to use for evaluation
- resultName: Optional pet name to store the result

The host decides which capabilities to provide for each slot.
The code proposed by the guest runs with these host-chosen bindings.

Example: endow(0, { counter: "my-counter" })

## form(recipientName, description, fields) -> Promise<void>

Send a structured form to another agent.
The form appears in the recipient's inbox. They can submit values using submit().

- recipientName: Pet name or path of the recipient
- description: Human-readable description of what the form is for
- fields: Array of field definitions, e.g. [{ name: "email", label: "Your email" }]

Example: form("@host", "Configure settings", [{ name: "name", label: "Name" }, { name: "email", label: "Email" }])

## submit(messageNumber, values) -> Promise<void>

Submit values for a form message. Each call creates a new value message
in reply to the form, allowing multiple submissions.

- messageNumber: The form message number
- values: Record mapping field names to values, e.g. { name: "Alice" }

Each value must match the pattern specified by the form field (if any).
Fields without explicit patterns default to M.string().

Example: submit(0, { name: "Alice", age: 30 })

## sendValue(messageNumber, petNameOrPath) -> Promise<void>

Reply to any message with a retained value from your pet store.

- messageNumber: The inbox message number to reply to
- petNameOrPath: Pet name (or path) of the value to send

Example: sendValue(0, "my-counter")

## getFormulaGraph() -> Promise<{ nodes, edges }>

Returns a snapshot of the formula dependency graph reachable from
this agent's pet store.

- nodes: Array of { id, type } for each formula
- edges: Array of { sourceId, targetId, label } for each dependency

Used by the Chat inventory graph space to visualize formula relationships.

## readText(petNameOrPath) -> Promise<string>

Read text content by pet name or path.
For a single name, reads the blob's text content.
For a multi-segment path, reads through the mount.
Example: readText(["my-blob"])
Example: readText(["my-mount", "config.json"])

## maybeReadText(petNameOrPath) -> Promise<string | undefined>

Read text content, returning undefined if not found.
Same as readText but returns undefined instead of throwing.

## writeText(petNameOrPath, content) -> Promise<void>

Write text content by pet name or path.
For a single name, creates a ReadableBlob and binds the name.
For a multi-segment path, writes through the mount.
Example: writeText(["my-blob"], "hello")
Example: writeText(["my-mount", "output.txt"], "hello")

# EndoReadable - A readable blob of binary data.

Blobs store binary content with a content-addressed hash.
Use text() to read as a string, json() to parse as JSON,
or streamBase64() for streaming access.

## help(methodName?) -> string

Get documentation for this interface or a specific method.

## sha256() -> string

Get the SHA-256 hash of the blob content.
This is the content address used for storage.

## streamBase64() -> AsyncIterator<string>

Stream the blob content as base64-encoded chunks.
Use for large files to avoid loading everything into memory.

## text() -> Promise<string>

Read the entire blob as a UTF-8 string.

## json() -> Promise<any>

Read and parse the blob as JSON.

# Endo Bootstrap - The root interface for the Endo daemon.

This is the entry point for connecting to Endo.
Use host() to get your host agent with full capabilities,
or leastAuthority() for a minimal confined agent.

## help(methodName?) -> string

Get documentation for this interface or a specific method.

## ping() -> Promise<string>

Check if the daemon is responsive. Returns "pong".

## terminate() -> Promise<void>

Shut down the Endo daemon.

## host() -> Promise<EndoHost>

Get the main host agent with full capabilities.

## leastAuthority() -> Promise<EndoGuest>

Get a minimal guest agent with no special capabilities.
Use for maximum confinement.

## greeter() -> Promise<EndoGreeter>

Get the network greeter for accepting connections.

## gateway() -> Promise<EndoGateway>

Get the network gateway for providing values to peers.

## nodeId() -> string

Get this node's unique identifier.
Used for peer-to-peer communication.

## reviveNetworks() -> Promise<void>

Restore network connections from persisted state.

## revivePins() -> Promise<void>

Restore pinned values from persisted state.

## addPeerInfo(peerInfo) -> Promise<void>

Add information about a remote peer.
peerInfo: { node: string, addresses: string[] }

# ReadableTree - A read-only tree of files and subdirectories.

An immutable directory: entries cannot be added, removed, or modified.
lookup() returns EndoReadable values for files and nested ReadableTree
values for subdirectories.

## help(methodName?) -> string

Get documentation for this interface or a specific method.

## has(...names) -> Promise<boolean>

Check if an entry exists at the given path.
names: string[] - Path segments.
Example: has("index.html") → true
Example: has("assets", "style.css") → true

## list(...names) -> Promise<string[]>

List entry names at the given path (or root).
names: string[] - Path segments (optional, defaults to root).
Example: list() → ["index.html", "app.js", "assets"]
Example: list("assets") → ["style.css", "logo.png"]

## lookup(nameOrPath) -> Promise<EndoReadable | ReadableTree>

Get the value at a name or path.
nameOrPath: string | string[] - Name or path segments.
Returns EndoReadable for files, ReadableTree for subdirectories.
Example: lookup("index.html") → EndoReadable
Example: lookup(["assets", "style.css"]) → EndoReadable

# EndoMount - Live mutable access to a filesystem directory.

All paths are confined to the mount root. Symlinks that escape
the root are invisible. Use readOnly() for an attenuated view.

## help(methodName?) -> string

Get documentation for this interface or a specific method.

## has(...pathSegments) -> Promise<boolean>

Check if a path exists within the mount.
Each argument is one path segment: has("dir", "file.txt").

## list(...pathSegments) -> Promise<string[]>

List directory entries at the given path.
Each argument is one path segment: list("subdir").
Call with no arguments to list the root.
Entries with symlinks escaping the mount root are excluded.

## lookup(path) -> Promise<EndoMount | EndoMountFile>

Resolve a path within the mount.
path: string | string[] — Name or path segments.
Returns EndoMount for directories, EndoMountFile for files.

## readText(path) -> Promise<string>

Read a file as UTF-8 text.
path: string | string[] — Name or path segments.
Throws if the file does not exist.

## maybeReadText(path) -> Promise<string | undefined>

Read a file as UTF-8 text, returning undefined if missing.
path: string | string[] — Name or path segments.

## writeText(path, content) -> Promise<void>

Write UTF-8 text to a file at the given path.
path: string | string[] — Name or path segments.
content: string — Text content to write.
Creates parent directories as needed. Throws if read-only.

## remove(path) -> Promise<void>

Remove a file or empty directory.
path: string | string[] — Name or path segments.

## move(from, to) -> Promise<void>

Rename an entry within the mount.
from: string | string[] — Source name or path segments.
to: string | string[] — Destination name or path segments.

## makeDirectory(path) -> Promise<void>

Create a directory (and missing parents).
path: string | string[] — Name or path segments.

## readOnly() -> EndoMount

Returns a read-only view of this mount.

## snapshot() -> Promise<SnapshotTree>

Capture current state as an immutable readable-tree.
(Not yet implemented.)

# EndoMountFile - A file within a mounted directory.

## help(methodName?) -> string

Get documentation for this interface or a specific method.

## text() -> Promise<string>

Read the file content as a UTF-8 string.

## streamBase64() -> AsyncIterator<string>

Stream the file content as base64 chunks.

## json() -> Promise<any>

Read and parse the file as JSON.

## writeText(content) -> Promise<void>

Write a string to the file. Throws if read-only.

## writeBytes(readableRef) -> Promise<void>

Write bytes from an async iterator. Throws if read-only.

## readOnly() -> EndoMountFile

Returns a read-only view of this file.
