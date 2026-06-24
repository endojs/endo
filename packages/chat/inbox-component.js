// @ts-check

/** @import { ERef } from '@endo/far' */
/** @import { EndoHost } from '@endo/daemon' */

import harden from '@endo/harden';
import { InboxRoot } from '@endo/space-chat';

import { h, renderConfined, unmount } from './setup-preact-container.js';

// Host wrapper for the default 1:1 chat (inbox) space. The view itself — the
// confined `InboxRoot` Preact tree and all its message rendering — lives in the
// standalone `@endo/space-chat` package. This trusted host code resolves the
// mount node, applies the project's CONFINED renderer, owns the scroll geometry
// (the package component is authority-free over the DOM), and returns a
// `dispose()`.

/**
 * @param {HTMLElement} $parent
 * @param {HTMLElement | null} $end
 * @param {ERef<EndoHost>} powers
 * @param {{ showValue: (value: unknown, id?: string, petNamePath?: string[], messageContext?: { number: bigint, edgeName: string }) => void | Promise<void>, conversationId?: string | null, conversationPetName?: string | null }} options
 * @returns {Promise<{ dispose: () => void }>} A disposer that unmounts the
 *   confined tree and removes its mount node. (The view also self-disables via
 *   `isLive()` if the host rebuilds the container without calling it.)
 */
export const inboxComponent = async (
  $parent,
  $end,
  powers,
  { showValue, conversationId, conversationPetName },
) => {
  // The caller passes a SHARED host element (`#messages`, which also holds the
  // scroll `$end` anchor and any connecting indicators). `renderConfined`
  // reconciles against ALL children of its mount node, so render into a
  // DEDICATED child inserted before `$end`; that way siblings are never
  // clobbered, and re-invocation stays isolated.
  //
  // Teardown: the returned `dispose()` unmounts and removes `$mount`. As a
  // belt-and-suspenders fallback, chat.js may instead rebuild `$parent`
  // (`innerHTML = template`) on space/conversation switch, which detaches
  // `$mount`; the subscription effect stops dispatching once `isLive()` reports
  // the mount detached, so a stale view never mutates the rebuilt DOM.
  const $mount = document.createElement('div');
  $parent.insertBefore($mount, $end);
  const isLive = () => $mount.isConnected;

  // Scroll geometry is the host's concern: these close over `$parent` (the
  // host's own scroll container) and are passed to the confined `InboxRoot` as
  // callbacks, so the component itself never receives a host DOM node.
  const measureNearBottom = () =>
    new Promise(resolve =>
      requestAnimationFrame(() => {
        const scrollTop = /** @type {number} */ ($parent.scrollTop);
        const endScrollTop = /** @type {number} */ (
          $parent.scrollHeight - $parent.clientHeight
        );
        // 80px tolerance (matching channel-component) so short messages don't
        // make the user "lose" auto-scroll.
        resolve(endScrollTop - scrollTop < 80);
      }),
    );
  const scrollToBottom = () => $parent.scrollTo(0, $parent.scrollHeight);

  /** Map from form messageId to its description, for value message rendering. */
  /** @type {Map<string, string>} */
  const formDescriptions = new Map();

  renderConfined(
    h(InboxRoot, {
      powers,
      showValue,
      formDescriptions,
      measureNearBottom,
      scrollToBottom,
      isLive,
      conversationId,
      conversationPetName,
      // The confined view is authority-free over ambient globals; the trusted
      // host supplies the error sink. `reportError` surfaces background failures
      // (e.g. a rejected `reject`) to the platform's unhandled-error handler.
      reportError: error => globalThis.reportError(error),
    }),
    $mount,
  );

  // Initial scroll handled imperatively against the host's own container (never
  // part of the confined tree). One immediate scroll, plus one after the first
  // backlog batch has rendered (150ms), so the user lands at the latest message.
  scrollToBottom();
  const initialScrollTimer = setTimeout(() => {
    if (isLive()) scrollToBottom();
  }, 150);

  return harden({
    dispose: () => {
      clearTimeout(initialScrollTimer);
      unmount($mount);
      $mount.remove();
    },
  });
};
harden(inboxComponent);
