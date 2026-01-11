// @ts-check

/**
 * Help documentation for Endo daemon interfaces.
 *
 * Each help object maps method names to documentation strings.
 * The special key '' (empty string) provides an overview of the interface.
 *
 * Documentation is written to be useful for both human developers and
 * LLM agents that need to understand how to use these capabilities.
 */

/**
 * @typedef {Record<string, string>} HelpText
 */

/** @type {HelpText} */
export const directoryHelp = {
  '': `\
EndoDirectory - A naming hub for managing pet names and references.

A directory maps pet names to formula identifiers (internal references).
Pet names are lowercase strings like "my-worker" or "counter".
Special names are uppercase like "SELF", "HOST", or "AGENT".

Use lookup() to get a value by name, list() to see available names,
and write() to store new references.`,

  help: `\
help(methodName?) -> string
Get documentation for this interface or a specific method.
- help() returns an overview of the interface
- help("lookup") returns documentation for the lookup method`,

  has: `\
has(...petNamePath) -> Promise<boolean>
Check if a pet name exists in this directory.
- has("counter") checks if "counter" exists
- has("subdir", "value") checks if "value" exists in subdirectory "subdir"`,

  identify: `\
identify(...petNamePath) -> Promise<string | undefined>
Get the formula identifier for a pet name path.
Returns undefined if the name doesn't exist.
Formula identifiers are internal references used by Endo.`,

  locate: `\
locate(...petNamePath) -> Promise<string | undefined>
Get a locator string for a pet name path.
Locators include the formula type and can be used for reverse lookups.`,

  reverseLocate: `\
reverseLocate(locator) -> Promise<string[]>
Find all pet names that refer to a given locator.
Returns an array of names (may be empty if no names exist).`,

  followLocatorNameChanges: `\
followLocatorNameChanges(locator) -> AsyncIterator
Subscribe to name changes for a specific locator.
Yields events when names are added or removed for the locator.
Use with for-await-of to receive updates.`,

  list: `\
list(...petNamePath?) -> Promise<string[]>
List all pet names in this directory or a subdirectory.
- list() returns names in this directory
- list("subdir") returns names in the subdirectory "subdir"`,

  listIdentifiers: `\
listIdentifiers(...petNamePath?) -> Promise<string[]>
List all unique formula identifiers in this directory.
Multiple names may refer to the same identifier.`,

  followNameChanges: `\
followNameChanges() -> AsyncIterator
Subscribe to all name changes in this directory.
First yields existing names, then yields diffs as names change.
Use with for-await-of to receive updates.`,

  lookup: `\
lookup(petNameOrPath) -> Promise<any>
Resolve a pet name or path to its value.
- lookup("counter") gets the value named "counter"
- lookup(["subdir", "value"]) gets "value" from subdirectory "subdir"
Throws if the name doesn't exist.`,

  reverseLookup: `\
reverseLookup(value) -> Promise<string[]>
Find all pet names that refer to a given value.
Useful for discovering what names exist for an object you have.`,

  write: `\
write(petNameOrPath, formulaId) -> Promise<void>
Store a formula identifier with a pet name.
- write("my-name", id) stores id as "my-name"
- write(["subdir", "name"], id) stores in a subdirectory
Overwrites any existing value at that name.`,

  remove: `\
remove(...petNamePath) -> Promise<void>
Remove a pet name from this directory.
The underlying value is not deleted, just the name mapping.`,

  move: `\
move(fromPath, toPath) -> Promise<void>
Move/rename a reference from one name to another.
- move(["old-name"], ["new-name"]) renames within this directory
- move(["a"], ["subdir", "b"]) moves to a subdirectory
The original name is removed after the move.`,

  copy: `\
copy(fromPath, toPath) -> Promise<void>
Copy a reference from one name to another.
Both names will refer to the same underlying value.`,

  makeDirectory: `\
makeDirectory(petNamePath) -> Promise<EndoDirectory>
Create a new subdirectory at the given path.
Returns the new directory object.`,
};

