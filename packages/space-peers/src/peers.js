// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
import { h } from 'preact';
import { useEffect, useReducer, useState } from 'preact/hooks';

/** @import { ERef } from '@endo/far' */

// Network peers view, migrated from imperative DOM (raw HTML strings /
// createElement) to a PURE Preact component. This package does NO rendering of
// its own (no DOM-mounting renderer): `PeersView` returns a vnode tree built
// with `h()`, and the host (chat) mounts it through its CONFINED renderer,
// which sanitizes the whole tree exactly like every other surface in the app.
// There is no raw-HTML sink — the three original raw-HTML sites become vnodes —
// so the `escapeHtml` / `escapeAttr` helpers the old string renderer needed are
// gone (the renderer escapes text automatically).
//
// `peers.css` is intentionally NOT imported here as a JS side-effect: that
// would make the module fail to load under plain Node (tests, tsc). The host
// links the stylesheet via the `./peers.css` package export instead.

/**
 * @param {string} state - 'start' | 'accepted' | 'connected'
 * @returns {{ label: string }}
 */
const connectionStatusInfo = state => {
  switch (state) {
    case 'connected':
      return { label: 'Connected' };
    case 'accepted':
      return { label: 'Connected (inbound)' };
    default:
      return { label: 'Disconnected' };
  }
};
harden(connectionStatusInfo);

/**
 * @typedef {object} PeerEntry
 * @property {string} node
 * @property {string[]} addresses
 * @property {string} [connectionState]
 */

/**
 * @typedef {object} SelfInfo
 * @property {string} node
 * @property {string[]} addresses
 */

/**
 * @typedef {ERef<{
 *   listKnownPeers(): Promise<PeerEntry[]>,
 *   getPeerInfo(): Promise<SelfInfo>,
 *   followPeerChanges(): unknown
 * }>} PeersHost
 */

/**
 * @typedef {object} PeersState
 * @property {'loading' | 'ready' | 'error'} status
 * @property {PeerEntry[]} peers
 * @property {SelfInfo | null} selfInfo
 * @property {string} error
 */

/**
 * @param {PeersState} state
 * @param {{ type: 'loading' }
 *   | { type: 'ready', peers: PeerEntry[], selfInfo: SelfInfo | null }
 *   | { type: 'error', error: string }} action
 * @returns {PeersState}
 */
const peersReducer = (state, action) => {
  switch (action.type) {
    case 'loading':
      return { ...state, status: 'loading', error: '' };
    case 'ready':
      return {
        status: 'ready',
        peers: action.peers,
        selfInfo: action.selfInfo,
        error: '',
      };
    case 'error':
      return { ...state, status: 'error', error: action.error };
    default:
      return state;
  }
};
harden(peersReducer);

/**
 * A copyable address row: the address `code` plus a copy button. Mirrors the
 * original `renderAddress` markup (`.peer-address-row` / `.peer-address` /
 * `.peer-copy-btn`).
 *
 * @param {object} props
 * @param {string} props.addr
 */
const AddressRow = ({ addr }) => h(CopyableCode, { value: addr, label: addr });
harden(AddressRow);

/**
 * A copy button that copies `value` to the clipboard and flashes a checkmark.
 * Preserves the original `.peer-copy-btn` markup and the ⧉ / ✓ glyphs.
 *
 * @param {object} props
 * @param {string} props.value - The full text to copy.
 * @param {string} [props.copyTitle]
 */
const CopyButton = ({ value, copyTitle = 'Copy address' }) => {
  const [copied, setCopied] = useState(false);
  return h(
    'button',
    {
      class: 'peer-copy-btn',
      title: copyTitle,
      onClick: () => {
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(window.reportError);
      },
    },
    copied ? '✓' : '⧉',
  );
};
harden(CopyButton);

/**
 * The `.peer-address-row` form: a `.peer-address` code plus copy button.
 *
 * @param {object} props
 * @param {string} props.value
 * @param {string} props.label
 */
const CopyableCode = ({ value, label }) =>
  h(
    'span',
    { class: 'peer-address-row' },
    h('code', { class: 'peer-address', title: value }, label),
    h(CopyButton, { value, copyTitle: 'Copy address' }),
  );
