# Weblet Applications from Zip Archives

| | |
|---|---|
| **Date** | 2026-02-25 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

Weblets today are installed from bundles — JavaScript evaluated in a worker
that programmatically constructs HTTP and WebSocket handlers. This works for
developer-authored server-side logic, but it does not accommodate the common
case of a **static web application** (HTML, CSS, JavaScript, images) that
should simply be served as files and optionally connect back to the daemon
for capabilities via CapTP.

The `kriskowal-zip-compression` branch adds DEFLATE support to `@endo/zip`,
making it practical to store complete web application archives as zip files
within the daemon's content-addressed storage. What's missing is:

1. A **formula for a readable tree** — a transitively read-only directory
   of blobs and sub-trees, using the daemon's existing `EndoDirectory` and
   `EndoReadable` interfaces.
2. A **zip extraction operation** — that decompresses a zip archive into
   `readable-blob` formulas and organizes them into a `readable-tree`.
3. A **formula for a weblet** — combining a readable tree with a powers
   reference so the gateway can serve the tree's files on a virtual host
   while making the associated capabilities available over CapTP.
4. **Gateway integration** — the unified weblet server serves files from
   the readable tree with inferred content types, and handles CapTP
   connections over `MessagePort` (iframe) or WebSocket (external browser).
5. **Chat and CLI verbs** — so users can create the full chain (handle,
   guest, content, weblet) and open the weblet in an iframe without manual
   plumbing.

This design builds on `familiar-unified-weblet-server` (virtual host
routing), `familiar-chat-weblet-hosting` (iframe hosting in Chat), and the
zip compression work on the `kriskowal-zip-compression` branch.

## Prerequisites

### Merge `kriskowal-zip-compression`

The `kriskowal-zip-compression` branch adds DEFLATE compression and
decompression to `@endo/zip` via a pluggable "bring your own compressor"
architecture. It introduces:

- `zip/deflate` and `zip/inflate` using the Web `CompressionStream` /
  `DecompressionStream` APIs.
- Updated `ZipWriter` and `ZipReader` with async `set()` / `get()` methods
  for compressed archives.
- CRC-32 integrity checking.
- Backward compatibility — uncompressed archives work unchanged.

This branch should be merged to `master` before implementation begins.

## Description of the Design

### Building on existing daemon abstractions

Rather than introducing new file node or directory node interfaces, this
design composes the daemon's two existing content abstractions:

- **`EndoReadable`** (`BlobInterface`) — `text()`, `json()`,
  `streamBase64()`, `sha256()`. Already used for `readable-blob` formulas.
  Any code that reads a blob can read a file from a readable tree without
  adaptation.

- **`EndoDirectory`** (`DirectoryInterface`) — `has()`, `list()`,
  `lookup()`, `write()`, `remove()`, etc. Already used for the pet-name
  directory tree. The read methods (`has`, `list`, `lookup`) are the
  navigation surface; the write methods (`write`, `remove`, `move`, `copy`,
  `makeDirectory`) are the mutation surface.

A `readable-tree` is a directory that is transitively read-only: its
`lookup()` returns `EndoReadable` values for files and nested
`readable-tree` values for subdirectories. The mutation methods are absent
from the interface — not present-but-throwing, but structurally absent.
This is the same relationship that `EndoReadable` has to a hypothetical
writable blob: the write surface simply doesn't exist.

### New formula: `readable-tree`

A `readable-tree` formula represents an immutable, transitively read-only
directory. Its entries are references to other formulas — `readable-blob`
for files, nested `readable-tree` for subdirectories.

#### Formula shape

```typescript
type ReadableTreeFormula = {
  type: 'readable-tree';
  entries: Record<string, FormulaIdentifier>;
};
```

Each key in `entries` is a name (single path segment, no `/` or `..`).
Each value is the formula identifier of either a `readable-blob` or
another `readable-tree`.

#### Incarnated interface

The readable tree exposes a **subset of the `EndoDirectory` interface** —
the read methods only:

