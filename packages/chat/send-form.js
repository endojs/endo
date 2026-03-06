// @ts-check
/* global window */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import { tokenAutocompleteComponent } from './token-autocomplete.js';
import { makeLiveHeatEngine } from './heat-engine.js';
import { makeCompositeHeatEngine } from './composite-heat-engine.js';
import { createHeatBar } from './heat-bar.js';

/**
 * @typedef {object} SendFormState
 * @property {boolean} menuVisible - Token autocomplete menu is showing
 * @property {boolean} hasToken - Input contains at least one token chip
 * @property {boolean} hasText - Input contains text (not just tokens)
 * @property {boolean} isEmpty - Input is completely empty
 */

/**
 * @typedef {object} SendFormAPI
 * @property {() => void} focus - Focus the input
 * @property {() => void} clear - Clear the input
 * @property {() => boolean} isMenuVisible - Check if autocomplete menu is visible
 * @property {() => string | null} getLastRecipient - Get the last recipient for continuation
 * @property {() => SendFormState} getState - Get current input state for modeline
 * @property {() => boolean} isSubmitting - Check if a send is in progress
 */

/**
 * Send form component - handles message sending with token autocomplete.
 *
 * @param {object} options
 * @param {HTMLElement} options.$input - The contenteditable div
 * @param {HTMLElement} options.$menu - The autocomplete menu container
 * @param {HTMLElement} options.$error - Error display element
 * @param {HTMLElement} options.$sendButton - Send button element
 * @param {HTMLElement} options.$chatBar - Chat bar element (for submitting class)
 * @param {typeof import('@endo/far').E} options.E - Eventual send function
 * @param {(ref: unknown) => AsyncIterable<unknown>} options.makeRefIterator - Ref iterator factory
 * @param {ERef<EndoHost>} options.powers - Powers object
 * @param {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} [options.showValue] - Display a value
 * @param {() => boolean} [options.shouldHandleEnter] - Optional callback to check if Enter should be handled
 * @param {(state: SendFormState) => void} [options.onStateChange] - Called when input state changes
 * @param {() => string | null} [options.getConversationPetName] - Returns active conversation pet name
 * @param {(petName: string) => void} [options.navigateToConversation] - Navigate to a conversation after sending
 * @param {() => unknown | null} [options.getChannelRef] - Returns channel exo ref when in channel mode, null otherwise
 * @returns {SendFormAPI}
 */
