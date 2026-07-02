// @ts-check

/** @import { ERef } from '@endo/eventual-send' */
/** @import { EndoHost } from '@endo/daemon' */

import { E } from '@endo/eventual-send';

/**
 * The detail a UI shows alongside a thrown error: the original message, the
 * full daemon-side stack trace for the error (when the trace aggregator could
 * resolve one), and the authoritative worker identifier the daemon stamped from
 * the connection identity. `workerId` is the formula identifier of the worker
 * that produced the error, suitable to pass to a Show Value flow.
 *
 * @typedef {object} ErrorTraceDetail
 * @property {string} message
 * @property {string | undefined} stack
 * @property {string | undefined} workerId
 * @property {string | undefined} [workerName] - The worker's display name — the
 *   same `@petName` token Show Value renders in its title, reverse-looked-up
 *   from `workerId`. `undefined` when the worker has no pet name (anonymous),
 *   which is the common case for eval workers.
 * @property {string | undefined} [errorId] - The wire-level identifier the UI
 *   uses to re-query the trace aggregator. Populated whenever an errorId could
 *   be recovered from the decoded error, even when the initial lookup missed
 *   (so a consumer can `watchErrorTrace` for a late-arriving record).
 */

/**
 * Registry of decoded-error → wire-level errorId, populated by the CapTP
 * `marshalLoadError` hook the client installs on its connection (see
 * `noteDecodedErrorId`). This is the authoritative recovery path: under SES
 * `errorTaming: 'safe'` the decoded error's public `.name` reads back as the
 * bare constructor name (`Error`), NOT the `Remote…(error:…#n)` tagged form, so
 * the parenthesized-tag scrape below never matches in a real browser. The
 * marshal decode hook, by contrast, hands us the errorId directly at decode
 * time, keyed on the exact error object CapTP later rejects with.
 *
 * @type {WeakMap<object, string>}
 */
const errorIdByDecodedError = new WeakMap();

/**
 * Record the wire-level errorId that `@endo/marshal` decoded for `error`.
 * Wired from the client CapTP's `marshalLoadError` option so that a later
 * `extractErrorId(error)` can recover the id even though SES redacts it from
 * the public `.name`.
 *
 * @param {unknown} error
 * @param {string} [errorId]
 */
export const noteDecodedErrorId = (error, errorId) => {
  if (error === null || typeof error !== 'object') return;
  if (typeof errorId !== 'string' || errorId === '') return;
  errorIdByDecodedError.set(error, errorId);
};

/**
 * Extract the wire-level errorId stamped onto a decoded CapTP error by
 * `@endo/marshal`'s error decoder. Prefers the id captured at decode time by
 * the client's `marshalLoadError` hook (see `noteDecodedErrorId`), which is the
 * only reliable source under SES `errorTaming: 'safe'`. Falls back to an
 * `errorId` own-property and finally to scraping the parenthesized SES error
 * tag out of `err.name` (only present in non-SES embeddings), mirroring the
 * daemon's own `extractInboundErrorId`. A privileged caller (here the chat
 * client, which holds the host's diagnostics facet) feeds the errorId to
 * `traces.lookup` to correlate the local error to its daemon-side trace.
 *
 * @param {unknown} error
 * @returns {string | undefined}
 */
export const extractErrorId = error => {
  if (error === null || typeof error !== 'object') return undefined;
  const noted = errorIdByDecodedError.get(error);
  if (typeof noted === 'string') return noted;
  const err = /** @type {{ errorId?: unknown, name?: unknown }} */ (error);
  if (typeof err.errorId === 'string') return err.errorId;
  if (typeof err.name !== 'string') return undefined;
  const match = /\(error:[^)]+\)/.exec(err.name);
  if (match === null) return undefined;
  return match[0].slice(1, -1);
};

/**
 * Extract the `{ stack, workerId }` a trace report contributes to an
 * `ErrorTraceDetail`, normalising empty strings to `undefined`. Returns an
 * object whose fields are both `undefined` when the report is missing or holds
 * neither a stack nor a worker id.
 *
 * @param {{ stack?: unknown, workerId?: unknown } | undefined | null} report
 * @returns {{ stack: string | undefined, workerId: string | undefined }}
 */
const reportFields = report => {
  const stack =
    report && typeof report.stack === 'string' && report.stack !== ''
      ? report.stack
      : undefined;
  const workerId =
    report && typeof report.workerId === 'string' && report.workerId !== ''
      ? report.workerId
      : undefined;
  return { stack, workerId };
};

/**
 * Reverse-look-up the worker's display name from its formula identifier — the
 * same name Show Value renders in its title (an `@petName` token, or "(unnamed)"
 * when the worker has none). Returns the first pet name as `@name`, matching
 * Show Value's `@${petName}` rendering, or `undefined` when the worker is
 * anonymous (the common case: eval workers are not named in the pet store).
 * Best-effort: a missing or throwing `reverseIdentify` yields `undefined`.
 *
 * @param {ERef<EndoHost>} powers
 * @param {string | undefined} workerId
 * @returns {Promise<string | undefined>}
 */
