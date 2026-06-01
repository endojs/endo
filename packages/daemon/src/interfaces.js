// @ts-check

import { M } from '@endo/patterns';
import {
  DirectoryInterface as PlatformDirectoryInterface,
  FileInterface as PlatformFileInterface,
} from '@endo/platform/fs/lite';

// #region Patterns

// Names: pet names are lowercase (a-z start, then a-z0-9-), special names are uppercase
// Pattern matching is done at runtime by the implementation, but we can at least
// ensure strings are passed.
const NameShape = M.string();
const NamePathShape = M.arrayOf(NameShape);
const NameOrPathShape = M.or(NameShape, NamePathShape);
const NamesOrPathsShape = M.arrayOf(NameOrPathShape);

// Edge names for message edges (same pattern as Name)
const EdgeNameShape = M.string();
const EdgeNamesShape = M.arrayOf(EdgeNameShape);

// Formula identifiers are strings
const IdShape = M.string();

// Locators are formatted formula identifiers
const LocatorShape = M.string();

// Message numbers are non-negative BigInts
const MessageNumberShape = M.bigint();

// Environment variables as string-to-string record
const EnvShape = M.recordOf(M.string(), M.string());

// Options for makeUnconfined and makeArchive
const MakeCapletOptionsShape = M.splitRecord(
  {},
  {
    powersName: NameShape,
    resultName: NameOrPathShape,
    env: EnvShape,
    workerTrustedShims: M.arrayOf(M.string()),
  },
);

// Shared method guard for evaluate (used by both Host and Guest)
// Both execute directly in a worker, differing only in namespace
const EvaluateMethodGuard = M.call(
  M.or(NameShape, M.undefined()),
  M.string(),
  M.arrayOf(M.string()),
  NamesOrPathsShape,
)
  .optional(NameOrPathShape)
  .returns(M.promise());

// #region Interfaces

export const WorkerInterface = M.interface('EndoWorker', {});

export const PeerGatewayInterface = M.interface('ResilientPeerGateway', {
  provide: M.callWhen(M.string()).returns(M.any()),
});

export const ResponderInterface = M.interface('EndoResponder', {
  resolveWithId: M.callWhen(M.or(IdShape, M.promise())).returns(),
});

export const NameHubInterface = M.interface('EndoNameHub', {
  has: M.call().rest(NamePathShape).returns(M.promise()),
  identify: M.call().rest(NamePathShape).returns(M.promise()),
  locate: M.call().rest(NamePathShape).returns(M.promise()),
  reverseLocate: M.call(LocatorShape).returns(M.promise()),
  followLocatorNameChanges: M.call(LocatorShape).returns(M.remotable()),
  list: M.call().rest(NamePathShape).returns(M.promise()),
  listIdentifiers: M.call().rest(NamePathShape).returns(M.promise()),
  listLocators: M.call().rest(NamePathShape).returns(M.promise()),
  followNameChanges: M.call().returns(M.remotable()),
  lookup: M.call(NameOrPathShape).returns(M.promise()),
  maybeLookup: M.call(NameOrPathShape).returns(M.any()),
  reverseLookup: M.call(M.any()).returns(M.promise()),
  storeIdentifier: M.call(NameOrPathShape, IdShape).returns(M.promise()),
  storeLocator: M.call(NameOrPathShape, IdShape).returns(M.promise()),
  remove: M.call().rest(NamePathShape).returns(M.promise()),
  move: M.call(NamePathShape, NamePathShape).returns(M.promise()),
  copy: M.call(NamePathShape, NamePathShape).returns(M.promise()),
});

export const EnvelopeInterface = M.interface('EndoEnvelope', {});

export const DismisserInterface = M.interface('EndoDismisser', {
  dismiss: M.call().returns(M.promise()),
});

// CRITICAL: HandleInterface must use defaultGuards: 'passable' to preserve
// envelope object identity when passed through E() calls. Explicit guards
// like M.remotable('Envelope') cause envelope identity loss and "mail fraud"
// errors.
export const HandleInterface = M.interface(
  'EndoHandle',
  {},
  { defaultGuards: 'passable' },
);

export const AsyncIteratorInterface = M.interface('AsyncIterator', {
  next: M.call().returns(M.promise()),
  return: M.call().optional(M.any()).returns(M.promise()),
  throw: M.call().optional(M.any()).returns(M.promise()),
});

