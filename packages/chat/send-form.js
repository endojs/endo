// @ts-check
/* eslint-disable no-use-before-define */

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';

import { tokenAutocompleteComponent } from '@endo/chat-kit/token-autocomplete.js';
import {
  h,
  renderConfined,
  unmount,
  useEffect,
  useState,
} from './setup-preact-container.js';

import { makeLiveHeatEngine } from './heat-engine.js';
import { makeCompositeHeatEngine } from './composite-heat-engine.js';
import { createHeatBar } from './heat-bar.js';

// Send form, migrated from imperative DOM to a confined Preact component for the
// one piece that is genuinely a view: the reply-context bar. The rest of the
// form is irreducible trusted host work — it owns the contenteditable `$input`
// (focus, selection, contentEditable), `$error.textContent`, the `$sendButton`
// classes/`disabled`, the `$chatBar` classes, the heat-engine orchestration, and
// the `E()` eventual-sends — and stays imperative, exactly as token-autocomplete
// keeps contenteditable editing imperative and renders only its dropdown body
// confined.
//
// COMPOSITION. Both child components are host-node CONTROLLERS, not Preact
// components: `createHeatBar($container, $sendButton)` and
// `tokenAutocompleteComponent($input, $menu, opts)` each own their OWN
// `renderConfined` into a host node and return a control object. They are
// therefore mounted IMPERATIVELY into host nodes the form already owns (the
// heat bar into `$input.parentElement`, the token dropdown into `$menu`) — the
// host-node embedding pattern (cf. edit-space-modal's scheme picker) — NOT
// nested inside this form's vnode tree.
//
// The reply-context bar renders confined into a DEDICATED mount child this form
// creates inside the host `$chatBar` container (cf. inbox-component). Host DOM
// nodes never enter that vnode tree; its inputs are controlled SafeEvent
// handlers and there is no dangerouslySetInnerHTML. The same `.reply-context-*`
// / `.reply-type-*` CSS class names are reused so styling is unchanged.

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
 * @property {(number: string, authorName: string, preview: string) => void} setDefaultReplyTo - Set default (auto-restoring) reply context
 * @property {() => void} clearDefaultReplyTo - Clear default reply context
 * @property {(type: string | undefined) => void} setReplyType - Set reply type for next send
 * @property {() => string | undefined} getReplyType - Get current reply type
 * @property {(text: string) => void} setText - Set the input text content
 * @property {() => void} dispose - Tear down polling, engines, and heat bar
 */

/**
 * One reply-type entry for the picker menu.
 *
 * @typedef {object} ReplyTypeEntry
 * @property {string | undefined} type
 * @property {string} icon
 * @property {string} label
 * @property {string} verb
 */

/**
 * Plain-data view state pushed into the confined reply-context bar. `null` hides
 * the bar entirely (the component renders nothing), matching the original
 * `display:none` teardown.
 *
 * @typedef {object} ReplyBarView
 * @property {string} verb - Verb prefix for the label (e.g. "Replying to").
 * @property {string} icon - Current reply-type icon.
 * @property {string} authorName - Author being replied to.
 * @property {string} preview - Message preview text.
 * @property {string | undefined} activeType - The active reply type.
 */

/**
 * Reply type definitions for the picker menu.
 *
 * @type {ReadonlyArray<ReplyTypeEntry>}
 */
const REPLY_TYPES = harden([
  { type: undefined, icon: '↩', label: 'Reply', verb: 'Replying to' },
  { type: 'edit', icon: '✎', label: 'Edit', verb: 'Editing' },
  { type: 'pro', icon: '✔', label: 'Pro', verb: 'Pro for' },
  { type: 'con', icon: '✘', label: 'Con', verb: 'Con for' },
  {
    type: 'evidence',
    icon: '📄',
    label: 'Evidence',
    verb: 'Evidence for',
  },
]);

/**
 * Mutable bridge between the host controller and the reply-context component.
 * The component writes its state setter; the host writes the row callbacks. Not
 * hardened — both sides assign onto it.
 *
 * @typedef {object} ReplyBarController
 * @property {(view: ReplyBarView | null) => void} [setView]
 * @property {() => ReplyBarView | null} [getView]
 * @property {() => void} [closeMenu]
 * @property {(type: string | undefined) => void} [onSelectType]
 * @property {() => void} [onClose]
 */

