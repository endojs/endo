// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { petNamePathAutocomplete } from './petname-path-autocomplete.js';

/**
 * @typedef {object} EndowModalAPI
 * @property {(messageNumber: bigint) => Promise<void>} show
 * @property {() => void} hide
 * @property {() => boolean} isVisible
 */

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

  $container.innerHTML = `
    <div class="endow-modal">
      <div class="endow-modal-header">
        <span class="endow-modal-title">Endow Definition</span>
        <button class="endow-modal-close" title="Close (Esc)">&times;</button>
      </div>
      <div class="endow-modal-body">
        <div class="endow-modal-source-section">
          <label class="endow-modal-label">Code</label>
          <pre class="endow-modal-source"></pre>
        </div>
        <div class="endow-modal-slots-section">
          <label class="endow-modal-label">Bindings</label>
          <div class="endow-modal-slots"></div>
        </div>
        <div class="endow-modal-options">
          <div class="endow-modal-option">
            <label>Save as</label>
            <input type="text" class="endow-modal-result-name" placeholder="result-name (optional)" autocomplete="off" data-form-type="other" data-lpignore="true" />
          </div>
          <div class="endow-modal-option">
            <label>Worker</label>
            <input type="text" class="endow-modal-worker" value="@main" autocomplete="off" data-form-type="other" data-lpignore="true" />
          </div>
        </div>
      </div>
      <div class="endow-modal-footer">
        <span class="endow-modal-error"></span>
        <button class="endow-modal-submit" disabled>Endow</button>
      </div>
    </div>
  `;

  const $source = /** @type {HTMLPreElement} */ (
    $container.querySelector('.endow-modal-source')
  );
  const $slotsContainer = /** @type {HTMLElement} */ (
    $container.querySelector('.endow-modal-slots')
  );
  const $resultName = /** @type {HTMLInputElement} */ (
    $container.querySelector('.endow-modal-result-name')
  );
  const $worker = /** @type {HTMLInputElement} */ (
    $container.querySelector('.endow-modal-worker')
  );
  const $closeBtn = /** @type {HTMLButtonElement} */ (
    $container.querySelector('.endow-modal-close')
  );
  const $submitBtn = /** @type {HTMLButtonElement} */ (
    $container.querySelector('.endow-modal-submit')
  );
  const $error = /** @type {HTMLElement} */ (
    $container.querySelector('.endow-modal-error')
  );

  /** @type {bigint | undefined} */
  let currentMessageNumber;
  /** @type {Map<string, HTMLInputElement>} */
  const slotInputs = new Map();
  /** @type {Array<{ dispose: () => void }>} */
  let autocompletes = [];

  const clearError = () => {
    $error.textContent = '';
  };

  const updateSubmitButton = () => {
    let allFilled = true;
    for (const $input of slotInputs.values()) {
      if (!$input.value.trim()) {
        allFilled = false;
        break;
      }
    }
    $submitBtn.disabled = !allFilled || slotInputs.size === 0;
  };

  const handleSubmit = async () => {
    if (currentMessageNumber === undefined) return;
    clearError();

    /** @type {Record<string, string>} */
    const bindings = {};
    for (const [codeName, $input] of slotInputs) {
      const val = $input.value.trim();
      if (!val) {
        $error.textContent = `Missing binding for ${codeName}`;
        return;
      }
      bindings[codeName] = val;
    }

    $submitBtn.disabled = true;
    try {
      const resultName = $resultName.value.trim() || undefined;
      const workerName = $worker.value.trim() || '@main';
      await onSubmit({
        messageNumber: currentMessageNumber,
        bindings,
        workerName,
        resultName,
      });
      onClose();
    } catch (/** @type {any} */ err) {
      $error.textContent = /** @type {Error} */ (err).message;
      $submitBtn.disabled = false;
    }
  };

  $closeBtn.addEventListener('click', onClose);
  $submitBtn.addEventListener('click', handleSubmit);

  // Esc to close
  $container.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  });

  /**
   * Show the modal for a specific definition message.
   *
   * @param {bigint} messageNumber
   */
  const show = async messageNumber => {
    currentMessageNumber = messageNumber;
    clearError();
    $resultName.value = '';
    $worker.value = '@main';
    $submitBtn.disabled = true;

    // Clean up previous autocompletes
    for (const ac of autocompletes) {
      ac.dispose();
    }
    autocompletes = [];
    slotInputs.clear();
    $slotsContainer.innerHTML = '';
    $source.textContent = 'Loading...';

    visible = true;

    // Find the definition message
    const messages = /** @type {Array<Record<string, unknown>>} */ (
      await E(powers).listMessages()
    );
    const msg = messages.find(
      m => /** @type {bigint} */ (m.number) === messageNumber,
    );

    if (!msg || msg.type !== 'definition') {
      $source.textContent = '';
      $error.textContent = `Message #${messageNumber} is not a definition`;
      return;
    }

    const source = /** @type {string} */ (msg.source);
    const slots = /** @type {Record<string, { label: string }>} */ (msg.slots);

    // Display source code
    $source.textContent = source;

    // Build slot binding inputs
    for (const [codeName, slot] of Object.entries(slots)) {
      const $row = document.createElement('div');
      $row.className = 'endow-modal-slot-row';

      const $label = document.createElement('label');
      $label.className = 'endow-modal-slot-label';
      const $code = document.createElement('code');
      $code.textContent = codeName;
      $label.appendChild($code);
      if (slot.label) {
        const $desc = document.createElement('span');
        $desc.className = 'endow-modal-slot-desc';
        $desc.textContent = ` — ${slot.label}`;
        $label.appendChild($desc);
      }

      const $inputWrapper = document.createElement('div');
      $inputWrapper.className = 'endow-modal-slot-input-wrapper';

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

      $inputWrapper.appendChild($input);
      $inputWrapper.appendChild($menu);

      $row.appendChild($label);
      $row.appendChild($inputWrapper);
      $slotsContainer.appendChild($row);

      slotInputs.set(codeName, $input);
      autocompletes.push(petNamePathAutocomplete($input, $menu, { E, powers }));
    }

    // Focus first slot input
    const firstInput = slotInputs.values().next().value;
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 50);
    }
  };

  const hide = () => {
    visible = false;
    currentMessageNumber = undefined;
    for (const ac of autocompletes) {
      ac.dispose();
    }
    autocompletes = [];
    slotInputs.clear();
  };

  const isVisible = () => visible;

  return harden({ show, hide, isVisible });
};