export const DirectoryInterface = M.interface('EndoDirectory', {
  // Self-documentation
  help: M.call().optional(M.string()).returns(M.string()),
  // Check if a name exists
  has: M.call().rest(NamePathShape).returns(M.promise()),
  // Get formula identifier for a name path
  identify: M.call().rest(NamePathShape).returns(M.promise()),
  // Get locator string for a name path
  locate: M.call().rest(NamePathShape).returns(M.promise()),
  // Find names for a locator
  reverseLocate: M.call(LocatorShape).returns(M.promise()),
  // Subscribe to name changes for a locator (returns iterator ref)
  followLocatorNameChanges: M.call(LocatorShape).returns(M.remotable()),
  // List names in a directory
  list: M.call().rest(NamePathShape).returns(M.promise()),
  // List unique formula identifiers
  listIdentifiers: M.call().rest(NamePathShape).returns(M.promise()),
  // List locators for names
  listLocators: M.call().rest(NamePathShape).returns(M.promise()),
  // Subscribe to name changes (returns iterator ref)
  followNameChanges: M.call().returns(M.remotable()),
  // Resolve a name path to a value
  lookup: M.call(NameOrPathShape).returns(M.promise()),
  // Resolve a name path, returning undefined if the head name is absent
  maybeLookup: M.call(NameOrPathShape).returns(M.any()),
  // Get names for a value
  reverseLookup: M.call(M.any()).returns(M.promise()),
  // Store a formula identifier with a name
  storeIdentifier: M.call(NameOrPathShape, IdShape).returns(M.promise()),
  // Store an endo:// locator with a name
  storeLocator: M.call(NameOrPathShape, IdShape).returns(M.promise()),
  // Remove a name
  remove: M.call().rest(NamePathShape).returns(M.promise()),
  // Move/rename a reference
  move: M.call(NamePathShape, NamePathShape).returns(M.promise()),
  // Copy a reference
  copy: M.call(NamePathShape, NamePathShape).returns(M.promise()),
  // Create a new directory
  makeDirectory: M.call(NameOrPathShape).returns(M.promise()),
  // Text I/O (delegated to mount)
  readText: M.call(NameOrPathShape).returns(M.promise()),
  maybeReadText: M.call(NameOrPathShape).returns(M.promise()),
  writeText: M.call(NameOrPathShape, M.string()).returns(M.promise()),
});

export const GuestInterface = M.interface('EndoGuest', {
  // Self-documentation
  help: M.call().optional(M.string()).returns(M.string()),
  // Directory
  has: M.call().rest(NamePathShape).returns(M.promise()),
  identify: M.call().rest(NamePathShape).returns(M.promise()),
  reverseIdentify: M.call(IdShape).returns(M.array()),
  locate: M.call().rest(NamePathShape).returns(M.promise()),
  reverseLocate: M.call(LocatorShape).returns(M.promise()),
  followLocatorNameChanges: M.call(LocatorShape).returns(M.promise()),
  list: M.call().rest(NamePathShape).returns(M.promise()),
  listIdentifiers: M.call().rest(NamePathShape).returns(M.promise()),
  listLocators: M.call().rest(NamePathShape).returns(M.promise()),
  followNameChanges: M.call().returns(M.promise()),
  lookup: M.call(NameOrPathShape).returns(M.promise()),
  maybeLookup: M.call(NameOrPathShape).returns(M.any()),
  lookupById: M.call(IdShape).returns(M.promise()),
  reverseLookup: M.call(M.any()).returns(M.promise()),
  storeIdentifier: M.call(NameOrPathShape, IdShape).returns(M.promise()),
  storeLocator: M.call(NameOrPathShape, IdShape).returns(M.promise()),
  remove: M.call().rest(NamePathShape).returns(M.promise()),
  move: M.call(NamePathShape, NamePathShape).returns(M.promise()),
  copy: M.call(NamePathShape, NamePathShape).returns(M.promise()),
  makeDirectory: M.call(NameOrPathShape).returns(M.promise()),
  // Text I/O (delegated to mount)
  readText: M.call(NameOrPathShape).returns(M.promise()),
  maybeReadText: M.call(NameOrPathShape).returns(M.promise()),
  writeText: M.call(NameOrPathShape, M.string()).returns(M.promise()),
  // Mail
  // Get the guest's mailbox handle
  handle: M.call().returns(M.remotable()),
  // List all messages
  listMessages: M.call().returns(M.promise()),
  // Subscribe to messages (returns iterator ref)
  followMessages: M.call().returns(M.promise()),
  // Respond to a request with a formula identifier
  resolve: M.call(MessageNumberShape, NameOrPathShape).returns(M.promise()),
  // Decline a request
  reject: M.call(MessageNumberShape).optional(M.string()).returns(M.promise()),
  // Adopt a reference from an incoming message
  adopt: M.call(MessageNumberShape, NameOrPathShape, NameOrPathShape).returns(
    M.promise(),
  ),
  // Remove a message from inbox
  dismiss: M.call(MessageNumberShape).returns(M.promise()),
  // Remove all messages from inbox
  dismissAll: M.call().returns(M.promise()),
  // Send a request and wait for response
  request: M.call(NameOrPathShape, M.string())
    .optional(NameOrPathShape)
    .returns(M.promise()),
  // Send a package message
  send: M.call(
    NameOrPathShape,
    M.arrayOf(M.string()),
    EdgeNamesShape,
    NamesOrPathsShape,
  )
    .optional(MessageNumberShape)
    .returns(M.promise()),
  // Reply to a message
  reply: M.call(
    MessageNumberShape,
    M.arrayOf(M.string()),
    EdgeNamesShape,
    NamesOrPathsShape,
  ).returns(M.promise()),
  // Define code with named slots
  define: M.call(
    M.string(), // source
    M.record(), // slots
  ).returns(M.promise()),
  // Send a form to a recipient
  form: M.call(
    NameOrPathShape, // recipientName
    M.string(), // description
    M.arrayOf(M.record()), // fields
  ).returns(M.promise()),
  // Store a blob
  storeBlob: M.call(M.remotable())
    .optional(NameOrPathShape)
    .returns(M.promise()),
  // Store a passable value
  storeValue: M.call(M.any(), NameOrPathShape).returns(M.promise()),
  // Submit values for a form
  submit: M.call(
    MessageNumberShape, // messageNumber
    M.record(), // values
  ).returns(M.promise()),
  // Send a retained value as a reply
  sendValue: M.call(
    MessageNumberShape, // messageNumber
    NameOrPathShape, // petNameOrPath
  ).returns(M.promise()),
  // Internal: deliver a message
  deliver: M.call(M.record()).returns(),
  // Evaluate code directly in a worker
  evaluate: EvaluateMethodGuard,
});

