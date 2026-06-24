// @ts-check
/* eslint-disable no-use-before-define */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */
/** @import { VNode } from 'preact' */

import { E } from '@endo/far';
import { createMonacoEditor, detectTheme } from '@endo/monaco-wrapper';
import { inferLanguage } from './language-detect.js';
import { isMarkdown } from './markdown-preview.js';
import { MarkdownFragment } from './markdown-vnodes.js';
import { keyCombo, modKey } from './platform-keys.js';

import { h, renderConfined, unmount } from './setup-preact-container.js';

// Blob viewer/editor, migrated from imperative DOM to a confined Preact
// component.
//
// THE MONACO HOST-NODE PATTERN (copied from define-form.js). A live Monaco
// editor is real DOM and CANNOT enter a confined vnode tree (`renderConfined`
// strips refs and real nodes). So the editor lives on a PERSISTENT host node —
// a plain `<div>` this controller creates once, on which `createMonacoEditor`
// is called imperatively. The confined chrome renders an empty anchor slot
// (`data-editor-anchor`) in whichever pane is active (full editor or the
// split editor) and, after each render, the controller re-parents the editor
// host node into that anchor. Only the surrounding chrome (header, panes,
// buttons) renders confined; the editor host node is owned and positioned by
// the controller. The editor is disposed on teardown.
//
// THE MARKDOWN PREVIEW. The original used `renderMarkdownToHtml` and assigned
// the resulting HTML string to `.innerHTML`, which is a dead sink under
// confinement (no `dangerouslySetInnerHTML`). The preview is now rendered as
// real sanitized vnodes via `MarkdownFragment` from markdown-vnodes.js, reusing
// the existing `.md-*` class names so the CSS applies unchanged. As with the
// inbox `PackageBody`, Monaco `colorize` of fenced code inside the preview is a
// deferred limitation: fences render as plain `<pre class="md-code-fence">`.
// The raw-source view (the markdown "Source" toggle and the non-markdown
// read-only pane) likewise renders its text into a plain `<pre>` vnode rather
// than colorized HTML, for the same reason.

/**
 * @typedef {object} BlobViewerAPI
 * @property {(petNamePath: string, readOnly: boolean) => Promise<void>} open
 * @property {() => void} hide
 * @property {() => boolean} isVisible
 * @property {() => void} dispose
 */

/**
 * @typedef {'editor' | 'pre' | 'md-preview' | 'split' | 'none'} ActivePane
 *   Which content pane is currently shown.
 */

/**
 * @typedef {object} BlobViewerState
 * @property {string} title - The pet name path shown in the header.
 * @property {string} language - The inferred Monaco language identifier.
 * @property {boolean} readOnly - Whether the blob is opened read-only.
 * @property {boolean} canSave - Whether the Save button is enabled.
 * @property {boolean} saving - Whether a save is in flight.
 * @property {ActivePane} pane - The active content pane.
 * @property {'preview' | 'source'} mdToggle - Markdown view sub-mode.
 * @property {string} preText - Raw text for the `<pre>` pane.
 * @property {string} previewText - Markdown source for the rendered preview.
 * @property {string} theme - The detected Monaco theme name.
 * @property {string} status - The footer status text.
 * @property {string} error - The footer error text ('' for none).
 */

/**
 * The confined chrome around the Monaco editor and markdown preview — a pure
 * function of `state` plus controller callbacks. Host DOM nodes never enter
 * this tree; the Monaco editor (real DOM) lives on a persistent host node that
 * the controller re-parents into the active pane's `data-editor-anchor` slot
 * after each render. The markdown preview renders as real vnodes via
 * `MarkdownFragment` (no innerHTML / dangerouslySetInnerHTML). All inputs are
 * controlled with SafeEvent handlers and the original `.blob-viewer-*` /
 * `.md-rendered` CSS class names are reused so styling is unchanged.
 *
 * @param {object} props
 * @param {BlobViewerState} props.state - The current viewer state.
 * @param {() => void} props.onClose - Close requested via header button.
 * @param {() => void} props.onSave - Save requested via the Save button.
 * @param {(seg: 'preview' | 'source') => void} props.onMdToggle - Markdown
 *   preview/source toggle requested.
 * @returns {VNode}
 */
