// @ts-check
import React from 'react';

/**
 * @param {object} props
 * @param {import('./hooks/useConversation.js').TreeNode[]} props.nodes
 * @param {string | null} props.activeNodeId
 * @param {(id: string) => void} props.onNavigate
 */
export function ConversationTree({ nodes, activeNodeId, onNavigate }) {
  /** @type {Map<string | null, import('./hooks/useConversation.js').TreeNode[]>} */
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
   * @returns {React.ReactNode}
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

      return (
        <div key={node.id} className="tree-branch">
          <button
            className={`tree-node ${isActive ? 'active' : ''} tree-role-${node.role}`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => onNavigate(node.id)}
            title={displayText.slice(0, 120)}
          >
            <span className="tree-icon">{roleIcon}</span>
            <span className="tree-preview">
              {preview || `(${node.role})`}
            </span>
          </button>
          {hasChildren && renderLevel(node.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="whylip-tree">
      <div className="tree-header">Conversation</div>
      <div className="tree-list">
        {nodes.length === 0 ? (
          <div className="tree-empty">
            Send a message to begin.
          </div>
        ) : (
          renderLevel(null, 0)
        )}
      </div>
    </div>
  );
}