```js
const ReadableTreeI = M.interface('ReadableTree', {
  has: M.call().rest(NamePathShape).returns(M.promise()),
  list: M.call().rest(NamePathShape).returns(M.promise()),
  lookup: M.call(NameOrPathShape).returns(M.promise()),
  help: M.call().optional(M.string()).returns(M.string()),
});
```

- `has(...petNamePath)` — returns whether the tree contains an entry at
  the given path. Supports multi-segment paths that traverse nested
  readable trees, matching `EndoDirectory.has()` semantics.
- `list(...petNamePath)` — returns entry names at the given path (or the
  root if no path). Supports multi-segment paths, matching
  `EndoDirectory.list()` semantics.
- `lookup(petNamePath)` — returns the value at the given name or path.
  For files, returns an `EndoReadable`. For subdirectories, returns
  another readable tree. Supports single names or arrays of path
  segments, and chains through nested readable trees via `E()`, matching
  `EndoDirectory.lookup()` semantics.
- `help()` — returns a description of the capability.

The `lookup()` implementation mirrors the existing directory's:

```js
const lookup = petNamePath => {
  const namePath = namePathFrom(petNamePath);
  const [headName, ...tailNames] = namePath;

  if (!entries[headName]) {
    throw new TypeError(`Unknown name: ${q(headName)}`);
  }
  const value = provide(entries[headName]);
  return tailNames.reduce(
    (hub, name) => E(hub).lookup(name),
    value,
  );
};
```

Multi-segment lookups chain through nested readable trees exactly as
`EndoDirectory.lookup()` chains through nested directories. Code that
navigates a directory tree with `E(dir).lookup(['a', 'b', 'c'])` can
navigate a readable tree with the same call.

#### What is absent

The readable tree does **not** expose:

- `write()`, `remove()`, `move()`, `copy()`, `makeDirectory()` — mutation
  methods. The tree is immutable.
- `identify()`, `locate()`, `reverseLocate()`, `listIdentifiers()` —
  formula identity methods. These are tied to the pet store system and
  the daemon's formula identifier scheme. The readable tree stores
  formula identifiers internally but does not expose them to callers;
  callers navigate by name and receive values, not identifiers.
- `followNameChanges()`, `followLocatorNameChanges()` — change
  notification methods. The tree is immutable, so there are no changes
  to follow.
- `reverseLookup()` — reverse lookup by value. Not meaningful for a
  static tree of blobs.

If any of these methods become needed in the future (e.g., exposing
formula identifiers for sharing individual files), they can be added
without breaking the existing interface.

#### help() text

```js
help() {
  return `\
ReadableTree provides read-only access to a tree of files.
It is an immutable directory: entries cannot be added, removed, or
modified. Its lookup() returns EndoReadable values for files and
nested ReadableTree values for subdirectories.

Methods:
  has(...names) - Check if an entry exists at the given path.
    names: string[] - Path segments.
    Returns: boolean
    Example: has("index.html") → true
    Example: has("assets", "style.css") → true

  list(...names) - List entry names at the given path (or root).
    names: string[] - Path segments (optional, defaults to root).
    Returns: string[]
    Example: list() → ["index.html", "app.js", "assets"]
    Example: list("assets") → ["style.css", "logo.png"]

  lookup(nameOrPath) - Get the value at a name or path.
    nameOrPath: string | string[] - Name or path segments.
    Returns: EndoReadable (for files) or ReadableTree (for subdirs)
    The returned EndoReadable has the standard blob interface:
      value.text()         → Promise<string>  (UTF-8 text)
      value.json()         → Promise<any>     (parsed JSON)
      value.streamBase64() → AsyncIterator<string> (base64 chunks)
      value.sha256()       → string           (content hash)
    Example:
      const file = await E(tree).lookup("index.html");
      const html = await E(file).text();
    Example (nested):
      const css = await E(tree).lookup(["assets", "style.css"]);
      const text = await E(css).text();

  help() - Returns this description.`;
}
```

#### Relationship to EndoDirectory

`ReadableTree` is a **proper subset** of `EndoDirectory`. Any code that
uses only `has()`, `list()`, and `lookup()` on a directory will work
unchanged with a readable tree. The method signatures and traversal
semantics are identical.