const BlobViewerBody = ({ state, onClose, onSave, onMdToggle }) => {
  // The single editor anchor; only rendered into the active editor-bearing
  // pane. The controller re-parents the persistent Monaco host node into it.
  const editorAnchor = (/** @type {string} */ className) =>
    h('div', { class: className, 'data-editor-anchor': 'true' });

  /** @type {VNode[]} */
  const panes = [];

  if (state.pane === 'editor') {
    panes.push(editorAnchor('blob-viewer-editor-container'));
  }

  if (state.pane === 'pre') {
    panes.push(
      h(
        'pre',
        {
          class: 'blob-viewer-pre',
          tabindex: '0',
          'data-theme': state.theme,
        },
        state.preText,
      ),
    );
  }

  if (state.pane === 'md-preview') {
    if (state.mdToggle === 'source') {
      panes.push(
        h(
          'pre',
          {
            class: 'blob-viewer-pre',
            tabindex: '0',
            'data-theme': state.theme,
          },
          state.preText,
        ),
      );
    } else {
      panes.push(
        h(
          'div',
          {
            class: 'blob-viewer-md-preview md-rendered',
            tabindex: '0',
            'data-theme': state.theme,
          },
          MarkdownFragment(state.previewText),
        ),
      );
    }
  }

  if (state.pane === 'split') {
    panes.push(
      h(
        'div',
        { class: 'blob-viewer-split' },
        editorAnchor('blob-viewer-split-editor'),
        h(
          'div',
          {
            class: 'blob-viewer-split-preview md-rendered',
            'data-theme': state.theme,
          },
          MarkdownFragment(state.previewText),
        ),
      ),
    );
  }

  return h(
    'div',
    { class: 'blob-viewer' },
    h(
      'div',
      { class: 'blob-viewer-header' },
      h(
        'div',
        { class: 'blob-viewer-title-area' },
        h('span', { class: 'blob-viewer-title' }, state.title),
        h('span', { class: 'blob-viewer-language' }, state.language),
      ),
      h(
        'div',
        { class: 'blob-viewer-actions' },
        state.pane === 'md-preview'
          ? h(
              'div',
              {
                class: 'blob-viewer-md-toggle',
                'data-active': state.mdToggle,
              },
              h(
                'button',
                {
                  class: 'md-toggle-seg',
                  'data-seg': 'preview',
                  onClick: () => onMdToggle('preview'),
                },
                'Preview',
              ),
              h(
                'button',
                {
                  class: 'md-toggle-seg',
                  'data-seg': 'source',
                  onClick: () => onMdToggle('source'),
                },
                'Source',
              ),
            )
          : null,
        !state.readOnly
          ? h(
              'button',
              {
                class: state.saving
                  ? 'blob-viewer-save btn-spinner'
                  : 'blob-viewer-save',
                title: `Save (${keyCombo(modKey, 'S')})`,
                disabled: !state.canSave || state.saving,
                onClick: onSave,
              },
              'Save',
            )
          : null,
        h(
          'button',
          {
            class: 'blob-viewer-close',
            title: 'Close (Esc)',
            onClick: onClose,
          },
          '×',
        ),
      ),
    ),
    ...panes,
    h(
      'div',
      { class: 'blob-viewer-footer' },
      h('span', { class: 'blob-viewer-status' }, state.status),
      h('span', { class: 'blob-viewer-error' }, state.error),
    ),
  );
};
harden(BlobViewerBody);

/**
 * Create the blob viewer/editor component. The chrome is one confined Preact
 * tree rendered through a single `renderConfined` into a dedicated mount inside
 * `$container`; the Monaco editor lives on a persistent host node that the
 * controller re-parents into the active pane's `data-editor-anchor` slot after
 * each render.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element
 * @param {HTMLElement} options.$backdrop - Backdrop element
 * @param {ERef<EndoHost>} options.powers - Powers object
 * @param {() => void} options.onClose - Called when the viewer is closed
 * @returns {BlobViewerAPI}
 */