export const sendFormComponent = ({
  $input,
  $menu,
  $error,
  $sendButton,
  $chatBar,
  E,
  makeRefIterator,
  powers,
  showValue,
  shouldHandleEnter = () => true,
  onStateChange,
  getConversationPetName,
  navigateToConversation,
  getChannelRef,
}) => {
  const clearError = () => {
    $error.textContent = '';
  };

  /** @type {string | null} */
  let lastRecipient = null;
  let submitting = false;

  // --- Heat engine integration ---
  /** @type {ReturnType<typeof makeLiveHeatEngine> | null} */
  let heatEngine = null;
  /** @type {ReturnType<typeof makeCompositeHeatEngine> | null} */
  let compositeEngine = null;
  /** @type {ReturnType<typeof createHeatBar> | null} */
  let heatBar = null;
  /** Guard against double-init (polling + async race) */
  let heatEngineInitialized = false;
  /** Polling cancellation flag */
  let heatPollingStopped = false;

  /**
   * Initialize the composite heat engine for multi-hop heat tracking.
   * Falls back to single-hop engine if getHopInfo is not available.
   * @param {unknown} channelRef
   */
  const initHeatEngine = async channelRef => {
    if (heatEngineInitialized) return;
    heatEngineInitialized = true;

    try {
      // Try composite (multi-hop) engine first
      const hopInfo = await E(channelRef).getHopInfo();
      if (hopInfo && hopInfo.policies && hopInfo.policies.length > 0) {
        heatBar = createHeatBar(
          /** @type {HTMLElement} */ ($input.parentElement),
          $sendButton,
        );
        compositeEngine = makeCompositeHeatEngine(
          hopInfo.policies,
          hopInfo.states,
          state => {
            if (heatBar) heatBar.update(state);
          },
        );
        compositeEngine.start();

        // Subscribe to heat events for real-time updates
        try {
          const eventsRef = await E(channelRef).followHeatEvents();
          const eventIter = makeRefIterator(eventsRef);
          (async () => {
            for await (const event of eventIter) {
              if (compositeEngine) {
                compositeEngine.applyEvent(/** @type {any} */ (event));
              }
            }
          })();
        } catch {
          // Heat events not available — composite engine still works locally
        }
        return;
      }
    } catch {
      // getHopInfo not available — try legacy single-hop
    }

    // Fallback: single-hop heat engine
    try {
      const config = await E(channelRef).getHeatConfig();
      if (config && typeof config === 'object') {
        const heatConfig =
          /** @type {import('./heat-engine.js').HeatConfig} */ (config);
        heatBar = createHeatBar(
          /** @type {HTMLElement} */ ($input.parentElement),
          $sendButton,
        );
        heatEngine = makeLiveHeatEngine(heatConfig, state => {
          if (heatBar) heatBar.update(state);
        });
        heatEngine.start();
      }
    } catch {
      // Heat config not available — no rate limiting UI
    }
  };

  // If in channel mode, try to init heat engine.
  // The channel ref may not be available yet (it's set asynchronously),
  // so poll until it appears.
  if (getChannelRef) {
    const channelRef = getChannelRef();
    if (channelRef) {
      void initHeatEngine(channelRef);
    } else {
      const pollForChannelRef = () => {
        if (heatPollingStopped || heatEngineInitialized) return;
        const ref = getChannelRef();
        if (ref) {
          void initHeatEngine(ref);
        } else {
          setTimeout(pollForChannelRef, 500);
        }
      };
      setTimeout(pollForChannelRef, 500);
    }
  }

  // Initialize token autocomplete
  const tokenComponent = tokenAutocompleteComponent($input, $menu, {
    E,
    makeRefIterator,
    powers,
  });

  /**
   * Check if the input is empty or cursor is at the very beginning.
   * @returns {boolean}
   */
  const isAtEmptyStart = () => {
    const content = $input.textContent || '';
    if (content.trim()) return false;

    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return true;

    const range = sel.getRangeAt(0);
    return range.startOffset === 0;
  };

  const setSubmitting = (/** @type {boolean} */ value) => {
    submitting = value;
    if (value) {
      $chatBar.classList.add('submitting');
      $sendButton.classList.add('btn-spinner');
      /** @type {HTMLButtonElement} */ ($sendButton).disabled = true;
      $input.contentEditable = 'false';
    } else {
      $chatBar.classList.remove('submitting');
      $sendButton.classList.remove('btn-spinner');
      /** @type {HTMLButtonElement} */ ($sendButton).disabled = false;
      $input.contentEditable = 'true';
    }
  };

  /** @param {Event} event */
  const handleSend = event => {
    event.preventDefault();
    event.stopPropagation();

    if (submitting) return;

    // Don't send if token menu is visible (Enter selects token)
    if (tokenComponent.isMenuVisible()) {
      return;
    }

    // Get structured message from the component
    const { strings, petNames, edgeNames } = tokenComponent.getMessage();

    // Check if message is empty
    const hasContent = strings.some(s => s.trim()) || petNames.length > 0;
    if (!hasContent) {
      return;
    }

    // Channel mode: post directly to the channel (no recipient needed)
    const channelRef = getChannelRef ? getChannelRef() : null;
    if (channelRef) {
      // Client-side heat check (composite engine takes priority)
      if (compositeEngine) {
        const result = compositeEngine.recordSend();
        if (!result.allowed) {
          $sendButton.classList.add('heat-shake');
          setTimeout(() => $sendButton.classList.remove('heat-shake'), 500);
          $error.textContent =
            result.lockRemainingMs > 0
              ? `Rate limited — wait ${Math.ceil(result.lockRemainingMs / 1000)}s`
              : 'Sending too fast — slow down';
          return;
        }
      } else if (heatEngine) {
        const result = heatEngine.attemptSend();
        if (!result.allowed) {
          $sendButton.classList.add('heat-shake');
          setTimeout(() => $sendButton.classList.remove('heat-shake'), 500);
          $error.textContent =
            result.lockRemainingMs > 0
              ? `Rate limited — wait ${Math.ceil(result.lockRemainingMs / 1000)}s`
              : 'Sending too fast — slow down';
          return;
        }
      }

      const messageStrings = strings.map((s, i) => {
        if (i === 0) return s.trimStart();
        if (i === strings.length - 1) return s.trimEnd();
        return s;
      });

      // Resolve pet names to formula IDs so channel messages carry references
      // that other members can adopt.
      const resolveIds = petNames.length > 0
        ? Promise.all(
            petNames.map(async petName => {
              const petPath = petName.split('.');
              const id = await E(powers).identify(
                .../** @type {[string, ...string[]]} */ (petPath),
              );
              return id || '';
            }),
          )
        : Promise.resolve(/** @type {string[]} */ ([]));

      resolveIds
        .then(ids =>
          E(channelRef).post(
            messageStrings,
            edgeNames,
            petNames,
            undefined,
            ids,
          ),
        )
        .then(
          () => {
            tokenComponent.clear();
            clearError();
          },
          (/** @type {Error} */ err) => {
            $error.textContent = err.message;
            // On server rejection, sync heat to threshold
            if (/rate limit/i.test(err.message)) {
              if (compositeEngine) {
                compositeEngine.recordSend();
              } else if (heatEngine) {
                const state = heatEngine.getState();
                if (!state.locked) {
                  heatEngine.attemptSend();
                }
              }
            }
          },
        );
      return;
    }

    const conversationPetName = getConversationPetName
      ? getConversationPetName()
      : null;

    if (conversationPetName) {
      // In conversation mode: all tokens are embedded values, recipient is implicit
      const messageStrings = strings.map((s, i) => {
        if (i === 0) return s.trimStart();
        if (i === strings.length - 1) return s.trimEnd();
        return s;
      });

      setSubmitting(true);
      E(powers)
        .send(conversationPetName, messageStrings, edgeNames, petNames)
        .then(
          () => {
            lastRecipient = conversationPetName;
            tokenComponent.clear();
            clearError();
          },
          (/** @type {Error} */ error) => {
            $error.textContent = error.message;
          },
        )
        .finally(() => setSubmitting(false));
      return;
    }

    // Single token with no message opens the value modal
    const onlyToken =
      petNames.length === 1 && strings.every(part => !part.trim());
    if (onlyToken) {
      const [petName] = petNames;
      const petNamePath = petName.split('.');
      setSubmitting(true);
      Promise.all([
        E(powers).identify(
          .../** @type {[string, ...string[]]} */ (petNamePath),
        ),
        E(powers).lookup(petNamePath),
      ])
        .then(
          ([id, value]) => {
            if (showValue) {
              showValue(value, id, petNamePath, undefined);
            }
            tokenComponent.clear();
            clearError();
          },
          (/** @type {Error} */ error) => {
            $error.textContent = error.message;
          },
        )
        .finally(() => setSubmitting(false));
      return;
    }

    // Determine recipient and message content
    const firstStringEmpty = !strings[0] || !strings[0].trim();
    /** @type {string} */
    let to;
    /** @type {string[]} */
    let messageStrings;
    /** @type {string[]} */
    let messagePetNames;
    /** @type {string[]} */
    let messageEdgeNames;

    if (firstStringEmpty && petNames.length > 0) {
      // First token is the recipient, rest is the message
      to = petNames[0];
      const rawMessageStrings = [strings[0] + strings[1], ...strings.slice(2)];
      messageStrings = rawMessageStrings.map((s, i) => {
        if (i === 0) return s.trimStart();
        if (i === rawMessageStrings.length - 1) return s.trimEnd();
        return s;
      });
      messagePetNames = petNames.slice(1);
      messageEdgeNames = edgeNames.slice(1);
    } else if (lastRecipient) {
      // No leading @-mention: send to last recipient, all tokens are embedded values
      to = lastRecipient;
      messageStrings = strings.map((s, i) => {
        if (i === 0) return s.trimStart();
        if (i === strings.length - 1) return s.trimEnd();
        return s;
      });
      messagePetNames = petNames;
      messageEdgeNames = edgeNames;
    } else {
      $error.textContent =
        'No recipient — start with @name or select a conversation';
      return;
    }

    const navigateAfterSend = firstStringEmpty && petNames.length > 0;

    setSubmitting(true);
    E(powers)
      .send(to, messageStrings, messageEdgeNames, messagePetNames)
      .then(
        () => {
          lastRecipient = to;
          tokenComponent.clear();
          clearError();
          if (navigateAfterSend && navigateToConversation) {
            navigateToConversation(to);
          }
        },
        (/** @type {Error} */ error) => {
          $error.textContent = error.message;
        },
      )
      .finally(() => setSubmitting(false));
  };

  $sendButton.addEventListener('click', handleSend);

  $input.addEventListener('keydown', (/** @type {KeyboardEvent} */ event) => {
    // Space at empty start inserts last recipient (not in channel mode)
    if (
      event.key === ' ' &&
      !tokenComponent.isMenuVisible() &&
      lastRecipient &&
      isAtEmptyStart() &&
      !(getChannelRef && getChannelRef())
    ) {
      event.preventDefault();
      tokenComponent.insertTokenAtCursor(lastRecipient);
      return;
    }

    // Only handle Enter for send if menu is not visible and shouldHandleEnter allows it
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !tokenComponent.isMenuVisible() &&
      shouldHandleEnter()
    ) {
      event.preventDefault();
      handleSend(event);
    }
  });

  /**
   * Get the current state of the input for modeline display.
   * @returns {SendFormState}
   */
  const getState = () => {
    const { strings, petNames } = tokenComponent.getMessage();
    const menuVisible = tokenComponent.isMenuVisible();
    const hasToken = petNames.length > 0;
    const hasText = strings.some(s => s.trim().length > 0);
    const isEmpty = !hasToken && !hasText;
    return { menuVisible, hasToken, hasText, isEmpty };
  };

  const notifyStateChange = () => {
    if (onStateChange) {
      onStateChange(getState());
    }
  };

  $input.addEventListener('input', () => {
    clearError();
    notifyStateChange();
  });

  // Also notify on keyup for menu state changes
  $input.addEventListener('keyup', notifyStateChange);

  return {
    focus: () => $input.focus(),
    clear: () => tokenComponent.clear(),
    isMenuVisible: () => tokenComponent.isMenuVisible(),
    getLastRecipient: () => lastRecipient,
    getState,
    isSubmitting: () => submitting,
  };
};
