// @ts-check

import harden from '@endo/harden';

/**
 * Per-formula-type back-face layouts for the Value modal Formula view.
 *
 * Each registry entry names the formula type, the user-facing header,
 * a one-line help text, and an ordered `propertyList` that declares
 * which properties to render and in what order. The runtime renderer
 * in `formula-view.js` consults this registry to drive the
 * back-face layout, classifying each property's value (literal, single
 * reference, or reference list) at render time.
 *
 * The registry mirrors the Formula-view layout taxonomy in
 * `designs/formula-inspector.md`. Adding a new formula type means
 * adding (or updating) a row here and (when the formula carries
 * retained references or distinctive literals) updating
 * `packages/daemon/src/formula-record.js` so the daemon ships the
 * matching properties.
 *
 * @typedef {object} FormulaViewSpec
 * @property {string} header             Short, human-facing type label.
 * @property {string} helpText           One-line explanation of the type.
 * @property {string[]} propertyList     Ordered property names this type
 *                                       surfaces. Properties absent from
 *                                       the daemon's record render as a
 *                                       muted "(not yet exposed)" row;
 *                                       properties present on the record
 *                                       but absent from this list render
 *                                       in their declared order below the
 *                                       known list, so additive daemon
 *                                       changes never become invisible.
 * @property {string} [emptyStateText]   Override for the empty-state row
 *                                       when `propertyList` is empty.
 * @property {string[]} [omitProperties] Properties the daemon may carry
 *                                       but that the back face must
 *                                       suppress for security or privacy
 *                                       reasons (today: `keypair`'s
 *                                       `privateKey`).
 * @property {Record<string, string>} [overrideLabels]
 *                                       Optional per-property label
 *                                       overrides for cases where the
 *                                       formula schema's property name
 *                                       is not the most natural button
 *                                       label.
 */

/**
 * @type {Record<string, FormulaViewSpec>}
 */
