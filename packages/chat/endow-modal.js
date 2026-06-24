// @ts-check
/* eslint-disable no-use-before-define */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */
/** @import { PetNamePathAutocompleteAPI } from './petname-path-autocomplete.js' */

import harden from '@endo/harden';

import { h, renderConfined } from './setup-preact-container.js';

import { petNamePathAutocomplete } from './petname-path-autocomplete.js';

// Endow modal, migrated from imperative `innerHTML`/`createElement` DOM to a
// confined Preact tree rendered through a single `renderConfined` into a
// dedicated mount child of the host `$container`. The exported entry keeps its
// exact signature (`createEndowModal({ $container, E, powers, onSubmit,
// onClose })`) and hardened control object (`{ show, hide, isVisible }`) so the
// caller (chat-bar-component) needs no changes, and the same `.endow-modal-*`
// CSS class names are reused so styling is unchanged.
//
// COMPOSITION. Each slot's pet-name path autocomplete is a host-node CONTROLLER
// (`petNamePathAutocomplete($input, $menu, opts)` owns its OWN `renderConfined`
// into a host node and returns a control object). The slot input + menu are
// therefore PERSISTENT host nodes the modal owns, mounted IMPERATIVELY into a
// per-slot anchor that the confined tree renders (cf. edit-space-modal's
// scheme-picker host node, and send-form's host-node children) — NOT nested
// inside this modal's vnode tree. The controllers are disposed on hide/reshow.

/**
 * @typedef {object} EndowModalAPI
 * @property {(messageNumber: bigint) => Promise<void>} show
 * @property {() => void} hide
 * @property {() => boolean} isVisible
 */

/**
 * Plain-data description of one definition slot, derived from the daemon
 * message. Host DOM never enters the confined tree; only this crosses in.
 *
 * @typedef {object} SlotView
 * @property {string} codeName - The code-side name to bind.
 * @property {string} label - Optional human-readable description.
 */

/**
 * Plain-data view state for the confined modal body.
 *
 * @typedef {object} EndowModalView
 * @property {string} source - The definition's source code (or status text).
 * @property {SlotView[]} slots - The slots to bind.
 * @property {string} resultName - The current "save as" value.
 * @property {string} workerName - The current worker value.
 * @property {boolean} submitDisabled - Whether the submit button is disabled.
 * @property {string} error - The current error message.
 */

/**
 * One slot binding row. The actual `<input>` and its autocomplete `<div>` are
 * persistent host nodes the controller re-parents into the
 * `data-slot-anchor` slot after each render; only the label renders here.
 *
 * @param {object} props
 * @param {SlotView} props.slot
 */
const SlotRow = ({ slot }) =>
  h(
    'div',
    { class: 'endow-modal-slot-row' },
    h(
      'label',
      { class: 'endow-modal-slot-label' },
      h('code', null, slot.codeName),
      slot.label
        ? h('span', { class: 'endow-modal-slot-desc' }, ` — ${slot.label}`)
        : null,
    ),
    // Empty anchor; the controller re-parents the persistent input + menu
    // wrapper (owned by the autocomplete host controller) into it after render.
    h('div', {
      class: 'endow-modal-slot-input-wrapper',
      'data-slot-anchor': slot.codeName,
    }),
  );
harden(SlotRow);

/**
 * The confined modal body — a pure function of `view` plus controller
 * callbacks. Host DOM nodes never enter this tree; the slot inputs live on
 * persistent host nodes the controller re-parents into the per-slot anchors
 * after each render.
 *
 * @param {object} props
 * @param {EndowModalView} props.view
 * @param {(value: string) => void} props.onResultNameInput
 * @param {(value: string) => void} props.onWorkerInput
 * @param {() => void} props.onSubmit
 * @param {() => void} props.onClose
 */
