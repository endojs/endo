// @ts-check
/* global window, document */

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
 * @typedef {object} ReplyContext
 * @property {string} number - The message number being replied to (stringified)
 * @property {string} authorName - Display name of the message author
 * @property {string} preview - Short preview of the message text
 */

/**
 * @typedef {object} SendFormAPI
 * @property {() => void} focus - Focus the input
 * @property {() => void} clear - Clear the input
 * @property {() => boolean} isMenuVisible - Check if autocomplete menu is visible
 * @property {() => string | null} getLastRecipient - Get the last recipient for continuation
 * @property {() => SendFormState} getState - Get current input state for modeline
 * @property {() => boolean} isSubmitting - Check if a send is in progress
 * @property {(number: string, authorName: string, preview: string) => void} setReplyTo - Set reply context
 * @property {() => void} clearReplyTo - Clear reply context
 * @property {(type: string | undefined) => void} setReplyType - Set reply type for next send
 * @property {() => string | undefined} getReplyType - Get current reply type
 * @property {(text: string) => void} setText - Set the input text content
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
 * @param {(info: { petNames: string[], edgeNames: string[], messageStrings: string[], replyTo: string | undefined }) => void} [options.onMentionNotify] - Called after channel post with @-mentions instead of silent send
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
  onMentionNotify,
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

  // --- Reply type (for outliner edit/deletion/etc) ---
  /** @type {string | undefined} */
  let pendingReplyType;

  // --- Reply context ---
  /** @type {ReplyContext | null} */
  let replyContext = null;

  /** Default reply context that auto-restores after send (e.g. thread root). */
  /** @type {ReplyContext | null} */
  let defaultReplyContext = null;

  const $replyContextBar = document.createElement('div');
  $replyContextBar.className = 'reply-context-bar';
  $replyContextBar.style.display = 'none';
  $chatBar.insertBefore($replyContextBar, $chatBar.firstChild);

  // Keep #messages bottom in sync with #chat-bar's actual height so the
  // reply context bar (and any other dynamic chat-bar content) never
  // overlaps the scrollable message area.
  const $messages = document.getElementById('messages');
  if ($messages && typeof ResizeObserver !== 'undefined') {
    const chatBarObserver = new ResizeObserver(() => {
      $messages.style.bottom = `${$chatBar.offsetHeight}px`;
    });
    chatBarObserver.observe($chatBar);
  }

  /**
   * Reply type definitions for the picker menu.
   * @type {Array<{ type: string | undefined, icon: string, label: string, verb: string }>}
   */
  const REPLY_TYPES = [
    { type: undefined, icon: '\u21A9', label: 'Reply', verb: 'Replying to' },
    { type: 'edit', icon: '\u270E', label: 'Edit', verb: 'Editing' },
    { type: 'pro', icon: '\u2714', label: 'Pro', verb: 'Pro for' },
    { type: 'con', icon: '\u2718', label: 'Con', verb: 'Con for' },
    { type: 'evidence', icon: '\uD83D\uDCC4', label: 'Evidence', verb: 'Evidence for' },
  ];

  /**
   * Get the reply type entry for the current pendingReplyType.
   * @returns {{ type: string | undefined, icon: string, label: string, verb: string }}
   */
  const getCurrentReplyTypeEntry = () => {
    const entry = REPLY_TYPES.find(rt => rt.type === pendingReplyType);
    return entry || REPLY_TYPES[0];
  };

  /**
   * Render the reply context bar UI.
   */
  const renderReplyContextBar = () => {
    if (!replyContext) {
      $replyContextBar.style.display = 'none';
      return;
    }
    $replyContextBar.style.display = '';
    $replyContextBar.innerHTML = '';

    const rtEntry = getCurrentReplyTypeEntry();

    // Reply type picker button
    const $typePicker = document.createElement('button');
    $typePicker.className = 'reply-type-picker';
    $typePicker.title = 'Change reply type';
    $typePicker.textContent = rtEntry.icon;
    $typePicker.addEventListener('click', e => {
      e.stopPropagation();
      const $existing = $replyContextBar.querySelector('.reply-type-menu');
      if ($existing) {
        $existing.remove();
        return;
      }
      const $menu = document.createElement('div');
      $menu.className = 'reply-type-menu';
      const dismissMenu = () => {
        $menu.remove();
        document.removeEventListener('click', dismissMenu);
      };
      for (const rt of REPLY_TYPES) {
        const $item = document.createElement('button');
        $item.className = 'reply-type-menu-item';
        if (rt.type === pendingReplyType) {
          $item.classList.add('active');
        }
        $item.innerHTML = `<span class="reply-type-menu-icon">${rt.icon}</span> ${rt.label}`;
        $item.addEventListener('click', ev => {
          ev.stopPropagation();
          pendingReplyType = rt.type;
          dismissMenu();
          renderReplyContextBar();
        });
        $menu.appendChild($item);
      }
      $replyContextBar.appendChild($menu);
      // Close menu on outside click (next tick so this click doesn't trigger it)
      setTimeout(() => document.addEventListener('click', dismissMenu), 0);
    });
    $replyContextBar.appendChild($typePicker);

    const $label = document.createElement('span');
    $label.className = 'reply-context-label';
    $label.textContent = `${rtEntry.verb} ${replyContext.authorName}`;
    $replyContextBar.appendChild($label);

    const $preview = document.createElement('span');
    $preview.className = 'reply-context-preview';
    $preview.textContent = replyContext.preview;
    $replyContextBar.appendChild($preview);

    const $close = document.createElement('button');
    $close.className = 'reply-context-close';
    $close.title = 'Cancel reply';
    $close.textContent = '\u00D7';
    $close.addEventListener('click', () => {
      replyContext = defaultReplyContext;
      pendingReplyType = undefined;
      renderReplyContextBar();
    });
    $replyContextBar.appendChild($close);
  };

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
      const resolveIds =
        petNames.length > 0
          ? Promise.all(
              petNames.map(async petName => {
                const petPath = petName.split('/');
                const id = await E(powers).identify(
                  .../** @type {[string, ...string[]]} */ (petPath),
                );
                return id || '';
              }),
            )
          : Promise.resolve(/** @type {string[]} */ ([]));

      const replyTo = replyContext ? replyContext.number : undefined;

      const sendReplyType = pendingReplyType;
      resolveIds
        .then(ids =>
          sendReplyType !== undefined
            ? E(channelRef).post(messageStrings, edgeNames, petNames, replyTo, ids, sendReplyType)
            : E(channelRef).post(messageStrings, edgeNames, petNames, replyTo, ids),
        )
        .then(
          () => {
            // Notify caller about @-mentions for invitation prompts
            if (petNames.length > 0 && onMentionNotify) {
              onMentionNotify({
                petNames,
                edgeNames,
                messageStrings,
                replyTo,
              });
            }

            tokenComponent.clear();
            clearError();
            // Reset reply type after send
            pendingReplyType = undefined;
            // Reset reply context: fall back to thread default if set
            replyContext = defaultReplyContext;
            renderReplyContextBar();
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
      const petNamePath = petName.split('/');
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
    setReplyTo: (
      /** @type {string} */ number,
      /** @type {string} */ authorName,
      /** @type {string} */ preview,
    ) => {
      replyContext = { number, authorName, preview };
      renderReplyContextBar();
      $input.focus();
    },
    clearReplyTo: () => {
      replyContext = null;
      renderReplyContextBar();
    },
    setDefaultReplyTo: (
      /** @type {string} */ number,
      /** @type {string} */ authorName,
      /** @type {string} */ preview,
    ) => {
      defaultReplyContext = { number, authorName, preview };
      replyContext = defaultReplyContext;
      renderReplyContextBar();
    },
    clearDefaultReplyTo: () => {
      defaultReplyContext = null;
      replyContext = null;
      renderReplyContextBar();
    },
    setReplyType: (/** @type {string | undefined} */ type) => {
      pendingReplyType = type;
      renderReplyContextBar();
    },
    getReplyType: () => pendingReplyType,
    setText: (/** @type {string} */ text) => {
      tokenComponent.clear();
      $input.textContent = text;
      // Place cursor at end
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents($input);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    },
  };
};
