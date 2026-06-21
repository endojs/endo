// @ts-check
import { h } from 'preact';

/** @import { ComponentChildren } from 'preact' */
/** @import { TreeNode } from './hooks/useConversation.js' */

/**
 * @param {object} props
 * @param {TreeNode[]} props.nodes
 * @param {string | null} props.activeNodeId
 * @param {(id: string) => void} props.onNavigate
 */
export function ConversationTree({ nodes, activeNodeId, onNavigate }) {
  /** @type {Map<string | null, TreeNode[]>} */
  const childrenMap = new Map();
  for (const node of nodes) {
    const parentKey = node.parentId;
    if (!childrenMap.has(parentKey)) {
      childrenMap.set(parentKey, []);
    }
    childrenMap.get(parentKey)?.push(node);
  }

  /**
   * @param {string | null} parentId
   * @param {number} depth
   * @returns {ComponentChildren}
   */
  const renderLevel = (parentId, depth) => {
    const children = childrenMap.get(parentId);
    if (!children || children.length === 0) return null;

    return children.map(node => {
      const isActive = node.id === activeNodeId;
      const hasChildren = childrenMap.has(node.id);
      const roleIcon =
        node.role === 'user' ? '›' : node.role === 'assistant' ? '◆' : '○';

      // For assistant nodes, show the parsed narrative instead of raw JSON
      const displayText =
        node.role === 'assistant' && node.parsed?.narrative
          ? node.parsed.narrative
          : node.content;
      const preview = displayText.slice(0, 40).replace(/\n/g, ' ');

      return h(
        'div',
        { key: node.id, class: 'tree-branch' },
        h(
          'button',
          {
            class: `tree-node ${isActive ? 'active' : ''} tree-role-${node.role}`,
            style: { paddingLeft: `${12 + depth * 16}px` },
            onClick: () => onNavigate(node.id),
            title: displayText.slice(0, 120),
          },
          h('span', { class: 'tree-icon' }, roleIcon),
          h('span', { class: 'tree-preview' }, preview || `(${node.role})`),
        ),
        hasChildren ? renderLevel(node.id, depth + 1) : null,
      );
    });
  };

  return h(
    'div',
    { class: 'whylip-tree' },
    h('div', { class: 'tree-header' }, 'Conversation'),
    h(
      'div',
      { class: 'tree-list' },
      nodes.length === 0
        ? h('div', { class: 'tree-empty' }, 'Send a message to begin.')
        : renderLevel(null, 0),
    ),
  );
}
harden(ConversationTree);