const REGISTRY = {
  // @ts-expect-error confused by __proto__
  __proto__: null,
  eval: {
    header: 'Evaluation',
    helpText: 'Code run inside a worker.',
    propertyList: ['source', 'endowments', 'worker'],
  },
  lookup: {
    header: 'Lookup',
    helpText: 'Name traversal through a hub.',
    propertyList: ['hub', 'path'],
  },
  guest: {
    header: 'Guest',
    helpText: 'Sub-agent of a host.',
    propertyList: [
      'hostAgent',
      'hostHandle',
      'handle',
      'petStore',
      'mailboxStore',
      'mailHub',
      'worker',
    ],
  },
  host: {
    header: 'Host',
    helpText: 'Agent identity.',
    propertyList: [
      'handle',
      'hostHandle',
      'mainWorker',
      'nodeWorker',
      'inspector',
      'petStore',
      'mailboxStore',
      'mailHub',
      'endo',
      'networks',
      'pins',
    ],
  },
  directory: {
    header: 'Directory',
    helpText: 'Naming hub.',
    propertyList: ['petStore'],
  },
  'pet-store': {
    header: 'Pet store',
    helpText: 'Name-to-id table.',
    propertyList: [],
    emptyStateText: 'No formula properties; this is a leaf store.',
  },
  'mailbox-store': {
    header: 'Mailbox store',
    helpText: 'Inbox-and-outbox storage.',
    propertyList: [],
    emptyStateText: 'No formula properties; this is a leaf store.',
  },
  'mail-hub': {
    header: 'Mail hub',
    helpText: 'Inbox-and-outbox facet over a store.',
    propertyList: ['store'],
  },
  message: {
    header: 'Message',
    helpText: 'A message in a mailbox.',
    propertyList: [
      'messageType',
      'from',
      'to',
      'date',
      'description',
      'promise',
      'resolver',
      'strings',
      'names',
    ],
  },
  'make-unconfined': {
    header: 'Make-unconfined',
    helpText: 'Unconfined code loaded from a specifier.',
    propertyList: ['specifier', 'powers', 'worker'],
  },
  'make-archive': {
    header: 'Make-archive',
    helpText: 'Code loaded from an archive.',
    propertyList: ['archive', 'powers', 'worker'],
  },
  'make-from-tree': {
    header: 'Make-from-tree',
    helpText: 'Code loaded from a readable tree.',
    propertyList: ['tree', 'powers', 'worker'],
  },
  peer: {
    header: 'Peer',
    helpText: 'Remote node.',
    propertyList: ['node', 'addresses', 'networks'],
  },
  mount: {
    header: 'Mount',
    helpText: 'Filesystem capability.',
    propertyList: ['path', 'readOnly'],
  },
  'scratch-mount': {
    header: 'Scratch mount',
    helpText: 'Daemon-managed scratch directory.',
    propertyList: ['path', 'readOnly'],
  },
  git: {
    header: 'Git',
    helpText: 'Git working tree.',
    propertyList: [],
    emptyStateText:
      'Properties not yet exposed; see designs/daemon-git-capability.md.',
  },
  'git-credential': {
    header: 'Git credential',
    helpText: 'Git authentication material.',
    propertyList: [],
    emptyStateText:
      'Properties not yet exposed; see designs/daemon-git-capability.md.',
  },
  'git-remote': {
    header: 'Git remote',
    helpText: 'Git remote endpoint.',
    propertyList: [],
    emptyStateText:
      'Properties not yet exposed; see designs/daemon-git-capability.md.',
  },
  channel: {
    header: 'Channel',
    helpText: 'Thread substrate.',
    propertyList: [],
    emptyStateText:
      'Properties not yet exposed; see designs/daemon-message-streaming.md.',
  },
  'readable-blob': {
    header: 'Readable blob',
    helpText: 'Immutable bytes.',
    propertyList: ['content'],
  },
  'readable-tree': {
    header: 'Readable tree',
    helpText: 'Immutable snapshot.',
    propertyList: [],
    emptyStateText:
      'An immutable snapshot of a directory of files and subtrees. Its ' +
      'contents are content-addressed by hash rather than referenced as ' +
      'separate formulas, so this view carries no formula references — the ' +
      "tree's entries are listed below instead.",
  },
  promise: {
    header: 'Promise',
    helpText: 'Pending result.',
    propertyList: ['store'],
  },
  resolver: {
    header: 'Resolver',
    helpText: 'Write-half of a promise.',
    propertyList: ['store'],
  },
  worker: {
    header: 'Worker',
    helpText: 'Execution sandbox.',
    propertyList: [],
    emptyStateText: 'Leaf formula; no retained references or literals.',
  },
  handle: {
    header: 'Handle',
    helpText:
      'Lets the holder send messages to the corresponding agent, or ' +
      'verify that a message from that agent is genuine.',
    propertyList: ['agent'],
  },
  // Reserved for a future daemon-side `keypair` formula type. The
  // type is not yet enumerated in `packages/daemon/src/formula-type.js`;
  // this spec defines the back-face contract (and the privacy-suppression
  // of `privateKey`) so the surface is ready when the daemon side lands.
  // See follow-up tracked at `designs/formula-inspector.md` (Forward
  // compatibility section).
  keypair: {
    header: 'Keypair',
    helpText: 'Ed25519 key material.',
    propertyList: ['publicKey'],
    omitProperties: ['privateKey'],
  },
  endo: {
    header: 'Endo bootstrap',
    helpText: 'Root of the formula graph.',
    propertyList: [],
    emptyStateText:
      'Root references are deferred to a follow-up; see designs/formula-inspector.md.',
  },
  invitation: {
    header: 'Invitation',
    helpText: 'Pending guest enrollment.',
    propertyList: ['hostAgent', 'hostHandle', 'guestName'],
  },
  'pet-inspector': {
    header: 'Pet inspector',
    helpText: 'Vestigial inspector facet (retained for on-disk compatibility).',
    propertyList: ['petStore'],
  },
  'least-authority': {
    header: 'Least authority',
    helpText: 'Powerless capability used as a baseline.',
    propertyList: [],
    emptyStateText: 'Leaf formula; no retained references or literals.',
  },
  'known-peers-store': {
    header: 'Known peers store',
    helpText: 'Persisted record of known remote peers.',
    propertyList: [],
    emptyStateText: 'Leaf formula; no retained references or literals.',
  },
  'loopback-network': {
    header: 'Loopback network',
    helpText: 'Local in-process network substrate.',
    propertyList: [],
    emptyStateText: 'Leaf formula; no retained references or literals.',
  },
  marshal: {
    header: 'Marshal',
    helpText: 'A passable encoded for storage or transit.',
    propertyList: ['body', 'slots'],
  },
  timer: {
    header: 'Timer',
    helpText: 'Periodic notification.',
    propertyList: ['intervalMs', 'label'],
  },
};

harden(REGISTRY);

/**
 * Look up the back-face spec for a formula type. Unknown types fall
 * back to a generic "unknown" spec so the back face still renders a
 * coherent header instead of failing the modal session.
 *
 * @param {string} formulaType
 * @returns {FormulaViewSpec}
 */
export const getFormulaViewSpec = formulaType => {
  const spec = REGISTRY[formulaType];
  if (spec) return spec;
  return harden({
    header: formulaType,
    helpText: 'Unknown formula type.',
    propertyList: [],
    emptyStateText:
      'Unknown formula type. The chat client may be older than the daemon; check for an update.',
  });
};
harden(getFormulaViewSpec);

/**
 * Enumerate every registered formula type. Used by unit tests to
 * assert that the registry covers the canonical type list and by the
 * inspector to render type badges in the modeline.
 *
 * @returns {string[]}
 */
export const listKnownFormulaTypes = () =>
  /** @type {string[]} */ (harden(Object.keys(REGISTRY)));
harden(listKnownFormulaTypes);
