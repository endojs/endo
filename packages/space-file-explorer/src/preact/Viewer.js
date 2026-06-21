// @ts-check
import { Fragment, h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

/** @import { FileExplorerState, Source, FileExplorerActions } from './types.js' */

// The right-hand VIEWER pane: file editor / layer-diff / blob preview.
//
// This is the Preact reimplementation of `renderViewer` in
// `../file-explorer.js` (L2524–2661). It reproduces that region's markup,
// `fx-*` class names, and behavior:
//
//  - `state.viewerCollapsed` hides the pane (renders nothing).
//  - `state.viewerWidth` sets the pane's px width; the `fx-splitter` to its
//    left drags it, clamped to [260, innerWidth - 320] exactly as the original.
//  - `state.viewerMode === 'layer-diff'` shows `state.layerDiff` colorized as a
//    unified diff; otherwise the selected file (loading spinner, binary /
//    truncated notices, an editable `<textarea>` in edit mode).
//
// Monaco `colorize(text, language)` is imported lazily from
// `@endo/monaco-wrapper` and awaited, mirroring L2547–2558 / L2627–2633: a
// stale result (the user navigated away, toggled edit, or the text changed
// while colorize was resolving) is dropped via the `epoch` ref guard.
//
// The confined renderer strips `dangerouslySetInnerHTML`, so Monaco's HTML
// output cannot be injected as a raw-HTML sink (the same constraint the chat
// blob-viewer documents). Instead the colorized HTML is parsed into safe,
// styled `<span>` vnodes (inline `style` survives the sanitizer); on any parse
// failure the plain text is shown, so highlighting only ever upgrades the view.

/**
 * @param {string} name
 * @returns {string}
 */
const languageForName = name => {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'json':
      return 'json';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
      return 'css';
    default:
      return 'plaintext';
  }
};
harden(languageForName);

/**
 * @param {number} bytes
 * @returns {string}
 */
const formatSize = bytes => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
harden(formatSize);

// Minimal HTML-entity decode for the text inside Monaco's <span> output.
/**
 * @param {string} s
 * @returns {string}
 */
const decodeEntities = s =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
harden(decodeEntities);

// Pull `color:` (and `font-*`) declarations out of a Monaco inline style
// string into a plain style object the sanitizing renderer admits.
/**
 * @param {string} styleText
 * @returns {Record<string, string>}
 */
const parseStyle = styleText => {
  /** @type {Record<string, string>} */
  const style = {};
  for (const decl of styleText.split(';')) {
    const idx = decl.indexOf(':');
    const prop = idx < 0 ? '' : decl.slice(0, idx).trim();
    const value = idx < 0 ? '' : decl.slice(idx + 1).trim();
    if (prop && value) {
      // camelCase the CSS property name for Preact's style object.
      const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      style[camel] = value;
    }
  }
  return style;
};
harden(parseStyle);

/**
 * Parse Monaco `colorize` output (a flat run of
 * `<span style="color:#…">text</span>` and `<br/>`) into safe styled vnodes.
 * Returns `null` when the string is not recognizably span-markup, so the caller
 * falls back to the plain text.
 *
 * @param {string} html
 * @returns {import('preact').ComponentChildren[] | null}
 */
const colorizedHtmlToVnodes = html => {
  if (typeof html !== 'string' || !html.includes('<span')) return null;
  /** @type {import('preact').ComponentChildren[]} */
  const out = [];
  const pattern = /<span style="([^"]*)">([\s\S]*?)<\/span>|<br\s*\/?>/gi;
  let lastIndex = 0;
  let key = 0;
  let match = pattern.exec(html);
  while (match !== null) {
    if (match.index > lastIndex) {
      const between = decodeEntities(html.slice(lastIndex, match.index));
      if (between) out.push(between);
    }
    if (match[1] !== undefined) {
      key += 1;
      out.push(
        h(
          'span',
          { style: parseStyle(match[1]), key: String(key) },
          decodeEntities(match[2]),
        ),
      );
    } else {
      key += 1;
      out.push(h('br', { key: `br${key}` }));
    }
    lastIndex = pattern.lastIndex;
    match = pattern.exec(html);
  }
  if (lastIndex < html.length) {
    const tail = decodeEntities(html.slice(lastIndex));
    if (tail) out.push(tail);
  }
  return out;
};
harden(colorizedHtmlToVnodes);

