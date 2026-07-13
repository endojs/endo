// @ts-check

/** @import { ERef } from '@endo/eventual-send' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';
import { watchErrorTrace } from './error-trace.js';

/**
 * @typedef {import('./error-trace.js').ErrorTraceDetail} ErrorTraceDetail
 */

/**
 * @typedef {object} PendingCommandEntry
 * @property {string} id
 * @property {string} commandName
 * @property {Record<string, unknown>} params
 * @property {'pending' | 'success' | 'error'} status
 * @property {HTMLElement} $card
 * @property {(() => void) | undefined} cancelTraceWatch - Cancel handle for a
 *   late-arriving trace watch started when the error card first rendered with an
 *   unresolved trace. Cancelled when the card is dismissed.
 */

/**
 * The result shape the command executor resolves to. The executor catches its
 * own errors and resolves `{ success: false, error, trace? }` rather than
 * rejecting, so a card keys success vs. error off the resolved `success` field.
 * `trace` carries the resolved daemon-side detail (stack + authoritative worker
 * id) so the error card can render the same rich error UX the inline command
 * bubble used to own.
 *
 * @typedef {object} CommandResultShape
 * @property {boolean} success
 * @property {unknown} [value]
 * @property {string} [message]
 * @property {Error} [error]
 * @property {ErrorTraceDetail} [trace]
 */

/**
 * @typedef {object} PendingCommandsOptions
 * @property {ERef<EndoHost>} powers - Host powers, used to watch for a
 *   late-arriving trace record and enrich an error card in place.
 * @property {(workerId: string) => void} onShowWorker - Bring up Show Value for
 *   the worker that produced an error, given its formula identifier (the error
 *   card's worker-chip click). The host owns the behaviour.
 * @property {HTMLElement} [scrollContainer] - The scrollable transcript
 *   (`#messages`) the region lives in. When a card is added, the region scrolls
 *   this container to its bottom so the newest card is fully in view (chat-style
 *   bottom-pin), rather than nudging the minimum.
 * @property {() => void} [onRegionEmptied] - Called when the last card is
 *   removed and the region collapses. The chat bar uses it to drop out of
 *   pending-navigation mode when an async success-fade or error resolution
 *   empties the region while the user is parked in it.
 */

/**
 * The result of a cursor move within the region, telling the caller when the
 * cursor has walked off an edge so it can hand navigation back to the transcript
 * (`exit-top`, the card nearest the transcript) or the command input
 * (`exit-bottom`, the card nearest the input).
 *
 * @typedef {'moved' | 'exit-top' | 'exit-bottom'} CursorMoveResult
 */

/**
 * @typedef {object} PendingCommandsAPI
 * @property {(commandName: string, params: Record<string, unknown>, promise: Promise<CommandResultShape>) => void} track
 * @property {() => number} count
 * @property {(edge: 'top' | 'bottom') => boolean} focusEnd - Place the cursor on
 *   the card nearest the transcript (`top`) or the input (`bottom`). Returns
 *   `false` when the region is empty, so the caller can skip past it.
 * @property {(direction: 'up' | 'down') => CursorMoveResult} moveCursor
 * @property {() => 'dismissed' | 'empty'} dismissCursor - Dismiss the cursor
 *   card and advance the cursor to a neighbour. `empty` when no card remains.
 * @property {() => void} clearCursor
 */

/**
 * Create the pending commands region. Each dispatched command is tracked as a
 * compact card in `$container`: a spinner while in flight, a brief checkmark
 * that auto-fades on success, and — on failure of ANY command — an ephemeral
 * error card carrying the rich error UX (message, daemon stack trace, and a
 * clickable worker chip) that was previously the inline `/js` error bubble.
 * This is the single, general error surface for command dispatch; there is no
 * command-specific inline error path.
 *
 * @param {HTMLElement} $container - Element to append pending cards to.
 * @param {PendingCommandsOptions} options
 * @returns {PendingCommandsAPI}
 */