const resolveWorkerName = async (powers, workerId) => {
  if (workerId === undefined) return undefined;
  try {
    const petNames = await E(powers).reverseIdentify(
      /** @type {Parameters<EndoHost['reverseIdentify']>[0]} */ (
        /** @type {unknown} */ (workerId)
      ),
    );
    if (Array.isArray(petNames)) {
      const [first] = Array.from(new Set(petNames));
      if (typeof first === 'string' && first !== '') return `@${first}`;
    }
  } catch {
    // reverseIdentify unavailable or threw; treat the worker as anonymous.
  }
  return undefined;
};

/**
 * Look up the daemon-side trace report for an errorId against the host's
 * privileged diagnostics aggregator. Best-effort: returns `undefined` when
 * diagnostics is unavailable, the aggregator has no matching record yet (the
 * record may still be in flight — see `watchErrorTrace`), or the lookup throws.
 *
 * @param {ERef<EndoHost>} powers
 * @param {string} errorId
 * @returns {Promise<{ stack?: string, workerId?: string } | undefined>}
 */
const lookupTraceReport = async (powers, errorId) => {
  try {
    const diagnostics = await E(powers).diagnostics();
    const traces = await E(diagnostics).traces();
    return await E(traces).lookup(errorId);
  } catch {
    // Diagnostics may be unavailable (older daemon, no aggregator) or the
    // lookup may throw; the caller degrades to the bare message.
    return undefined;
  }
};

/**
 * Resolve the trace detail for a thrown error against the host's privileged
 * diagnostics trace aggregator. Best-effort: if the daemon has no aggregator,
 * the errorId is absent, or the lookup misses, this returns the bare message
 * with no stack or worker. When an errorId *was* recovered but the record had
 * not yet reached the aggregator (a race between the worker's asynchronous
 * trace push and the browser's lookup round-trip), the returned detail still
 * carries `errorId`, so a UI can `watchErrorTrace` for the late record and
 * enrich the bubble in place. The worker identifier comes from the
 * daemon-recorded trace, which the daemon stamps from the connection identity,
 * so it is never a worker-supplied (and thus untrusted) field.
 *
 * @param {ERef<EndoHost>} powers
 * @param {unknown} error
 * @returns {Promise<ErrorTraceDetail>}
 */
export const resolveErrorTrace = async (powers, error) => {
  /** @type {string} */
  let message;
  if (
    error &&
    typeof error === 'object' &&
    typeof (/** @type {{ message?: unknown }} */ (error).message) === 'string'
  ) {
    message = /** @type {{ message: string }} */ (error).message;
  } else {
    message = String(error) || 'Unknown error';
  }

  /** @type {ErrorTraceDetail} */
  const detail = {
    message,
    stack: undefined,
    workerId: undefined,
    errorId: undefined,
  };

  const errorId = extractErrorId(error);
  if (errorId === undefined) return detail;
  // Carry the errorId even when the lookup below misses: the UI uses it to
  // watch for a late-arriving record rather than degrading permanently.
  detail.errorId = errorId;

  const report = await lookupTraceReport(powers, errorId);
  const { stack, workerId } = reportFields(report);
  detail.stack = stack;
  detail.workerId = workerId;
  detail.workerName = await resolveWorkerName(powers, workerId);
  return detail;
};

/**
 * Watch for a daemon-side trace record that had not yet reached the aggregator
 * when an error first surfaced. The worker pushes its `TraceRecord` to the
 * daemon on a separate, asynchronous leg from the rejection that travels back
 * to the browser, and the browser's `lookup` is itself a round-trip; there is
 * no cross-connection ordering guarantee, so the first `resolveErrorTrace` can
 * legitimately miss (the bubble then shows only the bare message — no stack, no
 * worker chip). This re-queries the aggregator on a bounded schedule until the
 * record resolves a stack or worker id, then calls `onResolved` once. It is the
 * caller's responsibility to invoke the returned `cancel` when the error is
 * dismissed (e.g. the next command is submitted); the watch also stops on its
 * own after `attempts` misses.
 *
 * @param {ERef<EndoHost>} powers
 * @param {string} errorId
 * @param {(resolved: { stack: string | undefined, workerId: string | undefined, workerName: string | undefined }) => void} onResolved
 * @param {{ intervalMs?: number, attempts?: number }} [options]
 * @returns {() => void} cancel the watch
 */
export const watchErrorTrace = (
  powers,
  errorId,
  onResolved,
  { intervalMs = 200, attempts = 25 } = {},
) => {
  let cancelled = false;
  let remaining = attempts;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  const poll = async () => {
    if (cancelled) return;
    const report = await lookupTraceReport(powers, errorId);
    if (cancelled) return;
    const { stack, workerId } = reportFields(report);
    if (stack !== undefined || workerId !== undefined) {
      const workerName = await resolveWorkerName(powers, workerId);
      if (cancelled) return;
      onResolved({ stack, workerId, workerName });
      return;
    }
    remaining -= 1;
    if (remaining <= 0) return;
    timer = setTimeout(poll, intervalMs);
  };

  // The in-line resolve already missed once, so wait one interval before the
  // first re-check rather than hammering the daemon synchronously.
  timer = setTimeout(poll, intervalMs);

  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
  };
};