export const createBlobViewer = ({
  $container,
  $backdrop,
  powers,
  onClose,
}) => {
  let visible = false;
  let dirty = false;
  /** @type {import('@endo/monaco-wrapper').MonacoEditorAPI | null} */
  let editor = null;
  /** @type {string[]} */
  let currentPath = [];
  /** @type {string} */
  let originalContent = '';

  /** @type {BlobViewerState} */
  let state = harden({
    title: '',
    language: '',
    readOnly: true,
    canSave: false,
    saving: false,
    pane: 'none',
    mdToggle: 'preview',
    preText: '',
    previewText: '',
    theme: 'endo-light',
    status: '',
    error: '',
  });

  // Dedicated confined mount; siblings of `$container` are never reconciled.
  const $mount = document.createElement('div');
  $container.appendChild($mount);

  // Persistent host node carrying the imperative Monaco editor. Re-parented into
  // the confined tree's active anchor after each render, so the live editor and
  // its listeners survive confined re-renders.
  const $editorHost = document.createElement('div');
  $editorHost.className = 'blob-viewer-editor-host';
  $editorHost.style.display = 'contents';

  /**
   * Re-parent the persistent editor host into the freshly rendered anchor (if
   * the active pane has one). `renderConfined` is synchronous, so the anchor
   * exists by the time this runs.
   */
  const reattachEditor = () => {
    const $anchor = /** @type {HTMLElement | null} */ (
      $mount.querySelector('[data-editor-anchor="true"]')
    );
    if ($anchor && $editorHost.parentElement !== $anchor) {
      $anchor.appendChild($editorHost);
    } else if (!$anchor && $editorHost.parentElement) {
      // No editor-bearing pane is active; detach the host so it is not
      // orphaned inside a removed pane.
      $editorHost.parentElement.removeChild($editorHost);
    }
  };

  /**
   * Render the confined chrome for the current `state`, then re-parent the
   * editor host into its anchor.
   */
  const rerender = () => {
    renderConfined(
      h(BlobViewerBody, {
        state,
        onClose: () => {
          close();
        },
        onSave: () => {
          handleSave();
        },
        onMdToggle: seg => {
          handleMdToggle(seg);
        },
      }),
      $mount,
    );
    reattachEditor();
  };

  /**
   * Merge a partial state update and re-render the confined chrome.
   *
   * @param {Partial<BlobViewerState>} patchValue
   */
  const patch = patchValue => {
    state = harden({ ...state, ...patchValue });
    rerender();
  };

  // Initial render so the mount exists before the first open.
  rerender();

  // Extra per-open onChange hook (used by the markdown split view to keep the
  // live preview in sync); set in `open`, read by the editor's onChange below.
  /** @type {((value: string) => void) | undefined} */
  let currentExtraOnChange;

  /**
   * Lazily initialize the Monaco editor on the persistent host node. The host
   * is positioned into the active pane's anchor by `reattachEditor`.
   *
   * @param {string} lang
   */
  const ensureEditor = async lang => {
    await null; // safe-await-separator
    if (!editor) {
      editor = await createMonacoEditor($editorHost, {
        onChange: value => {
          if (!state.readOnly) {
            dirty = true;
            if (!state.canSave) patch({ canSave: true });
          }
          if (currentExtraOnChange) {
            currentExtraOnChange(value);
          }
        },
        initialValue: '',
        language: lang,
      });
    } else {
      editor.setLanguage(lang);
    }
  };

  const clearError = () => {
    if (state.error !== '') patch({ error: '' });
  };

  /**
   * Save the current content back to the daemon.
   */
  const handleSave = async () => {
    if (!editor || state.readOnly || !dirty) return;
    clearError();

    patch({ saving: true, canSave: false, status: 'Saving...' });

    await null; // safe-await-separator

    try {
      const content = editor.getValue();
      await E(powers).writeText(currentPath, content);
      originalContent = content;
      dirty = false;
      patch({ saving: false, status: 'Saved' });
    } catch (err) {
      patch({
        saving: false,
        canSave: true,
        error: /** @type {Error} */ (err).message,
      });
    }
  };

  /**
   * Toggle the markdown read-only view between rendered preview and raw source.
   *
   * @param {'preview' | 'source'} target
   */
  const handleMdToggle = target => {
    if (state.pane !== 'md-preview') return;
    if (target === 'source' && state.mdToggle !== 'source') {
      patch({ mdToggle: 'source', preText: originalContent });
    } else if (target === 'preview' && state.mdToggle !== 'preview') {
      patch({ mdToggle: 'preview' });
    }
  };

  /**
   * Open the viewer/editor for a blob at the given pet name path.
   *
   * @param {string} petNamePath - Slash-separated pet name path
   * @param {boolean} readOnly - Whether to open in read-only mode
   */
  const open = async (petNamePath, readOnly) => {
    dirty = false;
    currentExtraOnChange = undefined;
    currentPath = petNamePath.split('/');

    const filename = currentPath[currentPath.length - 1] || petNamePath;
    const lang = inferLanguage(filename);
    const themed = detectTheme();

    // Show the modal immediately so the user sees the loading state.
    $backdrop.style.display = 'block';
    $container.style.display = 'block';
    $container.classList.remove('blob-viewer-expanded');
    visible = true;

    patch({
      title: petNamePath,
      language: lang,
      readOnly,
      canSave: false,
      saving: false,
      pane: 'none',
      mdToggle: 'preview',
      preText: '',
      previewText: '',
      theme: themed,
      status: 'Loading...',
      error: '',
    });

    const md = isMarkdown(lang);

    await null; // safe-await-separator

    try {
      let text = '';
      let isNew = false;
      try {
        text = await E(powers).readText(currentPath);
      } catch (lookupErr) {
        if (readOnly) throw lookupErr;
        isNew = true;
      }

      originalContent = text;

      if (readOnly && md) {
        // Markdown view: rendered vnodes with a source toggle.
        patch({
          pane: 'md-preview',
          mdToggle: 'preview',
          previewText: text,
          preText: text,
          status: 'Read-only',
        });
        focusPane('.blob-viewer-md-preview');
      } else if (readOnly) {
        // Non-markdown view: plain `<pre>` (colorize is deferred under
        // confinement, same limitation as the inbox code fences).
        patch({
          pane: 'pre',
          preText: text,
          status: 'Read-only',
        });
        focusPane('.blob-viewer-pre');
      } else if (md) {
        // Markdown edit: side-by-side editor + live preview.
        $container.classList.add('blob-viewer-expanded');
        patch({ pane: 'split', previewText: text });

        currentExtraOnChange = value => {
          patch({ previewText: value });
        };
        await ensureEditor(lang);
        if (!editor) throw new Error('Editor failed to initialize');

        // Scroll synchronization between the editor and the preview pane.
        let isSyncing = false;
        editor.onDidScrollChange((scrollTop, scrollHeight) => {
          if (isSyncing) return;
          const $splitEditor = /** @type {HTMLElement | null} */ (
            $mount.querySelector('.blob-viewer-split-editor')
          );
          const $splitPreview = /** @type {HTMLElement | null} */ (
            $mount.querySelector('.blob-viewer-split-preview')
          );
          if (!$splitEditor || !$splitPreview) return;
          isSyncing = true;
          const editorMax = Math.max(
            1,
            scrollHeight - $splitEditor.clientHeight,
          );
          const fraction = scrollTop / editorMax;
          const previewMax = Math.max(
            1,
            $splitPreview.scrollHeight - $splitPreview.clientHeight,
          );
          $splitPreview.scrollTop = fraction * previewMax;
          isSyncing = false;
        });

        editor.setValue(text);
        editor.setReadOnly(false);
        patch({ status: isNew ? 'New file' : '' });
        editor.focus();
      } else {
        // Non-markdown edit: full Monaco editor.
        patch({ pane: 'editor' });
        await ensureEditor(lang);
        if (!editor) throw new Error('Editor failed to initialize');
        editor.setValue(text);
        editor.setReadOnly(false);
        patch({ status: isNew ? 'New file' : '' });
        editor.focus();
      }
    } catch (err) {
      patch({ error: /** @type {Error} */ (err).message, status: '' });
    }
  };

  /**
   * Focus a content pane by selector, if present.
   *
   * @param {string} selector
   */
  const focusPane = selector => {
    const $pane = /** @type {HTMLElement | null} */ (
      $mount.querySelector(selector)
    );
    if ($pane) $pane.focus();
  };

  const hide = () => {
    visible = false;
    $backdrop.style.display = 'none';
    $container.style.display = 'none';
    $container.classList.remove('blob-viewer-expanded');
    patch({ status: '', error: '' });
  };

  const close = () => {
    if (dirty) {
      // Could add confirmation dialog
    }
    hide();
    onClose();
  };

  // Global keydown handles Escape and Cmd+S when the viewer is open.
  /** @param {KeyboardEvent} e */
  const handleKeydown = e => {
    if (!visible) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (!state.readOnly && dirty) {
        handleSave();
      }
    }
  };
  document.addEventListener('keydown', handleKeydown);

  $backdrop.addEventListener('click', close);

  // Escape from Monaco: close the viewer.
  $editorHost.addEventListener('monaco-escape', close);

  // Cmd+Enter from Monaco: save and close in edit mode.
  const handleMonacoSubmit = () => {
    if (!state.readOnly && dirty) {
      handleSave().then(() => {
        close();
      });
    } else {
      close();
    }
  };
  $editorHost.addEventListener('monaco-submit', handleMonacoSubmit);

  return harden({
    open,
    hide,
    isVisible: () => visible,
    dispose: () => {
      document.removeEventListener('keydown', handleKeydown);
      $backdrop.removeEventListener('click', close);
      if (editor) {
        editor.dispose();
        editor = null;
      }
      unmount($mount);
      $mount.remove();
      if ($editorHost.parentElement) {
        $editorHost.parentElement.removeChild($editorHost);
      }
    },
  });
};
harden(createBlobViewer);