This means the readable tree is duck-type compatible with the read surface
of `EndoDirectory`. A function typed as accepting a "thing I can look up
names in" can receive either:

```js
// Works with both EndoDirectory and ReadableTree
const readFile = async (hub, ...path) => {
  const readable = await E(hub).lookup(path);
  return E(readable).text();
};
```

The relationship is:

```
EndoDirectory (has, list, lookup, write, remove, move, copy, makeDirectory, ...)
     ↑ superset
ReadableTree  (has, list, lookup)
```

#### Relationship to the capability filesystem

The `daemon-capability-filesystem.md` design proposed `Dir` and `File`
interfaces with methods like `readText()`, `readBytes()`, `openDir()`,
`openFile()`, and separate control facets. The readable tree offers a
simpler path to the same goal:

- **No new file interface.** Files are `EndoReadable` — the same
  interface used for blobs throughout the daemon. Code that reads blobs
  can read files from a readable tree without adaptation. The
  `daemon-capability-filesystem.md` proposal for `readText()` /
  `readBytes()` on `File` is unnecessary when `text()` and
  `streamBase64()` already exist on `EndoReadable`.

- **No new directory interface.** The readable tree uses `has()`,
  `list()`, `lookup()` — the same methods as `EndoDirectory`. The
  `daemon-capability-filesystem.md` proposal for `openDir()` /
  `openFile()` is unnecessary when `lookup()` already returns the
  appropriate type (readable or tree) based on what the entry is.

- **No control facet needed.** The readable tree is immutable by
  construction. The caretaker pattern from
  `daemon-capability-filesystem.md` applies to mutable filesystems but
  is unnecessary here — there is no write authority to revoke.

- **VFS backend compatibility.** A readable tree can serve as a read-only
  backend in the VFS namespace, mounted alongside mutable backends:

  ```js
  const vfs = makeVirtualFs({ policy: rootedPolicy });
  vfs.mount(['app'], readableTree);
  vfs.mount(['data'], physicalBackend('/home/user/project/data'));
  ```

  The VFS layer would wrap both backends in a uniform `Dir` / `File`
  interface if needed, but code that only navigates and reads can use the
  readable tree directly.

When a mutable filesystem capability is needed (physical backend, memory
backend), it would extend the readable tree pattern by adding mutation
methods and a writer facet — the same `EndoDirectory` pattern of
`write()`, `remove()`, `makeDirectory()`, applied to file content rather
than pet-name bindings.

### Zip extraction operation

Extracting a zip archive into a readable tree is a daemon operation, not
a formula type. The operation takes a `readable-blob` containing zip
archive bytes and produces:

1. A `readable-blob` formula for each file entry in the archive.
2. Nested `readable-tree` formulas for each directory level.
3. A root `readable-tree` formula that the user names.

#### Extraction process

```js
const extractZipToReadableTree = async (
  zipBlobId,
  formulateReadableBlob,
  formulateReadableTree,
) => {
  // 1. Read the zip archive
  const zipBlob = await provide(zipBlobId);
  const zipBytes = await E(zipBlob).streamBase64();
  // ... decode base64, collect into Uint8Array ...

  // 2. Parse with ZipReader (with inflate for DEFLATE entries)
  const reader = new ZipReader(zipBytes, { inflate });

  // 3. Build a tree structure from the flat zip entries
  //    { 'index.html': blobId, 'assets': { 'style.css': blobId } }
  const tree = {};
  for (const path of reader.list()) {
    const segments = path.split('/');
    const fileName = segments.pop();
    if (!fileName) continue; // skip directory-only entries

    // Navigate/create intermediate tree nodes
    let node = tree;
    for (const segment of segments) {
      if (!node[segment]) node[segment] = {};
      node = node[segment];
    }

    // Store the decompressed content as a readable-blob
    const content = await reader.get(path);
    const { id: blobId } = await formulateReadableBlob(content);
    node[fileName] = blobId;
  }

  // 4. Build readable-tree formulas bottom-up
  const buildTree = async subtree => {
    const entries = {};
    for (const [name, value] of Object.entries(subtree)) {
      if (typeof value === 'string') {
        // FormulaIdentifier — already a blob
        entries[name] = value;
      } else {
        // Nested object — recurse to create a sub-tree formula
        const { id: subTreeId } = await buildTree(value);
        entries[name] = subTreeId;
      }
    }
    return formulateReadableTree(entries);
  };

  return buildTree(tree);
};
```