export const HostInterface = M.interface('EndoHost', {
  // Self-documentation
  help: M.call().optional(M.string()).returns(M.string()),
  // Directory
  has: M.call().rest(NamePathShape).returns(M.promise()),
  identify: M.call().rest(NamePathShape).returns(M.promise()),
  reverseIdentify: M.call(IdShape).returns(M.array()),
  locate: M.call().rest(NamePathShape).returns(M.promise()),
  reverseLocate: M.call(LocatorShape).returns(M.promise()),
  followLocatorNameChanges: M.call(LocatorShape).returns(M.promise()),
  list: M.call().rest(NamePathShape).returns(M.promise()),
  listIdentifiers: M.call().rest(NamePathShape).returns(M.promise()),
  listLocators: M.call().rest(NamePathShape).returns(M.promise()),
  followNameChanges: M.call().returns(M.promise()),
  lookup: M.call(NameOrPathShape).returns(M.promise()),
  maybeLookup: M.call(NameOrPathShape).returns(M.any()),
  lookupById: M.call(IdShape).returns(M.promise()),
  reverseLookup: M.call(M.any()).returns(M.promise()),
  storeIdentifier: M.call(NameOrPathShape, IdShape).returns(M.promise()),
  storeLocator: M.call(NameOrPathShape, IdShape).returns(M.promise()),
  remove: M.call().rest(NamePathShape).returns(M.promise()),
  move: M.call(NamePathShape, NamePathShape).returns(M.promise()),
  copy: M.call(NamePathShape, NamePathShape).returns(M.promise()),
  makeDirectory: M.call(NameOrPathShape).returns(M.promise()),
  // Text I/O (delegated to mount)
  readText: M.call(NameOrPathShape).returns(M.promise()),
  maybeReadText: M.call(NameOrPathShape).returns(M.promise()),
  writeText: M.call(NameOrPathShape, M.string()).returns(M.promise()),
  // Mail
  handle: M.call().returns(M.remotable()),
  listMessages: M.call().returns(M.promise()),
  followMessages: M.call().returns(M.promise()),
  resolve: M.call(MessageNumberShape, NameOrPathShape).returns(M.promise()),
  reject: M.call(MessageNumberShape).optional(M.string()).returns(M.promise()),
  adopt: M.call(MessageNumberShape, NameOrPathShape, NameOrPathShape).returns(
    M.promise(),
  ),
  dismiss: M.call(MessageNumberShape).returns(M.promise()),
  dismissAll: M.call().returns(M.promise()),
  request: M.call(NameOrPathShape, M.string())
    .optional(NameOrPathShape)
    .returns(M.promise()),
  send: M.call(
    NameOrPathShape,
    M.arrayOf(M.string()),
    EdgeNamesShape,
    NamesOrPathsShape,
  )
    .optional(MessageNumberShape)
    .returns(M.promise()),
  deliver: M.call(M.record()).returns(),
  // Send a form to a recipient
  form: M.call(
    NameOrPathShape, // recipientName
    M.string(), // description
    M.arrayOf(M.record()), // fields
  ).returns(M.promise()),
  // Host
  // Store a blob
  storeBlob: M.call(M.remotable())
    .optional(NameOrPathShape)
    .returns(M.promise()),
  // Store a passable value
  storeValue: M.call(M.any(), NameOrPathShape).returns(M.promise()),
  // Check in a remote readable-tree Exo, storing content-addressed
  storeTree: M.call(M.remotable(), NameOrPathShape).returns(M.promise()),
  // Mount an external directory
  provideMount: M.call(M.string(), NameOrPathShape)
    .optional(M.splitRecord({}, { readOnly: M.boolean() }))
    .returns(M.promise()),
  // Create a daemon-managed scratch mount
  provideScratchMount: M.call(NameOrPathShape)
    .optional(M.splitRecord({}, { readOnly: M.boolean() }))
    .returns(M.promise()),
  // Derive a local Git capability from an authorized mount.
  provideGit: M.callWhen(M.remotable(), NameOrPathShape).returns(
    M.remotable('Git'),
  ),
  // Mint a GitRemote capability that wraps a writable Git cap with a
  // policy-bound endpoint and (optional) credential.
  provideGitRemote: M.callWhen(
    M.remotable(),
    NameOrPathShape,
    M.recordOf(M.string(), M.any()),
  ).returns(M.remotable('GitRemote')),
  // Mint daemon-private Git credential capabilities.
  provideBearerCredential: M.callWhen(
    NameOrPathShape,
    M.recordOf(M.string(), M.any()),
  ).returns(M.remotable('BearerCredential')),
  provideBasicCredential: M.callWhen(
    NameOrPathShape,
    M.recordOf(M.string(), M.any()),
  ).returns(M.remotable('BasicCredential')),
  // Host-side controllers for daemon-minted credential / remote caps.
  getGitCredentialController: M.callWhen(M.remotable()).returns(
    M.remotable('GitCredentialController'),
  ),
  getGitRemoteController: M.callWhen(M.remotable()).returns(
    M.remotable('GitRemoteController'),
  ),
  // Resolve a Mount capability to its host filesystem path. This is
  // deliberately part of the fully privileged EndoHost surface used
  // by the @endo/sandbox factory (and similar make-unconfined
  // plugins); do not hand an EndoHost cap to code that should not be
  // able to recover host paths for daemon-minted top-level mounts.
  provideHostPath: M.call(M.any()).returns(M.promise()),
  // Provide a guest
  provideGuest: M.call().optional(NameShape, M.record()).returns(M.promise()),
  // Provide a host
  provideHost: M.call().optional(NameShape, M.record()).returns(M.promise()),
  // Provide a worker
  provideWorker: M.call(NameOrPathShape).returns(M.promise()),
  // Evaluate code directly in a worker
  evaluate: EvaluateMethodGuard,
  // Make an unconfined caplet
  makeUnconfined: M.call(M.or(NameShape, M.undefined()), M.string())
    .optional(MakeCapletOptionsShape)
    .returns(M.promise()),
  // Make a caplet from a source-only ZIP archive
  makeArchive: M.call(M.or(NameShape, M.undefined()), NameShape)
    .optional(MakeCapletOptionsShape)
    .returns(M.promise()),
  // Make a caplet from a ReadableTree or Mount laid out as a
  // compartment-mapper archive (compartment-map.json at root plus
  // modules at their referenced paths).
  makeFromTree: M.call(M.or(NameShape, M.undefined()), NameOrPathShape)
    .optional(MakeCapletOptionsShape)
    .returns(M.promise()),
  // Materialise a readable tree into a new scratch mount.
  stageTree: M.call(NameOrPathShape, NameShape).returns(M.promise()),
  // Stage a readable tree and run its entry module as an unconfined
  // Node caplet.
  makeUnconfinedFromTree: M.call(
    M.or(NameShape, M.undefined()),
    NameOrPathShape,
  )
    .optional(MakeCapletOptionsShape)
    .returns(M.promise()),
  // Create a channel
  makeChannel: M.call(NameShape, M.string()).returns(M.promise()),
  // Create a timer
  makeTimer: M.call(NameShape, M.number())
    .optional(M.string())
    .returns(M.promise()),
  // Cancel a value
  cancel: M.call(NameOrPathShape).optional(M.error()).returns(M.promise()),
  // Get the greeter
  greeter: M.call().returns(M.promise()),
  // Get the gateway
  gateway: M.call().returns(M.promise()),
  // Sign hex-encoded bytes with the daemon's root Ed25519 key, returns hex signature
  sign: M.call(M.string()).returns(M.promise()),
  // Get peer info
  getPeerInfo: M.call().returns(M.promise()),
  // Add peer info
  addPeerInfo: M.call(M.record()).returns(M.promise()),
  // List all known remote peers
  listKnownPeers: M.call().returns(M.promise()),
  // Follow changes to the known peers store
  followPeerChanges: M.call().returns(M.promise()),
  // Locate a formula with connection hints for sharing with remote peers
  locateForSharing: M.call().rest(NamePathShape).returns(M.promise()),
  // Adopt a value from a locator with connection hints
  adoptFromLocator: M.call(LocatorShape, NameOrPathShape).returns(M.promise()),
  // Create an invitation
  invite: M.call(NameShape).returns(M.promise()),
  // Accept an invitation
  accept: M.call(LocatorShape, NameShape).returns(M.promise()),
  // Reply to a message
  reply: M.call(
    MessageNumberShape,
    M.arrayOf(M.string()),
    EdgeNamesShape,
    NamesOrPathsShape,
  ).returns(M.promise()),
  // Endow a definition request with bindings
  endow: M.call(
    MessageNumberShape, // messageNumber
    M.record(), // bindings
  )
    .optional(
      M.or(NameShape, M.undefined()), // workerName
      NameOrPathShape, // resultName
    )
    .returns(M.promise()),
  // Submit values for a form
  submit: M.call(
    MessageNumberShape, // messageNumber
    M.record(), // values
  ).returns(M.promise()),
  // Send a retained value as a reply
  sendValue: M.call(
    MessageNumberShape, // messageNumber
    NameOrPathShape, // petNameOrPath
  ).returns(M.promise()),
  // Get formula dependency graph snapshot for this agent's pet store
  getFormulaGraph: M.call().returns(M.promise()),
});

