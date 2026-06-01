// @ts-check

/**
 * @file In-memory virtual-host routing table for the gateway.
 *
 * The gateway routes incoming HTTP and WebSocket traffic by the
 * `Host` header to the corresponding weblet. The mapping is held
 * in an `AppsNameHub` exo (`@apps` per
 * `designs/gateway-package.md` § Feature 2) that the host agent
 * binds and the gateway reads.
 *
 * The phase-1 skeleton holds only the in-memory map; the design's
 * Weblet formula resolution and content-tree serving are
 * follow-on work. The map records `(virtualHostName,
 * webletFormulaId)` pairs and exposes `bind`, `unbind`, `list`,
 * and `lookup`.
 *
 * Naming: virtual-host *names* are case-insensitive per RFC 7230
 * (HTTP `Host` headers), so this module normalizes to lowercase
 * before insertion and lookup.
 */

import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makeError, q, X } from '@endo/errors';

/**
 * Validate and normalize a virtual-host name. RFC 1123 hostnames
 * are case-insensitive ASCII; this normalization keeps the table
 * keys canonical so a `bind('Chat.example.com', ...)` followed by
 * a `lookup('chat.example.com')` resolves.
 *
 * @param {string} name
 * @returns {string}
 */
export const normalizeVirtualHostName = name => {
  if (typeof name !== 'string' || name.length === 0) {
    throw makeError(
      X`Virtual host name must be a non-empty string, got ${q(name)}`,
    );
  }
  if (name.length > 253) {
    // RFC 1035: a hostname can be up to 253 octets.
    throw makeError(X`Virtual host name exceeds 253 octets: ${q(name.length)}`);
  }
  // The Host header may include a port. We accept either shape
  // but key on the host-only portion to match the routing
  // contract.
  const colonIndex = name.indexOf(':');
  const hostPart = colonIndex < 0 ? name : name.slice(0, colonIndex);
  if (hostPart.length === 0) {
    throw makeError(X`Virtual host name has empty host part: ${q(name)}`);
  }
  // Reject obviously-invalid hostname characters. We accept ASCII
  // letters, digits, hyphens, and dots. Other characters
  // (whitespace, control characters, slashes) are rejected. The
  // Host header is server-side input; we are strict.
  if (!/^[A-Za-z0-9.-]+$/.test(hostPart)) {
    throw makeError(
      X`Virtual host name contains invalid characters: ${q(name)}`,
    );
  }
  return hostPart.toLowerCase();
};
harden(normalizeVirtualHostName);

const VirtualHostShape = M.string();

const AppsNameHubInterface = M.interface('AppsNameHub', {
  bind: M.call(M.string(), M.string()).returns(M.promise()),
  unbind: M.call(M.string()).returns(M.promise()),
  list: M.call().returns(M.promise()),
  lookup: M.call(M.string()).returns(M.promise()),
  has: M.call(M.string()).returns(M.promise()),
});
harden(AppsNameHubInterface);

/**
 * @typedef {object} VirtualHostEntry
 * @property {string} name The lowercased virtual-host name.
 * @property {string} webletFormulaId The formula identifier the
 *   gateway should resolve when serving this host. The current
 *   slice holds the identifier as an opaque string; later phases
 *   replace it with a typed FormulaIdentifier.
 */

/**
 * @typedef {object} AppsNameHub
 * @property {(name: string, webletFormulaId: string) => Promise<void>} bind
 *   Bind a virtual host to a weblet formula. Throws on collision
 *   with the design's first-bind-wins policy; later phases relax
 *   this to operator policy.
 * @property {(name: string) => Promise<void>} unbind
 * @property {() => Promise<ReadonlyArray<VirtualHostEntry>>} list
 * @property {(name: string) => Promise<string>} lookup Throws if
 *   the name is not bound.
 * @property {(name: string) => Promise<boolean>} has
 */

/**
 * Create an in-memory `@apps` NameHub exo. The phase-1 skeleton
 * does not persist; later phases couple to the host agent's
 * formula store.
 *
 * Collision policy is first-bind-wins per the design's Open
 * Question 3 default (a follow-on PR adds the operator-allowlist
 * override).
 *
 * @returns {AppsNameHub}
 */
export const makeAppsNameHub = () => {
  /** @type {Map<string, string>} */
  const entries = new Map();

  const exo = makeExo(
    'AppsNameHub',
    AppsNameHubInterface,
    /** @type {any} */ ({
      /**
       * @param {string} name
       * @param {string} webletFormulaId
       */
      async bind(name, webletFormulaId) {
        const key = normalizeVirtualHostName(name);
        if (typeof webletFormulaId !== 'string' || webletFormulaId === '') {
          throw makeError(
            X`Weblet formula id must be a non-empty string, got ${q(webletFormulaId)}`,
          );
        }
        const existing = entries.get(key);
        if (existing !== undefined && existing !== webletFormulaId) {
          throw makeError(
            X`Virtual host ${q(key)} is already bound to ${q(existing)} (first-bind-wins)`,
          );
        }
        entries.set(key, webletFormulaId);
      },
      /** @param {string} name */
      async unbind(name) {
        const key = normalizeVirtualHostName(name);
        entries.delete(key);
      },
      async list() {
        const list = [];
        for (const [name, webletFormulaId] of entries) {
          list.push(harden({ name, webletFormulaId }));
        }
        return harden(list);
      },
      /** @param {string} name */
      async lookup(name) {
        const key = normalizeVirtualHostName(name);
        const webletFormulaId = entries.get(key);
        if (webletFormulaId === undefined) {
          throw makeError(X`No virtual host bound for ${q(key)}`);
        }
        return webletFormulaId;
      },
      /** @param {string} name */
      async has(name) {
        const key = normalizeVirtualHostName(name);
        return entries.has(key);
      },
    }),
  );

  return /** @type {AppsNameHub} */ (/** @type {unknown} */ (exo));
};
harden(makeAppsNameHub);

// Silences eslint's "no-unused-vars" on the shape constants for
// future readers; the constants document the wire contract.
void VirtualHostShape;