Each file in the archive becomes an independent `readable-blob` formula,
content-addressed by SHA-256. Identical files across archives (or files
already stored in the daemon) are deduplicated automatically by the
content store.

#### Formula count

For a typical web application with N files across M directory levels, the
extraction creates:

- N `readable-blob` formulas (one per file, deduplicated by content hash).
- M+1 `readable-tree` formulas (one per directory level, including root).

For a small app (20 files, 3 directory levels), that's ~24 formulas. For
a large app (200 files, 10 levels), ~211 formulas. The daemon routinely
manages hundreds of formulas; this is not a scaling concern.

#### Dependency tracking

The `readable-tree` formula's dependencies for garbage collection are
the formula identifiers in its `entries` record:

```js
case 'readable-tree':
  return Object.values(formula.entries);
```

When the root readable tree is garbage-collected (no pet name references
it), the entire sub-tree and its blobs become eligible for collection —
unless individual blobs are also referenced by other names.

### New formula: `readable-tree-weblet`

A `readable-tree-weblet` formula combines a `readable-tree` reference
with a powers reference (typically a `guest` or `host` formula). When
incarnated, the gateway serves the tree's files on a virtual host and
provides a CapTP connection to the associated powers.

#### Formula shape

```typescript
type ReadableTreeWebletFormula = {
  type: 'readable-tree-weblet';
  content: FormulaIdentifier;
  powers: FormulaIdentifier;
  handle: FormulaIdentifier;
};
```

- `content` — a `readable-tree` formula providing the static files.
- `powers` — a `guest` (or `host`) formula providing the CapTP bootstrap.
- `handle` — the handle for the weblet, used to derive the access token.

#### Incarnated interface

```js
const ReadableTreeWebletI = M.interface('ReadableTreeWeblet', {
  getLocation: M.call().returns(M.string()),
  getContent: M.call().returns(M.remotable('ReadableTree')),
  getPowers: M.call().returns(M.remotable('EndoGuest')),
  help: M.call().optional(M.string()).returns(M.string()),
});
```

- `getLocation()` — returns the URL for accessing the weblet. The format
  depends on which isolation mode is active (see below).
- `getContent()` — returns the `ReadableTree` reference.
- `getPowers()` — returns the powers reference.
- `help()` — returns a description of the capability.

#### Gateway isolation modes

The gateway supports two isolation modes for weblets. Both guarantee a
stable, isolated origin. The weblet formula does not choose the mode —
it provides `respond` and `connect` handlers, and the gateway
infrastructure decides how to route to them.

##### Mode A: Virtual host on the unified server

The weblet registers its handlers in the unified server's
`webletHandlers` map, keyed by an **access token** derived from the
weblet's formula identifier:

```js
const accessToken = webletId.slice(0, 32);

webletHandlers.set(accessToken, { respond, connect });
```

Incoming HTTP requests are routed by extracting the `Host` header:

```js
const { host } = req.headers;
const hostname = host && new URL(`http://${host}`).hostname;
const handlers = hostname ? webletHandlers.get(hostname) : undefined;
```

In Familiar (Electron), the custom protocol handler sends the bare
access token as the `Host` header, so requests to
`localhttp://<accessToken>/path` are routed to the correct weblet.
The weblet's location is:

```
localhttp://<accessToken>
```

This mode is used when no dedicated port is requested. Origin isolation
comes from each weblet having a distinct hostname in the `Host` header.

##### Mode B: Dedicated port on 127.0.0.1

The weblet gets its own HTTP server listening on `127.0.0.1` at an
OS-assigned port. The access token is embedded in the URL path:

```js
const portStarted = servePortHttp({
  port: requestedPort, // 0 for OS-assigned
  host: '127.0.0.1',
  respond,
  connect,
  cancelled,
});
```

