# Scoped agent visibility via the endo pet namespace

- [x] originally following up on task 2 from `TADA/20_genie_main.md` task 2
- [x] respond to all **TODO(feedback)** below and evolve the design
- [x] revise the above design incorporating feedback notes

- [x] implement the planned design changes to `packages/genie/main.js`

## Problem

Today every genie agent guest is provisioned under the host agent's namespace
and every agent can, in principle, look up any other agent by pet name.

An agent should:
- only be able to discover sub-agents that it itself spawned
- only through the endo pet namespace
- not through any internal map or out-of-band registry

## Daemon-side constraints (resolved)

After analysing `packages/daemon/src/host.js`, `packages/daemon/src/guest.js`,
and the formula graph in `packages/daemon/src/graph.js`, the following
constraints are clear:

1. **`provideGuest` is host-only.**
   - Only `EndoHost` exposes `provideGuest`; `EndoGuest` does not.
   - Sub-agent provisioning must therefore always go through a host reference.

2. **Guests start with empty namespaces.**
  - Each guest gets a fresh, isolated pet store.
  - The only entries visible to a new guest are the special names (`@self`,
    `@host`, `@agent`, `@keypair`, `@mail`, `@nets`) set up by `makePetSitter`.

3. **`introducedNames` controls initial visibility.**
  - `provideGuest(name, { introducedNames })` resolves each key in the *host's*
    namespace and writes the corresponding formula ID into the *guest's*
    namespace under the value.
  - This is the mechanism for scoping what a child can see at birth.

4. **Guests can write to their own namespace.**
  - `EndoGuest` exposes `storeIdentifier`, `storeLocator`, `makeDirectory`,
    `move`, `remove`, `copy`.
  - A parent agent can therefore record a child's locator in its own namespace
    after provisioning.

5. **No cascading deletion.**
  - The daemon uses reference-counted garbage collection (`graph.js`), not cascading deletes.
  - Removing a formula removes inbound references; dependents persist until
    they themselves become unreferenced.
  - However, `guest.js` registers `context.thisDiesIfThatDies(hostHandleId)` —
    so if the *host handle* that created the guest is collected, the guest
    formula is also collected.
  - This means children of a host handle are transitively cleaned up if the
    host handle is removed.

6. **`introduceNamesToAgent` is idempotent but one-shot.**
  - It runs at `provideGuest` time.
  - There is no daemon API to dynamically add introduced names after creation.
  - Post-creation sharing must use `storeIdentifier` or message-based adoption.

## Design (refined)

### 1. Parent records children in an endo directory

After `provideGuest` returns the child guest, the parent
agent stores a reference in a dedicated endo directory within
its own pet store.
The directory name is a config setting (default: `genie`).

```js
// Ensure the child-tracking directory exists.
const agentDirName = config.agentDirectory || 'genie';
if (!(await E(parentPowers).has(agentDirName))) {
  await E(parentPowers).makeDirectory(agentDirName);
}

// Store the child reference inside the directory.
const childLocator = await E(childGuest).locate('@self');
await E(parentPowers).storeLocator(
  [agentDirName, childName],
  childLocator,
);
```

Discovery is then:

```js
const childNames = await E(parentPowers).list(agentDirName);
```

No module-level `Map` or `Set` needed — the endo namespace
is the single source of truth.

### 2. Scoped child namespace via `introducedNames`

When the host provisions the child guest, pass
`introducedNames` to grant only the capabilities the child
needs.
The child does **not** receive a reference to the parent; it
is fully isolated.

```js
const childGuest = await E(hostAgent).provideGuest(
  childName,
  {
    agentName: `profile-for-${childName}`,
    introducedNames: {
      // host-namespace name → child-namespace name
      'workspace-mount': 'workspace',
    },
  },
);
```

The child sees `workspace` in its namespace but cannot see
sibling agents, the parent, or any host-level names that
were not explicitly introduced.

### 3. Cleanup

Because `context.thisDiesIfThatDies(hostHandleId)` is
registered in `guest.js`, removing the host handle that
created the child guest causes the child to be collected by
the formula graph GC.

For explicit cleanup from the parent:

```js
const agentDirName = config.agentDirectory || 'genie';
// Remove the child from the parent's directory.
await E(parentPowers).remove([agentDirName, childName]);
// Ask the host to cancel the child guest.
await E(hostAgent).remove(childName);
```

The last call removes the host-level reference; the GC
then collects the orphaned guest and its transitive
dependencies (worker, pet store, mailbox, etc.).

### 4. Generic directory tree traversal

Discovery of child agents (and their descendants) is framed
as a generic endo directory tree traversal — an async
generator that yields `{ name, depth }` entries by walking
endo directories depth-first.

This is not agent-specific; it works on any endo directory.

