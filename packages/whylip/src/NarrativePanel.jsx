// @ts-check
import React from 'react';

/**
 * Renders the narrative text from the fae agent's response.
 * Simple markdown-like rendering (paragraphs, bold, italic, code).
 *
 * @param {object} props
 * @param {string} props.narrative
 * @param {boolean} props.loading
 */
export function NarrativePanel({ narrative, loading }) {
  if (loading) {
    return (
      <div className="whylip-narrative">
        <div className="narrative-loading">Thinking...</div>
      </div>
    );
  }

  if (!narrative) {
    return (
      <div className="whylip-narrative">
        <div className="narrative-empty">Ask a question to start learning.</div>
      </div>
    );
  }

  // Minimal markdown: split into paragraphs, render bold/italic/code
  const paragraphs = narrative.split(/\n{2,}/);

  return (
    <div className="whylip-narrative">
      <div className="narrative-content">
        {paragraphs.map((p, i) => {
          const html = p
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br/>');
          return (
            <p
              key={i}
              className="narrative-paragraph"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        })}
      </div>
    </div>
  );
}