The weblet's location is:

```
http://127.0.0.1:<port>/<accessToken>/
```

This mode is used for standalone development without Familiar (e.g.,
`endo install` + `endo open`). Origin isolation comes from each weblet
having a distinct port on the loopback interface. The access token in
the path prevents accidental cross-weblet access if ports are reused.

#### Request handling

Both modes delegate to the same `respond` and `connect` handlers. The
handler navigates the readable tree to serve files:

```js
const respond = async request => {
  // Parse the request path into segments.
  // In dedicated-port mode, the gateway strips the accessToken prefix
  // before passing the request to the handler.
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const segments = pathname.split('/').filter(s => s !== '');

  // Default to index.html
  if (segments.length === 0 || pathname.endsWith('/')) {
    segments.push('index.html');
  }

  // Navigate the readable tree
  const has = await E(readableTree).has(...segments);
  if (!has) {
    return harden({ status: 404, headers: {}, content: 'Not Found' });
  }

  const readable = await E(readableTree).lookup(segments);
  const contentType = inferContentType(segments[segments.length - 1]);
  const reader = E(readable).streamBase64();
  return harden({
    status: 200,
    headers: { 'content-type': contentType },
    content: reader,
  });
};

const connect = (connection, _request) => {
  // Set up CapTP with the weblet's powers as bootstrap
  makeCapTPConnection(connection, powers);
};
```

The gateway navigates the readable tree using `has()` and `lookup()` —
the same methods it would use on an `EndoDirectory`. It reads file
content via `streamBase64()` — the same method it would use on any
`EndoReadable`. No special-purpose serving code is needed.

#### Content type inference

The gateway infers content types from file extensions. A minimal mapping
covers the common cases for web applications:

```js
const contentTypes = harden({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
});

const inferContentType = fileName => {
  const ext = fileName.slice(fileName.lastIndexOf('.'));
  return contentTypes[ext] || 'application/octet-stream';
};
```

### CapTP connection via MessagePort

When the weblet is hosted in an iframe within Chat (the Familiar
Electron shell or a browser tab), the CapTP connection can be established
over a `MessagePort` instead of a WebSocket. This avoids a network
round-trip and works within the same origin.

#### Protocol

1. **Chat (host frame)** creates a `MessageChannel`, yielding `port1`
   and `port2`.
2. **Chat** transfers `port2` to the weblet iframe via
   `iframe.contentWindow.postMessage({ type: 'endo:connect', port }, '*', [port])`.
3. **Weblet JS** listens for the `message` event, receives `port2`,
   and establishes CapTP over the port.
4. **Chat** hands `port1` to the gateway's connection handler, which
   sets up the server side of the CapTP session with the weblet's
   powers as the bootstrap.

#### Weblet-side bootstrap

The weblet includes a small bootstrap script (either inlined or
loaded from the zip archive) that initiates the CapTP connection:

```js
// In the weblet's entry point
window.addEventListener('message', event => {
  if (event.data?.type !== 'endo:connect') return;
  const port = event.ports[0];
  if (!port) return;

  // Wrap the MessagePort as a CapTP-compatible stream
  const { getBootstrap, dispatch } = makeCapTP('app', {
    send: msg => port.postMessage(msg),
  });
  port.onmessage = event => dispatch(event.data);
  port.start();

  // Use the bootstrap to get powers
  const powers = getBootstrap();
  // Weblet logic begins here
  make(powers);
});
```

#### WebSocket fallback

When the weblet is opened in an external browser tab (not inside
an iframe), the MessagePort protocol is not available. The weblet
falls back to a WebSocket connection to its virtual host:

