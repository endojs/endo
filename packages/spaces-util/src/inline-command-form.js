// @ts-check
/* eslint-disable no-use-before-define */

/** @import { ERef } from '@endo/eventual-send' */
/** @import { EndoHost } from '@endo/daemon' */
/** @import { CommandField } from './command-registry.js' */

import harden from '@endo/harden';

import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { renderConfined, unmount } from '@endo/preact-container/renderer';
import { tokenAutocompleteComponent } from './token-autocomplete.js';

import { getCommand } from './command-registry.js';
import { petNamePathAutocomplete } from './petname-path-autocomplete.js';
import { petNamePathsAutocomplete } from './petname-paths-autocomplete.js';
import { createInlineEval } from './inline-eval.js';
import { createInlineDefine } from './inline-define.js';

// Inline command form, migrated from imperative `innerHTML`/`createElement` DOM
// to confined Preact for the parts that are genuinely a view, while keeping the
// orchestration that composes host-node controllers imperative — exactly the
// shape of send-form.js.
//
// The exported entry `createInlineCommandForm({...})` keeps its exact options
// object and the hardened control object (`setCommand`, `getCommand`, `getData`,
// `isValid`, `setDisabled`, `clear`, `focus`, `dispose`) so its only caller —
// chat-bar-component.js — needs no changes.
//
// COMPOSITION. This file is a Tier-3 composite. Its children are all already
// converted host-node CONTROLLERS that each own their own `renderConfined` into
// host nodes and return a control object:
//   • `petNamePathAutocomplete($input, $menu, opts)` — drives a host `<input>`'s
//     value/focus and renders its dropdown confined into the host `$menu`.
//   • `petNamePathsAutocomplete($container, $menu, opts)` — owns a chip UI and
//     renders confined into its own host nodes.
//   • `tokenAutocompleteComponent($input, $menu, opts)` — owns a contenteditable
//     host `<div>` and renders its dropdown confined into the host `$menu`.
//   • `createInlineEval({...})` / `createInlineDefine({...})` — full sub-forms
//     that render confined into their own host `$container`.
// All of them are mounted IMPERATIVELY into host nodes this form owns (the
// host-node embedding pattern, cf. send-form's heat bar / token autocomplete and
// edit-space-modal's scheme picker), NOT nested inside this form's vnode tree.
// Every child controller is disposed on teardown.
//
// The view-shaped chrome this form owns DIRECTLY — the per-field label and
// layout wrapper, and the plain `text` / `locator` / `select` / `messageNumber`
// / `edgeName` inputs together with the edgeName dropdown menu — renders through
// ONE `renderConfined` into a dedicated `$formMount`. Those inputs are CONTROLLED
// SafeEvent inputs (their `value`/`disabled` are Preact state pushed by the host;
// their `onInput`/`onChange`/`onKeyDown` read the frozen SafeEvent), the edgeName
// menu renders as real vnodes (no dangerouslySetInnerHTML), and the host nodes of
// the autocomplete / token / paths controllers are re-parented into per-field
// host anchors the view exposes (the send-form re-parenting pattern). Host DOM
// nodes never enter the vnode tree. The same `inline-*` / `token-menu-*` CSS
// class names are reused so styling from index.css continues to apply.
//
// The view's authoritative form data lives in the host closure (`formData`), not
// in a component, so `getData`/`isValid` always read a synchronously-fresh value
// rather than racing Preact's deferred effect flush. A small `FormView` mirrors
// the per-field display state through a mutable controller, exactly as
// inline-eval.js / inline-define.js do.

/**
 * @typedef {object} InlineCommandFormAPI
 * @property {(commandName: string, prefill?: Record<string, string>) => void} setCommand - Set the active command
 * @property {() => string | null} getCommand - Get current command name
 * @property {() => Record<string, unknown>} getData - Get form data
 * @property {() => boolean} isValid - Check if form is valid
 * @property {(disabled: boolean) => void} setDisabled - Disable or enable all fields
 * @property {() => void} clear - Clear the form
 * @property {(skipFilled?: boolean) => void} focus - Focus the first field (or first empty field if skipFilled)
 * @property {() => void} dispose - Clean up
 */

/**
 * Plain-data display state for one confined input field.
 *
 * @typedef {object} FieldState
 * @property {string} name - Field name/key.
 * @property {'text' | 'number' | 'select' | 'edgeName'} kind - Which input to render.
 * @property {string} label - Field label.
 * @property {string} value - Current value (stringified).
 * @property {string} placeholder - Placeholder text.
 * @property {string} className - Extra class on the input.
 * @property {boolean} disabled - Whether the input is disabled.
 * @property {string[]} [options] - Options for a select input.
 * @property {boolean} [menuVisible] - Whether the edgeName menu is open.
 * @property {string[]} [menuItems] - Filtered edgeName menu items.
 * @property {number} [selectedIndex] - Highlighted edgeName menu index.
 * @property {number} [focusNonce] - Bumped to re-apply autofocus.
 */