export const ChannelInterface = M.interface('EndoChannel', {
  help: M.call().optional(M.string()).returns(M.string()),
  post: M.call(M.arrayOf(M.string()), EdgeNamesShape, NamesOrPathsShape)
    .optional(
      M.or(M.string(), M.undefined()),
      M.arrayOf(IdShape),
      M.or(M.string(), M.undefined()),
    )
    .returns(M.promise()),
  followMessages: M.call().returns(M.promise()),
  listMessages: M.call().returns(M.promise()),
  createInvitation: M.call(M.string()).returns(M.promise()),
  join: M.call(M.string()).returns(M.promise()),

  getMembers: M.call().returns(M.promise()),
  getProposedName: M.call().returns(M.string()),
  getMemberId: M.call().returns(M.string()),
  getMember: M.call(M.string()).returns(M.promise()),
  getAttenuator: M.call(M.string()).returns(M.promise()),
  getHeatConfig: M.call().returns(M.promise()),
  getHopInfo: M.call().returns(M.promise()),
  followHeatEvents: M.call().returns(M.promise()),
});

export const ChannelMemberInterface = M.interface('EndoChannelMember', {
  help: M.call().optional(M.string()).returns(M.string()),
  post: M.call(M.arrayOf(M.string()), EdgeNamesShape, NamesOrPathsShape)
    .optional(
      M.or(M.string(), M.undefined()),
      M.arrayOf(IdShape),
      M.or(M.string(), M.undefined()),
    )
    .returns(M.promise()),
  setProposedName: M.call(M.string()).returns(M.promise()),
  followMessages: M.call().returns(M.promise()),
  listMessages: M.call().returns(M.promise()),
  createInvitation: M.call(M.string()).returns(M.promise()),
  getMembers: M.call().returns(M.promise()),
  getProposedName: M.call().returns(M.string()),
  getMemberId: M.call().returns(M.string()),
  getMember: M.call(M.string()).returns(M.promise()),
  getAttenuator: M.call(M.string()).returns(M.promise()),
  getHeatConfig: M.call().returns(M.promise()),
  getHopInfo: M.call().returns(M.promise()),
  followHeatEvents: M.call().returns(M.promise()),
});