/**
 * Lazily import Monaco's `colorize`, run it, and feed the styled-vnode result
 * back through `onResult` only while `isCurrent()` still holds — the stale
 * guard from `renderViewer` (L2547–2558, L2629). Plaintext skips colorize.
 *
 * @param {string} text
 * @param {string} language
 * @param {() => boolean} isCurrent
 * @param {(vnodes: import('preact').ComponentChildren[]) => void} onResult
 */
const colorizeInto = (text, language, isCurrent, onResult) => {
  import('@endo/monaco-wrapper')
    .then(({ colorize }) => colorize(text, language))
    .then(coloredHtml => {
      if (!isCurrent()) return;
      const vnodes = colorizedHtmlToVnodes(coloredHtml);
      if (vnodes) onResult(vnodes);
    })
    .catch(() => {
      // Keep the plain-text view on colorize failure.
    });
};
harden(colorizeInto);

/**
 * @param {object} props
 * @param {string} props.text
 * @param {string} props.language
 * @param {boolean} props.colorizeDiff When true, colorize as a `'diff'`.
 */
function CodeBlock({ text, language, colorizeDiff }) {
  const [colored, setColored] = useState(
    /** @type {import('preact').ComponentChildren[] | null} */ (null),
  );
  // A monotonically increasing epoch; only the latest colorize may win.
  const epochRef = useRef(0);

  useEffect(() => {
    epochRef.current += 1;
    const epoch = epochRef.current;
    setColored(null);
    const lang = colorizeDiff ? 'diff' : language;
    if (!colorizeDiff && language === 'plaintext') {
      return undefined;
    }
    colorizeInto(text, lang, () => epochRef.current === epoch, setColored);
    // Bump the epoch on unmount / re-run so an in-flight result is dropped.
    return () => {
      epochRef.current += 1;
    };
  }, [text, language, colorizeDiff]);

  return h(
    'pre',
    { class: 'fx-code' },
    h('code', null, ...(colored || [text])),
  );
}
harden(CodeBlock);

/**
 * The viewer pane. Presentational: holds no powers, only the local edit buffer.
 *
 * @param {object} props
 * @param {FileExplorerState} props.state
 * @param {Source | null} props.activeSource
 * @param {FileExplorerActions} props.actions
 */
