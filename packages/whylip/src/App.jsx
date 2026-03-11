// @ts-check
import React, { useCallback } from 'react';
import { ConversationTree } from './ConversationTree.jsx';
import { SceneCanvas } from './SceneCanvas.jsx';
import { NarrativePanel } from './NarrativePanel.jsx';
import { InputBar } from './InputBar.jsx';
import { useConversation } from './hooks/useConversation.js';
import './whylip.css';

/**
 * Top-level Whylip Primer component.
 * Three-panel layout: tree sidebar, scene + narrative + input.
 *
 * @param {object} props
 * @param {unknown} props.powers - Resolved endo powers for this profile
 * @param {unknown} props.rootPowers - Root endo powers
 * @param {string[]} props.profilePath
 * @param {(newPath: string[]) => void} props.onProfileChange
 */
export function WhylipApp({ powers, rootPowers, profilePath, onProfileChange }) {
  const {
    nodes,
    activeNodeId,
    activeScene,
    activeNarrative,
    sending,
    send,
    navigateTo,
  } = useConversation(powers);

  const handleNavigate = useCallback(
    /** @param {string} nodeId */
    nodeId => {
      navigateTo(nodeId);
    },
    [navigateTo],
  );

  const handleBack = useCallback(() => {
    onProfileChange([]);
  }, [onProfileChange]);

  return (
    <div className="whylip-layout">
      <div className="whylip-sidebar">
        <div className="whylip-sidebar-header">
          <button
            className="whylip-back-button"
            onClick={handleBack}
            title="Back to Home"
          >
            ←
          </button>
          <span className="whylip-title">Whylip</span>
        </div>
        <ConversationTree
          nodes={nodes}
          activeNodeId={activeNodeId}
          onNavigate={handleNavigate}
        />
      </div>
      <div className="whylip-main">
        <SceneCanvas scene={activeScene} />
        <div className="whylip-bottom">
          <NarrativePanel narrative={activeNarrative} loading={sending} />
          <InputBar onSend={send} disabled={sending} />
        </div>
      </div>
    </div>
  );
}
