import { arrayPush } from './commons.js';

/**
 * Creates a notifier that defers subscribers until a resolver is invoked,
 * then forwards all subsequent subscribers to a target notifier.
 *
 * This is a synchronous variant of `Promise.withResolvers`: `notify` is the
 * "subscribe" side and `resolve` is the "settle" side. Subscribers attached
 * via `notify(update)` before `resolve(targetNotify)` is called are queued;
 * once `resolve` is called, queued updaters are replayed to the target
 * notifier and subsequent `notify(update)` calls forward directly through.
 *
 * `resolve` is one-shot: the first call settles the resolver to its target,
 * and subsequent calls are no-ops. (This matches `Promise.withResolvers`
 * semantics: a promise settles once.) Callers that need to discover the
 * target lazily may safely call `resolve` again on each `notify`; only the
 * first call has effect.
 *
 * Used by `module-instance.js` `wireUpExportNotifier` to resolve the
 * star-export-cycle case (endojs/endo#59): a re-export may be wired before
 * the upstream module has exposed its notifier for the imported name, and
 * the upstream notifier becomes available only after a second pass of
 * candidate-all wiring elsewhere in the graph.
 *
 * @returns {{
 *   notify: (update: (value: any) => void) => void,
 *   resolve: (targetNotify: (update: (value: any) => void) => void) => void,
 * }}
 */
export const makeNotifierWithResolver = () => {
  /** @type {Array<(value: any) => void>} */
  const pendingUpdaters = [];
  /** @type {((update: (value: any) => void) => void) | undefined} */
  let resolvedTargetNotify;

  const notify = update => {
    if (resolvedTargetNotify !== undefined) {
      resolvedTargetNotify(update);
      return;
    }
    arrayPush(pendingUpdaters, update);
  };

  const resolve = targetNotify => {
    if (resolvedTargetNotify !== undefined) {
      return;
    }
    resolvedTargetNotify = targetNotify;
    for (const pending of pendingUpdaters) {
      targetNotify(pending);
    }
    pendingUpdaters.length = 0;
  };

  return { notify, resolve };
};