/** @type {HelpText} */
export const mailHelp = {
  '': `\
Mail Operations - Send and receive messages between agents.

Messages can be requests (asking for a capability) or packages (sending values).
Each message has a number, sender, recipient, and content.

Use followMessages() to receive messages, send() to send packages,
and request() to ask for capabilities.`,

  handle: `\
handle() -> Handle
Get this agent's mailbox handle.
The handle is used internally for receiving messages.`,

  listMessages: `\
listMessages() -> Promise<Message[]>
List all messages in the inbox.
Each message has: number, date, from, to, type, and content.`,

  followMessages: `\
followMessages() -> AsyncIterator<Message>
Subscribe to incoming messages.
First yields existing messages, then yields new ones as they arrive.
Use with for-await-of:
  for await (const message of E(guest).followMessages()) { ... }`,

  resolve: `\
resolve(messageNumber, petNameOrPath) -> Promise<void>
Respond to a request message by providing a named value.
- resolve(0, "my-counter") responds to message 0 with the value named "my-counter"
The requester receives the resolved value.`,

  reject: `\
reject(messageNumber, reason?) -> Promise<void>
Decline a request message.
- reject(0) declines message 0
- reject(0, "Not available") declines with a reason
The requester receives an error.`,

  adopt: `\
adopt(messageNumber, edgeName, petName) -> Promise<void>
Adopt a value from an incoming package message, giving it a pet name.
- adopt(0, "gift", "my-new-thing") takes "gift" from message 0, names it "my-new-thing"
Edge names are the labels the sender attached to values in the package.`,

  dismiss: `\
dismiss(messageNumber) -> Promise<void>
Remove a message from the inbox.
Use after you've processed a message.`,

  request: `\
request(recipientName, description, responseName?) -> Promise<any>
Send a request to another agent asking for a capability.
- request("HOST", "a counter") asks HOST for "a counter"
- request("HOST", "a counter", "my-counter") also stores the response as "my-counter"
The recipient sees your request and can resolve or reject it.`,

  send: `\
send(recipientName, strings, edgeNames, petNames) -> Promise<void>
Send a package message with values to another agent.
- strings: Text fragments that form the message
- edgeNames: Labels for the values being sent
- petNames: Names of values to include

Example: send("HOST", ["Here is ", " for you"], ["gift"], ["my-counter"])
  Sends: "Here is @gift for you" where @gift refers to "my-counter"`,

  deliver: `\
deliver(message) -> void
Internal method to deliver a message to this mailbox.
Typically not called directly by users.`,
};

/** @type {HelpText} */
export const guestHelp = {
  '': `\
EndoGuest - A confined agent with directory and mail capabilities.

A guest can:
- Manage pet names for values (directory operations)
- Send and receive messages (mail operations)
- Request capabilities from its host

Special names available:
- SELF: This guest's own handle
- HOST: The host that created this guest
- AGENT: This guest's formula identifier

Use help("methodName") for details on specific methods.`,

  help: `\
help(methodName?) -> string
Get documentation for this interface or a specific method.
- help() returns an overview of the guest capabilities
- help("request") returns documentation for the request method
- help("send") returns documentation for send method`,

  reverseIdentify: `\
reverseIdentify(formulaId) -> string[]
Find all pet names that refer to a given formula identifier.
Synchronous version of reverse lookup by identifier.`,

  // Directory operations inherit from directoryHelp
  // Mail operations inherit from mailHelp
};

/** @type {HelpText} */
export const hostHelp = {
  '': `\
EndoHost - A privileged agent with full Endo capabilities.

A host has all guest capabilities plus:
- Create workers for running code
- Evaluate JavaScript code
- Create confined guests
- Store blobs and values
- Make unconfined or bundled caplets
- Manage network peers

Use help("methodName") for details on specific methods.`,

  help: `\
help(methodName?) -> string
Get documentation for this interface or a specific method.
- help() returns an overview of the host capabilities
- help("evaluate") returns documentation for code evaluation`,

  storeBlob: `\
storeBlob(readerRef, petName) -> Promise<EndoReadable>
Store binary data as a blob with a pet name.
- readerRef: An async iterator yielding base64-encoded strings
- petName: Name to store the blob under
Returns a readable blob reference.`,

  storeValue: `\
storeValue(value, petNameOrPath) -> Promise<void>
Store a passable value (number, string, array, record, etc.) with a name.
- storeValue(42, "answer") stores the number 42
- storeValue({x: 1, y: 2}, "point") stores a record`,

  provideGuest: `\
provideGuest(petName?, options?) -> Promise<EndoGuest>
Create or retrieve a confined guest agent.
- provideGuest() creates an anonymous guest
- provideGuest("my-guest") creates/retrieves a named guest
Options: { introducedNames: { guestName: hostName } }`,

  provideHost: `\
provideHost(petName?, options?) -> Promise<EndoHost>
Create or retrieve another host agent.
- provideHost() creates an anonymous host
- provideHost("my-host") creates/retrieves a named host`,

  provideWorker: `\
provideWorker(petNamePath) -> Promise<EndoWorker>
Create or retrieve a worker for running code.
Workers are isolated JavaScript environments.`,

  evaluate: `\
evaluate(workerName, source, codeNames, petNames, resultName?) -> Promise<any>
Evaluate JavaScript code in a worker with named endowments.
- workerName: Worker to use (undefined for new worker)
- source: JavaScript code string
- codeNames: Names visible in the code
- petNames: Pet names providing values for those names
- resultName: Optional name to store the result

Example: evaluate(undefined, "x + y", ["x", "y"], ["a", "b"], ["result"])
  Runs "x + y" where x=lookup("a"), y=lookup("b"), stores result as "result"`,

  makeUnconfined: `\
makeUnconfined(workerName, specifier, powersName, resultName?) -> Promise<any>
Load and instantiate an unconfined module (has access to Node.js APIs).
- workerName: Worker to use (undefined for new worker)
- specifier: Module path or URL
- powersName: Pet name of the powers object to provide
- resultName: Optional name to store the result`,

  makeBundle: `\
makeBundle(workerName, bundleName, powersName, resultName?) -> Promise<any>
Instantiate a pre-bundled module.
- workerName: Worker to use (undefined for new worker)
- bundleName: Pet name of the bundle
- powersName: Pet name of the powers object to provide
- resultName: Optional name to store the result`,

  cancel: `\
cancel(petNameOrPath, reason?) -> Promise<void>
Cancel a value, triggering cleanup and releasing resources.
Cancellation propagates to dependent values.`,

  greeter: `\
greeter() -> Promise<EndoGreeter>
Get the greeter for accepting network connections.`,

  gateway: `\
gateway() -> Promise<EndoGateway>
Get the gateway for providing values to remote peers.`,

  getPeerInfo: `\
getPeerInfo() -> Promise<{node: string, addresses: string[]}>
Get this node's peer information for sharing with others.`,

  addPeerInfo: `\
addPeerInfo(peerInfo) -> Promise<void>
Add information about a remote peer.
peerInfo: { node: string, addresses: string[] }`,

  invite: `\
invite(guestName) -> Promise<Invitation>
Create an invitation for a guest to connect.`,

  accept: `\
accept(invitationId, guestHandleId, guestName) -> Promise<void>
Accept an invitation, creating a connection.`,
};

