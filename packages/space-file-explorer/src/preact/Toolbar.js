// @ts-check
import { h } from 'preact';

/** @import { FileExplorerStore, Source, GitRefs } from './types.js' */

// The `GIT_WORKTREE` sentinel mirrors `../file-explorer.js` (a leading space so
// it can never collide with a valid git ref). The toolbar offers it as the
// "Working tree" option in the revision picker.
const GIT_WORKTREE = ' worktree';

/**
 * Build the "save to inventory" disabled-tooltip text. The save actions run
 * through a daemon caplet module whose URL Vite injects at build time; when the
 * URL is missing (loaded outside the Vite dev server) the corresponding button
 * is disabled with this explanatory tooltip.
 *
 * @param {string} what
 * @returns {string}
 */
const moduleMissingTitle = what =>
  `${what} requires the chat to be loaded through the Vite dev server (the daemon-side caplet module URL was not injected at build time).`;

/**
 * One `fx-btn` toolbar button.
 *
 * @param {object} opts
 * @param {string} opts.label
 * @param {string} opts.cls Extra class (e.g. `fx-act-refresh`).
 * @param {boolean} [opts.disabled]
 * @param {string} [opts.title]
 * @param {() => void} opts.onClick
 * @returns {import('preact').VNode}
 */
const button = ({ label, cls, disabled, title, onClick }) =>
  h(
    'button',
    {
      type: 'button',
      class: `fx-btn ${cls}`,
      disabled: !!disabled,
      title,
      onClick,
    },
    label,
  );

/**
 * The file-explorer toolbar: source select, view toggle, optional git revision
 * picker, CAS-cache toggle, and the new-filesystem / file-action / layer button
 * clusters. A faithful Preact reimplementation of `renderToolbar`
 * (`../file-explorer.js` L1942–2154); reuses the same `fx-*` classes and DOM
 * nesting verbatim.
 *
 * @param {object} props
 * @param {FileExplorerStore} props.store
 * @returns {import('preact').VNode}
 */