/**
 * Plain-data display state for one host-node-controller-backed field. The view
 * renders only the label and an empty host anchor; the host re-parents the
 * controller's host nodes into the anchor after render.
 *
 * @typedef {object} HostFieldState
 * @property {string} name - Field name/key.
 * @property {'host'} kind - Marker for an anchor-only field.
 * @property {string} label - Field label.
 * @property {string} anchorClass - Class on the host anchor wrapper.
 */

/**
 * @typedef {FieldState | HostFieldState} AnyFieldState
 */

/**
 * Whole-form view state pushed into the confined `FormView`.
 *
 * @typedef {object} FormViewState
 * @property {AnyFieldState[]} fields - Ordered field display states.
 */

/**
 * Mutable bridge between the host orchestrator and the confined `FormView`. The
 * component writes its setter; the host writes the per-field callbacks. Not
 * hardened — both sides assign onto it.
 *
 * @typedef {object} FormViewController
 * @property {(s: FormViewState) => void} [setState]
 * @property {FormViewState} [pendingState] - Buffered so a render issued before
 *   the effect wires `setState` is applied on mount rather than dropped.
 * @property {(anchors: Record<string, HTMLElement>) => void} [onAnchors] - Called
 *   after each render with the live host anchor nodes by field name.
 * @property {(name: string, value: string) => void} [onInput]
 * @property {(name: string, value: string) => void} [onChange]
 * @property {(name: string, e: SafeKeyEvent) => void} [onKeyDown]
 * @property {(name: string) => void} [onFocus]
 * @property {(name: string) => void} [onBlur]
 * @property {(name: string, item: string) => void} [onMenuPick]
 */

/**
 * The narrow keyboard-event facade the confined inputs report up.
 *
 * @typedef {object} SafeKeyEvent
 * @property {string} [key]
 * @property {boolean} [shiftKey]
 * @property {number} [selectionStart]
 * @property {number} [selectionEnd]
 * @property {string} [value]
 * @property {() => void} preventDefault
 */

/**
 * One confined input field plus its label. Anchor-only host fields render an
 * empty host-anchor `<div>` that the host fills by re-parenting a controller's
 * host nodes into it.
 *
 * @param {object} props
 * @param {AnyFieldState} props.field
 * @param {FormViewController} props.controller
 */
const Field = ({ field, controller }) => {
  const label = h('label', { class: 'inline-field-label' }, field.label);

  if (field.kind === 'host') {
    // Anchor-only: the host re-parents controller host nodes into this wrapper.
    return h(
      'div',
      { class: 'inline-field', 'data-field-name': field.name },
      label,
      h('div', { class: field.anchorClass }),
    );
  }

  /** @param {SafeKeyEvent} e */
  const onKeyDown = e => {
    if (controller.onKeyDown) controller.onKeyDown(field.name, e);
  };

  if (field.kind === 'select') {
    return h(
      'div',
      { class: 'inline-field', 'data-field-name': field.name },
      label,
      h(
        'select',
        {
          class: `inline-field-input ${field.className}`,
          value: field.value,
          disabled: field.disabled,
          'data-form-type': 'other',
          /** @param {{ target: { value: string } }} e */
          onChange: e => {
            if (controller.onChange)
              controller.onChange(field.name, e.target.value);
          },
        },
        (field.options || []).map(option =>
          h('option', { key: option, value: option }, option),
        ),
      ),
    );
  }

  if (field.kind === 'number') {
    return h(
      'div',
      { class: 'inline-field', 'data-field-name': field.name },
      label,
      h('input', {
        type: 'number',
        class: `inline-field-input ${field.className}`,
        placeholder: field.placeholder,
        value: field.value,
        min: '0',
        disabled: field.disabled,
        autocomplete: 'off',
        'data-form-type': 'other',
        'data-lpignore': 'true',
        /** @param {{ target: { value: string } }} e */
        onInput: e => {
          if (controller.onInput)
            controller.onInput(field.name, e.target.value);
        },
        onFocus: () => {
          if (controller.onFocus) controller.onFocus(field.name);
        },
        onKeyDown,
      }),
    );
  }

  if (field.kind === 'edgeName') {
    const menu =
      field.menuVisible && (field.menuItems || []).length > 0
        ? h(
            'div',
            { class: 'inline-petname-menu visible' },
            (field.menuItems || []).map((item, index) =>
              h(
                'div',
                {
                  key: item,
                  class:
                    index === field.selectedIndex
                      ? 'token-menu-item selected'
                      : 'token-menu-item',
                  /** @param {{ preventDefault: () => void }} e */
                  onMouseDown: e => {
                    // Pick before the input's blur fires.
                    e.preventDefault();
                    if (controller.onMenuPick) {
                      controller.onMenuPick(field.name, item);
                    }
                  },
                },
                item,
              ),
            ),
          )
        : field.menuVisible
          ? h(
              'div',
              { class: 'inline-petname-menu visible' },
              h('div', { class: 'token-menu-empty' }, 'No edge names'),
            )
          : null;

    return h(
      'div',
      { class: 'inline-field', 'data-field-name': field.name },
      label,
      h(
        'div',
        { class: 'inline-field-input-wrapper' },
        h('input', {
          key: field.focusNonce
            ? `${field.name}-${field.focusNonce}`
            : undefined,
          type: 'text',
          class: `inline-field-input ${field.className}`,
          placeholder: field.placeholder,
          value: field.value,
          disabled: field.disabled,
          autocomplete: 'off',
          autofocus: (field.focusNonce || 0) > 0,
          'data-form-type': 'other',
          'data-lpignore': 'true',
          /** @param {{ target: { value: string } }} e */
          onInput: e => {
            if (controller.onInput)
              controller.onInput(field.name, e.target.value);
          },
          onFocus: () => {
            if (controller.onFocus) controller.onFocus(field.name);
          },
          onBlur: () => {
            if (controller.onBlur) controller.onBlur(field.name);
          },
          onKeyDown,
        }),
        menu,
      ),
    );
  }

  // text / locator
  return h(
    'div',
    { class: 'inline-field', 'data-field-name': field.name },
    label,
    h('input', {
      key: field.focusNonce ? `${field.name}-${field.focusNonce}` : undefined,
      type: 'text',
      class: `inline-field-input ${field.className}`,
      placeholder: field.placeholder,
      value: field.value,
      disabled: field.disabled,
      autocomplete: 'off',
      autofocus: (field.focusNonce || 0) > 0,
      'data-form-type': 'other',
      'data-lpignore': 'true',
      /** @param {{ target: { value: string } }} e */
      onInput: e => {
        if (controller.onInput) controller.onInput(field.name, e.target.value);
      },
      onKeyDown,
    }),
  );
};
harden(Field);