export const ChannelInvitationInterface = M.interface('EndoChannelInvitation', {
  help: M.call().optional(M.string()).returns(M.string()),
  join: M.call(M.string()).returns(M.promise()),
});
harden(ChannelInvitationInterface);

export const AttenuatorInterface = M.interface('EndoChannelAttenuator', {
  setInvitationValidity: M.call(M.boolean()).returns(M.promise()),
  setHeatConfig: M.call(M.record()).returns(M.promise()),
  getHeatConfig: M.call().returns(M.promise()),
  temporaryBan: M.call(M.number()).returns(M.promise()),
});
harden(AttenuatorInterface);

export const InvitationInterface = M.interface('EndoInvitation', {
  accept: M.call(IdShape).optional(M.string()).returns(M.promise()),
  locate: M.call().returns(M.promise()),
});

export const InspectorHubInterface = M.interface('EndoInspectorHub', {
  lookup: M.call(NameOrPathShape).returns(M.promise()),
  list: M.call().returns(M.array()),
});

export const InspectorInterface = M.interface('EndoInspector', {
  lookup: M.call(NameOrPathShape).returns(M.promise()),
  list: M.call().returns(M.array()),
});

export const BlobInterface = M.interface('EndoBlob', {
  help: M.call().optional(M.string()).returns(M.string()),
  sha256: M.call().returns(M.string()),
  streamBase64: M.call().returns(M.remotable()),
  text: M.call().returns(M.promise()),
  json: M.call().returns(M.promise()),
});

