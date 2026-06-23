// @ts-check

/**
 * @file Passable value -> Preact vnode rendering for the confined chat UI.
 *
 * The imperative {@link module:./value-render.js} `render` builds DOM elements
 * directly (and must keep doing so for its other consumers — the value
 * inspector `value-component.js` and the channel / microblog views that splice
 * its `HTMLElement` into a host tree). Under the confined Preact renderer we
 * cannot hand the sanitizing surface raw DOM (`dangerouslySetInnerHTML` is
 * stripped on purpose), so this module mirrors `render`'s pass-style cases and
 * EMITS VNODES with the SAME class names (`.number` / `.bigint` / `.string` /
 * `.entries` / `.tag` / `.error` / `.remotable`) so the existing CSS applies
 * unchanged.
 *
 * The shared number formatter is imported from `time-formatters.js` (the same
 * source `value-render.js` uses), so large-number / bigint formatting cannot
 * drift between the two renderers. This module does not change
 * `value-render.js`'s DOM behavior or exports.
 */

/** @import { VNode } from 'preact' */

import harden from '@endo/harden';
import { passStyleOf } from '@endo/pass-style';

import { h } from 'preact';
import { numberFormatter } from './time-formatters.js';

/**
 * Render a passable value as a Preact vnode (or string), mirroring the
 * pass-style cases and class names of `value-render.js`'s imperative `render`.
 *
 * Nested arrays / records recurse, interleaving `, ` separators exactly as the
 * DOM renderer does (a trailing-comma-free join). A non-passable value renders
 * the same `⚠️ Not passable ⚠️` error block as `render`.
 *
 * @param {unknown} value
 * @returns {VNode}
 */
export const valueToVnodes = value => {
  let passStyle;
  try {
    passStyle = passStyleOf(value);
  } catch {
    return h('div', { class: 'error' }, '⚠️ Not passable ⚠️');
  }

  switch (passStyle) {
    case 'null':
    case 'undefined':
    case 'boolean': {
      return h('span', { class: 'number' }, `${value}`);
    }
    case 'bigint': {
      return h(
        'span',
        { class: 'bigint' },
        `${numberFormatter.format(/** @type {bigint} */ (value))}n`,
      );
    }
    case 'number': {
      return h(
        'span',
        { class: 'number' },
        numberFormatter.format(/** @type {number} */ (value)),
      );
    }
    case 'string': {
      return h('span', { class: 'string' }, JSON.stringify(value));
    }
    case 'promise': {
      // TODO await (and respect cancellation), matching value-render.js.
      return h('span', null, '⏳');
    }
    case 'copyArray': {
      const children = /** @type {unknown[]} */ (value);
      return h(
        'span',
        null,
        '[',
        h(
          'span',
          { class: 'entries' },
          ...children.map((child, i) =>
            h(
              'span',
              { key: String(i) },
              valueToVnodes(child),
              i < children.length - 1 ? ', ' : null,
            ),
          ),
        ),
        ']',
      );
    }
    case 'copyRecord': {
      const entries = Object.entries(
        /** @type {Record<string, unknown>} */ (value),
      );
      return h(
        'span',
        null,
        '{',
        h(
          'span',
          { class: 'entries' },
          ...entries.map(([key, child], i) =>
            h(
              'span',
              { key },
              h('span', null, `${JSON.stringify(key)}: `),
              valueToVnodes(child),
              i < entries.length - 1 ? ', ' : null,
            ),
          ),
        ),
        '}',
      );
    }
    case 'tagged': {
      const tagged =
        /** @type {{ [Symbol.toStringTag]: string, payload: unknown }} */ (
          value
        );
      return h(
        'span',
        null,
        h(
          'span',
          { class: 'tag' },
          `${JSON.stringify(tagged[Symbol.toStringTag])} `,
        ),
        valueToVnodes(tagged.payload),
      );
    }
    case 'error': {
      return h(
        'span',
        { class: 'error' },
        /** @type {Error} */ (value).message,
      );
    }
    case 'remotable': {
      const remotable = /** @type {{ [Symbol.toStringTag]: string }} */ (value);
      return h('span', { class: 'remotable' }, remotable[Symbol.toStringTag]);
    }
    default: {
      // Unreachable if programmed to account for all pass-styles. Rather than
      // throw (which would crash the whole inbox render), surface it inline.
      return h('span', { class: 'error' }, `⚠️ ${passStyle} ⚠️`);
    }
  }
};
// NB: `valueToVnodes` is hardened as a FUNCTION, but its RETURN value is left
// unhardened on purpose: it carries live Preact vnodes, which the reconciler
// mutates (`vnode.__*` internal pointers) during rendering; deep-freezing them
// breaks reconciliation. (Same rule as markdown-vnodes.js.)
harden(valueToVnodes);
