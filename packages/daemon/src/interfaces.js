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

// Message numbers are non-negative integers
const MessageNumberShape = M.number();

// Environment variables as string-to-string record
const EnvShape = M.recordOf(M.string(), M.string());

// Options for makeUnconfined and makeBundle
const MakeCapletOptionsShape = M.splitRecord(
  {},
  { powersName: NameShape, resultName: NameOrPathShape, env: EnvShape },
);

// Shared method guard for evaluate (used by both Host and Guest)
// Host.evaluate executes directly; Guest.evaluate sends an eval-proposal
const EvaluateMethodGuard = M.call(
  M.or(NameShape, M.undefined()),
  M.string(),
  M.arrayOf(M.string()),
  NamesOrPathsShape,
)
  .optional(NamePathShape)
  .returns(M.promise());

// #region Interfaces

export const WorkerInterface = M.interface('EndoWorker', {});

export const ResponderInterface = M.interface('EndoResponder', {
  respondId: M.call(M.or(IdShape, M.promise())).returns(),
});

export const EnvelopeInterface = M.interface('EndoEnvelope', {});

export const DismisserInterface = M.interface('EndoDismisser', {
  dismiss: M.call().returns(),
});

export const HandleInterface = M.interface('EndoHandle', {
  receive: M.call(M.remotable('Envelope'), IdShape).returns(M.promise()),
  open: M.call(M.remotable('Envelope')).returns(M.record()),
});

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
  // Subscribe to name changes (returns iterator ref)
  followNameChanges: M.call().returns(M.remotable()),
  // Resolve a name path to a value
  lookup: M.call(NameOrPathShape).returns(M.promise()),
  // Get names for a value
  reverseLookup: M.call(M.any()).returns(M.promise()),
  // Store a formula identifier with a name
  write: M.call(NameOrPathShape, IdShape).returns(M.promise()),
  // Remove a name
  remove: M.call().rest(NamePathShape).returns(M.promise()),
  // Move/rename a reference
  move: M.call(NamePathShape, NamePathShape).returns(M.promise()),
  // Copy a reference
  copy: M.call(NamePathShape, NamePathShape).returns(M.promise()),
  // Create a new directory
  makeDirectory: M.call(NamePathShape).returns(M.promise()),
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
  followLocatorNameChanges: M.call(LocatorShape).returns(M.remotable()),
  list: M.call().rest(NamePathShape).returns(M.promise()),
  listIdentifiers: M.call().rest(NamePathShape).returns(M.promise()),
  followNameChanges: M.call().returns(M.remotable()),
  lookup: M.call(NameOrPathShape).returns(M.promise()),
  reverseLookup: M.call(M.any()).returns(M.promise()),
  write: M.call(NameOrPathShape, IdShape).returns(M.promise()),
  remove: M.call().rest(NamePathShape).returns(M.promise()),
  move: M.call(NamePathShape, NamePathShape).returns(M.promise()),
  copy: M.call(NamePathShape, NamePathShape).returns(M.promise()),
  makeDirectory: M.call(NamePathShape).returns(M.promise()),
  // Mail
  // Get the guest's mailbox handle
  handle: M.call().returns(M.remotable()),
  // List all messages
  listMessages: M.call().returns(M.promise()),
  // Subscribe to messages (returns iterator ref)
  followMessages: M.call().returns(M.remotable()),
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
  ).returns(M.promise()),
  // Request sandboxed evaluation (guest -> host)
  requestEvaluation: M.call(
    M.string(),                    // source
    M.arrayOf(M.string()),         // codeNames
    NamesOrPathsShape,             // petNamePaths
  ).optional(NameOrPathShape)      // resultName
    .returns(M.promise()),
  // Internal: deliver a message
  deliver: M.call(M.record()).returns(),
  // Propose code evaluation to host (same signature as Host.evaluate)
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
  followLocatorNameChanges: M.call(LocatorShape).returns(M.remotable()),
  list: M.call().rest(NamePathShape).returns(M.promise()),
  listIdentifiers: M.call().rest(NamePathShape).returns(M.promise()),
  followNameChanges: M.call().returns(M.remotable()),
  lookup: M.call(NameOrPathShape).returns(M.promise()),
  reverseLookup: M.call(M.any()).returns(M.promise()),
  write: M.call(NameOrPathShape, IdShape).returns(M.promise()),
  remove: M.call().rest(NamePathShape).returns(M.promise()),
  move: M.call(NamePathShape, NamePathShape).returns(M.promise()),
  copy: M.call(NamePathShape, NamePathShape).returns(M.promise()),
  makeDirectory: M.call(NamePathShape).returns(M.promise()),
  // Mail
  handle: M.call().returns(M.remotable()),
  listMessages: M.call().returns(M.promise()),
  followMessages: M.call().returns(M.remotable()),
  resolve: M.call(MessageNumberShape, NameOrPathShape).returns(M.promise()),
  reject: M.call(MessageNumberShape).optional(M.string()).returns(M.promise()),
  adopt: M.call(MessageNumberShape, NameOrPathShape, NameOrPathShape).returns(
    M.promise(),
  ),
  dismiss: M.call(MessageNumberShape).returns(M.promise()),
  request: M.call(NameOrPathShape, M.string())
    .optional(NameOrPathShape)
    .returns(M.promise()),
  send: M.call(
    NameOrPathShape,
    M.arrayOf(M.string()),
    EdgeNamesShape,
    NamesOrPathsShape,
  ).returns(M.promise()),
  deliver: M.call(M.record()).returns(),
  // Host
  // Store a blob
  storeBlob: M.call(M.remotable()).optional(NameShape).returns(M.promise()),
  // Store a passable value
  storeValue: M.call(M.any(), NameOrPathShape).returns(M.promise()),
  // Provide a guest
  provideGuest: M.call().optional(NameShape, M.record()).returns(M.promise()),
  // Provide a host
  provideHost: M.call().optional(NameShape, M.record()).returns(M.promise()),
  // Provide a worker
  provideWorker: M.call(NamePathShape).returns(M.promise()),
  // Evaluate code (Host executes directly; Guest sends eval-proposal)
  evaluate: EvaluateMethodGuard,
  // Make an unconfined caplet
  makeUnconfined: M.call(M.or(NameShape, M.undefined()), M.string())
    .optional(MakeCapletOptionsShape)
    .returns(M.promise()),
  // Make a bundle caplet
  makeBundle: M.call(M.or(NameShape, M.undefined()), NameShape)
    .optional(MakeCapletOptionsShape)
    .returns(M.promise()),
  // Cancel a value
  cancel: M.call(NameOrPathShape).optional(M.error()).returns(M.promise()),
  // Get the greeter
  greeter: M.call().returns(M.promise()),
  // Get the gateway
  gateway: M.call().returns(M.promise()),
  // Get peer info
  getPeerInfo: M.call().returns(M.promise()),
  // Add peer info
  addPeerInfo: M.call(M.record()).returns(M.promise()),
  // Create an invitation
  invite: M.call(NameShape).returns(M.promise()),
  // Accept an invitation
  accept: M.call(LocatorShape, NameShape).returns(M.promise()),
  // Approve a sandboxed evaluation request
  approveEvaluation: M.call(MessageNumberShape)
    .optional(M.or(NameShape, M.undefined()))
    .returns(M.promise()),
  // Grant an eval-proposal (execute the proposed code)
  grantEvaluate: M.call(MessageNumberShape).returns(M.promise()),
  // Send a counter-proposal back to the proposer
  counterEvaluate: M.call(
    MessageNumberShape,
    M.string(),
    M.arrayOf(M.string()),
    NamesOrPathsShape,
  )
    .optional(M.or(NameShape, M.undefined()), NamePathShape)
    .returns(M.promise()),
});

export const InvitationInterface = M.interface('EndoInvitation', {
  accept: M.call(IdShape).returns(M.promise()),
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
  sha512: M.call().returns(M.string()),
  streamBase64: M.call().returns(M.remotable()),
  text: M.call().returns(M.promise()),
  json: M.call().returns(M.promise()),
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
  reviveNetworks: M.call().returns(M.promise()),
  revivePins: M.call().returns(M.promise()),
  addPeerInfo: M.call(M.record()).returns(M.promise()),
});
