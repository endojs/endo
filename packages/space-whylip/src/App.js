// @ts-check
import { h } from 'preact';
import { useCallback } from 'preact/hooks';

import { ConversationTree } from './ConversationTree.js';
import { InputBar } from './InputBar.js';
import { NarrativePanel } from './NarrativePanel.js';
import { SceneCanvas } from './SceneCanvas.js';
import { useConversation } from './hooks/useConversation.js';

// NB: `whylip.css` is intentionally NOT imported here. This package does no
// rendering and must stay loadable under plain Node (tests, tsc) where a CSS
// side-effect import would throw. The host (chat) links `whylip.css` via its
// HTML, and the package exposes the stylesheet through the `./whylip.css`
// export in package.json.

/**
 * Top-level Whylip Primer component.
 * Three-panel layout: tree sidebar, scene + narrative + input.
 *
 * This component does NO rendering of its own (no DOM-mounting renderer).
 * It returns a vnode tree built with `h()`; the host mounts it
 * through the confined renderer, which sanitizes the whole tree (including
 * SceneCanvas's untrusted scene markup).
 *
 * @param {object} props
 * @param {unknown} props.powers - Resolved endo powers for this profile
 * @param {unknown} props.rootPowers - Root endo powers
 * @param {string[]} props.profilePath
 * @param {(newPath: string[]) => void} props.onProfileChange
 */
export function WhylipApp({
  powers,
  // eslint-disable-next-line no-unused-vars
  rootPowers,
  // eslint-disable-next-line no-unused-vars
  profilePath,
  onProfileChange,
}) {
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

  return h(
    'div',
    { class: 'whylip-layout' },
    h(
      'div',
      { class: 'whylip-sidebar' },
      h(
        'div',
        { class: 'whylip-sidebar-header' },
        h(
          'button',
          {
            class: 'whylip-back-button',
            onClick: handleBack,
            title: 'Back to Home',
          },
          '←',
        ),
        h('span', { class: 'whylip-title' }, 'Whylip'),
      ),
      h(ConversationTree, {
        nodes,
        activeNodeId,
        onNavigate: handleNavigate,
      }),
    ),
    h(
      'div',
      { class: 'whylip-main' },
      h(SceneCanvas, { scene: activeScene }),
      h(
        'div',
        { class: 'whylip-bottom' },
        h(NarrativePanel, { narrative: activeNarrative, loading: sending }),
        h(InputBar, { onSend: send, disabled: sending }),
      ),
    ),
  );
}
harden(WhylipApp);