export function Viewer({ state, activeSource, actions }) {
  const {
    viewerCollapsed,
    viewerWidth,
    viewerMode,
    layerDiff,
    viewerLoading,
    selectedFile,
    editing,
  } = state;

  // Controlled edit buffer. Seeded from the selected file's text and reset
  // whenever the file or edit mode changes, so the textarea always opens on the
  // current file. The draft is handed to `actions.saveSelectedFile(draft)` on
  // save (see types.js: `saveSelectedFile(text?)`), so the store writes exactly
  // what is in the textarea without reaching into the DOM.
  const [draft, setDraft] = useState('');
  const fileKey = selectedFile
    ? `${selectedFile.parentPath.join('/')}/${selectedFile.name}`
    : '';
  useEffect(() => {
    if (editing && selectedFile) {
      setDraft(selectedFile.text);
    }
  }, [editing, fileKey]);

  // Splitter drag: mirror the imperative handler (clamp to
  // [260, innerWidth - 320]) but report the new width through `actions`.
  const onSplitterDown = event => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = viewerWidth;
    const onMove = moveEvent => {
      const delta = startX - moveEvent.clientX;
      const next = Math.max(
        260,
        Math.min(window.innerWidth - 320, startWidth + delta),
      );
      actions.setViewerWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  if (viewerCollapsed) {
    // The pane and its splitter are both hidden when collapsed.
    return null;
  }

  const closeButton = h(
    'button',
    {
      type: 'button',
      class: 'fx-mini fx-viewer-close',
      title: 'Collapse',
      onClick: () => actions.setViewerCollapsed(true),
    },
    '»',
  );

  let head;
  let body;

  if (viewerMode === 'layer-diff' && layerDiff) {
    const diffView = layerDiff;
    head = h(
      'div',
      { class: 'fx-viewer-head' },
      h(
        'span',
        {
          class: 'fx-viewer-title',
          title: `Layer diff: ${diffView.layerLabel}`,
        },
        `Layer diff: ${diffView.layerLabel}`,
      ),
      closeButton,
    );
    body = h(
      'div',
      { class: 'fx-viewer-body' },
      h(CodeBlock, {
        text: diffView.content,
        language: 'diff',
        colorizeDiff: true,
      }),
    );
  } else if (viewerLoading) {
    head = h(
      'div',
      { class: 'fx-viewer-head' },
      h('span', { class: 'fx-viewer-title' }, 'Loading…'),
      closeButton,
    );
    body = h(
      'div',
      { class: 'fx-viewer-empty' },
      h('span', { class: 'fx-spinner' }),
      'Reading file…',
    );
  } else if (!selectedFile) {
    head = h(
      'div',
      { class: 'fx-viewer-head' },
      h('span', { class: 'fx-viewer-title' }, 'Viewer'),
      closeButton,
    );
    body = h(
      'div',
      { class: 'fx-viewer-empty' },
      'Select a file to preview it.',
    );
  } else {
    const file = selectedFile;
    const language = languageForName(file.name);
    const meta = `${formatSize(file.size)} · ${language}${
      file.truncated ? ' · truncated' : ''
    }`;
    // A truncated preview must not be saved — that would overwrite the file
    // with only its first chunk.
    const canEdit =
      !!activeSource &&
      !activeSource.readOnly &&
      !file.binary &&
      !file.truncated;

    /** @type {import('preact').ComponentChildren} */
    let controls = '';
    if (editing) {
      controls = [
        h(
          'button',
          {
            type: 'button',
            class: 'fx-btn fx-viewer-save fx-primary',
            onClick: () => actions.saveSelectedFile(draft),
          },
          'Save',
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'fx-btn fx-viewer-cancel',
            onClick: () => actions.setEditing(false),
          },
          'Cancel',
        ),
      ];
    } else if (canEdit) {
      controls = h(
        'button',
        {
          type: 'button',
          class: 'fx-btn fx-viewer-edit',
          onClick: () => actions.setEditing(true),
        },
        'Edit',
      );
    }

    head = h(
      'div',
      { class: 'fx-viewer-head' },
      h('span', { class: 'fx-viewer-title', title: file.name }, file.name),
      h('span', { class: 'fx-viewer-meta' }, meta),
      h('span', { class: 'fx-viewer-controls' }, controls),
      closeButton,
    );

    let bodyContent;
    if (file.binary) {
      bodyContent = h(
        'div',
        { class: 'fx-viewer-empty' },
        'Binary file — preview not available.',
      );
    } else if (editing) {
      bodyContent = h('textarea', {
        class: 'fx-editor',
        spellcheck: false,
        value: draft,
        onInput: e =>
          setDraft(/** @type {HTMLTextAreaElement} */ (e.target).value),
      });
    } else {
      bodyContent = h(CodeBlock, {
        text: file.text,
        language,
        colorizeDiff: false,
      });
    }
    body = h('div', { class: 'fx-viewer-body' }, bodyContent);
  }

  // `fx-splitter` and `fx-viewer` are direct siblings under `fx-body` in the
  // original shell — render them as a Fragment, not wrapped in a container, so
  // the flex layout is identical.
  return h(
    Fragment,
    null,
    h('div', { class: 'fx-splitter', onMouseDown: onSplitterDown }),
    h(
      'div',
      { class: 'fx-viewer', style: { width: `${viewerWidth}px` } },
      head,
      body,
    ),
  );
}
harden(Viewer);