const EndowModalBody = ({
  view,
  onResultNameInput,
  onWorkerInput,
  onSubmit,
  onClose,
}) =>
  h(
    'div',
    { class: 'endow-modal' },
    h(
      'div',
      { class: 'endow-modal-header' },
      h('span', { class: 'endow-modal-title' }, 'Endow Definition'),
      h(
        'button',
        {
          class: 'endow-modal-close',
          title: 'Close (Esc)',
          onClick: onClose,
        },
        '×',
      ),
    ),
    h(
      'div',
      { class: 'endow-modal-body' },
      h(
        'div',
        { class: 'endow-modal-source-section' },
        h('label', { class: 'endow-modal-label' }, 'Code'),
        h('pre', { class: 'endow-modal-source' }, view.source),
      ),
      h(
        'div',
        { class: 'endow-modal-slots-section' },
        h('label', { class: 'endow-modal-label' }, 'Bindings'),
        h(
          'div',
          { class: 'endow-modal-slots' },
          view.slots.map(slot => h(SlotRow, { key: slot.codeName, slot })),
        ),
      ),
      h(
        'div',
        { class: 'endow-modal-options' },
        h(
          'div',
          { class: 'endow-modal-option' },
          h('label', null, 'Save as'),
          h('input', {
            type: 'text',
            class: 'endow-modal-result-name',
            placeholder: 'result-name (optional)',
            autocomplete: 'off',
            'data-form-type': 'other',
            'data-lpignore': 'true',
            value: view.resultName,
            /** @param {{ target: { value: string } }} e */
            onInput: e => onResultNameInput(e.target.value),
          }),
        ),
        h(
          'div',
          { class: 'endow-modal-option' },
          h('label', null, 'Worker'),
          h('input', {
            type: 'text',
            class: 'endow-modal-worker',
            autocomplete: 'off',
            'data-form-type': 'other',
            'data-lpignore': 'true',
            value: view.workerName,
            /** @param {{ target: { value: string } }} e */
            onInput: e => onWorkerInput(e.target.value),
          }),
        ),
      ),
    ),
    h(
      'div',
      { class: 'endow-modal-footer' },
      h('span', { class: 'endow-modal-error' }, view.error),
      h(
        'button',
        {
          class: 'endow-modal-submit',
          disabled: view.submitDisabled,
          onClick: onSubmit,
        },
        'Endow',
      ),
    ),
  );
harden(EndowModalBody);

/**
 * Create the endow modal component.
 *
 * Given a definition message number, fetches the definition's source
 * and slots, then presents a form for binding each slot to a pet name.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container
 * @param {typeof import('@endo/far').E} options.E
 * @param {ERef<EndoHost>} options.powers
 * @param {(result: { messageNumber: bigint, bindings: Record<string, string>, workerName: string, resultName?: string }) => Promise<void>} options.onSubmit
 * @param {() => void} options.onClose
 * @returns {EndowModalAPI}
 */