export function Toolbar({ store }) {
  const { state, activeSource, actions, features } = store;
  const { sources, activeSourceId, viewMode } = state;
  const source = activeSource;
  const isLayer = !!source && source.kind === 'layer';
  const readOnly = !!source && source.readOnly;
  const useCache = !!source && source.useCache;
  const { canMintMemory, canSaveReadOnly, canSaveLayer } = features;

  // Revision picker, only for git-backed sources. The one-shot branch/commit
  // fetch is owned by the store (it re-renders when refs land); until then just
  // the worktree option shows.
  const isGit = !!source && !!source.git;
  /** @type {GitRefs} */
  const gitRefs = (source && source.gitRefs) || { branches: [], commits: [] };

  /**
   * One `<option>` for the git revision picker.
   *
   * @param {string} value
   * @param {string} text
   * @param {string} [label]
   * @returns {import('preact').VNode}
   */
  const gitOption = (value, text, label) =>
    h(
      'option',
      { value, selected: !!source && source.gitRef === value },
      label === undefined ? text : label,
    );

  const branchOpts = gitRefs.branches.map(b => gitOption(b.name, b.name));
  const commitOpts = gitRefs.commits.map(c =>
    gitOption(c.oid, c.oid, `${c.oid.slice(0, 7)}  ${c.summary}`),
  );

  const gitPicker = isGit
    ? h(
        'div',
        { class: 'fx-toolbar-group fx-group-git' },
        h('span', { class: 'fx-group-label' }, 'Revision'),
        h(
          'select',
          {
            class: 'fx-git-ref',
            /** @param {{ target: { value: string } }} e */
            onChange: e => {
              actions.selectGitRevision(e.target.value);
            },
          },
          gitOption(GIT_WORKTREE, 'Working tree'),
          branchOpts.length
            ? h('optgroup', { label: 'Branches' }, ...branchOpts)
            : null,
          commitOpts.length
            ? h('optgroup', { label: 'Commits' }, ...commitOpts)
            : null,
        ),
      )
    : null;

  const sourceOptions = sources.length
    ? sources.map(item =>
        h(
          'option',
          { value: item.id, selected: item.id === activeSourceId },
          item.label,
        ),
      )
    : [h('option', {}, 'No filesystem')];

  // Three categories surfaced as labelled clusters: view options (what the
  // explorer shows), new-fs options (what the user mints into the inventory),
  // and file actions (mutations on the active source). When the active source
  // is a layer, the layer-specific actions show up as a fourth, labelled
  // subgroup.
  return h(
    'div',
    { class: 'fx-toolbar' },
    h(
      'div',
      { class: 'fx-toolbar-group fx-group-view' },
      h('span', { class: 'fx-group-label' }, 'View'),
      h(
        'select',
        {
          class: 'fx-source-select',
          disabled: !sources.length,
          /** @param {{ target: { value: string } }} e */
          onChange: e => {
            actions.selectSource(e.target.value);
          },
        },
        ...sourceOptions,
      ),
      h(
        'div',
        { class: 'fx-segmented' },
        h(
          'button',
          {
            type: 'button',
            class: `fx-seg ${viewMode === 'columns' ? 'fx-seg-on' : ''}`,
            'data-view': 'columns',
            onClick: () => {
              if (viewMode !== 'columns') {
                actions.setViewMode('columns');
              }
            },
          },
          'Columns',
        ),
        h(
          'button',
          {
            type: 'button',
            class: `fx-seg ${viewMode === 'tree' ? 'fx-seg-on' : ''}`,
            'data-view': 'tree',
            onClick: () => {
              if (viewMode !== 'tree') {
                actions.setViewMode('tree');
              }
            },
          },
          'Tree',
        ),
      ),
      h(
        'label',
        {
          class: `fx-check ${source ? '' : 'fx-check-disabled'}`,
          title:
            'Wrap reads through an ephemeral content-addressed LRU cache (view-only)',
        },
        h('input', {
          type: 'checkbox',
          class: 'fx-act-cache',
          checked: useCache,
          disabled: !source,
          onChange: () => {
            actions.toggleViewCache();
          },
        }),
        h('span', {}, 'CAS cache'),
      ),
      button({
        label: '↻ Refresh',
        cls: 'fx-act-refresh',
        disabled: !source,
        onClick: () => {
          actions.refreshActive();
        },
      }),
    ),
    gitPicker,
    h(
      'div',
      { class: 'fx-toolbar-group fx-group-new' },
      h('span', { class: 'fx-group-label' }, 'New filesystem'),
      button({
        label: '+ In-memory',
        cls: 'fx-act-memory',
        disabled: !canMintMemory,
        title: canMintMemory
          ? undefined
          : moduleMissingTitle('Minting an in-memory filesystem'),
        onClick: () => {
          actions.addMemoryFilesystem();
        },
      }),
      button({
        label: 'Open…',
        cls: 'fx-act-open',
        onClick: () => {
          actions.openByPetName();
        },
      }),
      button({
        label: 'Save read-only view…',
        cls: 'fx-act-readonly',
        disabled: !source || !canSaveReadOnly,
        title: canSaveReadOnly
          ? undefined
          : moduleMissingTitle('Saving a read-only view'),
        onClick: () => {
          actions.saveReadOnlyView();
        },
      }),
      button({
        label: 'Save layer…',
        cls: 'fx-act-layer',
        disabled: !source || !canSaveLayer,
        title: canSaveLayer ? undefined : moduleMissingTitle('Saving a layer'),
        onClick: () => {
          actions.saveLayer();
        },
      }),
    ),
    h(
      'div',
      { class: 'fx-toolbar-group fx-group-actions' },
      h('span', { class: 'fx-group-label' }, 'File actions'),
      button({
        label: 'New folder',
        cls: 'fx-act-newfolder',
        disabled: !source || readOnly,
        onClick: () => {
          actions.newFolder();
        },
      }),
      button({
        label: 'New file',
        cls: 'fx-act-newfile',
        disabled: !source || readOnly,
        onClick: () => {
          actions.newFile();
        },
      }),
    ),
    isLayer
      ? h(
          'div',
          { class: 'fx-toolbar-group fx-layer-group' },
          h('span', { class: 'fx-group-label' }, 'Layer'),
          button({
            label: 'View layer diff',
            cls: 'fx-act-changes',
            onClick: () => {
              actions.viewLayerDiff();
            },
          }),
          button({
            label: 'Apply layer…',
            cls: 'fx-act-apply',
            onClick: () => {
              actions.applyActiveLayer();
            },
          }),
          button({
            label: 'Revert layer',
            cls: 'fx-act-revert',
            onClick: () => {
              actions.revertActiveLayer();
            },
          }),
        )
      : null,
  );
}
harden(Toolbar);
