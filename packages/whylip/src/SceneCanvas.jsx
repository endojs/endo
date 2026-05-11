// @ts-check
import React, { useRef, useEffect } from 'react';

/**
 * Renders a scene (self-contained HTML) inside a sandboxed iframe.
 *
 * @param {object} props
 * @param {{ title: string, html: string } | null} props.scene
 */
export function SceneCanvas({ scene }) {
  const iframeRef = useRef(/** @type {HTMLIFrameElement | null} */ (null));

  useEffect(() => {
    if (iframeRef.current && scene) {
      iframeRef.current.srcdoc = scene.html;
    }
  }, [scene]);

  if (!scene) {
    return (
      <div className="whylip-scene whylip-scene-empty">
        <div className="scene-placeholder">
          <span className="scene-placeholder-icon">📖</span>
          <p>Scenes will appear here as the primer illustrates concepts.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="whylip-scene">
      <div className="scene-title-bar">
        <span className="scene-title">{scene.title}</span>
      </div>
      <iframe
        ref={iframeRef}
        className="scene-iframe"
        sandbox="allow-scripts"
        title={scene.title}
      />
    </div>
  );
}