const PathSegmentsShape = M.arrayOf(M.string());
const MountEntryShape = M.remotable('EndoMountEntry');
const PathArgShape = M.or(M.string(), PathSegmentsShape, MountEntryShape);

// `EndoMount` extends `Directory` from `@endo/platform/fs`.  Method
// shapes that overlap with `PlatformDirectoryInterface` carry the
// same `M.call(...)` arguments (path segments arrays plus an
// `M.remotable()` value for `write`) and return shapes; the
// mount-specific extensions (entry-arg overloads, `entry`, `stat`,
// `readText`, `maybeReadText`, `writeText`, `makeFile`, `help`) are
// additions, not redefinitions.  `has` widens `rest()` to `M.any()`
// because the daemon supports the single-entry-value overload that
// the platform contract does not name.
export const MountInterface = M.interface('EndoMount', {
  // ReadableTree-compatible surface.  `has` accepts either variadic
  // path segments or a single entry value; the impl validates the
  // shape because rest-with-M.or pattern guards do not narrow
  // remotables consistently across CapTP.
  has: M.call().rest(M.any()).returns(M.promise()),
  list: M.call().rest(PathSegmentsShape).returns(M.promise()),
  lookup: M.call(PathArgShape).returns(M.promise()),
  // Directory-shape write/copy (literal shapes from
  // PlatformDirectoryInterface for the path-segment form; entry-form
  // overloads accept an `EndoMountEntry` as the path argument).
  write: M.call(PathArgShape, M.remotable()).returns(M.promise()),
  copy: M.call(PathArgShape, PathArgShape).returns(M.promise()),
  // Mount-scoped descriptor minting (no I/O).
  entry: M.call(M.or(M.string(), PathSegmentsShape)).returns(MountEntryShape),
  // Metadata.
  stat: M.call(PathArgShape).returns(M.promise()),
  // Raw data I/O
  readText: M.call(PathArgShape).returns(M.promise()),
  maybeReadText: M.call(PathArgShape).returns(M.promise()),
  writeText: M.call(PathArgShape, M.string()).returns(M.promise()),
  // Path-form constructors.  `makeDirectory` returns a sub-mount
  // (matches `Directory.makeDirectory(path): Promise<Directory>`);
  // `makeFile` is the constructive sibling for parallel use.
  makeDirectory: M.call(PathArgShape).returns(M.promise()),
  makeFile: M.call(PathArgShape).optional(M.any()).returns(M.promise()),
  // Mutation
  remove: M.call(PathArgShape).returns(M.promise()),
  move: M.call(PathArgShape, PathArgShape).returns(M.promise()),
  // Attenuation — returns a structural ReadableTree view, not an
  // EndoMount.  Callers that need mount-specific extensions on a
  // read-only handle keep a reference to the un-attenuated mount.
  readOnly: M.call().returns(M.remotable('ReadableTree')),
  // Snapshot
  snapshot: M.call().returns(M.promise()),
  // Discoverability
  help: M.call().returns(M.string()),
});