```js
/**
 * Walk an endo directory tree depth-first, yielding each
 * entry with its depth.
 *
 * @param {FarRef<FarEndoGuest>} powers
 * @param {string} dirName - root directory pet name
 * @param {number} [maxDepth] - optional depth limit
 * @yields {{ name: string, depth: number, path: string[] }}
 */
async function* walkDirectory(powers, dirName, maxDepth = Infinity) {
  const stack = [{ path: [dirName], depth: 0 }];
  while (stack.length > 0) {
    const { path, depth } = stack.pop();
    const names = await E(powers).list(path);
    for (const name of names) {
      const entryPath = [...path, name];
      yield { name, depth, path: entryPath };
      if (depth + 1 < maxDepth) {
        // Check if entry is itself a directory.
        const entry = await E(powers).lookup(entryPath);
        const methods = await E(entry).__getMethodNames__();
        if (methods.includes('list')) {
          stack.push({ path: entryPath, depth: depth + 1 });
        }
      }
    }
  }
}
```

Usage for agent discovery:

```js
const agentDirName = config.agentDirectory || 'genie';
for await (const entry of walkDirectory(parentPowers, agentDirName)) {
  console.log(`${'  '.repeat(entry.depth)}${entry.name}`);
}
```

### 5. Concrete changes to `main.js`

#### `spawnAgent` signature change

Add an optional `parentPowers` parameter.  When present, the
child's locator is stored in the parent's genie directory
rather than (only) the host's.

```js
const spawnAgent = async (
  hostAgent,
  agentName,
  config,
  parentPowers,  // optional — undefined for top-level agents
) => { ... };
```

#### `introducedNames` wiring

Before calling `provideGuest`, build an `introducedNames`
map from the parent's namespace.
At minimum, introduce the workspace mount so the child can
access the filesystem.
Do **not** introduce a parent reference.

```js
const introducedNames = {};
if (await E(hostAgent).has('workspace-mount')) {
  introducedNames['workspace-mount'] = 'workspace';
}
```

#### Parent namespace bookkeeping

After provisioning, store the child reference in the parent's genie directory:

```js
if (parentPowers) {
  const agentDirName = config.agentDirectory || 'genie';
  if (!(await E(parentPowers).has(agentDirName))) {
    await E(parentPowers).makeDirectory(agentDirName);
  }
  const childLocator = await E(agentGuest).locate('@self');
  await E(parentPowers).storeLocator(
    [agentDirName, agentName],
    childLocator,
  );
}
```

#### `walkDirectory` utility

Add the generic async-generator directory walker described
in §5 to a new utility module
(`packages/genie/src/directory-walk.js`), exported for use
by `main.js` and tests.

## Implementation notes

All four planned steps have been implemented:

1. **`packages/genie/src/directory-walk.js`** — Generic async-generator
   `walkDirectory(powers, dirName, maxDepth)` that depth-first walks
   endo directories using `E(powers).list()` and
   `E(entry).__getMethodNames__()` for directory detection.  Hardened
   and exported.  Handles lookup errors gracefully (skips
   inaccessible entries).

2. **`spawnAgent` updated in `main.js`** — Added optional
   `parentPowers` parameter and `agentDirectory` config field (default
   `'genie'`).  After `provideGuest`, if `parentPowers` is provided,
   ensures the genie directory exists and stores the child's locator
   at `[agentDirName, agentName]`.  Wires `introducedNames` for
   workspace mount only (no parent reference introduced).

3. **Cleanup and discovery helpers in `main.js`**:
   - `removeChildAgent(hostAgent, parentPowers, config, childName)` —
     removes the directory entry and host-level guest reference.
   - `listChildAgents(parentPowers, config)` — lists child agent
     names from the parent's agent directory.
   - `walkDirectory` imported and available for nested tree traversal.

4. **`test/directory-walk.test.js`** — 5 unit tests covering flat
   directory, nested recursion, maxDepth limiting, empty directory,
   and lookup error handling.  All pass.

Configuration form updated with `agentDirectory` field.

## Implementation plan

1. **Create `packages/genie/src/directory-walk.js`**
   - Implement `walkDirectory` async generator as described
     in §5.
   - Export `walkDirectory` and `harden` it.
   - Add JSDoc types (`@ts-check`, `@param`, `@yields`).

2. **Update `spawnAgent` in `packages/genie/main.js`**
   - Add optional `parentPowers` parameter.
   - Add `agentDirectory` to the config type (default
     `'genie'`).
   - After `provideGuest`, if `parentPowers` is provided:
     - Ensure the genie directory exists.
     - Store child locator at `[agentDirName, agentName]`.
   - Wire `introducedNames` for workspace mount only (no
     parent reference).

3. **Add cleanup helper to `main.js`**
   - Implement `removeChildAgent(hostAgent, parentPowers, config, childName)`
     that removes the directory entry and host-level guest reference.

4. **Tests**
   - Unit test `walkDirectory` with a mock directory that
     has nested sub-directories.
   - Integration test: spawn a child agent, verify it
     appears in the parent's genie directory, verify the
     child cannot see the parent or siblings, verify cleanup
     removes all references.