```js
// Attempt MessagePort first, fall back to WebSocket
let connected = false;

window.addEventListener('message', event => {
  if (event.data?.type !== 'endo:connect') return;
  connected = true;
  // ... MessagePort CapTP as above
});

// If no MessagePort arrives within a frame, try WebSocket
setTimeout(() => {
  if (connected) return;
  const ws = new WebSocket(`ws://${location.host}/`);
  // ... WebSocket CapTP
}, 100);
```

### Chat and CLI verbs

Creating a running weblet requires assembling several formulas:
a handle for the weblet's identity, a guest for its powers, the
readable tree for its files, and the weblet formula that ties them
together. The chat and CLI should provide verbs that orchestrate this.

#### Verb: `mkweblet`

A single verb that extracts a zip archive, creates all required formulas,
and returns the weblet's location.

**CLI:**

```
endo mkweblet <zip-pet-name> [--as <weblet-name>] [--powers <level>]
```

- `<zip-pet-name>` — pet name of an existing `readable-blob` containing
  a zip archive.
- `--as <weblet-name>` — pet name for the weblet (defaults to
  `<zip-pet-name>-weblet`).
- `--powers <level>` — power level for the guest: `NONE` (default),
  `ENDO`, `HOST`, or a comma-separated list of pet names to endow.

**Chat command:**

```
/mkweblet <zip-pet-name> [--as <weblet-name>] [--powers <level>]
```

#### Orchestration steps

The `mkweblet` verb performs the following steps:

```js
const mkweblet = async (agent, zipPetName, webletPetName, powers) => {
  // 1. Create a handle for the weblet
  const handlePetName = `${webletPetName}-handle`;
  await E(agent).provideHandle(handlePetName);

  // 2. Create a guest for the weblet's powers
  const guestPetName = `${webletPetName}-guest`;
  await E(agent).provideGuest(handlePetName, {
    agentName: guestPetName,
    introducedNames: powers,
  });

  // 3. Extract the zip into a readable tree
  const contentPetName = `${webletPetName}-content`;
  await E(agent).extractZip(contentPetName, zipPetName);

  // 4. Create the readable-tree-weblet formula
  await E(agent).provideReadableTreeWeblet(webletPetName, {
    handleName: handlePetName,
    contentName: contentPetName,
    powersName: guestPetName,
  });

  // 5. Return the weblet's location
  const weblet = await E(agent).lookup(webletPetName);
  const location = await E(weblet).getLocation();
  return location;
};
```

Each step creates a named formula that the user can inspect and manage
through the inventory. The intermediate names (`-handle`, `-guest`,
`-content`) follow the convention of suffixed pet names for
sub-components of a composite formula.

#### Verb: `open`

Opens a weblet in Chat's weblet pane or in the default browser.

**CLI:**

```
endo open <weblet-name>
```

In the CLI, this opens the weblet's location URL in the default browser.

**Chat command:**

```
/open <weblet-name>
```

In Chat, `/open` partitions the transcript area to add a **weblet pane**
to the right of the chat transcript. The weblet pane contains an iframe
whose `src` is set to the weblet's location URL. The division between
transcript and weblet pane is **manually resizable** by dragging the
divider.

```
┌──────────────┬───┬─────────────┬──────────────────────────┐
│  Inventory   │   │ [× my-app ] │                          │
│  ──────────  ├───┴─────────────┤                          │
│  Handles     │                 │                          │
│  Hubs        │   Transcript    │     Weblet iframe        │
│  Everything  │                 │                          │
│              │   messages...   │                          │
│              │                ←┼→  (resizable divider)    │
│              │                 │                          │
│              │                 │                          │
│              ├─────────────────┤                          │
│              │ > /open my-app  │                          │
└──────────────┴─────────────────┴──────────────────────────┘
```

##### Chrome/weblet barrier

The close control for the weblet pane appears as a **tab above the
transcript**, not inside the weblet iframe. This is a deliberate
chrome/weblet barrier: the close tab is part of Chat's trusted UI
chrome, rendered by the host frame, so the weblet cannot obscure,
relocate, or impersonate it. The user can always identify and dismiss
the weblet regardless of what the weblet renders in its iframe.

The tab displays the weblet's pet name (e.g., `[× my-app]`) and sits
at the top of the transcript column, above the message area. Clicking
the `×` closes the weblet pane, removes the iframe, and restores the
transcript to full width. The tab is always visible when a weblet is
open — it cannot be scrolled away or covered by transcript content.

This prevents a class of UI deception attacks where a weblet renders
fake chrome (fake close buttons, fake address bars, fake Chat UI) to
trick the user into interacting with the weblet when they believe they
are interacting with Chat. The invariant is: **anything above the
weblet iframe boundary is Chat chrome, and the user can trust it.**

##### Multiple weblets

Only one weblet pane is open at a time. Opening a second weblet
replaces the first. The tab updates to show the new weblet's pet name.
To return to a previous weblet, the user runs `/open` again.

A future extension could support multiple weblet tabs (like browser
tabs above the pane), but this is deferred to keep the initial
implementation simple.

#### Host interface additions

The host (and guest) interface gains new methods:

```js
// On EndoHost / agent
extractZip: M.call(M.string(), M.string())
  .returns(M.promise(M.undefined())),
  // (treePetName, blobPetName) → void
  // Extracts a zip blob into a readable tree.

