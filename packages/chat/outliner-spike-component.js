// @ts-check

/** @import { OutlinerNodeData } from '@endo/space-channel/outliner/outliner-root.js' */
/** @import { EditableLine, LineContent } from '@endo/space-channel/outliner/editable-line.js' */

import harden from '@endo/harden';
import { OutlinerRoot } from '@endo/space-channel/outliner/outliner-root.js';
import { makeEditableLine } from '@endo/space-channel/outliner/editable-line.js';

import { h, renderConfined, unmount } from './setup-preact-container.js';

// Phase-0 host wrapper / controller for the outliner-confinement spike. Mirrors
// `inbox-component.js`: it resolves a dedicated mount, renders the CONFINED
// `OutlinerRoot` structure tree through `renderConfined`, and — after every
// render — re-parents each host-owned editable line into its matching
// `[data-line-anchor]` slot (the define-form anchor-slot pattern). The confined
// tree renders empty anchor divs; Preact never owns the editable DOM, so a
// forced re-render preserves each line's node identity, listeners, and caret.

/**
 * @typedef {object} SpikeNode
 * @property {string} key
 * @property {number} depth
 * @property {boolean} hasChildren
 * @property {boolean} collapsed
 * @property {LineContent} content - Initial editable content for this node.
 * @property {Array<SpikeNode>} [children]
 */

/**
 * Project a spike node (which carries editable content) into the plain
 * structure data the confined `OutlinerRoot` consumes — stripping the content,
 * which lives on the host-owned line, never in the confined tree.
 *
 * @param {SpikeNode} node
 * @returns {OutlinerNodeData}
 */
const toStructure = node => ({
  nodeKey: node.key,
  depth: node.depth,
  hasChildren: node.hasChildren,
  collapsed: node.collapsed,
  children: (node.children || []).map(toStructure),
});

/**
 * Mount the spike into `$mount`. Owns a `Map<key, EditableLine>`, one host line
 * per node, re-parented into the confined anchor slots after each render.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Host element to mount inside.
 * @param {Array<SpikeNode>} options.nodes - The (possibly nested) node list.
 * @param {(key: string, parsed: LineContent) => void} [options.onInput]
 * @param {(key: string, parsed: LineContent) => void} [options.onCommit]
 * @returns {{
 *   rerender: () => void,
 *   getLine: (key: string) => EditableLine | undefined,
 *   $mount: HTMLElement,
 *   dispose: () => void,
 * }}
 */
export const makeOutlinerSpike = ({ $container, nodes, onInput, onCommit }) => {
  // Dedicated confined mount so siblings of `$container` are never reconciled.
  const $mount = document.createElement('div');
  $container.appendChild($mount);

  /** @type {Map<string, EditableLine>} */
  const lines = new Map();

  // Create one persistent host-owned editable line per node, depth-first. Each
  // line outlives every confined re-render; the controller is its sole owner.
  /** @param {SpikeNode} node */
  const buildLines = node => {
    if (!lines.has(node.key)) {
      lines.set(
        node.key,
        makeEditableLine({
          key: node.key,
          initialContent: node.content,
          onInput,
          onCommit,
        }),
      );
    }
    for (const child of node.children || []) {
      buildLines(child);
    }
  };
  for (const node of nodes) {
    buildLines(node);
  }

  // Re-parent each persistent editable line into the freshly rendered anchor.
  // `renderConfined` is synchronous, so the anchors exist by the time this runs.
  const reattachLines = () => {
    for (const [key, line] of lines) {
      const $anchor = /** @type {HTMLElement | null} */ (
        $mount.querySelector(`[data-line-anchor="${key}"]`)
      );
      if ($anchor && line.$node.parentElement !== $anchor) {
        $anchor.appendChild(line.$node);
      }
    }
  };

  // Render the confined structure tree, then re-attach the host lines.
  const rerender = () => {
    renderConfined(h(OutlinerRoot, { nodes: nodes.map(toStructure) }), $mount);
    reattachLines();
  };

  rerender();

  /** @param {string} key */
  const getLine = key => lines.get(key);
  const dispose = () => {
    for (const line of lines.values()) {
      line.dispose();
    }
    lines.clear();
    unmount($mount);
    $mount.remove();
  };

  // NOT `harden`-ed: the handle carries the live `$mount` DOM node, which
  // cannot be deep-frozen. The methods are hardened individually.
  harden(rerender);
  harden(getLine);
  harden(dispose);
  return { rerender, getLine, $mount, dispose };
};
harden(makeOutlinerSpike);