export const createPendingCommands = (
  $container,
  { powers, onShowWorker, scrollContainer, onRegionEmptied },
) => {
  /** @type {Map<string, PendingCommandEntry>} */
  const entries = new Map();

  let nextId = 0;

  // The id of the card the keyboard navigation cursor ("hover") currently rests
  // on, or null when the cursor is not in the region. Its `.cursor` class draws
  // the same accent outline the transcript uses for a focused message.
  /** @type {string | null} */
  let cursorId = null;

  /**
   * Format command params for display.
   * @param {string} commandName
   * @param {Record<string, unknown>} params
   * @returns {string}
   */
  const formatCommand = (commandName, params) => {
    const parts = [`/${commandName}`];
    if (params.messageNumber !== undefined) {
      parts.push(`#${params.messageNumber}`);
    }
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '' && key !== 'messageNumber') {
        parts.push(String(value));
      }
    }
    return parts.join(' ');
  };

  /**
   * Paint the `.cursor` class on the card matching `cursorId`, clearing it from
   * every other card. A no-op visual: the class only draws the hover outline.
   */
  const setCursorClass = () => {
    for (const [id, entry] of entries) {
      entry.$card.classList.toggle('cursor', id === cursorId);
    }
  };

  /**
   * Scroll a card into view within the transcript. The region is flow content at
   * the bottom of the scrollable `#messages`; a freshly tracked card or the card
   * the cursor lands on can be below the fold, so bring it into view (`nearest`
   * scrolls the minimum, and is a no-op when the card is already visible).
   * @param {string} [id]
   */
  const scrollCardIntoView = id => {
    if (id === undefined) return;
    const entry = entries.get(id);
    entry?.$card.scrollIntoView?.({ block: 'nearest' });
  };

  /**
   * Pin the transcript to its bottom so the newest card is fully in view, the
   * way a chat log scrolls to the bottom on a new message. Falls back to a
   * minimal scroll of the given card when no scroll container was provided.
   * @param {string} [id] - The card to reveal if there is no scroll container.
   */
  const scrollToBottom = id => {
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    } else {
      scrollCardIntoView(id);
    }
  };

  /**
   * Pin to the bottom now and again on the next frame. A card that grows (an
   * error gaining its stack) reflows asynchronously, and the browser's scroll
   * anchoring can re-adjust `scrollTop` after a synchronous write; re-pinning on
   * the next frame lands after both so the grown card stays fully in view.
   */
  const scrollToBottomSoon = () => {
    scrollToBottom();
    requestAnimationFrame(() => scrollToBottom());
  };

  // Treat within a couple of pixels of the bottom as "at the bottom", tolerating
  // sub-pixel rounding.
  const BOTTOM_EPSILON = 2;

  /**
   * Whether the transcript is currently scrolled to (or within a hair of) its
   * bottom. Used to decide whether to re-pin after a card grows: an error card
   * that gains a stack/worker chip when its late trace arrives must not shove the
   * newest content out of view if the user was reading at the bottom — but must
   * also not yank a user who has scrolled up to read history.
   * @returns {boolean}
   */
  const isAtBottom = () => {
    if (!scrollContainer) return false;
    const { scrollTop, clientHeight, scrollHeight } = scrollContainer;
    return scrollTop + clientHeight >= scrollHeight - BOTTOM_EPSILON;
  };

  /**
   * Remove an entry's card and forget it, collapsing the region when it empties.
   * When the cursor rested on the removed card (an async success-fade or error
   * resolution under a parked cursor), advance the cursor to a neighbour so
   * keyboard navigation keeps a valid resting place; `onRegionEmptied` fires
   * when nothing remains.
   * @param {string} id
   * @param {PendingCommandEntry} entry
   */
  const removeEntry = (id, entry) => {
    if (entry.cancelTraceWatch) {
      entry.cancelTraceWatch();
      entry.cancelTraceWatch = undefined;
    }
    if (id === cursorId) {
      // Prefer the next (lower, toward the input) card, else the previous.
      const ids = [...entries.keys()];
      const index = ids.indexOf(id);
      cursorId = ids[index + 1] ?? ids[index - 1] ?? null;
    }
    entry.$card.remove();
    entries.delete(id);
    if (cursorId) setCursorClass();
    if (entries.size === 0) {
      $container.classList.remove('has-pending');
      if (onRegionEmptied) onRegionEmptied();
    }
  };

  /**
   * Fade a card out over the transition, then remove it.
   * @param {string} id
   * @param {PendingCommandEntry} entry
   */
  const fadeAndRemove = (id, entry) => {
    entry.$card.classList.add('fade-out');
    setTimeout(() => removeEntry(id, entry), 300);
  };

  /**
   * Dismiss a card the way the user's click or Escape does: cancel any in-flight
   * trace watch immediately (the maintainer-specified dismissal signal), then
   * fade the card out. Shared by the click-to-dismiss handler and the
   * keyboard-cursor `dismissCursor`.
   * @param {string} id
   * @param {PendingCommandEntry} entry
   */
  const dismissEntry = (id, entry) => {
    if (entry.cancelTraceWatch) {
      entry.cancelTraceWatch();
      entry.cancelTraceWatch = undefined;
    }
    fadeAndRemove(id, entry);
  };

  /**
   * Create a card element for a pending command.
   * @param {string} id
   * @param {string} commandName
   * @param {Record<string, unknown>} params
   * @returns {HTMLElement}
   */
  const createCard = (id, commandName, params) => {
    const $card = document.createElement('div');
    $card.className = 'pending-command-card pending';
    $card.dataset.pendingId = id;

    const $label = document.createElement('span');
    $label.className = 'pending-command-label';
    $label.textContent = formatCommand(commandName, params);
    $card.appendChild($label);

    const $spinner = document.createElement('span');
    $spinner.className = 'pending-command-spinner';
    $card.appendChild($spinner);

    const $status = document.createElement('span');
    $status.className = 'pending-command-status';
    $card.appendChild($status);

    return $card;
  };

  /**
   * Transition a card to the success state and fade it out.
   * @param {string} id
   * @param {PendingCommandEntry} entry
   */
  const transitionToSuccess = (id, entry) => {
    entry.status = 'success';
    const { $card } = entry;
    $card.classList.remove('pending');
    $card.classList.add('success');
    const $status = $card.querySelector('.pending-command-status');
    if ($status) $status.textContent = '✓';
    // Fade out after a brief display.
    setTimeout(() => fadeAndRemove(id, entry), 1500);
  };

  /**
   * Render (or re-render) the rich error detail into an error card: the message,
   * the daemon-recorded stack trace (when resolved), and a clickable worker chip
   * (when the daemon stamped a worker id). Reuses the `command-error-*` classes
   * the inline bubble used, so the styling is unchanged. The chip and the stack
   * stop click propagation so clicking them does not dismiss the (click-to-
   * dismiss) card.
   * @param {HTMLElement} $detail
   * @param {string} message
   * @param {ErrorTraceDetail | null} trace
   */
  const renderErrorDetail = ($detail, message, trace) => {
    $detail.replaceChildren();
    const stack = trace && trace.stack ? trace.stack : '';
    const workerId = trace && trace.workerId ? trace.workerId : '';
    // The chip shows the worker's reverse-looked-up name (`@petName`), the same
    // token Show Value renders in its title; `worker` when the worker is
    // anonymous (unnamed in the pet store).
    const workerName = trace && trace.workerName ? trace.workerName : '';

    const $message = document.createElement('div');
    $message.className = 'command-error-message';
    $message.textContent = message;
    $detail.appendChild($message);

    if (stack) {
      const $stack = document.createElement('pre');
      $stack.className = 'command-error-stack-text';
      $stack.textContent = stack;
      // Let the user select stack text without dismissing the card.
      $stack.addEventListener('click', event => event.stopPropagation());
      $detail.appendChild($stack);
    }

    if (workerId) {
      const $chip = document.createElement('button');
      $chip.type = 'button';
      $chip.className = 'command-error-worker-chip';
      $chip.title = 'Show the worker that produced this error';
      $chip.textContent = workerName || 'worker';
      $chip.addEventListener('click', event => {
        // Show Value for the worker, not dismiss the card.
        event.stopPropagation();
        onShowWorker(workerId);
      });
      $detail.appendChild($chip);
    }
  };

  /**
   * Transition a card to the ephemeral error state. The card replaces its
   * spinner/label chrome with the rich error detail and stays visible until the
   * user clicks it (click-to-dismiss). When the trace has an errorId but no
   * stack/worker yet (a race between the worker's asynchronous trace push and
   * the browser's lookup), the card watches for the late record and enriches
   * itself in place, exactly as the inline bubble did.
   * @param {string} id
   * @param {PendingCommandEntry} entry
   * @param {string} message
   * @param {ErrorTraceDetail | null} trace
   */
  const transitionToError = (id, entry, message, trace) => {
    entry.status = 'error';
    const { $card } = entry;
    // The card grows from a one-line pending chip to the error detail; keep the
    // transcript pinned to the bottom if it was already there.
    const wasAtBottom = isAtBottom();
    $card.classList.remove('pending');
    $card.classList.add('error');
    // Drop the spinner; the error detail owns the card's content beside the
    // command label.
    const $spinner = $card.querySelector('.pending-command-spinner');
    if ($spinner) $spinner.remove();
    const $status = $card.querySelector('.pending-command-status');
    if ($status) $status.remove();

    const $detail = document.createElement('div');
    $detail.className = 'command-error-detail pending-command-error';
    $card.appendChild($detail);
    renderErrorDetail($detail, message, trace || null);
    if (wasAtBottom) scrollToBottomSoon();

    // Error cards stay until dismissed by click (here) or the keyboard cursor
    // (`dismissCursor`); both route through `dismissEntry`.
    $card.addEventListener('click', () => dismissEntry(id, entry), {
      once: true,
    });

    // The daemon-side trace may not have reached the aggregator when the error
    // surfaced. When an errorId was recovered but no stack/worker resolved yet,
    // watch for the record to arrive and enrich the card in place.
    if (trace && trace.errorId && !trace.stack && !trace.workerId) {
      entry.cancelTraceWatch = watchErrorTrace(
        powers,
        trace.errorId,
        ({ stack, workerId, workerName }) => {
          entry.cancelTraceWatch = undefined;
          // Ignore a resolution for a card the user already dismissed.
          if (!entries.has(id)) return;
          // The stack + worker chip expand the card; re-pin to the bottom if the
          // user was reading there, so the growth does not push it out of view.
          const wasAtBottomOnEnrich = isAtBottom();
          renderErrorDetail($detail, message, {
            ...trace,
            stack,
            workerId,
            workerName,
          });
          if (wasAtBottomOnEnrich) scrollToBottomSoon();
        },
      );
    }
  };

  /**
   * Track a command execution. Shows a pending card immediately and transitions
   * it on completion. The executor returns a `{ success, error?, trace?,
   * message? }` shape and catches its own errors, so the promise normally
   * resolves; success vs. error keys off the resolved `success` field rather
   * than promise rejection. A rejection handler remains as defense-in-depth for
   * unexpected throws that escape the executor's catch.
   *
   * @param {string} commandName
   * @param {Record<string, unknown>} params
   * @param {Promise<CommandResultShape>} promise
   */
  const track = (commandName, params, promise) => {
    nextId += 1;
    const id = `pending-${nextId}`;
    const $card = createCard(id, commandName, params);

    /** @type {PendingCommandEntry} */
    const entry = {
      id,
      commandName,
      params,
      status: 'pending',
      $card,
      cancelTraceWatch: undefined,
    };
    entries.set(id, entry);
    $container.appendChild($card);
    $container.classList.add('has-pending');
    // The user just dispatched this command; pin the transcript to its bottom so
    // the whole new card is in view rather than left below the fold.
    scrollToBottom(id);

    promise.then(
      result => {
        if (result && result.success) {
          transitionToSuccess(id, entry);
        } else {
          const message =
            (result && result.error && result.error.message) ||
            (result && result.message) ||
            'Command failed';
          transitionToError(
            id,
            entry,
            message,
            (result && result.trace) || null,
          );
        }
      },
      error => {
        // Defense-in-depth: the executor normally catches its own errors and
        // returns { success: false, ... }, but a thrown rejection that escapes
        // still surfaces here.
        transitionToError(
          id,
          entry,
          /** @type {Error} */ (error).message,
          null,
        );
      },
    );
  };

  /**
   * Place the cursor on the card nearest the transcript (`top`, first) or the
   * input (`bottom`, last). Returns `false` when the region is empty so the
   * caller can skip navigation past it.
   * @param {'top' | 'bottom'} edge
   * @returns {boolean}
   */
  const focusEnd = edge => {
    const ids = [...entries.keys()];
    if (ids.length === 0) {
      cursorId = null;
      return false;
    }
    cursorId = edge === 'top' ? ids[0] : ids[ids.length - 1];
    setCursorClass();
    // Entering at the bottom (from the input) pins to the transcript bottom so
    // the whole card shows above the command bar; entering at the top (from the
    // messages) just brings that card into view.
    if (edge === 'bottom') {
      scrollToBottom(cursorId);
    } else {
      scrollCardIntoView(cursorId);
    }
    return true;
  };

  /**
   * Move the cursor one card up (toward the transcript) or down (toward the
   * input). Returns `exit-top` / `exit-bottom` when the cursor would step past
   * the region's edge, leaving the cursor where it was so the caller can hand
   * navigation to the neighbouring region.
   * @param {'up' | 'down'} direction
   * @returns {CursorMoveResult}
   */
  const moveCursor = direction => {
    const ids = [...entries.keys()];
    const index = cursorId ? ids.indexOf(cursorId) : -1;
    if (direction === 'up') {
      if (index <= 0) return 'exit-top';
      cursorId = ids[index - 1];
    } else {
      if (index === -1 || index >= ids.length - 1) return 'exit-bottom';
      cursorId = ids[index + 1];
    }
    setCursorClass();
    scrollCardIntoView(cursorId);
    return 'moved';
  };

  /**
   * Dismiss the card under the cursor and advance the cursor to a neighbour
   * (preferring the next card toward the input). Returns `empty` when no card
   * remains so the caller can return to the input.
   * @returns {'dismissed' | 'empty'}
   */
  const dismissCursor = () => {
    if (!cursorId) return 'empty';
    const entry = entries.get(cursorId);
    if (!entry) {
      cursorId = null;
      return 'empty';
    }
    const ids = [...entries.keys()];
    const index = ids.indexOf(cursorId);
    // Advance the cursor before the fade so `removeEntry`'s own cursor
    // bookkeeping sees a cursor that no longer points at the fading card.
    cursorId = ids[index + 1] ?? ids[index - 1] ?? null;
    dismissEntry(entry.id, entry);
    if (cursorId) {
      setCursorClass();
      scrollCardIntoView(cursorId);
      return 'dismissed';
    }
    return 'empty';
  };

  /** Drop the visual cursor when navigation leaves the region. */
  const clearCursor = () => {
    cursorId = null;
    setCursorClass();
  };

  return harden({
    track,
    count: () => entries.size,
    focusEnd,
    moveCursor,
    dismissCursor,
    clearCursor,
  });
};