/**
 * The confined reply-context bar. Pure view over plain-data props plus
 * controller callbacks; holds only its own menu-open state. Host DOM never
 * enters this tree, and there is no dangerouslySetInnerHTML — the reply-type
 * menu renders as real vnodes.
 *
 * @param {object} props
 * @param {ReplyBarController} props.controller
 */
const ReplyContextBar = ({ controller }) => {
  const [view, setView] = useState(/** @type {ReplyBarView | null} */ (null));
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    controller.setView = setView;
    controller.closeMenu = () => setMenuOpen(false);
    // The host may have called `setView` (via `renderReplyContextBar`) before
    // this effect wired the setter — that call is a no-op while `setView` is
    // unset. Pull the host's current view on mount so an early reply context is
    // not dropped.
    if (controller.getView) {
      setView(controller.getView());
    }
    return () => {
      if (controller.setView === setView) delete controller.setView;
    };
  }, [controller]);

  if (!view) {
    return null;
  }

  const menu = menuOpen
    ? h(
        'div',
        { class: 'reply-type-menu' },
        REPLY_TYPES.map(rt =>
          h(
            'button',
            {
              key: rt.label,
              class:
                rt.type === view.activeType
                  ? 'reply-type-menu-item active'
                  : 'reply-type-menu-item',
              /** @param {{ stopPropagation: () => void }} e */
              onClick: e => {
                e.stopPropagation();
                setMenuOpen(false);
                if (controller.onSelectType) controller.onSelectType(rt.type);
              },
            },
            h('span', { class: 'reply-type-menu-icon' }, rt.icon),
            ` ${rt.label}`,
          ),
        ),
      )
    : null;

  return h(
    'div',
    { class: 'reply-context-bar' },
    h(
      'button',
      {
        class: 'reply-type-picker',
        title: 'Change reply type',
        /** @param {{ stopPropagation: () => void }} e */
        onClick: e => {
          e.stopPropagation();
          setMenuOpen(open => !open);
        },
      },
      view.icon,
    ),
    h(
      'span',
      { class: 'reply-context-label' },
      `${view.verb} ${view.authorName}`,
    ),
    h('span', { class: 'reply-context-preview' }, view.preview),
    h(
      'button',
      {
        class: 'reply-context-close',
        title: 'Cancel reply',
        onClick: () => {
          if (controller.onClose) controller.onClose();
        },
      },
      '×',
    ),
    menu,
  );
};
harden(ReplyContextBar);

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
 * @param {(ref: unknown) => AsyncIterable<unknown>} options.iterateReader - Ref iterator factory
 * @param {ERef<EndoHost>} options.powers - Powers object
 * @param {(value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>} [options.showValue] - Display a value
 * @param {() => boolean} [options.shouldHandleEnter] - Optional callback to check if Enter should be handled
 * @param {(state: SendFormState) => void} [options.onStateChange] - Called when input state changes
 * @param {() => string | string[] | null} [options.getConversationPetName] - Returns active conversation pet name or path
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
  iterateReader,
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
  /**
   * Set once `dispose()` runs. `initHeatEngine` is async (it awaits
   * `getHopInfo`/`getHeatConfig`), so a component can be disposed while an
   * init is still in flight. Without this guard the awaited continuation
   * would create and `start()` a heat engine *after* dispose stopped the
   * (still-null) engines, leaking a self-rescheduling requestAnimationFrame
   * loop that keeps the process alive forever — which hangs the test worker
   * (and CI) even though every test passed.
   */
  let disposed = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let pollTimeoutId = null;

  // --- Reply type (for outliner edit/deletion/etc) ---
  /** @type {string | undefined} */
  let pendingReplyType;

  // --- Reply context ---
  /** @type {ReplyContext | null} */
  let replyContext = null;

  /** Default reply context that auto-restores after send (e.g. thread root). */
  /** @type {ReplyContext | null} */
  let defaultReplyContext = null;

  // The reply-context bar renders confined into a dedicated mount child inserted
  // at the top of the host `$chatBar`. `renderConfined` reconciles only against
  // this mount's children, so the form's other chat-bar content is untouched.
  const $replyBarMount = document.createElement('div');
  $chatBar.insertBefore($replyBarMount, $chatBar.firstChild);

  // Mutable bridge to the reply-context component (populated by its effect).
  // Intentionally NOT hardened — the component writes its setter onto it.
  /** @type {ReplyBarController} */
  const replyBarController = {};

  // The latest reply-bar view, kept here so a `setView` issued before the
  // component's effect wires up is not lost: the effect pulls it via `getView`.
  /** @type {ReplyBarView | null} */
  let currentReplyView = null;
  replyBarController.getView = () => currentReplyView;

  // Close the reply-type menu on any outside click. Host-side document listener
  // (the confined tree never sees DOM nodes), mirroring edit-space-modal's
  // host-side keydown listener. The picker/menu buttons stopPropagation, so a
  // click on them never reaches here.
  /** @param {Event} _event */
  const onDocumentClick = _event => {
    if (replyBarController.closeMenu) replyBarController.closeMenu();
  };
  document.addEventListener('click', onDocumentClick);

  /**
   * Get the reply type entry for the current pendingReplyType.
   * @returns {ReplyTypeEntry}
   */
  const getCurrentReplyTypeEntry = () => {
    const entry = REPLY_TYPES.find(rt => rt.type === pendingReplyType);
    return entry || REPLY_TYPES[0];
  };

  /**
   * Push the current reply context into the confined bar as plain data (or
   * `null` to hide it).
   */
  const renderReplyContextBar = () => {
    if (!replyContext) {
      currentReplyView = null;
    } else {
      const rtEntry = getCurrentReplyTypeEntry();
      currentReplyView = harden({
        verb: rtEntry.verb,
        icon: rtEntry.icon,
        authorName: replyContext.authorName,
        preview: replyContext.preview,
        activeType: pendingReplyType,
      });
    }
    if (replyBarController.setView) {
      replyBarController.setView(currentReplyView);
    }
  };

  // Row callbacks the confined bar invokes with plain data.
  replyBarController.onSelectType = type => {
    pendingReplyType = type;
    renderReplyContextBar();
  };
  replyBarController.onClose = () => {
    replyContext = defaultReplyContext;
    pendingReplyType = undefined;
    renderReplyContextBar();
  };

  renderConfined(
    h(ReplyContextBar, { controller: replyBarController }),
    $replyBarMount,
  );

  // Keep #messages bottom in sync with #chat-bar's actual height so the
  // reply context bar (and any other dynamic chat-bar content) never
  // overlaps the scrollable message area.
  /** @type {ResizeObserver | null} */
  let chatBarObserver = null;
  const $messages = document.getElementById('messages');
  if ($messages && typeof ResizeObserver !== 'undefined') {
    chatBarObserver = new ResizeObserver(() => {
      $messages.style.bottom = `${$chatBar.offsetHeight}px`;
    });
    chatBarObserver.observe($chatBar);
  }

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
      // Bail if the component was disposed while we awaited; otherwise we'd
      // start a heat engine whose rAF loop nothing will ever stop.
      if (disposed) return;
      if (hopInfo && hopInfo.policies && hopInfo.policies.length !== 0) {
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
          const eventIter = iterateReader(eventsRef);
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
      // Bail if the component was disposed while we awaited (see above).
      if (disposed) return;
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
        if (heatEngineInitialized) return;
        const ref = getChannelRef();
        if (ref) {
          void initHeatEngine(ref);
        } else {
          pollTimeoutId = setTimeout(pollForChannelRef, 500);
        }
      };
      pollTimeoutId = setTimeout(pollForChannelRef, 500);
    }
  }

  // Initialize token autocomplete
  const tokenComponent = tokenAutocompleteComponent($input, $menu, {
    E,
    iterateReader,
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
            ? E(channelRef).post(
                messageStrings,
                edgeNames,
                petNames,
                replyTo,
                ids,
                sendReplyType,
              )
            : E(channelRef).post(
                messageStrings,
                edgeNames,
                petNames,
                replyTo,
                ids,
              ),
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

  return harden({
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
    dispose: () => {
      // Mark disposed first so any in-flight `initHeatEngine` continuation
      // bails out instead of starting an engine after we've torn down.
      disposed = true;
      if (pollTimeoutId !== null) {
        clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
      }
      if (compositeEngine) {
        compositeEngine.stop();
        compositeEngine = null;
      }
      if (heatEngine) {
        heatEngine.stop();
        heatEngine = null;
      }
      if (heatBar) {
        heatBar.dispose();
        heatBar = null;
      }
      if (chatBarObserver) {
        chatBarObserver.disconnect();
        chatBarObserver = null;
      }
      document.removeEventListener('click', onDocumentClick);
      unmount($replyBarMount);
      $replyBarMount.remove();
    },
  });
};
harden(sendFormComponent);
