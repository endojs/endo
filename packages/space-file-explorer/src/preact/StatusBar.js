// @ts-check
import { h } from 'preact';

/** @import { Status } from './types.js' */

/**
 * The bottom status line and busy spinner. A faithful Preact reimplementation
 * of `renderStatus` (`../file-explorer.js` L2662–2713); reuses the same `fx-*`
 * classes and DOM nesting verbatim.
 *
 * The original sets `class="fx-status ${kind ? 'fx-status-'+kind : ''}"`,
 * prepends a `fx-spinner` span while any async action is in flight, and wraps
 * the message in a `fx-status-text` span.
 *
 * @param {object} props
 * @param {Status} props.status
 * @param {boolean} props.busy
 * @returns {import('preact').VNode}
 */
export function StatusBar({ status, busy }) {
  const { message, kind } = status;
  return h(
    'div',
    { class: `fx-status ${kind ? `fx-status-${kind}` : ''}` },
    busy ? h('span', { class: 'fx-spinner' }) : null,
    h('span', { class: 'fx-status-text' }, message),
  );
}
harden(StatusBar);