export const createEndowModal = ({
  $container,
  E,
  powers,
  onSubmit,
  onClose,
}) => {
  let visible = false;

  // Dedicated confined mount; siblings of `$container` are never reconciled.
  const $mount = document.createElement('div');
  $container.innerHTML = '';
  $container.appendChild($mount);

  /** @type {bigint | undefined} */
  let currentMessageNumber;

  // Per-slot persistent host nodes: a wrapper holding the `<input>` and the
  // autocomplete `<div>` menu, plus the autocomplete controller. These survive
  // confined re-renders; the controller re-parents each wrapper into its
  // anchor after every render.
  /**
   * @typedef {object} SlotHost
   * @property {string} codeName
   * @property {HTMLElement} $wrapper
   * @property {HTMLInputElement} $input
   * @property {PetNamePathAutocompleteAPI} autocomplete
   */
  /** @type {SlotHost[]} */
  let slotHosts = [];

  /** @type {EndowModalView} */
  let view = harden({
    source: '',
    slots: [],
    resultName: '',
    workerName: '@main',
    submitDisabled: true,
    error: '',
  });

  const computeSubmitDisabled = () => {
    if (slotHosts.length === 0) return true;
    return slotHosts.some(({ $input }) => !$input.value.trim());
  };

  /**
   * Re-parent each persistent slot wrapper into its freshly rendered anchor.
   * `renderConfined` is synchronous, so the anchors exist by the time this runs.
   */
  const reattachSlots = () => {
    for (const { codeName, $wrapper } of slotHosts) {
      const $anchor = /** @type {HTMLElement | null} */ (
        $mount.querySelector(`[data-slot-anchor="${codeName}"]`)
      );
      if ($anchor && $wrapper.parentElement !== $anchor) {
        $anchor.appendChild($wrapper);
      }
    }
  };

  const rerender = () => {
    renderConfined(
      h(EndowModalBody, {
        view,
        onResultNameInput: value => {
          view = harden({ ...view, resultName: value });
          rerender();
        },
        onWorkerInput: value => {
          view = harden({ ...view, workerName: value });
          rerender();
        },
        onSubmit: () => {
          handleSubmit();
        },
        onClose,
      }),
      $mount,
    );
    reattachSlots();
  };

  /** @param {string} message */
  const setError = message => {
    view = harden({ ...view, error: message });
    rerender();
  };

  const updateSubmitButton = () => {
    const submitDisabled = computeSubmitDisabled();
    if (submitDisabled !== view.submitDisabled) {
      view = harden({ ...view, submitDisabled });
      rerender();
    }
  };

  const disposeSlots = () => {
    for (const { autocomplete, $wrapper } of slotHosts) {
      autocomplete.dispose();
      if ($wrapper.parentElement) {
        $wrapper.parentElement.removeChild($wrapper);
      }
    }
    slotHosts = [];
  };

  const handleSubmit = async () => {
    if (currentMessageNumber === undefined) return;

    /** @type {Record<string, string>} */
    const bindings = {};
    for (const { codeName, $input } of slotHosts) {
      const val = $input.value.trim();
      if (!val) {
        setError(`Missing binding for ${codeName}`);
        return;
      }
      bindings[codeName] = val;
    }

    setError('');
    view = harden({ ...view, submitDisabled: true });
    rerender();
    try {
      const resultName = view.resultName.trim() || undefined;
      const workerName = view.workerName.trim() || '@main';
      await onSubmit({
        messageNumber: currentMessageNumber,
        bindings,
        workerName,
        resultName,
      });
      onClose();
    } catch (err) {
      setError(/** @type {Error} */ (err).message);
      updateSubmitButton();
    }
  };

  /**
   * Escape-key handler; only active while the modal is open.
   *
   * @param {KeyboardEvent} e
   */
  const handleEscape = e => {
    if (e.key === 'Escape' && visible) {
      e.stopPropagation();
      onClose();
    }
  };
  $container.addEventListener('keydown', handleEscape);

  /**
   * Build the persistent slot host nodes (input + menu wrapper) and wire each
   * to a pet-name path autocomplete controller.
   *
   * @param {SlotView[]} slots
   */
  const buildSlots = slots => {
    disposeSlots();
    for (const { codeName } of slots) {
      const $wrapper = document.createElement('div');

      const $input = document.createElement('input');
      $input.type = 'text';
      $input.className = 'endow-modal-slot-input';
      $input.placeholder = `pet name for ${codeName}`;
      $input.autocomplete = 'off';
      $input.dataset.formType = 'other';
      $input.dataset.lpignore = 'true';
      $input.addEventListener('input', updateSubmitButton);
      $input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        }
      });

      const $menu = document.createElement('div');
      $menu.className = 'endow-modal-slot-menu token-menu';

      $wrapper.appendChild($input);
      $wrapper.appendChild($menu);

      const autocomplete = petNamePathAutocomplete($input, $menu, {
        E,
        powers,
      });
      // Not hardened: holds live host DOM nodes, which harden cannot freeze.
      slotHosts.push({ codeName, $wrapper, $input, autocomplete });
    }
  };

  /**
   * Show the modal for a specific definition message.
   *
   * @param {bigint} messageNumber
   */
  const show = async messageNumber => {
    currentMessageNumber = messageNumber;
    disposeSlots();
    view = harden({
      source: 'Loading...',
      slots: [],
      resultName: '',
      workerName: '@main',
      submitDisabled: true,
      error: '',
    });
    rerender();

    visible = true;

    // Find the definition message
    const messages = /** @type {Array<Record<string, unknown>>} */ (
      await E(powers).listMessages()
    );
    const msg = messages.find(
      m => /** @type {bigint} */ (m.number) === messageNumber,
    );

    if (!msg || msg.type !== 'definition') {
      view = harden({
        ...view,
        source: '',
        error: `Message #${messageNumber} is not a definition`,
      });
      rerender();
      return;
    }

    const source = /** @type {string} */ (msg.source);
    const slots = /** @type {Record<string, { label: string }>} */ (msg.slots);

    /** @type {SlotView[]} */
    const slotViews = Object.entries(slots).map(([codeName, slot]) =>
      harden({ codeName, label: slot.label || '' }),
    );

    // Build the persistent slot host nodes and their autocompletes, then render
    // and re-parent them into their anchors.
    buildSlots(slotViews);

    view = harden({
      ...view,
      source,
      slots: slotViews,
      submitDisabled: computeSubmitDisabled(),
    });
    rerender();

    // Focus first slot input.
    const first = slotHosts[0];
    if (first) {
      setTimeout(() => first.$input.focus(), 50);
    }
  };

  const hide = () => {
    visible = false;
    currentMessageNumber = undefined;
    disposeSlots();
    view = harden({
      source: '',
      slots: [],
      resultName: '',
      workerName: '@main',
      submitDisabled: true,
      error: '',
    });
    rerender();
  };

  const isVisible = () => visible;

  // Initial render (closed/empty).
  rerender();

  return harden({ show, hide, isVisible });
};
harden(createEndowModal);
