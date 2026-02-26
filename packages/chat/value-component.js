// @ts-check
/* global window, document, navigator, setTimeout */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/far';
import { passStyleOf } from '@endo/pass-style';
import { render, inferType, toClipboardText } from './value-render.js';

/**
 * @param {HTMLElement} $container
 * @param {string} label
 * @param {string} defaultValue
 * @param {string} buttonText
 * @param {(name: string) => Promise<void>} handler
 */
const buildNameAction = ($container, label, defaultValue, buttonText, handler) => {
  const $form = document.createElement('div');
  $form.className = 'value-name-form';

  const $label = document.createElement('label');
  $label.textContent = label;
  $form.appendChild($label);

  const $input = document.createElement('input');
  $input.type = 'text';
  $input.className = 'value-name-input';
  $input.placeholder = 'pet.name.path';
  $input.value = defaultValue;
  $form.appendChild($input);

  const $button = document.createElement('button');
  $button.textContent = buttonText;
  $form.appendChild($button);

  const submit = async () => {
    const name = $input.value.trim();
    if (!name) return;
    try {
      await handler(name);
    } catch (error) {
      $input.style.borderColor = '#e53e3e';
      setTimeout(() => {
        $input.style.borderColor = '';
      }, 2000);
      console.error(`Failed to ${buttonText.toLowerCase()} value:`, error);
    }
  };

  $button.addEventListener('click', submit);
  $input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  });

  $container.appendChild($form);
  return $input;
};

/**
 * @param {HTMLElement} $container
 * @param {unknown} value
 */
const buildCopyButton = ($container, value) => {
  const text = toClipboardText(value);
  if (text === undefined) return;

  const $button = document.createElement('button');
  $button.className = 'value-copy-button';
  $button.textContent = 'Copy';

  $button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      $button.textContent = 'Copied!';
      $button.classList.add('value-copy-feedback');
      setTimeout(() => {
        $button.textContent = 'Copy';
        $button.classList.remove('value-copy-feedback');
      }, 1500);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  });

  $container.appendChild($button);
};

/**
 * @param {HTMLElement} $parent
 * @param {ERef<EndoHost>} powers
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
  const $actionsContainer = /** @type {HTMLElement} */ (
    $parent.querySelector('#value-actions-container')
  );
  const $enterProfile = /** @type {HTMLButtonElement} */ (
    $parent.querySelector('#value-enter-profile')
  );

  /** @type {unknown} */
  let currentValue;
  /** @type {string[] | undefined} */
  let currentPetNamePath;

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
    $actionsContainer.innerHTML = '';
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
   * @param {{ number: bigint, edgeName: string }} [messageContext]
   */
  const focusValue = async (value, id, petNamePath, messageContext) => {
    currentValue = value;
    currentPetNamePath = petNamePath;
    window.addEventListener('keyup', handleKey);

    $value.innerHTML = '';
    $value.appendChild(render(value));

    const inferredType = inferType(value);
    $type.value = inferredType;

    updateEnterProfileVisibility();

    $title.innerHTML = '';

    /** @type {string[]} */
    let uniquePetNames = [];

    if (messageContext) {
      const $msgChip = document.createElement('span');
      $msgChip.className = 'token message-token';
      $msgChip.textContent = `#${messageContext.number}:${messageContext.edgeName}`;
      $title.appendChild($msgChip);
      $title.appendChild(document.createTextNode(' '));
    }

    if (id) {
      try {
        const petNames = await E(powers).reverseIdentify(id);
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
          $title.textContent = '(unnamed)';
        }
      } catch {
        if (!messageContext) {
          $title.textContent = '(unnamed)';
        }
      }
    } else if (!messageContext) {
      $title.textContent = 'Ephemeral Value';
    }

    if (!currentPetNamePath && uniquePetNames.length > 0) {
      currentPetNamePath = uniquePetNames[0].split('.');
    }

    updateEnterProfileVisibility();

    // Build context-aware actions
    $actionsContainer.innerHTML = '';

    let passStyle;
    try {
      passStyle = passStyleOf(value);
    } catch {
      passStyle = undefined;
    }
    const isPlainPassable =
      passStyle !== undefined &&
      passStyle !== 'remotable' &&
      passStyle !== 'promise';
    const isAdopted = uniquePetNames.length > 0;

    /** @type {HTMLInputElement | undefined} */
    let $focusTarget;

    if (messageContext && !isAdopted) {
      $focusTarget = buildNameAction(
        $actionsContainer,
        'Adopt as:',
        messageContext.edgeName,
        'Adopt',
        async name => {
          const targetPath = name.split('.');
          await E(powers).adopt(
            messageContext.number,
            messageContext.edgeName,
            targetPath,
          );
          clearValue();
        },
      );
    } else if (petNamePath) {
      $focusTarget = buildNameAction(
        $actionsContainer,
        'Rename to:',
        petNamePath.join('.'),
        'Rename',
        async newName => {
          const fromPath = /** @type {string[]} */ (currentPetNamePath);
          const toPath = newName.split('.');
          await E(powers).move(fromPath, toPath);
          clearValue();
        },
      );
    } else if (!id && isPlainPassable) {
      $focusTarget = buildNameAction(
        $actionsContainer,
        'Save as:',
        '',
        'Save',
        async name => {
          const targetPath = name.split('.');
          await E(powers).storeValue(
            /** @type {import('@endo/pass-style').Passable} */ (currentValue),
            targetPath,
          );
          clearValue();
        },
      );
    }

    if (isPlainPassable) {
      buildCopyButton($actionsContainer, value);
    }

    if ($focusTarget) {
      $focusTarget.focus();
      $focusTarget.select();
    }
  };

  const blurValue = () => {
    window.removeEventListener('keyup', handleKey);
  };

  return { focusValue, blurValue };
};
