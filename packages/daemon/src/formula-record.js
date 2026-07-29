// @ts-check

/** @import { Formula, FormulaIdentifier, FormulaNumber, FormulaProperty, FormulaRecord } from './types.js' */

/**
 * Convert a daemon-internal `Formula` object plus its formula number into
 * the normalized `FormulaRecord` shape that `EndoHost.getFormula` returns.
 *
 * Each property of the record is classified as one of three kinds:
 *
 * - `literal` for plain passable values (strings, arrays, and similar).
 * - `reference` for a single retained `FormulaIdentifier`.
 * - `reference-list` for a code-name-keyed record of retained
 *   `FormulaIdentifier`s (for example, an `eval`'s `endowments`).
 *
 * Per-type metadata is curated here rather than in `host.js` so the
 * per-type table can evolve alongside the formula schema in
 * `types.d.ts`. Adding a new formula type or a new property
 * touches this file in one place.
 *
 * See `designs/formula-inspector.md` "Formula-view layout taxonomy"
 * section for the per-type property catalog.
 *
 * @param {Formula} formula
 * @param {FormulaNumber} number
 * @param {object} [options]
 * @param {string} [options.mountHostPath] On-disk filesystem path for a
 *   `scratch-mount` formula, resolved host-side via `getMountHostPath`.
 *   A `scratch-mount` formula does not carry its path on disk (the daemon
 *   derives it from the formula number), so the host supplies it here.
 * @returns {FormulaRecord}
 */
