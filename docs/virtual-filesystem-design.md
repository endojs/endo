---
title: virtual-filesystem-design
group: Documents
category: Guides
---

# Virtual Filesystem Design Sketch

This document sketches a virtual filesystem design for the Endo daemon.
It is expressed in terms of Exos, patterns, and object-capability concepts.
It emphasizes attenuation, caretaker control, safe symlink handling, and
composability across multiple storage backends.

The design assumes a daemon environment with EndoHost holders and
object-capability discipline.
Where behavior depends on the underlying platform, we note limitations
explicitly.

## Goals

- Provide a filesystem capability that can be attenuated by scope and by
  rights.
- Allow construction of a virtual filesystem from fragments of other
  filesystems.
- Permit read-only CAS-backed and in-memory nodes inside the same namespace.
- Enable high-performance copy or move without userspace pumping when two
  filesystems share a backend.
- Preserve atomicity where possible and degrade safely where not.
- Handle symbolic links without allowing escape from a virtual boundary.
- Support a controller facet that can flip readability or writability without
  holding the file node.
- Allow a writable file capability to attenuate itself to a readable or
  revokable file.

## Terminology

- A *node* is a directory, file, or symbolic link.
- A *backend* is a storage provider like an OS filesystem, CAS store, or
  in-memory store.
- A *mount* attaches a backend subtree to a virtual path.
- A *policy* governs traversal, resolution, and reachability.
- A *controller* is a caretaker facet that can modify node permissions.

## High-Level Structure

We model the filesystem as an ExoClassKit with three facets.
The `fs` facet is the user-facing filesystem capability.
The `control` facet is the caretaker, able to change permissions.
The `internal` facet holds backends, grants, and fast-path mechanics.

Each node is also modeled as an ExoClassKit with facets for directory, file,
link, and node control.
This permits clean separation of access and authority.

## Exo Interfaces

These interfaces are sketches and will be adjusted to align with Endo
conventions and existing packages.

```javascript
import { M } from '@endo/patterns';

const NodeId = M.string();
const Path = M.arrayOf(M.string());

const FsI = M.interface('Filesystem', {
  root: M.call().returns(M.remotable('Dir')),
  at: M.call(NodeId).returns(M.remotable('Node')),
  resolve: M.call(Path).returns(M.remotable('Node')),
  attenuate: M.call(
    M.splitRecord(
      { policy: M.remotable('Policy') },
      { read: M.boolean(), write: M.boolean(), subtree: M.remotable('Dir') }
    )
  ).returns(M.remotable('Filesystem')),
  mount: M.call(Path, M.remotable('Mount')).returns(),
  copy: M.call(
    M.remotable('Node'),
    M.remotable('Dir'),
    M.string()
  ).returns(M.remotable('Node')),
  move: M.call(
    M.remotable('Node'),
    M.remotable('Dir'),
    M.string()
  ).returns(M.remotable('Node')),
  stat: M.call(M.remotable('Node')).returns(M.copyRecord()),
});

const DirI = M.interface('Dir', {
  list: M.call().returns(M.arrayOf(M.string())),
  get: M.call(M.string()).returns(M.remotable('Node')),
  openDir: M.call(M.string()).returns(M.remotable('Dir')),
  openFile: M.call(M.string()).returns(M.remotable('File')),
  createDir: M.call(M.string()).returns(M.remotable('Dir')),
  createFile: M.call(M.string()).returns(M.remotable('File')),
  remove: M.call(M.string()).returns(),
});

const FileI = M.interface('File', {
  read: M.call().returns(M.copyArray()),
  write: M.call(M.copyArray()).returns(),
  append: M.call(M.copyArray()).returns(),
  truncate: M.call(M.number()).returns(),
  stat: M.call().returns(M.copyRecord()),
  readOnly: M.call().returns(M.remotable('File')),
  revokable: M.call().returns(M.remotable('RevokableFileKit')),
});

const LinkI = M.interface('Link', {
  target: M.call().returns(M.copyRecord()),
  resolve: M.call().returns(M.remotable('Node')),
});

const FsControlI = M.interface('FsControl', {
  root: M.call().returns(M.remotable('DirControl')),
  at: M.call(NodeId).returns(M.remotable('NodeControl')),
});

const NodeControlI = M.interface('NodeControl', {
  setReadable: M.call(M.boolean()).returns(),
  setWritable: M.call(M.boolean()).returns(),
  getReadable: M.call().returns(M.boolean()),
  getWritable: M.call().returns(M.boolean()),
});
```

## Attenuation and Rights

Attenuation is explicit and compositional.
A filesystem can be narrowed by scope or by rights.
A file can attenuate itself to a read-only or revokable capability.

Attenuation patterns are enforced by design.
Rights amplification occurs only in guarded code paths, such as a privileged
controller or a trusted backend.

Example attenuation by subtree:

```javascript
const userFs = hostFs.at(projectDirNodeId);
```

Example attenuation to read-only:

```javascript
const readOnlyFs = userFs.at(projectDirNodeId).attenuate({
  policy: rootedPolicy,
  read: true,
  write: false,
});
```

Example file self-attenuation:

```javascript
const readOnlyFile = file.readOnly();
const { file: revokable, revoke } = file.revokable();
```

## Controller Facet

The controller facet follows the caretaker pattern.
It can toggle readability and writability without holding the file node.
The `fs` facet is constrained by those toggles.
The `fs` facet cannot countermand or override controller changes.

Example controller usage:

```javascript
const fsControl = hostFsControl.root();
const nodeControl = fsControl.get('logs').get('app.log');
nodeControl.setWritable(false);
```

## Policies

Policies govern traversal, resolution, and reachability.
Different policies express different containment semantics.
Policies are Exos so they can encapsulate state and logic.

Example policy options:

- Connected policy allows any directory to reach any other by walking the
  virtual tree.
- Rooted forest policy defines inescapable roots and prevents cross-root
  traversal.
- Single node policy allows only a single node to be reachable.

Policies are enforced by path resolution and link traversal.
Policy changes are an attenuation, not an amplification.

## Symbolic Links

Symbolic links are supported but must never allow escape from a virtual
boundary.
Links store an opaque target descriptor, not a raw path.
Resolution checks policy reachability before returning a node.

The virtual filesystem may reveal that two nodes are equivalent.
It should avoid revealing a concrete path when that could reveal information
outside the allowed boundary.

If a link target is unreachable, it resolves to a dangling node.
Operations on that dangling node fail with a policy or existence error.

## Backends and Mounts

Backends provide the storage substrate.
A mount attaches a backend subtree to a virtual path.
Multiple mounts can compose a single virtual filesystem.

Example mounts:

- Physical backend for OS filesystem access.
- CAS backend for read-only content-addressed blobs.
- Memory backend for ephemeral data.

Mounts can be read-only or read-write, depending on backend and policy.

## Fast-Path Copy and Move

We want to avoid userspace pumping for copy and move when possible.
This requires grant matching and a sealer or unsealer.

Each backend can produce a sealed grant describing its identity.
The internal facet holds the unsealer for comparison.
If two nodes share a backend grant, the filesystem uses a backend-native
operation like `copyWithin` or `moveWithin`.

If grants do not match, the filesystem falls back to read and write streams.
This is a controlled and explicit rights amplification in the internal facet.

## Atomicity

Atomicity depends on backend capability.
Within a single backend, rename or copy can be atomic.
Across backends, atomicity is not guaranteed.

Where possible, the filesystem uses temp files and rename to provide atomic
commit on the destination backend.
When atomicity cannot be guaranteed, operations return a clear error or
explicitly document best-effort semantics.

## Node.js Limitation

Node.js APIs do not provide stable inode-bound capabilities for userland
applications.
We therefore treat `NodeId` as a logical identity, not a true inode handle.
This affects link equivalence and long-lived handles.
We should note this limitation and plan to improve when stronger foundations
are available.

## Example: Composed Virtual Filesystem

```javascript
const vfs = makeVirtualFs({ policy: rootedPolicy });

vfs.mount(['home'], physicalMount('/home/alice'));
vfs.mount(['cache'], casMount(contentAddressStore));
vfs.mount(['tmp'], memoryMount());

const root = vfs.root();
const tmpFile = root.openDir('tmp').createFile('scratch.txt');
tmpFile.write(harden([0x68, 0x69]));
```

## Example: Attenuation to a Single Node

```javascript
const projectFs = vfs.at(projectDirNodeId);
const readme = projectFs.resolve(['README.md']);
const oneNodeFs = projectFs.at(readme.nodeId);
```

## Example: Safe Link Resolution

```javascript
const dir = vfs.root().openDir('home');
const link = dir.get('current');
const target = link.resolve();
// If target is outside policy boundaries, resolve fails.
```

## Example: Controller-Based Write Lock

```javascript
const admin = vfsControl.root();
const logs = admin.get('var').get('log');
const appLog = logs.get('app.log');

appLog.setWritable(false);

const userFile = vfs.root().openDir('var').openDir('log').openFile('app.log');
userFile.append(harden([0x61])); // throws: not writable
```

## Example: Revokable File

```javascript
const { file: revokable, revoke } = file.revokable();
revoke();
revokable.read(); // throws: revoked
```

## Notes on Rights Patterns

- Rights attenuation is achieved by narrowing a filesystem scope, applying a
  policy, or self-attenuating a file.
- Rights amplification is restricted to explicit, audited code paths such as
  controller changes or backend-native copy operations.
- The caretaker pattern is represented by the controller facet, which holds
  the authority to adjust permissions without handing out the underlying
  capability.

## Future Extensions

- Additional backend types with stronger atomic guarantees.
- Stable inode-bound handles on platforms that support it.
- Richer policy combinators for dynamic and temporal constraints.
- Extended symlink metadata with safe provenance hints.