/**
 * The confined form body. Owns no authoritative state; mirrors the field display
 * states the host pushes through the controller, and reports the live host
 * anchor nodes back so the host can re-parent controller host nodes into them.
 *
 * @param {object} props
 * @param {FormViewController} props.controller
 */
const FormView = ({ controller }) => {
  const [state, setState] = useState(
    /** @type {FormViewState} */ (controller.pendingState || { fields: [] }),
  );

  useEffect(() => {
    controller.setState = setState;
    if (controller.pendingState !== undefined) {
      setState(controller.pendingState);
    }
    return () => {
      if (controller.setState === setState) delete controller.setState;
    };
    // Mount-only: `controller` is a stable bridge. A `[controller]` dep re-runs
    // every render under confinement (the sanitizer reissues the prop identity)
    // and re-applies `setState(pendingState)` — itself reissued — into a slow
    // render/effect feedback loop that never settles on a slow runner.
  }, []);

  // After each render, hand the host the live anchor nodes by field name so it
  // can re-parent controller host nodes into them.
  useEffect(() => {
    if (!controller.onAnchors) return;
    /** @type {Record<string, HTMLElement>} */
    const anchors = {};
    // The confined renderer strips refs, so locate anchors by data attribute on
    // the mount this component owns. The mount is the parent of the rendered
    // `.inline-command-form`; query within it.
    controller.onAnchors(anchors);
  });

  if (state.fields.length === 0) {
    return null;
  }

  return h(
    'div',
    { class: 'inline-command-form' },
    state.fields.map(field => h(Field, { key: field.name, field, controller })),
  );
};
harden(FormView);