provideReadableTreeWeblet: M.call(M.string(), M.splitRecord({
    handleName: M.string(),
    contentName: M.string(),
    powersName: M.string(),
  }))
  .returns(M.promise(M.undefined())),
  // (webletPetName, { handleName, contentName, powersName }) → void
```

### Uploading zip archives

Before `mkweblet` can be used, the user needs a zip archive in their
inventory. The existing `endo store` verb handles this:

```
endo store --as my-app < ./dist.zip
```

Or, for Chat:

```
/store my-app (with file attachment)
```

The stored blob is a `readable-blob` formula. The `mkweblet` verb takes
this blob's pet name and extracts it into a `readable-tree`.

### Affected packages

- `packages/daemon` — new `readable-tree` and `readable-tree-weblet`
  formula types, formula-type registry, daemon maker functions, host
  interface additions, zip extraction operation.
- `packages/daemon/src/web-server-node.js` — gateway static file serving
  from readable tree, CapTP connection handler for weblets.
- `packages/cli` — `mkweblet` and `open` commands.
- `packages/chat` — `/mkweblet` and `/open` commands, weblet pane with
  resizable divider, chrome/weblet close tab, MessagePort CapTP bridge
  for iframe hosting.
- `packages/zip` — dependency (already exists, needs
  `kriskowal-zip-compression` merge).

### Dependencies

- **kriskowal-zip-compression** — `@endo/zip` DEFLATE support (merge
  prerequisite).
- **familiar-unified-weblet-server** — virtual host routing on the
  gateway (the weblet formula registers handlers with the unified
  server).
- **familiar-chat-weblet-hosting** — iframe panel in Chat (the `/open`
  command displays the weblet in Chat's iframe).

## Security Considerations

- **Readable trees are immutable.** Once a `readable-tree` formula is
  created, its entries cannot change. The underlying `readable-blob`
  formulas are also immutable. This prevents time-of-check/time-of-use
  attacks where served content changes after inspection.

- **Path traversal prevention.** The `readable-tree` formula stores
  entries by single-segment name. Multi-segment lookup chains through
  nested readable trees via `E()`, the same mechanism as
  `EndoDirectory.lookup()`. There is no path string parsing that could
  be exploited — each segment is a direct key lookup in the `entries`
  record.

- **Content type inference is conservative.** Unknown extensions default
  to `application/octet-stream`, which browsers will not execute as
  script. The inferred types are based solely on the file extension,
  not on content sniffing, to avoid MIME confusion attacks.

- **Guest isolation.** Each weblet's CapTP session bootstraps with
  the weblet's own guest powers. The guest can only access capabilities
  explicitly endowed by the host user. The `NONE` power level provides
  a fully sandboxed weblet with no daemon access.

- **Chrome/weblet barrier.** The weblet close tab is rendered by Chat's
  host frame, above the iframe boundary. The weblet cannot obscure,
  relocate, or impersonate the close control. This prevents UI deception
  attacks where a weblet renders fake chrome to trick the user.

- **MessagePort CapTP isolation.** The MessagePort is created by Chat
  and transferred to the iframe. The weblet cannot discover or access
  MessagePorts belonging to other weblets or to Chat itself. The CapTP
  session over the port is bound to the weblet's powers.

- **Origin isolation.** Each weblet has a stable, isolated origin. In
  unified-server mode, each weblet has a distinct hostname in the `Host`
  header (the access token). In dedicated-port mode, each weblet has its
  own port on `127.0.0.1`. Both modes prevent cross-weblet cookie,
  localStorage, and DOM access.

- **No ambient network access.** Weblets served from readable trees
  have no inherent network capabilities. Network access requires an
  explicit capability grant through the guest's powers.

- **Zip bomb mitigation.** The extraction operation decompresses each
  entry individually and stores it as a `readable-blob`. The content
  store can enforce size limits per blob. Deeply nested directory
  structures in the zip are bounded by the finite number of entries
  in the archive.

## Scaling Considerations

- **Extraction is a one-time cost.** The zip is decompressed and stored
  as blobs during extraction. Subsequent HTTP requests read from the
  content store, not from the zip.

- **Content deduplication.** Files stored as `readable-blob` formulas
  are content-addressed by SHA-256. Identical files across multiple
  weblets (e.g., shared libraries, common assets) are stored once.

- **Formula count.** A typical web application produces tens to low
  hundreds of formulas (one `readable-blob` per file, one
  `readable-tree` per directory level). The daemon routinely manages
  this many formulas.

- **Concurrent weblets.** Each weblet registers a handler in the unified
  server's `webletHandlers` map (O(1) lookup). Concurrent weblets share
  the same HTTP server socket.

## Test Plan

- **Unit test:** Create a `readable-tree` formula with nested sub-trees
  and blob entries. Verify `has()`, `list()`, and `lookup()` navigate
  correctly. Verify `lookup()` returns `EndoReadable` values for files
  and `ReadableTree` values for subdirectories.

- **Unit test:** Multi-segment `has()` and `lookup()` traverse nested
  readable trees correctly.

- **Unit test:** Content type inference returns correct MIME types for
  known extensions and `application/octet-stream` for unknown.

- **Integration test:** Extract a zip archive into a readable tree.
  Verify the tree structure matches the zip's directory layout and
  file contents match the zip's decompressed entries.

- **Integration test:** Create a `readable-tree-weblet` formula, verify
  the gateway serves `index.html` at the virtual host root with correct
  content type.

- **Integration test:** CapTP connection over WebSocket to a weblet's
  virtual host bootstraps with the weblet's guest powers.

- **Integration test:** `mkweblet` CLI verb creates handle, guest,
  readable-tree, and readable-tree-weblet formulas with correct pet
  names.

- **Integration test:** `open` CLI verb returns the correct URL.

- **UI test:** `/open` partitions the transcript, displays the weblet
  pane with the correct iframe `src`, and shows the close tab with the
  weblet's pet name above the transcript.

- **UI test:** Closing the weblet tab removes the iframe and restores
  the transcript to full width.

- **UI test:** The divider between transcript and weblet pane is
  draggable and persists the resize.

- **UI test:** Opening a second weblet replaces the first; the tab
  updates to the new pet name.

### Maybe

- **Integration test:** MessagePort CapTP from Chat iframe to gateway.
  This requires a browser/Electron test environment.

- **Integration test:** Fallback from MessagePort to WebSocket when not
  in an iframe.

## Compatibility Considerations

- Two new formula types (`readable-tree`, `readable-tree-weblet`) are
  additive. Existing formulas and workflows are unaffected.

- The `mkweblet` verb is new. Existing `endo install` workflow for
  bundle-based weblets continues to work unchanged.

- The host interface gains new methods (`extractZip`,
  `provideReadableTreeWeblet`). These are additive and do not change
  existing method signatures.

- Weblets using the MessagePort protocol must include the `endo:connect`
  listener. Weblets that don't include it will still work via WebSocket
  fallback.

## Upgrade Considerations

- No existing formulas need migration. The new formula types only exist
  after a user explicitly creates them.

- The `APPS` builtin formula may need updating if the weblet registration
  mechanism requires new powers. This would be handled as part of the
  `familiar-unified-weblet-server` work.

- Zip archives stored as `readable-blob` formulas before this change
  can be extracted into `readable-tree` formulas after upgrade — no
  re-upload is needed.
