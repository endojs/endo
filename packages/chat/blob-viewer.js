// @ts-check
/* global document */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { createMonacoEditor, colorize, detectTheme } from './monaco-wrapper.js';
import { inferLanguage } from './language-detect.js';
import { renderMarkdownToHtml, isMarkdown } from './markdown-preview.js';
import { keyCombo, modKey } from './platform-keys.js';

/**
 * @typedef {object} BlobViewerAPI
 * @property {(petNamePath: string, readOnly: boolean) => Promise<void>} open
 * @property {() => void} hide
 * @property {() => boolean} isVisible
 */

/**
 * Create the blob viewer/editor component.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container element
 * @param {HTMLElement} options.$backdrop - Backdrop element
 * @param {typeof import('@endo/far').E} options.E - Eventual send
 * @param {ERef<EndoHost>} options.powers - Powers object
 * @param {() => void} options.onClose - Called when the viewer is closed
 * @returns {BlobViewerAPI}
 */
export const createBlobViewer = ({ $container, $backdrop, E, powers, onClose }) => {
  let visible = false;
  let dirty = false;
  /** @type {import('./monaco-wrapper.js').MonacoEditorAPI | null} */
  let editor = null;
  /** @type {string[]} */
  let currentPath = [];
  /** @type {string} */
  let originalContent = '';
  /** @type {boolean} */
  let currentReadOnly = true;
  /** @type {boolean} */
  let showingRawMarkdown = false;
  /** @type {HTMLElement | null} */
  let editorMountedIn = null;

  // Build the DOM structure
  $container.innerHTML = `
    <div class="blob-viewer">
      <div class="blob-viewer-header">
        <div class="blob-viewer-title-area">
          <span class="blob-viewer-title"></span>
          <span class="blob-viewer-language"></span>
        </div>
        <div class="blob-viewer-actions">
          <div class="blob-viewer-md-toggle" data-active="preview" style="display:none">
            <button class="md-toggle-seg" data-seg="preview">Preview</button>
            <button class="md-toggle-seg" data-seg="source">Source</button>
          </div>
          <button class="blob-viewer-save" title="Save (${keyCombo(modKey, 'S')})" style="display:none">Save</button>
          <button class="blob-viewer-close" title="Close (Esc)">&times;</button>
        </div>
      </div>
      <div class="blob-viewer-editor-container"></div>
      <pre class="blob-viewer-pre" tabindex="0" style="display:none"></pre>
      <div class="blob-viewer-md-preview md-rendered" tabindex="0" style="display:none"></div>
      <div class="blob-viewer-split" style="display:none">
        <div class="blob-viewer-split-editor"></div>
        <div class="blob-viewer-split-preview md-rendered"></div>
      </div>
      <div class="blob-viewer-footer">
        <span class="blob-viewer-status"></span>
        <span class="blob-viewer-error"></span>
      </div>
    </div>
  `;

  const $title = /** @type {HTMLElement} */ (
    $container.querySelector('.blob-viewer-title')
  );
  const $langBadge = /** @type {HTMLElement} */ (
    $container.querySelector('.blob-viewer-language')
  );
  const $editorContainer = /** @type {HTMLElement} */ (
    $container.querySelector('.blob-viewer-editor-container')
  );
  const $pre = /** @type {HTMLPreElement} */ (
    $container.querySelector('.blob-viewer-pre')
  );
  const $mdPreview = /** @type {HTMLElement} */ (
    $container.querySelector('.blob-viewer-md-preview')
  );
  const $splitContainer = /** @type {HTMLElement} */ (
    $container.querySelector('.blob-viewer-split')
  );
  const $splitEditor = /** @type {HTMLElement} */ (
    $container.querySelector('.blob-viewer-split-editor')
  );
  const $splitPreview = /** @type {HTMLElement} */ (
    $container.querySelector('.blob-viewer-split-preview')
  );
  const $mdToggle = /** @type {HTMLElement} */ (
    $container.querySelector('.blob-viewer-md-toggle')
  );
  const $saveBtn = /** @type {HTMLButtonElement} */ (
    $container.querySelector('.blob-viewer-save')
  );
  const $closeBtn = /** @type {HTMLButtonElement} */ (
    $container.querySelector('.blob-viewer-close')
  );
  const $status = /** @type {HTMLElement} */ (
    $container.querySelector('.blob-viewer-status')
  );
  const $error = /** @type {HTMLElement} */ (
    $container.querySelector('.blob-viewer-error')
  );

  /**
   * Lazily initialize the Monaco editor, mounting it in the given
   * container.  If the editor already exists in a different container
   * it is disposed and recreated.
   *
   * @param {string} lang
   * @param {HTMLElement} $mount
   * @param {((value: string) => void) | undefined} [extraOnChange]
   */
  const ensureEditor = async (lang, $mount, extraOnChange) => {
    if (editor && editorMountedIn !== $mount) {
      editor.dispose();
      editor = null;
      editorMountedIn = null;
    }
    if (!editor) {
      editor = await createMonacoEditor($mount, {
        onChange: value => {
          if (!currentReadOnly) {
            dirty = true;
            $saveBtn.disabled = false;
          }
          if (extraOnChange) {
            extraOnChange(value);
          }
        },
        initialValue: '',
        language: lang,
      });
      editorMountedIn = $mount;
    } else {
      editor.setLanguage(lang);
    }
  };

  const clearError = () => {
    $error.textContent = '';
  };

  /**
   * Save the current content back to the daemon.
   */
  const handleSave = async () => {
    if (!editor || currentReadOnly || !dirty) return;
    clearError();

    $saveBtn.disabled = true;
    $saveBtn.classList.add('btn-spinner');
    $status.textContent = 'Saving...';

    try {
      const content = editor.getValue();
      await E(powers).writeText(currentPath, content);
      originalContent = content;
      dirty = false;
      $status.textContent = 'Saved';
    } catch (err) {
      $error.textContent = /** @type {Error} */ (err).message;
      $saveBtn.disabled = false;
    } finally {
      $saveBtn.classList.remove('btn-spinner');
    }
  };

  /**
   * Open the viewer/editor for a blob at the given pet name path.
   *
   * @param {string} petNamePath - Slash-separated pet name path
   * @param {boolean} readOnly - Whether to open in read-only mode
   */
  const open = async (petNamePath, readOnly) => {
    clearError();
    dirty = false;
    currentReadOnly = readOnly;
    currentPath = petNamePath.split('/');

    const filename = currentPath[currentPath.length - 1] || petNamePath;
    const lang = inferLanguage(filename);

    $title.textContent = petNamePath;
    $langBadge.textContent = lang;
    $saveBtn.style.display = readOnly ? 'none' : '';
    $saveBtn.disabled = true;
    $status.textContent = 'Loading...';

    // Show the modal immediately so the user sees the loading state
    $backdrop.style.display = 'block';
    $container.style.display = 'block';
    visible = true;

    // Hide all content panes; the active one is shown below.
    $editorContainer.style.display = 'none';
    $pre.style.display = 'none';
    $mdPreview.style.display = 'none';
    $splitContainer.style.display = 'none';
    $mdToggle.style.display = 'none';
    $container.classList.remove('blob-viewer-expanded');
    showingRawMarkdown = false;

    const md = isMarkdown(lang);

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
        // Markdown view: rendered HTML with source toggle.
        $mdPreview.style.display = 'block';
        $mdToggle.style.display = '';
        $mdToggle.setAttribute('data-active', 'preview');
        const themed = detectTheme();
        $mdPreview.setAttribute('data-theme', themed);
        $mdPreview.innerHTML = await renderMarkdownToHtml(text);
        $status.textContent = 'Read-only';
        $mdPreview.focus();
      } else if (readOnly) {
        // Non-markdown view: syntax-highlighted <pre>.
        $pre.style.display = 'block';
        const themed = detectTheme();
        $pre.setAttribute('data-theme', themed);
        $pre.innerHTML = await colorize(text, lang);
        $status.textContent = 'Read-only';
        $pre.focus();
      } else if (md) {
        // Markdown edit: side-by-side editor + live preview.
        $container.classList.add('blob-viewer-expanded');
        $splitContainer.style.display = 'flex';
        const themed = detectTheme();
        $splitPreview.setAttribute('data-theme', themed);
        $splitPreview.innerHTML = await renderMarkdownToHtml(text);

        await ensureEditor(lang, $splitEditor, value => {
          renderMarkdownToHtml(value).then(html => {
            $splitPreview.innerHTML = html;
          });
        });
        if (!editor) throw new Error('Editor failed to initialize');

        // Scroll synchronization
        let isSyncing = false;
        editor.onDidScrollChange((scrollTop, scrollHeight) => {
          if (isSyncing) return;
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
        $splitPreview.addEventListener('scroll', () => {
          if (isSyncing || !editor) return;
          isSyncing = true;
          const previewMax = Math.max(
            1,
            $splitPreview.scrollHeight - $splitPreview.clientHeight,
          );
          const fraction = $splitPreview.scrollTop / previewMax;
          editor.setScrollFraction(fraction);
          isSyncing = false;
        });

        editor.setValue(text);
        editor.setReadOnly(false);
        $status.textContent = isNew ? 'New file' : '';
        editor.focus();
      } else {
        // Non-markdown edit: full Monaco editor.
        $editorContainer.style.display = 'block';
        await ensureEditor(lang, $editorContainer);
        if (!editor) throw new Error('Editor failed to initialize');
        editor.setValue(text);
        editor.setReadOnly(false);
        $status.textContent = isNew ? 'New file' : '';
        editor.focus();
      }
    } catch (err) {
      $error.textContent = /** @type {Error} */ (err).message;
      $status.textContent = '';
    }
  };

  const hide = () => {
    visible = false;
    $backdrop.style.display = 'none';
    $container.style.display = 'none';
    $container.classList.remove('blob-viewer-expanded');
    $status.textContent = '';
    clearError();
  };

  const close = () => {
    if (dirty) {
      // Could add confirmation dialog
    }
    hide();
    onClose();
  };

  // Markdown view toggle: switch between rendered and raw source.
  $mdToggle.addEventListener('click', async e => {
    const seg = /** @type {HTMLElement | null} */ (
      /** @type {HTMLElement} */ (e.target).closest('.md-toggle-seg')
    );
    if (!seg) return;
    const target = seg.getAttribute('data-seg');
    if (target === 'source' && !showingRawMarkdown) {
      $mdPreview.style.display = 'none';
      $pre.style.display = 'block';
      const themed = detectTheme();
      $pre.setAttribute('data-theme', themed);
      $pre.innerHTML = await colorize(originalContent, 'markdown');
      $mdToggle.setAttribute('data-active', 'source');
      showingRawMarkdown = true;
      $pre.focus();
    } else if (target === 'preview' && showingRawMarkdown) {
      $pre.style.display = 'none';
      $mdPreview.style.display = 'block';
      $mdToggle.setAttribute('data-active', 'preview');
      showingRawMarkdown = false;
      $mdPreview.focus();
    }
  });

  // Event handlers
  $closeBtn.addEventListener('click', close);
  $saveBtn.addEventListener('click', handleSave);
  $backdrop.addEventListener('click', close);

  // Global keydown handles Escape and Cmd+S when the viewer is open.
  // Monaco's addCommand(Escape) fires monaco-escape but may not
  // propagate to the container, so we listen on document as well.
  document.addEventListener('keydown', e => {
    if (!visible) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (!currentReadOnly && dirty) {
        handleSave();
      }
    }
  });

  // Escape from Monaco: close the viewer.
  $editorContainer.addEventListener('monaco-escape', close);
  $splitEditor.addEventListener('monaco-escape', close);

  // Cmd+Enter from Monaco: save and close in edit mode
  const handleMonacoSubmit = () => {
    if (!currentReadOnly && dirty) {
      handleSave().then(() => {
        close();
      });
    } else {
      close();
    }
  };
  $editorContainer.addEventListener('monaco-submit', handleMonacoSubmit);
  $splitEditor.addEventListener('monaco-submit', handleMonacoSubmit);

  return {
    open,
    hide,
    isVisible: () => visible,
  };
};