/**
 * Create an inline command form that renders dynamically based on command definition.
 *
 * @param {object} options
 * @param {HTMLElement} options.$container - Container for the form
 * @param {typeof import('@endo/eventual-send').E} options.E - Eventual send function
 * @param {ERef<EndoHost>} options.powers - Powers object for autocomplete
 * @param {(commandName: string, data: Record<string, unknown>) => void} options.onSubmit - Submit callback
 * @param {() => void} options.onCancel - Cancel callback
 * @param {(isValid: boolean) => void} options.onValidityChange - Called when validity changes
 * @param {(messageNumber: number) => void} [options.onMessageNumberClick] - Called when message number clicked
 * @param {(data: import('./inline-eval.js').ParsedEval) => void} [options.onExpandEval] - Called to expand eval to modal
 * @param {(data: import('./inline-define.js').ParsedDefine) => void} [options.onExpandDefine] - Called to expand define to modal
 * @param {(messageNumber: number) => Promise<string[]>} [options.getMessageEdgeNames] - Get edge names for a message
 * @param {(ref: unknown) => AsyncIterable<unknown>} options.iterateReader - Ref iterator factory
 * @param {() => 'inbox' | 'channel' | undefined} [options.getContext] - Returns current UI context
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
  onExpandDefine,
  getMessageEdgeNames,
  iterateReader,
  getContext,
}) => {
  /** @type {string | null} */
  let currentCommand = null;
  /** @type {Record<string, unknown>} */
  let formData = {};
  /** @type {Array<{ dispose: () => void, focus?: () => void }>} */
  let childControllers = [];
  /**
   * Per-field runtime state for the host-node fields and confined fields. Keyed
   * by field name. Lives in the host closure so `getData`/`isValid` read fresh.
   * @type {Map<string, FieldRuntime>}
   */
  let fieldRuntimes = new Map();
  /**
   * Ordered field names for focus traversal and first-field detection.
   * @type {string[]}
   */
  let fieldOrder = [];
  /** @type {import('./inline-eval.js').InlineEvalAPI | null} */
  let inlineEvalInstance = null;
  /** @type {import('./inline-define.js').InlineDefineAPI | null} */
  let inlineDefineInstance = null;
  let disabled = false;

  // Dedicated mount for the confined form body (labels + plain inputs + edgeName
  // menu). Host nodes of child controllers are re-parented into per-field
  // anchors this body renders.
  const $formMount = document.createElement('div');
  $container.appendChild($formMount);

  // Mutable bridge to the confined FormView (populated by its effect).
  /** @type {FormViewController} */
  const formViewController = {};

  /**
   * The runtime backing one field. `kind` selects which slice is meaningful.
   * @typedef {object} FieldRuntime
   * @property {CommandField} field
   * @property {'text' | 'number' | 'select' | 'edgeName' | 'petNamePath' | 'petNamePaths' | 'message'} kind
   * @property {string} value - Stringified current value (for confined inputs).
   * @property {number} focusNonce
   * @property {boolean} userModified - Whether the user edited agentName/petName.
   * @property {() => unknown} [getHostValue] - Read a host-node controller's value.
   * @property {() => void} [focusHost] - Focus a host-node field.
   * @property {(d: boolean) => void} [setHostDisabled] - Toggle a host-node field.
   * @property {HTMLElement} [$hostNodes] - Detached host nodes to re-parent into the anchor.
   * @property {string[]} [edgeNameOptions] - Edge name menu options.
   * @property {boolean} [menuVisible] - edgeName menu open.
   * @property {number} [selectedIndex] - edgeName highlighted item.
   */

  /**
   * Build the FormViewState from the current field runtimes.
   * @returns {FormViewState}
   */
  const buildViewState = () => {
    /** @type {AnyFieldState[]} */
    const fields = fieldOrder.map(name => {
      const rt = /** @type {FieldRuntime} */ (fieldRuntimes.get(name));
      const { field } = rt;
      if (
        rt.kind === 'petNamePath' ||
        rt.kind === 'petNamePaths' ||
        rt.kind === 'message'
      ) {
        return {
          name,
          kind: 'host',
          label: field.label,
          anchorClass:
            rt.kind === 'petNamePaths'
              ? 'inline-field-input-wrapper petname-paths-anchor'
              : 'inline-field-input-wrapper',
        };
      }
      if (rt.kind === 'select') {
        return {
          name,
          kind: 'select',
          label: field.label,
          value: rt.value,
          placeholder: field.placeholder || '',
          className: 'select-input',
          disabled,
          options: field.options || [],
        };
      }
      if (rt.kind === 'number') {
        return {
          name,
          kind: 'number',
          label: field.label,
          value: rt.value,
          placeholder: field.placeholder || '#',
          className: 'message-number-input',
          disabled,
        };
      }
      if (rt.kind === 'edgeName') {
        const filterValue = rt.value.toLowerCase();
        const filtered = (rt.edgeNameOptions || []).filter(n =>
          n.toLowerCase().includes(filterValue),
        );
        return {
          name,
          kind: 'edgeName',
          label: field.label,
          value: rt.value,
          placeholder: field.placeholder || '',
          className: 'edgeName-input',
          disabled,
          menuVisible: !!rt.menuVisible,
          menuItems: filtered,
          selectedIndex: rt.selectedIndex ?? -1,
          focusNonce: rt.focusNonce,
        };
      }
      // text / locator
      return {
        name,
        kind: 'text',
        label: field.label,
        value: rt.value,
        placeholder: field.placeholder || '',
        className: `${field.type}-input`,
        disabled,
        focusNonce: rt.focusNonce,
      };
    });
    return harden({ fields });
  };

  const pushViewState = () => {
    const state = buildViewState();
    formViewController.pendingState = state;
    if (formViewController.setState) {
      formViewController.setState(state);
    }
  };

  /**
   * Re-parent each host-node controller's detached host nodes into the matching
   * anchor the confined body just rendered. Runs after every render flush.
   */
  const reparentHostNodes = () => {
    for (const name of fieldOrder) {
      const rt = fieldRuntimes.get(name);
      if (rt && rt.$hostNodes) {
        const $anchor = /** @type {HTMLElement | null} */ (
          $formMount.querySelector(
            `[data-field-name="${name}"] .inline-field-input-wrapper`,
          )
        );
        if ($anchor && rt.$hostNodes.parentElement !== $anchor) {
          $anchor.appendChild(rt.$hostNodes);
        }
      }
    }
  };
  formViewController.onAnchors = () => {
    reparentHostNodes();
  };

  /**
   * Read the live value of a field (host-node controllers report their own).
   * @param {string} name
   * @returns {unknown}
   */
  const readFieldValue = name => {
    const rt = fieldRuntimes.get(name);
    if (!rt) return formData[name];
    if (rt.getHostValue) return rt.getHostValue();
    return formData[name];
  };

  /**
   * Check if the form is valid based on required fields.
   * @returns {boolean}
   */
  const isValid = () => {
    if (!currentCommand) return false;

    if (inlineEvalInstance) {
      return inlineEvalInstance.isValid();
    }
    if (inlineDefineInstance) {
      return inlineDefineInstance.isValid();
    }

    const command = getCommand(currentCommand);
    if (!command) return false;

    const validationContext = getContext ? getContext() : undefined;
    /** @param {CommandField} field */
    const isFieldVisible = field => {
      if (!field.showWhen) return true;
      const [condKey, condValue] = field.showWhen.split(':');
      if (condKey === 'context') return validationContext === condValue;
      return true;
    };
    for (const field of command.fields) {
      if (!isFieldVisible(field)) {
        // Field is hidden — skip validation
      } else if (field.required) {
        const value = formData[field.name];
        if (value === undefined || value === null || value === '') {
          return false;
        }
        // Check array fields (like petNamePaths)
        if (Array.isArray(value) && value.length === 0) {
          return false;
        }
        // Check message fields (ChatMessage objects)
        if (field.type === 'message') {
          const msg =
            /** @type {{ strings: string[], petNames: string[], edgeNames: string[] }} */ (
              value
            );
          const hasContent =
            msg.strings.some(s => s.trim().length > 0) ||
            msg.petNames.length > 0;
          if (!hasContent) return false;
        }
      }
    }
    return true;
  };

  const updateValidity = () => {
    onValidityChange(isValid());
  };

  /**
   * Auto-populate agentName from handleName for mkhost/mkguest-style commands.
   * @param {string} editedName - The field whose input fired.
   * @param {string} value - Its new value.
   */
  const maybePopulateAgentName = (editedName, value) => {
    if (
      editedName === 'handleName' &&
      (currentCommand === 'mkhost' ||
        currentCommand === 'mkguest' ||
        currentCommand === 'host' ||
        currentCommand === 'guest')
    ) {
      const agentRt = fieldRuntimes.get('agentName');
      if (agentRt && !agentRt.userModified) {
        const newValue = value ? `profile-for-${value}` : '';
        agentRt.value = newValue;
        formData.agentName = newValue;
      }
    }
  };

  /**
   * Copy an edgeName value into a petName field if the latter is empty / not
   * user-modified, mirroring the original behavior.
   * @param {string} value
   */
  const maybeCopyToPetName = value => {
    const petRt = fieldRuntimes.get('petName');
    if (petRt && !petRt.userModified) {
      petRt.value = value;
      formData.petName = value;
    }
  };

  // --- Confined-input controller callbacks ---

  formViewController.onInput = (name, value) => {
    const rt = fieldRuntimes.get(name);
    if (!rt) return;
    rt.value = value;
    if (rt.kind === 'number') {
      formData[name] = value ? Number(value) : undefined;
    } else {
      formData[name] = value;
    }
    if (name === 'agentName' || name === 'petName') {
      rt.userModified = true;
    }
    maybePopulateAgentName(name, value);
    if (rt.kind === 'edgeName') {
      rt.selectedIndex = -1;
      maybeCopyToPetName(value);
    }
    pushViewState();
    updateValidity();
  };

  formViewController.onChange = (name, value) => {
    const rt = fieldRuntimes.get(name);
    if (!rt) return;
    rt.value = value;
    formData[name] = value;
    pushViewState();
    updateValidity();
  };

  formViewController.onFocus = name => {
    const rt = fieldRuntimes.get(name);
    if (!rt) return;
    if (rt.kind === 'number') {
      if (onMessageNumberClick) {
        onMessageNumberClick(Number(rt.value) || 0);
      }
    } else if (rt.kind === 'edgeName') {
      void (async () => {
        await updateEdgeNames(rt);
        if ((rt.edgeNameOptions || []).length > 0) {
          rt.menuVisible = true;
          rt.selectedIndex = -1;
          pushViewState();
        }
      })();
    }
  };

  formViewController.onBlur = name => {
    const rt = fieldRuntimes.get(name);
    if (!rt || rt.kind !== 'edgeName') return;
    // Delay so a menu pick (onMouseDown preventDefault) still fires.
    setTimeout(() => {
      rt.menuVisible = false;
      rt.selectedIndex = -1;
      pushViewState();
    }, 150);
  };

  formViewController.onMenuPick = (name, item) => {
    const rt = fieldRuntimes.get(name);
    if (!rt || rt.kind !== 'edgeName') return;
    rt.value = item;
    formData[name] = item;
    rt.menuVisible = false;
    rt.selectedIndex = -1;
    maybeCopyToPetName(item);
    pushViewState();
    updateValidity();
  };

  /**
   * Refresh an edgeName field's options from the current messageNumber.
   * @param {FieldRuntime} rt
   */
  const updateEdgeNames = async rt => {
    await null; // safe-await-separator
    const messageNumber = formData.messageNumber;
    if (
      getMessageEdgeNames &&
      typeof messageNumber === 'number' &&
      messageNumber > 0
    ) {
      try {
        rt.edgeNameOptions = await getMessageEdgeNames(messageNumber);
      } catch {
        rt.edgeNameOptions = [];
      }
    } else {
      rt.edgeNameOptions = [];
    }
  };

  formViewController.onKeyDown = (name, e) => {
    const rt = fieldRuntimes.get(name);
    if (!rt) return;

    // edgeName menu navigation takes priority while the menu is up.
    if (rt.kind === 'edgeName' && rt.menuVisible) {
      const filterValue = rt.value.toLowerCase();
      const filtered = (rt.edgeNameOptions || []).filter(n =>
        n.toLowerCase().includes(filterValue),
      );
      const sel = rt.selectedIndex ?? -1;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        rt.selectedIndex = Math.min(sel + 1, filtered.length - 1);
        pushViewState();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        rt.selectedIndex = Math.max(sel - 1, 0);
        pushViewState();
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        rt.selectedIndex = 0;
        pushViewState();
        return;
      }
      if (e.key === 'End') {
        e.preventDefault();
        rt.selectedIndex = Math.max(0, filtered.length - 1);
        pushViewState();
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        if (sel >= 0 && sel < filtered.length) {
          e.preventDefault();
          const picked = filtered[sel];
          rt.value = picked;
          formData[name] = picked;
          rt.menuVisible = false;
          rt.selectedIndex = -1;
          maybeCopyToPetName(picked);
          pushViewState();
          updateValidity();
          return;
        }
      }
      if (e.key === 'Escape') {
        rt.menuVisible = false;
        rt.selectedIndex = -1;
        pushViewState();
        return;
      }
    }

    handleFormKeydown(e);
  };

  /**
   * Shared form-level keyboard handling: Escape cancels, Enter submits, Backspace
   * at empty start of the first field cancels command mode.
   * @param {SafeKeyEvent} e
   */
  const handleFormKeydown = e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      if (isValid()) {
        e.preventDefault();
        if (currentCommand) {
          onSubmit(currentCommand, { ...formData });
        }
      }
    } else if (e.key === 'Backspace') {
      const isEmpty = !e.value;
      const atStart = e.selectionStart === 0 && e.selectionEnd === 0;
      const firstName = fieldOrder[0];
      // The first field is identified by name; the SafeEvent carries no node.
      const rt = firstName ? fieldRuntimes.get(firstName) : undefined;
      const isFirstField = rt !== undefined && e.value === rt.value && isEmpty;
      if (isFirstField && isEmpty && atStart) {
        e.preventDefault();
        onCancel();
      }
    }
  };

  /**
   * Build a host-node controller field (petNamePath / petNamePaths / message).
   * Returns the detached host nodes to re-parent and a runtime entry.
   * @param {CommandField} field
   * @returns {FieldRuntime}
   */
  const buildHostField = field => {
    if (field.type === 'petNamePaths') {
      const $hostNodes = document.createElement('div');

      const $menu = document.createElement('div');
      $menu.className = 'inline-petname-menu';
      $hostNodes.appendChild($menu);

      const $pathsContainer = document.createElement('div');
      $hostNodes.insertBefore($pathsContainer, $menu);

      const autocomplete = petNamePathsAutocomplete($pathsContainer, $menu, {
        E,
        powers,
        onSubmit: () => {
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
      childControllers.push(autocomplete);
      formData[field.name] = [];

      return {
        field,
        kind: 'petNamePaths',
        value: '',
        focusNonce: 0,
        userModified: false,
        $hostNodes,
        getHostValue: () => autocomplete.getValue(),
        focusHost: () => {
          if (autocomplete.focus) autocomplete.focus();
        },
      };
    }

    if (field.type === 'message') {
      const $hostNodes = document.createElement('div');
      $hostNodes.className = 'message-field-wrapper';

      const $msgInput = document.createElement('div');
      $msgInput.className = 'inline-field-input message-field-input';
      $msgInput.contentEditable = 'true';
      $msgInput.dataset.placeholder = field.placeholder || 'Type a message...';
      $msgInput.dataset.fieldName = field.name;

      const $msgMenu = document.createElement('div');
      $msgMenu.className = 'inline-token-menu';

      $hostNodes.appendChild($msgInput);
      $hostNodes.appendChild($msgMenu);

      const tokenComp = tokenAutocompleteComponent($msgInput, $msgMenu, {
        E,
        iterateReader,
        powers,
      });
      // tokenAutocompleteComponent owns no teardown of its own; clearing the
      // input releases its menu, mirroring the original which never disposed it.
      childControllers.push(harden({ dispose: () => tokenComp.clear() }));

      $msgInput.addEventListener('input', () => {
        formData[field.name] = tokenComp.getMessage();
        updateValidity();
      });

      return {
        field,
        kind: 'message',
        value: '',
        focusNonce: 0,
        userModified: false,
        $hostNodes,
        getHostValue: () => tokenComp.getMessage(),
        focusHost: () => $msgInput.focus(),
      };
    }

    // petNamePath: host <input> + menu owned by petNamePathAutocomplete.
    const $hostNodes = document.createElement('div');

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

    $hostNodes.appendChild($input);
    $hostNodes.appendChild($menu);

    const autocomplete = petNamePathAutocomplete($input, $menu, { E, powers });
    childControllers.push(autocomplete);

    formData[field.name] = $input.value;

    /** @type {FieldRuntime} */
    const rt = {
      field,
      kind: 'petNamePath',
      value: $input.value,
      focusNonce: 0,
      userModified: false,
      $hostNodes,
      getHostValue: () => $input.value,
      focusHost: () => $input.focus(),
      setHostDisabled: d => {
        $input.disabled = d;
      },
    };

    $input.addEventListener('input', () => {
      rt.value = $input.value;
      formData[field.name] = $input.value;
      maybePopulateAgentName(field.name, $input.value);
      updateValidity();
    });

    if (field.name === 'agentName' || field.name === 'petName') {
      $input.addEventListener(
        'input',
        () => {
          rt.userModified = true;
        },
        { once: true },
      );
    }

    $input.addEventListener('keydown', e => {
      if (autocomplete.isMenuVisible && autocomplete.isMenuVisible()) {
        return;
      }
      handleFormKeydown(
        harden({
          key: e.key,
          shiftKey: e.shiftKey,
          selectionStart: $input.selectionStart ?? undefined,
          selectionEnd: $input.selectionEnd ?? undefined,
          value: $input.value,
          preventDefault: () => e.preventDefault(),
        }),
      );
    });

    return rt;
  };

  /**
   * Build a confined-input field runtime (text / locator / select / messageNumber
   * / edgeName).
   * @param {CommandField} field
   * @returns {FieldRuntime}
   */
  const buildConfinedField = field => {
    if (field.type === 'select') {
      const value = field.defaultValue || '';
      formData[field.name] = value;
      return {
        field,
        kind: 'select',
        value,
        focusNonce: 0,
        userModified: false,
      };
    }
    if (field.type === 'messageNumber') {
      formData[field.name] = undefined;
      return {
        field,
        kind: 'number',
        value: '',
        focusNonce: 0,
        userModified: false,
      };
    }
    if (field.type === 'edgeName') {
      const value = field.defaultValue || '';
      formData[field.name] = value;
      return {
        field,
        kind: 'edgeName',
        value,
        focusNonce: 0,
        userModified: false,
        edgeNameOptions: [],
        menuVisible: false,
        selectedIndex: -1,
      };
    }
    // text / locator
    const value = field.defaultValue || '';
    formData[field.name] = value;
    return {
      field,
      kind: 'text',
      value,
      focusNonce: 0,
      userModified: false,
    };
  };

  /**
   * Set the active command and render its form.
   * @param {string} commandName
   * @param {Record<string, string>} [prefill] - Optional field values to pre-fill
   */
  const setCommand = (commandName, prefill) => {
    // Clean up previous
    disposeChildren();

    // The confined form-body mount is unused by the inline eval/define
    // sub-forms. Reset it visible for the generic field form here; the js /
    // define branches hide it so its empty mount div is not the first flex child
    // of #inline-form-container, where it would supply the command row's
    // baseline (from an empty box) instead of the expression input.
    $formMount.style.display = '';

    currentCommand = commandName;
    formData = {};
    fieldRuntimes = new Map();
    fieldOrder = [];

    const command = getCommand(commandName);
    if (!command) {
      pushViewState();
      return;
    }

    // Special handling for eval command - use inline eval component.
    if (command.name === 'js') {
      pushViewState();
      $formMount.style.display = 'none';

      const $evalContainer = document.createElement('div');
      $evalContainer.className = 'inline-eval-container';
      $container.appendChild($evalContainer);

      inlineEvalInstance = createInlineEval({
        $container: $evalContainer,
        E,
        powers,
        onSubmit: data => {
          onSubmit('js', {
            source: data.source,
            endowments: data.endowments,
            workerName: '@main',
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

      setTimeout(() => {
        if (inlineEvalInstance) {
          inlineEvalInstance.focus();
        }
      }, 50);

      return;
    }

    // Special handling for define command - use inline define component.
    if (command.name === 'define') {
      pushViewState();
      $formMount.style.display = 'none';

      const $defineContainer = document.createElement('div');
      $defineContainer.className = 'inline-eval-container';
      $container.appendChild($defineContainer);

      inlineDefineInstance = createInlineDefine({
        $container: $defineContainer,
        onSubmit: data => {
          onSubmit('define', {
            source: data.source,
            slots: data.slots,
          });
        },
        onExpand: data => {
          if (onExpandDefine) {
            onExpandDefine(data);
          }
        },
        onCancel,
        onValidityChange,
      });

      setTimeout(() => {
        if (inlineDefineInstance) {
          inlineDefineInstance.focus();
        }
      }, 50);

      return;
    }

    // Filter out fields that don't match showWhen conditions or are non-inline.
    const context = getContext ? getContext() : undefined;
    const inlineFields = command.fields.filter(f => {
      if (f.type === 'source' || f.type === 'endowments') return false;
      if (f.showWhen) {
        const [condKey, condValue] = f.showWhen.split(':');
        if (condKey === 'context') {
          return context === condValue;
        }
      }
      return true;
    });

    if (inlineFields.length === 0) {
      pushViewState();
      updateValidity();
      return;
    }

    for (const field of inlineFields) {
      const isHostField =
        field.type === 'petNamePath' ||
        field.type === 'petNamePaths' ||
        field.type === 'message';
      const rt = isHostField
        ? buildHostField(field)
        : buildConfinedField(field);
      fieldRuntimes.set(field.name, rt);
      fieldOrder.push(field.name);
    }

    pushViewState();
    // Re-parent host nodes once the body has rendered.
    reparentHostNodes();

    // Apply prefill values if provided.
    if (prefill) {
      for (const [fieldName, value] of Object.entries(prefill)) {
        const rt = fieldRuntimes.get(fieldName);
        if (rt && rt.kind === 'petNamePath') {
          const $input = /** @type {HTMLInputElement | null} */ (
            rt.$hostNodes ? rt.$hostNodes.querySelector('input') : null
          );
          if ($input) {
            $input.value = value;
            rt.value = value;
            formData[fieldName] = value;
            $input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } else if (rt) {
          rt.value = value;
          formData[fieldName] = rt.kind === 'number' ? Number(value) : value;
        }
      }
      pushViewState();
    }

    updateValidity();
  };

  /**
   * Get current form data.
   * @returns {Record<string, unknown>}
   */
  const getData = () => {
    // Refresh host-node-backed values so the snapshot is fresh.
    for (const name of fieldOrder) {
      const rt = fieldRuntimes.get(name);
      if (rt && rt.getHostValue) {
        formData[name] = readFieldValue(name);
      }
    }
    return { ...formData };
  };

  /**
   * Clear the form.
   */
  const clear = () => {
    currentCommand = null;
    formData = {};
    disposeChildren();
    fieldRuntimes = new Map();
    fieldOrder = [];
    pushViewState();
    updateValidity();
  };

  /**
   * Focus the first field, or the first empty field when `skipFilled` is true.
   * @param {boolean} [skipFilled] - If true, skip fields that already have values
   */
  const focus = (skipFilled = false) => {
    if (inlineEvalInstance) {
      inlineEvalInstance.focus();
      return;
    }
    if (inlineDefineInstance) {
      inlineDefineInstance.focus();
      return;
    }

    if (fieldOrder.length === 0) return;

    /** @param {FieldRuntime} rt */
    const focusRuntime = rt => {
      if (rt.focusHost) {
        rt.focusHost();
      } else {
        rt.focusNonce += 1;
        pushViewState();
      }
    };

    if (skipFilled) {
      for (const name of fieldOrder) {
        const rt = /** @type {FieldRuntime} */ (fieldRuntimes.get(name));
        const val = rt.getHostValue ? rt.getHostValue() : rt.value;
        if (!val) {
          focusRuntime(rt);
          return;
        }
      }
    }
    const firstRt = /** @type {FieldRuntime} */ (
      fieldRuntimes.get(fieldOrder[0])
    );
    focusRuntime(firstRt);
  };

  /**
   * Disable or enable all form fields.
   * @param {boolean} nextDisabled
   */
  const setDisabled = nextDisabled => {
    disabled = nextDisabled;
    for (const name of fieldOrder) {
      const rt = fieldRuntimes.get(name);
      if (rt && rt.setHostDisabled) {
        rt.setHostDisabled(nextDisabled);
      }
    }
    if (inlineEvalInstance && inlineEvalInstance.setDisabled) {
      inlineEvalInstance.setDisabled(nextDisabled);
    }
    if (inlineDefineInstance) {
      inlineDefineInstance.setDisabled(nextDisabled);
    }
    pushViewState();
  };

  /**
   * Dispose every child controller and sub-form, and detach host field nodes.
   */
  const disposeChildren = () => {
    for (const controller of childControllers) {
      controller.dispose();
    }
    childControllers = [];

    if (inlineEvalInstance) {
      inlineEvalInstance.dispose();
      inlineEvalInstance = null;
    }
    if (inlineDefineInstance) {
      inlineDefineInstance.dispose();
      inlineDefineInstance = null;
    }
    // Remove any sub-containers (inline-eval / inline-define mounts) and detached
    // host field nodes the previous command added directly to $container.
    for (const $child of Array.from($container.children)) {
      if ($child !== $formMount) {
        $child.remove();
      }
    }
  };

  /**
   * Full teardown: dispose children and unmount the confined body.
   */
  const dispose = () => {
    disposeChildren();
    fieldRuntimes = new Map();
    fieldOrder = [];
    unmount($formMount);
    $formMount.remove();
  };

  // Render the confined form body once; subsequent updates flow via the
  // controller's `setState`.
  renderConfined(h(FormView, { controller: formViewController }), $formMount);

  return harden({
    setCommand,
    getCommand: () => currentCommand,
    getData,
    isValid,
    setDisabled,
    clear,
    focus,
    dispose,
  });
};
harden(createInlineCommandForm);