// `EndoMountFile` extends `File` from `@endo/platform/fs`.  The
// overlapping methods (`streamBase64`, `text`, `json`, `writeText`,
// `writeBytes`, `append`, `snapshot`) carry the same shapes as
// `PlatformFileInterface`; `stat` and `help` are mount-specific
// extensions.  `readOnly` narrows to a structural ReadableBlob view.
export const MountFileInterface = M.interface('EndoMountFile', {
  text: M.call().returns(M.promise()),
  streamBase64: M.call().returns(M.remotable()),
  json: M.call().returns(M.promise()),
  writeText: M.call(M.string()).returns(M.promise()),
  append: M.call(M.string()).returns(M.promise()),
  writeBytes: M.call(M.remotable()).returns(M.promise()),
  stat: M.call().returns(M.promise()),
  snapshot: M.call().returns(M.promise()),
  readOnly: M.call().returns(M.remotable('ReadableBlob')),
  help: M.call().returns(M.string()),
});

// Re-export so importing modules that already pull from
// `./interfaces.js` can reach the platform shapes without a second
// import line.
export { PlatformDirectoryInterface, PlatformFileInterface };

export const MountEntryInterface = M.interface('EndoMountEntry', {
  segments: M.call().returns(PathSegmentsShape),
  displayPath: M.call().returns(M.string()),
  child: M.call(M.string()).returns(MountEntryShape),
  help: M.call().returns(M.string()),
});

const RefArgShape = M.or(M.string(), M.recordOf(M.string(), M.any()));
const GitDirectionShape = M.or(M.eq('fetch'), M.eq('push'));

const GitIndexStatusShape = M.or(
  'clean',
  'added',
  'modified',
  'deleted',
  'renamed',
  'copied',
  'conflicted',
);

const GitWorktreeStatusShape = M.or(
  'clean',
  'modified',
  'deleted',
  'untracked',
  'ignored',
  'conflicted',
);

const GitStatusEntryShape = M.splitRecord(
  {
    entry: M.remotable('EndoMountEntry'),
    path: M.string(),
    index: GitIndexStatusShape,
    worktree: GitWorktreeStatusShape,
  },
  {
    node: M.remotable(),
    renamedFrom: M.string(),
  },
);

const GitRefKindShape = M.or('branch', 'tag', 'commit', 'detached');

const GitRefShape = M.splitRecord(
  {
    name: M.string(),
    kind: GitRefKindShape,
  },
  {
    oid: M.string(),
  },
);

const GitCommitShape = M.splitRecord(
  {
    oid: M.string(),
    summary: M.string(),
  },
  {
    author: M.string(),
    committedAt: M.number(),
  },
);

export const GitInterface = M.interface('Git', {
  worktree: M.call().returns(M.remotable('EndoMount')),
  status: M.callWhen().returns(M.arrayOf(GitStatusEntryShape)),
  diff: M.callWhen()
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.string()),
  log: M.callWhen()
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.arrayOf(GitCommitShape)),
  show: M.callWhen(RefArgShape).returns(M.string()),
  revParse: M.callWhen(RefArgShape).returns(GitRefShape),
  add: M.callWhen(M.arrayOf(M.remotable())).returns(M.undefined()),
  restore: M.callWhen(M.arrayOf(M.remotable()))
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.undefined()),
  commit: M.callWhen(M.string()).returns(GitCommitShape),
  currentBranch: M.callWhen().returns(M.or(GitRefShape, M.undefined())),
  branches: M.callWhen().returns(M.arrayOf(GitRefShape)),
  createBranch: M.callWhen(M.string())
    .optional(M.recordOf(M.string(), M.any()))
    .returns(GitRefShape),
  deleteBranch: M.callWhen(M.string())
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.undefined()),
  renameBranch: M.callWhen(M.string(), M.string()).returns(M.undefined()),
  switchBranch: M.callWhen(M.string()).returns(M.undefined()),
  detach: M.callWhen(RefArgShape).returns(M.undefined()),
  switch: M.callWhen(RefArgShape).returns(M.undefined()),
  merge: M.callWhen(RefArgShape)
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.string()),
  rebase: M.callWhen(M.recordOf(M.string(), M.any())).returns(M.string()),
  stashPush: M.callWhen()
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.string()),
  stashList: M.callWhen().returns(M.arrayOf(M.string())),
  stashShow: M.callWhen().optional(M.number()).returns(M.string()),
  stashApply: M.callWhen().optional(M.number()).returns(M.undefined()),
  stashPop: M.callWhen().optional(M.number()).returns(M.undefined()),
  stashDrop: M.callWhen().optional(M.number()).returns(M.undefined()),
  tree: M.callWhen(RefArgShape).returns(M.remotable('EndoReadableTree')),
  filesystemAt: M.callWhen(RefArgShape).returns(M.remotable('Filesystem')),
  readOnly: M.call().returns(M.remotable('Git')),
});