harden(CopyableCode);

/**
 * The shared header: back button, title, and (optionally) a refresh button.
 *
 * @param {object} props
 * @param {() => void} props.onBack
 * @param {(() => void) | null} props.onRefresh
 * @param {string} [props.refreshTitle]
 */
const PeersHeader = ({ onBack, onRefresh, refreshTitle = 'Refresh' }) =>
  h(
    'div',
    { class: 'peers-header' },
    h(
      'button',
      { class: 'peers-back', title: 'Back to inbox', onClick: onBack },
      '←',
    ),
    h('h2', { class: 'peers-title' }, 'Known Peers'),
    onRefresh
      ? h(
          'button',
          { class: 'peers-refresh', title: refreshTitle, onClick: onRefresh },
          '↻',
        )
      : null,
  );
harden(PeersHeader);

/**
 * The "This Node" self card.
 *
 * @param {object} props
 * @param {SelfInfo} props.selfInfo
 */
const SelfCard = ({ selfInfo }) =>
  h(
    'div',
    { class: 'peers-section' },
    h('h3', { class: 'peers-section-title' }, 'This Node'),
    h(
      'div',
      { class: 'peer-card peer-card-self' },
      h(
        'div',
        { class: 'peer-node-id' },
        h('span', { class: 'peer-label' }, 'Node'),
        h(
          'code',
          { class: 'peer-value peer-node-hash', title: selfInfo.node },
          `${selfInfo.node.slice(0, 16)}…`,
        ),
        h(CopyButton, {
          value: selfInfo.node,
          copyTitle: 'Copy full node ID',
        }),
      ),
      h(
        'div',
        { class: 'peer-addresses' },
        h('span', { class: 'peer-label' }, 'Addresses'),
        selfInfo.addresses.length > 0
          ? selfInfo.addresses.map(addr => h(AddressRow, { key: addr, addr }))
          : h('span', { class: 'peer-no-addresses' }, 'No network addresses'),
      ),
    ),
  );
harden(SelfCard);

/**
 * A single remote peer card.
 *
 * @param {object} props
 * @param {PeerEntry} props.peer
 */
const PeerCard = ({ peer }) => {
  const connState = peer.connectionState || 'start';
  const statusInfo = connectionStatusInfo(connState);
  return h(
    'div',
    { class: 'peer-card' },
    h(
      'div',
      { class: 'peer-node-id' },
      h('span', {
        class: `peer-status-dot peer-status-${connState}`,
        title: statusInfo.label,
      }),
      h('span', { class: 'peer-label' }, 'Node'),
      h(
        'code',
        { class: 'peer-value peer-node-hash', title: peer.node },
        `${peer.node.slice(0, 16)}…`,
      ),
      h(CopyButton, { value: peer.node, copyTitle: 'Copy full node ID' }),
      h(
        'span',
        { class: `peer-status-label peer-status-${connState}` },
        statusInfo.label,
      ),
    ),
    h(
      'div',
      { class: 'peer-addresses' },
      h('span', { class: 'peer-label' }, 'Connection Hints'),
      peer.addresses.length > 0
        ? peer.addresses.map(addr => h(AddressRow, { key: addr, addr }))
        : h('span', { class: 'peer-no-addresses' }, 'No addresses'),
    ),
  );
};
harden(PeerCard);

/**
 * The remote-peers section: count badge plus either the empty state or the
 * list of {@link PeerCard}s.
 *
 * @param {object} props
 * @param {PeerEntry[]} props.peers
 */
const RemotePeersSection = ({ peers }) =>
  h(
    'div',
    { class: 'peers-section' },
    h(
      'h3',
      { class: 'peers-section-title' },
      'Remote Peers ',
      h('span', { class: 'peers-count' }, String(peers.length)),
    ),
    peers.length === 0
      ? h(
          'div',
          { class: 'peers-empty' },
          h('div', { class: 'peers-empty-icon' }, '🌐'),
          h('p', null, 'No remote peers known yet.'),
          h(
            'p',
            { class: 'peers-empty-hint' },
            'Peers are discovered when you accept invitations, connect to channels, or adopt values from locators.',
          ),
        )
      : peers.map(peer => h(PeerCard, { key: peer.node, peer })),
  );
