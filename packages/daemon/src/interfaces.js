// @ts-check

import { M } from '@endo/patterns';

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

// Options for makeUnconfined and makeBundle
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

export const ResponderInterface = M.interface('EndoResponder', {
  resolveWithId: M.call(M.or(IdShape, M.promise())).returns(),
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
  // Request sandboxed evaluation (guest -> host)
  requestEvaluation: M.call(
    M.string(), // source
    M.arrayOf(M.string()), // codeNames
    NamesOrPathsShape, // petNamePaths
  )
    .optional(NameOrPathShape) // resultName
    .returns(M.promise()),
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
  // Make a bundle caplet
  makeBundle: M.call(M.or(NameShape, M.undefined()), NameShape)
    .optional(MakeCapletOptionsShape)
    .returns(M.promise()),
  // Create a channel
  makeChannel: M.call(NameShape, M.string()).returns(M.promise()),
  // Create a timer
  makeTimer: M.call(NameShape, M.number()).optional(M.string()).returns(M.promise()),
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
  // Approve a sandboxed evaluation request
  approveEvaluation: M.call(MessageNumberShape)
    .optional(M.or(NameShape, M.undefined()))
    .returns(M.promise()),
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
    .optional(M.or(M.string(), M.undefined()), M.arrayOf(IdShape), M.or(M.string(), M.undefined()))
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
    .optional(M.or(M.string(), M.undefined()), M.arrayOf(IdShape), M.or(M.string(), M.undefined()))
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
const PathArgShape = M.or(M.string(), PathSegmentsShape);

export const MountInterface = M.interface('EndoMount', {
  // ReadableTree-compatible surface
  has: M.call().rest(PathSegmentsShape).returns(M.promise()),
  list: M.call().rest(PathSegmentsShape).returns(M.promise()),
  lookup: M.call(PathArgShape).returns(M.promise()),
  // Raw data I/O
  readText: M.call(PathArgShape).returns(M.promise()),
  maybeReadText: M.call(PathArgShape).returns(M.promise()),
  writeText: M.call(PathArgShape, M.string()).returns(M.promise()),
  // Mutation
  remove: M.call(PathArgShape).returns(M.promise()),
  move: M.call(PathArgShape, PathArgShape).returns(M.promise()),
  makeDirectory: M.call(PathArgShape).returns(M.promise()),
  // Attenuation
  readOnly: M.call().returns(M.remotable()),
  // Snapshot
  snapshot: M.call().returns(M.promise()),
  // Discoverability
  help: M.call().returns(M.string()),
});

export const MountFileInterface = M.interface('EndoMountFile', {
  text: M.call().returns(M.promise()),
  streamBase64: M.call().returns(M.remotable()),
  json: M.call().returns(M.promise()),
  writeText: M.call(M.string()).returns(M.promise()),
  writeBytes: M.call(M.remotable()).returns(M.promise()),
  readOnly: M.call().returns(M.remotable()),
  help: M.call().returns(M.string()),
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
    // These methods receive promises that get resolved inside the worker
    // Args: (readableP, powersP, contextP, env)
    makeBundle: M.call(M.any(), M.any(), M.any(), EnvShape).returns(
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
