// @ts-check

import harden from '@endo/harden';
import { E } from '@endo/far';

/** @import { ERef } from '@endo/far' */

/**
 * @template TValue
 * @template TReturn
 * @template TNext
 * @param {import('@endo/far').ERef<AsyncIterator<TValue, TReturn, TNext>>} iteratorRef
 * @returns {AsyncIterableIterator<TValue, TReturn, TNext>}
 */
const makeRefIterator = iteratorRef => {
  const iterator = harden({
    /** @param {[] | [TNext]} args */
    next: async (...args) => E(iteratorRef).next(...args),
    /** @param {[] | [TReturn]} args */
    return: async (...args) => E(iteratorRef).return(...args),
    /** @param {any} error */
    throw: async error => E(iteratorRef).throw(error),
    [Symbol.asyncIterator]: () => iterator,
  });
  return iterator;
};
harden(makeRefIterator);

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

/**
 * @param {string} str
 * @returns {string}
 */
const escapeHtml = str =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * @param {string} str
 * @returns {string}
 */
const escapeAttr = str => str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * @param {string} addr
 * @returns {string}
 */
const renderAddress = addr =>
  `<span class="peer-address-row">
    <code class="peer-address" title="${escapeAttr(addr)}">${escapeHtml(addr)}</code>
    <button class="peer-copy-btn" data-copy="${escapeAttr(addr)}" title="Copy address">⧉</button>
  </span>`;

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
 * Render the peers network view into a root element.
 * Fetches peers from host powers and displays connection status.
 *
 * @param {HTMLElement} $root
 * @param {object} props
 * @param {unknown} props.powers - Resolved endo powers for this profile
 * @param {unknown} props.rootPowers - Root endo powers (host)
 * @param {string[]} props.profilePath
 * @param {(newPath: string[]) => void} props.onProfileChange
 * @returns {() => void} cleanup function
 */
