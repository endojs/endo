// @ts-check

import harden from '@endo/harden';
import { h } from 'preact';

// Floot voice-assistant space, as a PURE confined Preact component: this
// package does no rendering of its own — the host (packages/chat) mounts the
// vnode tree through chat's confined, sanitizing renderer, exactly like
// @endo/space-peers / @endo/space-whylip.
//
// The imperative pieces Floot needs that a confined component cannot do —
// mic capture (getUserMedia), Web Audio playback, the requestAnimationFrame
// VAD loop, the background-turn registry, and CapTP resolution — live in the
// host wrapper (packages/chat/floot-component.js). They reach this view as a
// host-owned `controller` prop that exposes pure-data snapshots plus callbacks;
// no DOM node or audio handle ever crosses this boundary.
//
// Scaffold: this is the package foundation. The full session sidebar, streaming
// message view, compose bar, and the embedded transcription/settings panel land
// on top of this, alongside the host controller they are driven by.

/**
 * @returns {import('preact').VNode}
 */
export const FlootApp = () =>
  h(
    'div',
    { class: 'floot-app' },
    h('div', { class: 'floot-empty-state' }, 'Floot'),
  );
harden(FlootApp);