/** @type {HelpText} */
export const blobHelp = {
  '': `\
EndoReadable - A readable blob of binary data.

Blobs store binary content with a content-addressed hash.
Use text() to read as a string, json() to parse as JSON,
or streamBase64() for streaming access.`,

  help: `\
help(methodName?) -> string
Get documentation for this interface or a specific method.`,

  sha512: `\
sha512() -> string
Get the SHA-512 hash of the blob content.
This is the content address used for storage.`,

  streamBase64: `\
streamBase64() -> AsyncIterator<string>
Stream the blob content as base64-encoded chunks.
Use for large files to avoid loading everything into memory.`,

  text: `\
text() -> Promise<string>
Read the entire blob as a UTF-8 string.`,

  json: `\
json() -> Promise<any>
Read and parse the blob as JSON.`,
};

/** @type {HelpText} */
export const endoHelp = {
  '': `\
Endo Bootstrap - The root interface for the Endo daemon.

This is the entry point for connecting to Endo.
Use host() to get your host agent with full capabilities,
or leastAuthority() for a minimal confined agent.`,

  help: `\
help(methodName?) -> string
Get documentation for this interface or a specific method.`,

  ping: `\
ping() -> Promise<string>
Check if the daemon is responsive. Returns "pong".`,

  terminate: `\
terminate() -> Promise<void>
Shut down the Endo daemon.`,

  host: `\
host() -> Promise<EndoHost>
Get the main host agent with full capabilities.`,

  leastAuthority: `\
leastAuthority() -> Promise<EndoGuest>
Get a minimal guest agent with no special capabilities.
Use for maximum confinement.`,

  greeter: `\
greeter() -> Promise<EndoGreeter>
Get the network greeter for accepting connections.`,

  gateway: `\
gateway() -> Promise<EndoGateway>
Get the network gateway for providing values to peers.`,

  nodeId: `\
nodeId() -> string
Get this node's unique identifier.
Used for peer-to-peer communication.`,

  reviveNetworks: `\
reviveNetworks() -> Promise<void>
Restore network connections from persisted state.`,

  revivePins: `\
revivePins() -> Promise<void>
Restore pinned values from persisted state.`,

  addPeerInfo: `\
addPeerInfo(peerInfo) -> Promise<void>
Add information about a remote peer.
peerInfo: { node: string, addresses: string[] }`,
};

/**
 * Create a help function that looks up documentation.
 *
 * @param {HelpText} helpText - The help text object
 * @param {HelpText[]} [fallbacks] - Additional help texts to search
 * @returns {(methodName?: string) => string}
 */
export const makeHelp = (helpText, fallbacks = []) => {
  /**
   * @param {string} [methodName]
   * @returns {string}
   */
  const help = (methodName = '') => {
    if (methodName in helpText) {
      return helpText[methodName];
    }
    for (const fallback of fallbacks) {
      if (methodName in fallback) {
        return fallback[methodName];
      }
    }
    if (methodName === '') {
      return 'No documentation available for this interface.';
    }
    return `No documentation available for method "${methodName}".`;
  };
  return help;
};
