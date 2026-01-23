// @ts-check
/* global document, setTimeout */
/* eslint-disable no-use-before-define */

import { getCommand } from './command-registry.js';
import { petNamePathAutocomplete } from './petname-path-autocomplete.js';
import { petNamePathsAutocomplete } from './petname-paths-autocomplete.js';
import { createInlineEval } from './inline-eval.js';

/**
 * @typedef {object} InlineCommandFormAPI
 * @property {(commandName: string) => void} setCommand - Set the active command
 * @property {() => string | null} getCommand - Get current command name
 * @property {() => Record<string, unknown>} getData - Get form data
 * @property {() => boolean} isValid - Check if form is valid
 * @property {() => void} clear - Clear the form
 * @property {() => void} focus - Focus the first field
 * @property {() => void} dispose - Clean up
 */

/**
 * Create an inline command form that renders dynamically based on command definition.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container for the form
 * @param {(target: unknown) => unknown} options.E - Eventual send function
 * @param {unknown} options.powers - Powers object for autocomplete
 * @param {(commandName: string, data: Record<string, unknown>) => void} options.onSubmit - Submit callback
 * @param {() => void} options.onCancel - Cancel callback
 * @param {(isValid: boolean) => void} options.onValidityChange - Called when validity changes
 * @param {(messageNumber: number) => void} [options.onMessageNumberClick] - Called when message number clicked
 * @param {(data: import('./inline-eval.js').ParsedEval) => void} [options.onExpandEval] - Called to expand eval to modal
 * @returns {InlineCommandFormAPI}
 */