export const renderPeers = ($root, { powers, onProfileChange }) => {
  const host =
    /** @type {ERef<{ listKnownPeers(): Promise<PeerEntry[]>, getPeerInfo(): Promise<SelfInfo>, followPeerChanges(): unknown }>} */ (
      powers
    );

  const $container = document.createElement('div');
  $container.className = 'peers-container';
  $root.appendChild($container);

  /** @type {boolean} */
  let disposed = false;

  /**
   * @param {PeerEntry[]} peers
   * @param {SelfInfo | null} selfInfo
   */
  const render = (peers, selfInfo) => {
    if (disposed) return;

    let html = `<div class="peers-header">
      <button class="peers-back" title="Back to inbox">←</button>
      <h2 class="peers-title">Known Peers</h2>
      <button class="peers-refresh" title="Refresh">↻</button>
    </div>`;

    if (selfInfo) {
      html += `<div class="peers-section">
        <h3 class="peers-section-title">This Node</h3>
        <div class="peer-card peer-card-self">
          <div class="peer-node-id">
            <span class="peer-label">Node</span>
            <code class="peer-value peer-node-hash" title="${selfInfo.node}">${selfInfo.node.slice(0, 16)}…</code>
            <button class="peer-copy-btn" data-copy="${escapeAttr(selfInfo.node)}" title="Copy full node ID">⧉</button>
          </div>
          <div class="peer-addresses">
            <span class="peer-label">Addresses</span>
            ${
              selfInfo.addresses.length > 0
                ? selfInfo.addresses.map(addr => renderAddress(addr)).join('')
                : '<span class="peer-no-addresses">No network addresses</span>'
            }
          </div>
        </div>
      </div>`;
    }

    html += `<div class="peers-section">
      <h3 class="peers-section-title">Remote Peers <span class="peers-count">${peers.length}</span></h3>`;

    if (peers.length === 0) {
      html += `<div class="peers-empty">
        <div class="peers-empty-icon">🌐</div>
        <p>No remote peers known yet.</p>
        <p class="peers-empty-hint">Peers are discovered when you accept invitations, connect to channels, or adopt values from locators.</p>
      </div>`;
    } else {
      for (const peer of peers) {
        const connState = peer.connectionState || 'start';
        const statusInfo = connectionStatusInfo(connState);
        html += `<div class="peer-card">
          <div class="peer-node-id">
            <span class="peer-status-dot peer-status-${connState}" title="${statusInfo.label}"></span>
            <span class="peer-label">Node</span>
            <code class="peer-value peer-node-hash" title="${peer.node}">${peer.node.slice(0, 16)}…</code>
            <button class="peer-copy-btn" data-copy="${escapeAttr(peer.node)}" title="Copy full node ID">⧉</button>
            <span class="peer-status-label peer-status-${connState}">${statusInfo.label}</span>
          </div>
          <div class="peer-addresses">
            <span class="peer-label">Connection Hints</span>
            ${
              peer.addresses.length > 0
                ? peer.addresses.map(addr => renderAddress(addr)).join('')
                : '<span class="peer-no-addresses">No addresses</span>'
            }
          </div>
        </div>`;
      }
    }

    html += '</div>';
    $container.innerHTML = html;

    const $back = $container.querySelector('.peers-back');
    if ($back) {
      $back.addEventListener('click', () => onProfileChange([]));
    }

    const $refresh = $container.querySelector('.peers-refresh');
    if ($refresh) {
      $refresh.addEventListener('click', () => {
        loadPeers();
      });
    }

    const $copyBtns = $container.querySelectorAll('.peer-copy-btn');
    for (const $btn of $copyBtns) {
      $btn.addEventListener('click', () => {
        const text = $btn.getAttribute('data-copy');
        if (text) {
          navigator.clipboard
            .writeText(text)
            .then(() => {
              const original = $btn.textContent;
              $btn.textContent = '✓';
              setTimeout(() => {
                $btn.textContent = original;
              }, 1500);
            })
            .catch(window.reportError);
        }
      });
    }
  };

  const renderLoading = () => {
    $container.innerHTML = `<div class="peers-header">
      <button class="peers-back" title="Back to inbox">←</button>
      <h2 class="peers-title">Known Peers</h2>
    </div>
    <div class="peers-loading">Loading peers…</div>`;

    const $back = $container.querySelector('.peers-back');
    if ($back) {
      $back.addEventListener('click', () => onProfileChange([]));
    }
  };

  /** @param {string} message */
  const renderError = message => {
    $container.innerHTML = `<div class="peers-header">
      <button class="peers-back" title="Back to inbox">←</button>
      <h2 class="peers-title">Known Peers</h2>
      <button class="peers-refresh" title="Retry">↻</button>
    </div>
    <div class="peers-error">${escapeHtml(message)}</div>`;

    const $back = $container.querySelector('.peers-back');
    if ($back) {
      $back.addEventListener('click', () => onProfileChange([]));
    }
    const $refresh = $container.querySelector('.peers-refresh');
    if ($refresh) {
      $refresh.addEventListener('click', () => {
        loadPeers();
      });
    }
  };

  const loadPeers = async () => {
    renderLoading();
    await null;
    try {
      const [peers, selfInfo] = await Promise.all([
        E(host).listKnownPeers(),
        E(host).getPeerInfo(),
      ]);
      render(
        /** @type {PeerEntry[]} */ (peers),
        /** @type {SelfInfo} */ (selfInfo),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      renderError(`Failed to load peers: ${message}`);
    }
  };

  const watchPeers = async () => {
    await null;
    try {
      const changesRef = E(host).followPeerChanges();
      const changes = makeRefIterator(changesRef);
      // eslint-disable-next-line no-underscore-dangle
      for await (const _change of changes) {
        if (disposed) break;
        loadPeers().catch(window.reportError);
      }
    } catch {
      // Watching not supported or failed — the initial load still works
    }
  };

  loadPeers()
    .then(() => watchPeers())
    .catch(window.reportError);

  return () => {
    disposed = true;
  };
};
harden(renderPeers);