harden(RemotePeersSection);

/**
 * Network peers view. Subscribes to a live peer stream (via the host's
 * `followPeerChanges` reader, iterated with `iterateReader`) inside a
 * `useEffect`, re-loading `listKnownPeers` / `getPeerInfo` on each change. A
 * `disposed` guard cancels every async continuation on teardown so a detached
 * view never dispatches into a stale tree.
 *
 * This component does NO rendering of its own — it returns a vnode tree that
 * the host mounts through the confined renderer.
 *
 * The host also passes `rootPowers` / `profilePath` (the full resolution
 * context), which this view does not consume — only the resolved `powers` and
 * the `onProfileChange` navigation callback are used.
 *
 * @param {object} props
 * @param {unknown} props.powers - Resolved endo powers for this profile.
 * @param {(newPath: string[]) => void} props.onProfileChange
 */
export const PeersView = ({ powers, onProfileChange }) => {
  const host = /** @type {PeersHost} */ (powers);

  const [state, dispatch] = useReducer(
    peersReducer,
    /** @type {PeersState} */ ({
      status: 'loading',
      peers: [],
      selfInfo: null,
      error: '',
    }),
  );

  // A monotonically increasing "reload" token. Bumping it re-runs the effect,
  // which reloads peers + re-subscribes. The refresh / retry buttons bump it.
  const [reloadToken, setReloadToken] = useState(0);
  const requestReload = () => setReloadToken(token => token + 1);

  useEffect(() => {
    // Guard every async continuation so neither the initial load, the
    // re-load on each change, nor the subscription loop dispatches into a
    // detached tree after teardown.
    let disposed = false;

    const loadPeers = async () => {
      if (disposed) return;
      dispatch({ type: 'loading' });
      await null;
      try {
        const [loadedPeers, loadedSelf] = await Promise.all([
          E(host).listKnownPeers(),
          E(host).getPeerInfo(),
        ]);
        if (disposed) return;
        const peers = /** @type {PeerEntry[]} */ (loadedPeers);
        const selfInfo = /** @type {SelfInfo} */ (loadedSelf);
        dispatch({ type: 'ready', peers, selfInfo });
      } catch (err) {
        if (disposed) return;
        const message = err instanceof Error ? err.message : String(err);
        dispatch({
          type: 'error',
          error: `Failed to load peers: ${message}`,
        });
      }
    };

    const watchPeers = async () => {
      await null;
      try {
        // The change payload itself is unused; any change triggers a reload.
        // eslint-disable-next-line no-unused-vars
        for await (const change of iterateReader(
          /** @type {Parameters<typeof iterateReader>[0]} */ (
            /** @type {unknown} */ (E(host).followPeerChanges())
          ),
        )) {
          if (disposed) break;
          loadPeers().catch(window.reportError);
        }
      } catch {
        // Watching not supported or failed — the initial load still works.
      }
    };

    loadPeers()
      .then(() => watchPeers())
      .catch(window.reportError);

    return () => {
      disposed = true;
    };
  }, [host, reloadToken]);

  const handleBack = () => onProfileChange([]);

  if (state.status === 'loading') {
    return h(
      'div',
      { class: 'peers-container' },
      h(PeersHeader, { onBack: handleBack, onRefresh: null }),
      h('div', { class: 'peers-loading' }, 'Loading peers…'),
    );
  }

  if (state.status === 'error') {
    return h(
      'div',
      { class: 'peers-container' },
      h(PeersHeader, {
        onBack: handleBack,
        onRefresh: requestReload,
        refreshTitle: 'Retry',
      }),
      h('div', { class: 'peers-error' }, state.error),
    );
  }

  return h(
    'div',
    { class: 'peers-container' },
    h(PeersHeader, { onBack: handleBack, onRefresh: requestReload }),
    state.selfInfo ? h(SelfCard, { selfInfo: state.selfInfo }) : null,
    h(RemotePeersSection, { peers: state.peers }),
  );
};
harden(PeersView);