export const createInlineCommandForm = ({
  $container,
  E,
  powers,
  onSubmit,
  onCancel,
  onValidityChange,
  onMessageNumberClick,
  onExpandEval,
}) => {
  /** @type {string | null} */
  let currentCommand = null;
  /** @type {Record<string, unknown>} */
  let formData = {};
  /** @type {Array<{ dispose: () => void, focus?: () => void }>} */
  let autocompleteInstances = [];
  /** @type {HTMLElement[]} */
  let fieldElements = [];
  /** @type {Record<string, HTMLInputElement>} */
  let fieldInputsByName = {};
  /** @type {import('./inline-eval.js').InlineEvalAPI | null} */
  let inlineEvalInstance = null;

  /**
   * Render a single field based on its type.
   * @param {import('./command-registry.js').CommandField} field
   * @returns {HTMLElement}
   */
  const renderField = field => {
    const $wrapper = document.createElement('div');
    $wrapper.className = 'inline-field';
    $wrapper.dataset.fieldName = field.name;

    const $label = document.createElement('label');
    $label.className = 'inline-field-label';
    $label.textContent = field.label;
    $wrapper.appendChild($label);

    switch (field.type) {
      case 'petNamePath': {
        const $inputWrapper = document.createElement('div');
        $inputWrapper.className = 'inline-field-input-wrapper';

        const $input = document.createElement('input');
        $input.type = 'text';
        $input.className = 'inline-field-input petname-input';
        $input.placeholder = field.placeholder || '';
        $input.value = field.defaultValue || '';
        $input.dataset.fieldName = field.name;
        $input.autocomplete = 'off';
        $input.dataset.formType = 'other';
        $input.dataset.lpignore = 'true';

        const $menu = document.createElement('div');
        $menu.className = 'inline-petname-menu';

        $inputWrapper.appendChild($input);
        $inputWrapper.appendChild($menu);
        $wrapper.appendChild($inputWrapper);

        // Initialize autocomplete
        const autocomplete = petNamePathAutocomplete($input, $menu, {
          E,
          powers,
        });
        autocompleteInstances.push(autocomplete);

        // Track changes
        $input.addEventListener('input', () => {
          formData[field.name] = $input.value;
          updateValidity();
          // Auto-populate agentName from handleName for mkhost/mkguest
          if (
            field.name === 'handleName' &&
            (currentCommand === 'mkhost' ||
              currentCommand === 'mkguest' ||
              currentCommand === 'host' ||
              currentCommand === 'guest')
          ) {
            const agentInput = fieldInputsByName.agentName;
            if (agentInput && !agentInput.dataset.userModified) {
              const newValue = $input.value
                ? `profile-for-${$input.value}`
                : '';
              agentInput.value = newValue;
              formData.agentName = newValue;
              updateValidity();
            }
          }
        });

        // Track if user manually modifies agentName
        if (field.name === 'agentName') {
          $input.addEventListener(
            'input',
            () => {
              $input.dataset.userModified = 'true';
            },
            { once: true },
          );
        }

        // Initialize form data
        formData[field.name] = $input.value;
        fieldElements.push($input);
        fieldInputsByName[field.name] = $input;
        break;
      }

      case 'petNamePaths': {
        const $inputWrapper = document.createElement('div');
        $inputWrapper.className =
          'inline-field-input-wrapper petname-paths-wrapper';

        const $menu = document.createElement('div');
        $menu.className = 'inline-petname-menu';

        $wrapper.appendChild($inputWrapper);
        $wrapper.appendChild($menu);

        // Initialize multi-path autocomplete with chip UI
        const autocomplete = petNamePathsAutocomplete($inputWrapper, $menu, {
          E,
          powers,
          onSubmit: () => {
            // Update form data before submit
            formData[field.name] = autocomplete.getValue();
            if (isValid() && currentCommand) {
              onSubmit(currentCommand, { ...formData });
            }
          },
          onChange: () => {
            formData[field.name] = autocomplete.getValue();
            updateValidity();
          },
        });
        autocompleteInstances.push(autocomplete);

        // Initialize form data
        formData[field.name] = [];
        break;
      }

      case 'messageNumber': {
        const $input = document.createElement('input');
        $input.type = 'number';
        $input.className = 'inline-field-input message-number-input';
        $input.placeholder = field.placeholder || '#';
        $input.min = '0';
        $input.dataset.fieldName = field.name;
        $input.autocomplete = 'off';
        $input.dataset.formType = 'other';
        $input.dataset.lpignore = 'true';

        // Make clickable to show message picker
        $input.addEventListener('focus', () => {
          if (onMessageNumberClick) {
            onMessageNumberClick(Number($input.value) || 0);
          }
        });

        $input.addEventListener('input', () => {
          formData[field.name] = $input.value
            ? Number($input.value)
            : undefined;
          updateValidity();
        });

        $wrapper.appendChild($input);
        fieldElements.push($input);
        break;
      }

      case 'edgeName':
      case 'text':
      case 'locator': {
        const $input = document.createElement('input');
        $input.type = 'text';
        $input.className = `inline-field-input ${field.type}-input`;
        $input.placeholder = field.placeholder || '';
        $input.value = field.defaultValue || '';
        $input.dataset.fieldName = field.name;
        $input.autocomplete = 'off';
        $input.dataset.formType = 'other';
        $input.dataset.lpignore = 'true';

        $input.addEventListener('input', () => {
          formData[field.name] = $input.value;
          updateValidity();
        });

        formData[field.name] = $input.value;
        $wrapper.appendChild($input);
        fieldElements.push($input);
        break;
      }

      default:
        // For source/endowments, we don't render inline - those use modal
        break;
    }

    return $wrapper;
  };

  /**
   * Check if the form is valid based on required fields.
   * @returns {boolean}
   */
  const isValid = () => {
    if (!currentCommand) return false;

    // Special handling for eval (handles aliases like 'eval' -> 'js')
    if (inlineEvalInstance) {
      return inlineEvalInstance.isValid();
    }

    const command = getCommand(currentCommand);
    if (!command) return false;

    for (const field of command.fields) {
      if (field.required) {
        const value = formData[field.name];
        if (value === undefined || value === null || value === '') {
          return false;
        }
        // Check array fields (like petNamePaths)
        if (Array.isArray(value) && value.length === 0) {
          return false;
        }
      }
    }
    return true;
  };

  const updateValidity = () => {
    onValidityChange(isValid());
  };

  /**
   * Set the active command and render its form.
   * @param {string} commandName
   */
  const setCommand = commandName => {
    // Clean up previous
    dispose();

    currentCommand = commandName;
    formData = {};
    autocompleteInstances = [];
    fieldElements = [];
    fieldInputsByName = {};

    const command = getCommand(commandName);
    if (!command) {
      $container.innerHTML = '';
      return;
    }

    // Special handling for eval command - use inline eval component
    // Check command.name to handle aliases like 'eval' -> 'js'
    if (command.name === 'js') {
      $container.innerHTML = '';

      const $evalContainer = document.createElement('div');
      $evalContainer.className = 'inline-eval-container';
      $container.appendChild($evalContainer);

      inlineEvalInstance = createInlineEval({
        $container: $evalContainer,
        E,
        powers,
        onSubmit: data => {
          // Convert to the format expected by the executor
          onSubmit('js', {
            source: data.source,
            endowments: data.endowments,
            workerName: 'MAIN',
          });
        },
        onExpand: data => {
          if (onExpandEval) {
            onExpandEval(data);
          }
        },
        onCancel,
        onValidityChange,
      });

      // Focus after setup
      setTimeout(() => {
        if (inlineEvalInstance) {
          inlineEvalInstance.focus();
        }
      }, 50);

      return;
    }

    // Only render inline fields (not source/endowments)
    const inlineFields = command.fields.filter(
      f => f.type !== 'source' && f.type !== 'endowments',
    );

    if (inlineFields.length === 0) {
      $container.innerHTML = '';
      updateValidity();
      return;
    }

    $container.innerHTML = '';

    const $form = document.createElement('div');
    $form.className = 'inline-command-form';

    for (const field of inlineFields) {
      const $field = renderField(field);
      $form.appendChild($field);
    }

    $container.appendChild($form);

    // Handle keyboard
    $form.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        if (isValid()) {
          e.preventDefault();
          onSubmit(commandName, { ...formData });
        }
      } else if (e.key === 'Backspace') {
        // If in first field and it's empty, cancel command mode
        const $target = /** @type {HTMLInputElement} */ (e.target);
        const isFirstField =
          fieldElements.length > 0 && fieldElements[0] === $target;
        const isEmpty = !$target.value;
        const atStart =
          $target.selectionStart === 0 && $target.selectionEnd === 0;
        if (isFirstField && isEmpty && atStart) {
          e.preventDefault();
          onCancel();
        }
      }
    });

    updateValidity();
  };

  /**
   * Get current form data.
   * @returns {Record<string, unknown>}
   */
  const getData = () => ({ ...formData });

  /**
   * Clear the form.
   */
  const clear = () => {
    currentCommand = null;
    formData = {};
    dispose();
    $container.innerHTML = '';
    updateValidity();
  };

  /**
   * Focus the first field.
   */
  const focus = () => {
    // Special handling for eval (handles aliases like 'eval' -> 'js')
    if (inlineEvalInstance) {
      inlineEvalInstance.focus();
      return;
    }

    if (fieldElements.length > 0) {
      fieldElements[0].focus();
      return;
    }

    // Check autocomplete instances for focus method (e.g., petNamePaths)
    for (const instance of autocompleteInstances) {
      if (typeof instance.focus === 'function') {
        instance.focus();
        return;
      }
    }
  };

  /**
   * Clean up autocomplete instances and inline eval.
   */
  const dispose = () => {
    for (const instance of autocompleteInstances) {
      instance.dispose();
    }
    autocompleteInstances = [];
    fieldElements = [];
    fieldInputsByName = {};

    if (inlineEvalInstance) {
      inlineEvalInstance.dispose();
      inlineEvalInstance = null;
    }
  };

  return {
    setCommand,
    getCommand: () => currentCommand,
    getData,
    isValid,
    clear,
    focus,
    dispose,
  };
};
