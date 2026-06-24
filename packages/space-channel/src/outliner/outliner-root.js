// @ts-check

import harden from '@endo/harden';

import { h } from 'preact';

// Phase-0 confined structure tree for the outliner migration. This component
// renders the STRUCTURE of a node list only — bullets, disclosure markers, and
// an EMPTY anchor slot per node. It never renders the editable text itself: the
// host controller owns one persistent `contentEditable` line per node and
// re-parents it into the matching `[data-line-anchor]` slot after each confined
// render (the define-form anchor-slot pattern). Preact thus never owns the
// editable DOM, so the live caret/selection survives confined re-renders.
//
// Authority-free: no `document`, no `window`, no refs. `h()` is the only
// rendering primitive; all data arrives as primitive props.

/**
 * A single node's structure: a bullet/disclosure marker, an empty editable
 * anchor (NO contentEditable here — the host owns that), and any nested
 * children. Recursion is a nested `<OutlinerNode>`, mirroring the
 * `InventoryItem` → `InventoryList` precedent.
 *
 * @param {object} props
 * @param {string} props.nodeKey - Stable per-node identity, surfaced as the
 *   `data-line-anchor` value the host matches against.
 * @param {number} props.depth - Indentation depth (0 = root).
 * @param {boolean} props.hasChildren - Whether a disclosure marker is shown.
 * @param {boolean} props.collapsed - Whether the disclosure is collapsed.
 * @param {Array<OutlinerNodeData>} [props.children] - Nested child nodes.
 */
const OutlinerNode = ({
  nodeKey,
  depth,
  hasChildren,
  collapsed,
  children = [],
}) => {
  // Disclosure / bullet marker. Structure only: the toggle handler is a Phase-2
  // concern, so the marker is presentational here.
  const marker = hasChildren ? (collapsed ? '▸' : '▾') : '•';

  return h(
    'div',
    {
      class: 'outliner-node',
      'data-key': nodeKey,
      'data-depth': String(depth),
    },
    h(
      'div',
      { class: 'outliner-row' },
      h(
        'span',
        {
          class: hasChildren ? 'outliner-disclosure' : 'outliner-bullet',
          'data-key': nodeKey,
        },
        marker,
      ),
      // The empty anchor slot. The host re-parents its persistent editable line
      // into this div after render. It MUST stay empty in the confined tree so
      // Preact never diffs (and clobbers) the host-owned editable DOM.
      h('div', {
        class: 'outliner-text-anchor',
        'data-line-anchor': nodeKey,
      }),
    ),
    children.length > 0
      ? h(
          'div',
          { class: 'outliner-children' },
          children.map(child =>
            h(OutlinerNode, {
              key: child.nodeKey,
              nodeKey: child.nodeKey,
              depth: child.depth,
              hasChildren: child.hasChildren,
              collapsed: child.collapsed,
              children: child.children,
            }),
          ),
        )
      : null,
  );
};
harden(OutlinerNode);

/**
 * Plain-data description of one node in the outliner structure tree. Primitives
 * + nested data only — no DOM, no object identity used as an effect dep.
 *
 * @typedef {object} OutlinerNodeData
 * @property {string} nodeKey
 * @property {number} depth
 * @property {boolean} hasChildren
 * @property {boolean} collapsed
 * @property {Array<OutlinerNodeData>} [children]
 */

/**
 * Confined root: renders a flat or 2-level list of {@link OutlinerNode}
 * structures from a plain-data `nodes` array. Each node contributes one
 * `[data-line-anchor]` slot the host fills with its editable line.
 *
 * @param {object} props
 * @param {Array<OutlinerNodeData>} props.nodes - Top-level nodes to render.
 */
export const OutlinerRoot = ({ nodes }) =>
  h(
    'div',
    { class: 'outliner-root' },
    nodes.map(node =>
      h(OutlinerNode, {
        key: node.nodeKey,
        nodeKey: node.nodeKey,
        depth: node.depth,
        hasChildren: node.hasChildren,
        collapsed: node.collapsed,
        children: node.children,
      }),
    ),
  );
harden(OutlinerRoot);
