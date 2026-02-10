// @ts-check
/* global window, document, setTimeout */

import { E } from '@endo/far';
import { render, inferType } from './value-render.js';

/**
 * @param {HTMLElement} $parent
 * @param {unknown} powers
 * @param {object} options
 * @param {() => void} options.dismissValue
 * @param {(hostName: string) => Promise<void>} options.enterProfile
 */
export const valueComponent = (
  $parent,
  powers,
  { dismissValue, enterProfile },
) => {
  const $frame = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-frame')
  );
  const $title = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-title')
  );
  const $type = /** @type {HTMLSelectElement} */ (
    $parent.querySelector('#value-type')
  );
  const $value = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-value')
  );
  const $close = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-close')
  );
  const $saveName = /** @type {HTMLInputElement} */ (
    $parent.querySelector('#value-save-name')
  );
  const $saveButton = /** @type {HTMLButtonElement} */ (
    $parent.querySelector('#value-save-button')
  );
  const $enterProfile = /** @type {HTMLButtonElement} */ (
    $parent.querySelector('#value-enter-profile')
  );

  /** @type {unknown} */
  let currentValue;
  /** @type {string[] | undefined} */
  let currentPetNamePath;

  /**
   * Update Enter Profile button visibility based on type.
   */
  const updateEnterProfileVisibility = () => {
    const selectedType = $type.value;
    if (
      selectedType === 'profile' &&
      currentPetNamePath &&
      currentPetNamePath.length > 0
    ) {
      $enterProfile.style.display = 'block';
    } else {
      $enterProfile.style.display = 'none';
    }
  };

  const clearValue = () => {
    $value.innerHTML = '';
    $saveName.value = '';
    $title.textContent = 'Value';
    $type.value = 'unknown';
    currentValue = undefined;
    currentPetNamePath = undefined;
    $enterProfile.style.display = 'none';
    dismissValue();
  };

  $close.addEventListener('click', () => {
    clearValue();
  });

  // Dismiss when clicking on the backdrop (but not the modal window)
  $frame.addEventListener('click', event => {
    if (event.target === $frame) {
      clearValue();
    }
  });

  $type.addEventListener('change', () => {
    updateEnterProfileVisibility();
  });

  $enterProfile.addEventListener('click', async () => {
    if (!currentPetNamePath) return;
    const hostName = currentPetNamePath.join('.');
    clearValue();
    await enterProfile(hostName);
  });

  const handleSave = async () => {
    const name = $saveName.value.trim();
    if (!name || currentValue === undefined) return;

    try {
      // Store the value with the given pet name path
      const petNamePath = name.split('.');
      await E(powers).storeValue(currentValue, petNamePath);
      $saveName.value = '';
      clearValue();
    } catch (error) {
      // Show error feedback
      $saveName.style.borderColor = '#e53e3e';
      setTimeout(() => {
        $saveName.style.borderColor = '';
      }, 2000);
      console.error('Failed to save value:', error);
    }
  };

  $saveButton.addEventListener('click', handleSave);

  $saveName.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSave();
    }
  });

  /** @param {KeyboardEvent} event */
  const handleKey = event => {
    const { key, repeat, metaKey } = event;
    if (repeat || metaKey) return;
    if (key === 'Escape') {
      clearValue();
      event.stopPropagation();
    }
  };

  /**
   * @param {unknown} value
   * @param {string} [id]
   * @param {string[]} [petNamePath]
   * @param {{ number: number, edgeName: string }} [messageContext]
   */
  const focusValue = async (value, id, petNamePath, messageContext) => {
    currentValue = value;
    currentPetNamePath = petNamePath;
    window.addEventListener('keyup', handleKey);

    // Render the value
    $value.innerHTML = '';
    $value.appendChild(render(value));

    // Infer and set the type
    const inferredType = inferType(value);
    $type.value = inferredType;

    // Update Enter Profile visibility based on inferred type
    updateEnterProfileVisibility();

    // Clear title and build it from components
    $title.innerHTML = '';

    /** @type {string[]} */
    let uniquePetNames = [];

    // 1. Add message context chip if present
    if (messageContext) {
      const $msgChip = document.createElement('span');
      $msgChip.className = 'token message-token';
      $msgChip.textContent = `#${messageContext.number}:${messageContext.edgeName}`;
      $title.appendChild($msgChip);
      $title.appendChild(document.createTextNode(' '));
    }

    // 2. Add pet name chips if we have an id
    if (id) {
      try {
        const petNames = /** @type {string[]} */ (
          await E(powers).reverseIdentify(id)
        );
        uniquePetNames = Array.from(new Set(petNames));
        for (const petName of uniquePetNames) {
          const $token = document.createElement('span');
          $token.className = 'token';
          const $name = document.createElement('b');
          $name.textContent = `@${petName}`;
          $token.appendChild($name);
          $title.appendChild($token);
          $title.appendChild(document.createTextNode(' '));
        }
        if (uniquePetNames.length === 0 && !messageContext) {
          // Has id but no names and no message context
          $title.textContent = '(unnamed)';
        }
      } catch {
        if (!messageContext) {
          $title.textContent = '(unnamed)';
        }
      }
    } else if (!messageContext) {
      // No id and no message context = ephemeral
      $title.textContent = 'Ephemeral Value';
    }

    // 3. Set currentPetNamePath from reverse lookup if not provided
    if (!currentPetNamePath && uniquePetNames.length > 0) {
      currentPetNamePath = uniquePetNames[0].split('.');
    }

    updateEnterProfileVisibility();
    $saveName.focus();
  };

  const blurValue = () => {
    window.removeEventListener('keyup', handleKey);
  };

  return { focusValue, blurValue };
};