export const makeFormulaRecord = (formula, number, options = {}) => {
  const { mountHostPath } = options;
  /** @type {Record<string, FormulaProperty>} */
  const properties = {};

  switch (formula.type) {
    case 'eval': {
      properties.source = { kind: 'literal', value: formula.source };
      properties.worker = { kind: 'reference', identifier: formula.worker };
      /** @type {Record<string, FormulaIdentifier>} */
      const endowments = {};
      for (let i = 0; i < formula.names.length; i += 1) {
        endowments[formula.names[i]] = formula.values[i];
      }
      properties.endowments = { kind: 'reference-list', entries: endowments };
      break;
    }
    case 'lookup': {
      properties.hub = { kind: 'reference', identifier: formula.hub };
      properties.path = { kind: 'literal', value: formula.path };
      break;
    }
    case 'guest': {
      properties.hostAgent = {
        kind: 'reference',
        identifier: formula.hostAgent,
      };
      properties.hostHandle = {
        kind: 'reference',
        identifier: formula.hostHandle,
      };
      properties.handle = { kind: 'reference', identifier: formula.handle };
      properties.petStore = {
        kind: 'reference',
        identifier: formula.petStore,
      };
      properties.mailboxStore = {
        kind: 'reference',
        identifier: formula.mailboxStore,
      };
      properties.mailHub = {
        kind: 'reference',
        identifier: formula.mailHub,
      };
      properties.worker = { kind: 'reference', identifier: formula.worker };
      break;
    }
    case 'host': {
      properties.handle = { kind: 'reference', identifier: formula.handle };
      properties.hostHandle = {
        kind: 'reference',
        identifier: formula.hostHandle,
      };
      properties.mainWorker = {
        kind: 'reference',
        identifier: formula.mainWorker,
      };
      properties.nodeWorker = {
        kind: 'reference',
        identifier: formula.nodeWorker,
      };
      properties.inspector = {
        kind: 'reference',
        identifier: formula.inspector,
      };
      properties.petStore = {
        kind: 'reference',
        identifier: formula.petStore,
      };
      properties.mailboxStore = {
        kind: 'reference',
        identifier: formula.mailboxStore,
      };
      properties.mailHub = { kind: 'reference', identifier: formula.mailHub };
      properties.endo = { kind: 'reference', identifier: formula.endo };
      properties.networks = {
        kind: 'reference',
        identifier: formula.networks,
      };
      properties.planes = {
        kind: 'reference',
        identifier: formula.planes,
      };
      properties.pins = { kind: 'reference', identifier: formula.pins };
      break;
    }
    case 'make-archive': {
      properties.archive = { kind: 'reference', identifier: formula.archive };
      properties.powers = { kind: 'reference', identifier: formula.powers };
      properties.worker = { kind: 'reference', identifier: formula.worker };
      break;
    }
    case 'make-from-tree': {
      properties.tree = { kind: 'reference', identifier: formula.tree };
      properties.powers = { kind: 'reference', identifier: formula.powers };
      properties.worker = { kind: 'reference', identifier: formula.worker };
      break;
    }
    case 'make-unconfined': {
      properties.specifier = { kind: 'literal', value: formula.specifier };
      properties.powers = { kind: 'reference', identifier: formula.powers };
      properties.worker = { kind: 'reference', identifier: formula.worker };
      break;
    }
    case 'peer': {
      properties.node = { kind: 'literal', value: formula.node };
      properties.addresses = { kind: 'literal', value: formula.addresses };
      properties.networks = {
        kind: 'reference',
        identifier: formula.networks,
      };
      break;
    }
    case 'directory': {
      properties.petStore = {
        kind: 'reference',
        identifier: formula.petStore,
      };
      break;
    }
    case 'pet-inspector': {
      properties.petStore = {
        kind: 'reference',
        identifier: formula.petStore,
      };
      break;
    }
    case 'mail-hub': {
      properties.store = { kind: 'reference', identifier: formula.store };
      break;
    }
    case 'message': {
      properties.messageType = {
        kind: 'literal',
        value: formula.messageType,
      };
      properties.from = { kind: 'reference', identifier: formula.from };
      properties.to = { kind: 'reference', identifier: formula.to };
      properties.date = { kind: 'literal', value: formula.date };
      if (formula.description !== undefined) {
        properties.description = {
          kind: 'literal',
          value: formula.description,
        };
      }
      if (formula.promiseId !== undefined) {
        properties.promise = {
          kind: 'reference',
          identifier: formula.promiseId,
        };
      }
      if (formula.resolverId !== undefined) {
        properties.resolver = {
          kind: 'reference',
          identifier: formula.resolverId,
        };
      }
      if (formula.strings !== undefined) {
        properties.strings = { kind: 'literal', value: formula.strings };
      }
      if (formula.names !== undefined && formula.ids !== undefined) {
        /** @type {Record<string, FormulaIdentifier>} */
        const named = {};
        for (let i = 0; i < formula.names.length; i += 1) {
          named[formula.names[i]] = formula.ids[i];
        }
        properties.names = { kind: 'reference-list', entries: named };
      }
      break;
    }
    case 'promise': {
      properties.store = { kind: 'reference', identifier: formula.store };
      break;
    }
    case 'resolver': {
      properties.store = { kind: 'reference', identifier: formula.store };
      break;
    }
    case 'handle': {
      properties.agent = { kind: 'reference', identifier: formula.agent };
      break;
    }
    case 'readable-blob': {
      properties.content = { kind: 'literal', value: formula.content };
      break;
    }
    case 'registry': {
      properties.registryUrl = { kind: 'literal', value: formula.registryUrl };
      break;
    }
    case 'marshal': {
      properties.body = { kind: 'literal', value: formula.body };
      /** @type {Record<string, FormulaIdentifier>} */
      const slotEntries = {};
      for (let i = 0; i < formula.slots.length; i += 1) {
        slotEntries[String(i)] = formula.slots[i];
      }
      properties.slots = { kind: 'reference-list', entries: slotEntries };
      break;
    }
    case 'invitation': {
      properties.hostAgent = {
        kind: 'reference',
        identifier: formula.hostAgent,
      };
      properties.hostHandle = {
        kind: 'reference',
        identifier: formula.hostHandle,
      };
      properties.guestName = { kind: 'literal', value: formula.guestName };
      break;
    }
    case 'mount': {
      properties.path = { kind: 'literal', value: formula.path };
      properties.readOnly = { kind: 'literal', value: formula.readOnly };
      break;
    }
    case 'scratch-mount': {
      // A scratch-mount carries no path on disk; the daemon derives it
      // from the formula number. The host resolves it via
      // `getMountHostPath` and passes it in as `mountHostPath`. When the
      // path is unavailable (formula collected since resolution), the
      // property is omitted and the inspector renders its absent state.
      if (mountHostPath !== undefined) {
        properties.path = { kind: 'literal', value: mountHostPath };
      }
      properties.readOnly = { kind: 'literal', value: formula.readOnly };
      break;
    }
    case 'http-client': {
      // Surface the formula-owned policy bounds (allowlist and limits) as
      // literals for inspector auditability. The `fetch`/`now` seams are
      // host-owned and never persisted, so there is nothing host-private here.
      properties.allowedOrigins = {
        kind: 'literal',
        value: formula.policy.allowedOrigins,
      };
      properties.maxRequestsPerMinute = {
        kind: 'literal',
        value: formula.policy.maxRequestsPerMinute,
      };
      properties.maxResponseBytes = {
        kind: 'literal',
        value: formula.policy.maxResponseBytes,
      };
      properties.policyMode = {
        kind: 'literal',
        value: formula.policy.policyMode,
      };
      break;
    }
    case 'endo':
    case 'worker':
    case 'pet-store':
    case 'mailbox-store':
    case 'known-peers-store':
    case 'least-authority':
    case 'loopback-network': {
      // Empty-state formula types: the formula type itself is meaningful
      // (the daemon knows what kind of capability this represents) but
      // there are no formula-level retained references or literals to
      // surface. The inspector renderer handles the empty state.
      break;
    }
    default: {
      // Forward-compatibility fallthrough: surface unknown formula
      // types as empty-properties records rather than throwing. New
      // formula types added to formula-type.js without a corresponding
      // entry here render as bare type names in the inspector.
      break;
    }
  }

  return harden({
    type: formula.type,
    number,
    properties,
  });
};