export const GitRemoteInterface = M.interface('GitRemote', {
  inspect: M.call().returns(M.promise()),
  fetch: M.call()
    .optional(M.recordOf(M.string(), M.any()))
    .returns(M.promise()),
  pull: M.call().optional(M.recordOf(M.string(), M.any())).returns(M.promise()),
  push: M.call().optional(M.recordOf(M.string(), M.any())).returns(M.promise()),
});

export const GitRemoteControllerInterface = M.interface('GitRemoteController', {
  inspect: M.call().returns(M.promise()),
  audit: M.call().returns(M.promise()),
  setAllowedDirections: M.call(M.arrayOf(GitDirectionShape)).returns(
    M.promise(),
  ),
  setFetchRefspecs: M.call(M.arrayOf(M.string())).returns(M.promise()),
  setPushRefspecs: M.call(M.arrayOf(M.string())).returns(M.promise()),
  setAllowedBranches: M.call(M.arrayOf(M.string())).returns(M.promise()),
  setAllowForcePush: M.call(M.boolean()).returns(M.promise()),
  setAllowTags: M.call(M.boolean()).returns(M.promise()),
  setAllowDelete: M.call(M.boolean()).returns(M.promise()),
  revoke: M.call().returns(M.promise()),
});

export const GitCredentialControllerInterface = M.interface(
  'GitCredentialController',
  {
    inspect: M.call().returns(M.promise()),
    rotate: M.call(M.recordOf(M.string(), M.any())).returns(M.promise()),
    revoke: M.call().returns(M.promise()),
  },
);

export const BearerCredentialInterface = M.interface('BearerCredential', {
  audience: M.call().returns(M.string()),
});

export const BasicCredentialInterface = M.interface('BasicCredential', {
  audience: M.call().returns(M.string()),
});

export const ReadableTreeInterface = M.interface('EndoReadableTree', {
  help: M.call().optional(M.string()).returns(M.string()),
  sha256: M.call().returns(M.string()),
  has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
  lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(M.promise()),
});

export const DaemonFacetForWorkerInterface = M.interface(
  'EndoDaemonFacetForWorker',
  {},
);

export const WorkerFacetForDaemonInterface = M.interface(
  'EndoWorkerFacetForDaemon',
  {
    terminate: M.call().returns(M.promise()),
    evaluate: M.call(
      M.string(),
      M.arrayOf(M.string()),
      M.arrayOf(M.any()),
      IdShape,
      M.promise(),
    ).returns(M.promise()),
    // Args: (readableP, powersP, contextP, env) — readable is a ZIP
    // archive of a compartment-map plus source-form modules.  These
    // methods receive promises that get resolved inside the worker.
    makeArchive: M.call(M.any(), M.any(), M.any(), EnvShape).returns(
      M.promise(),
    ),
    // Args: (treeP, powersP, contextP, env) — tree is a ReadableTree
    // or Mount whose layout mirrors a compartment-mapper archive
    // (compartment-map.json at root plus modules at their referenced
    // paths).
    makeFromTree: M.call(M.any(), M.any(), M.any(), EnvShape).returns(
      M.promise(),
    ),
    // Args: (specifier, powersP, contextP, env)
    makeUnconfined: M.call(M.string(), M.any(), M.any(), EnvShape).returns(
      M.promise(),
    ),
  },
);

export const EndoInterface = M.interface('Endo', {
  help: M.call().optional(M.string()).returns(M.string()),
  ping: M.call().returns(M.promise()),
  terminate: M.call().returns(M.promise()),
  host: M.call().returns(M.promise()),
  leastAuthority: M.call().returns(M.promise()),
  greeter: M.call().returns(M.promise()),
  gateway: M.call().returns(M.promise()),
  nodeId: M.call().returns(M.string()),
  sign: M.call(M.string()).returns(M.promise()),
  reviveNetworks: M.call().returns(M.promise()),
  revivePins: M.call().returns(M.promise()),
  addPeerInfo: M.call(M.record()).returns(M.promise()),
  listKnownPeers: M.call().returns(M.promise()),
  followPeerChanges: M.call().returns(M.promise()),
});
