// `.map()` record-replay support, wire-compatible with cloudflare/capnweb.
//
// Wire shape:
//   ["remap", subjectId, propertyPath, captures, instructions]
//   - captures: array of expressions that resolve to stub references
//     (`["import", id]` / `["export", id]`) at send time; recorded
//     here as raw values which the session devalues just before
//     transmission.
//   - instructions: array of "expressions"; each is typically a
//     `["pipeline", subject, path]` (property access) or
//     `["pipeline", subject, path, args]` (call).  The LAST instruction
//     is the recording's answer (no separate answerRef).
//   - subject is an integer:
//        0           = the input value being mapped
//        +N          = the result of the N'th instruction (1-based)
//        -k          = captures[k-1]
//
// The recorder uses a placeholder Proxy: each property access appends
// to a "pending path" carried by the placeholder; the next `apply`
// (i.e. `(args)` after one or more `.x` reads) emits a single
// `["pipeline", subject, path, args]` instruction.  Placeholders
// returned without ever being called become a final get-only
// instruction.

import harden from '@endo/harden';
import { HandledPromise } from '@endo/eventual-send';

import { isForbiddenKey } from './path-keys.js';

const PLACEHOLDER = Symbol('capnweb.remap.placeholder');

// Numbers that survive JSON.stringify round-trip.  NaN / +Infinity /
// -Infinity become `null` in JSON, so we must NOT inline them as
// literals in the wire form — they have to go through `captures`,
// where the special-value codec encodes them as `["nan"]` etc.
const isJsonSafePrimitive = v =>
  v === null ||
  typeof v === 'string' ||
  typeof v === 'boolean' ||
  (typeof v === 'number' && Number.isFinite(v));

const checkPathSegment = seg => {
  if (isForbiddenKey(seg)) {
    throw new TypeError(
      `forbidden property name in remap path: ${String(seg)}`,
    );
  }
};

/**
 * Encode a single argument value into a wire expression suitable for
 * inclusion in an instruction's args array.  Placeholders become
 * `["pipeline", subject, path]` references; arbitrary other values are
 * pushed onto `captures` and referenced via a negative-index pipeline.
 *
 * @param {{ instructions: unknown[][], captures: unknown[] }} state
 * @param {unknown} arg
 */
const encodeArg = (state, arg) => {
  if (
    arg !== null &&
    (typeof arg === 'object' || typeof arg === 'function') &&
    /** @type {any} */ (arg)[PLACEHOLDER] !== undefined
  ) {
    const { subject, pendingPath } = /** @type {any} */ (arg)[PLACEHOLDER];
    return ['pipeline', subject, pendingPath.slice()];
  }
  if (typeof arg === 'symbol') {
    throw new TypeError(
      `remap recorder cannot capture symbol value: ${String(arg)}`,
    );
  }
  // For atomic JSON-safe primitives we can inline the value directly.
  // For objects (typically stubs), non-finite numbers (NaN/Infinity that
  // would JSON-stringify to null), and other non-trivial captures we
  // store them in `state.captures` and reference via negative subject —
  // captures are devalued at send time, so the special-value codec
  // handles them.
  if (isJsonSafePrimitive(arg)) {
    return arg;
  }
  state.captures.push(arg);
  return ['pipeline', -state.captures.length, []];
};

/**
 * @param {{ instructions: unknown[][], captures: unknown[] }} state
 * @param {number} subject
 * @param {readonly (string | number)[]} pendingPath
 * @returns {any}
 */
const makePlaceholder = (state, subject, pendingPath) => {
  const fn = (...args) => {
    const wireArgs = args.map(a => encodeArg(state, a));
    state.instructions.push([
      'pipeline',
      subject,
      pendingPath.slice(),
      wireArgs,
    ]);
    // The next placeholder represents the result of the just-emitted
    // instruction.  Subject is the 1-based index (length AFTER push).
    return makePlaceholder(state, state.instructions.length, []);
  };
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === PLACEHOLDER) {
        return harden({ subject, pendingPath: pendingPath.slice() });
      }
      if (prop === 'then') return undefined; // not a thenable
      if (typeof prop === 'symbol') {
        throw new TypeError(
          `remap recorder cannot record symbol property access: ${String(prop)}`,
        );
      }
      checkPathSegment(prop);
      // Accumulate into pending path; do NOT emit yet (deferred until
      // the user either calls the placeholder, or the recording ends
      // with this placeholder as its answer).
      return makePlaceholder(state, subject, [...pendingPath, prop]);
    },
    apply(_t, _thisArg, args) {
      const wireArgs = args.map(a => encodeArg(state, a));
      state.instructions.push([
        'pipeline',
        subject,
        pendingPath.slice(),
        wireArgs,
      ]);
      return makePlaceholder(state, state.instructions.length, []);
    },
  });
};

/**
 * Record a mapper callback into a remap recording in capnweb wire form.
 *
 * The mapper is called as `mapper(input, ...captureStubs)`, where each
 * `captureStubs[i]` is a recorder-aware placeholder for `captures[i]`.
 * This means a captured stub can be used as the *receiver* of a method
 * call inside the mapper body (`bonus.combine(x)`), not just as an
 * argument (`x.combine(bonus)`).  The wire encoding routes capture-stub
 * receivers through `["pipeline", -(i+1), path, args]` just like
 * `encodeArg` does for arg-position captures.
 *
 * @param {(input: unknown, ...captures: unknown[]) => unknown} mapper
 * @param {readonly unknown[]} [captures]
 * @returns {{ propertyPath: (string | number)[], captures: unknown[], instructions: unknown[][] }}
 */
export const recordRemap = (mapper, captures = []) => {
  /** @type {{ instructions: unknown[][], captures: unknown[] }} */
  const state = { instructions: [], captures: captures.slice() };
  const inputPlaceholder = makePlaceholder(state, 0, []);
  // Pre-allocate a placeholder per capture so the mapper can use them
  // as method receivers.  Subject is the negative 1-based capture index.
  const capturePlaceholders = state.captures.map((_, i) =>
    makePlaceholder(state, -(i + 1), []),
  );
  const result = mapper(inputPlaceholder, ...capturePlaceholders);

  // Append the answer expression as the final instruction.
  if (
    result !== null &&
    (typeof result === 'object' || typeof result === 'function') &&
    /** @type {any} */ (result)[PLACEHOLDER] !== undefined
  ) {
    const { subject, pendingPath } = /** @type {any} */ (result)[PLACEHOLDER];
    // A placeholder result: emit a final pipeline expression that
    // resolves to the placeholder's location.
    state.instructions.push(['pipeline', subject, pendingPath.slice()]);
  } else if (typeof result === 'symbol') {
    throw new TypeError(
      `remap recorder cannot return a symbol from the mapper`,
    );
  } else if (isJsonSafePrimitive(result)) {
    // JSON-safe atomic primitive: encode inline as the final
    // instruction.  Non-finite numbers fall through to the captures
    // path below so the special-value codec can encode them.
    state.instructions.push(/** @type {any} */ (result));
  } else {
    // Arbitrary value (e.g. a stub the user captured): push to
    // captures and reference it.
    state.captures.push(result);
    state.instructions.push(['pipeline', -state.captures.length, []]);
  }

  return harden({
    propertyPath: [],
    instructions: state.instructions.map(i =>
      Array.isArray(i) ? harden(i.slice()) : i,
    ),
    captures: state.captures.slice(),
  });
};

/**
 * Replay a recording against a single input value.  Builds a small
 * variable register file and walks the instruction list; the last
 * instruction's value is the answer.
 *
 * Each instruction is either a `["pipeline", subject, path, args?]`
 * tuple (pipelined property/method dispatch) or a literal JSON value
 * (atomic primitives can appear directly in the instruction slot).
 *
 * @param {{ propertyPath?: readonly (string | number)[], instructions: readonly unknown[], captures: readonly unknown[] }} recording
 * @param {unknown} input
 * @returns {Promise<unknown>}
 */
/* eslint-disable no-await-in-loop -- the interpreter is sequential by design */
export const replayRemap = async (recording, input) => {
  const { instructions, captures } = recording;
  const variables = [await input];

  /**
   * Resolve a `subject` integer to a concrete value.
   *
   * @param {number} subject
   */
  const resolveSubject = subject => {
    if (subject >= 0) {
      if (subject >= variables.length) {
        throw new TypeError(`remap subject ${subject} out of range`);
      }
      return variables[subject];
    }
    const idx = -subject - 1;
    if (idx >= captures.length) {
      throw new TypeError(`remap capture ${subject} out of range`);
    }
    return captures[idx];
  };

  /**
   * Evaluate one expression: either a `pipeline` reference or a literal.
   *
   * Uses `HandledPromise.get` / `applyMethod` / `applyFunction` for path
   * descent so that remote presences (which look up properties via their
   * handler, not as own properties) work uniformly with plain objects.
   *
   * @param {unknown} expr
   */
  const evaluate = async expr => {
    if (Array.isArray(expr) && expr[0] === 'pipeline') {
      const subject = /** @type {number} */ (expr[1]);
      const path = /** @type {(string | number)[]} */ (expr[2] || []);
      const args = /** @type {unknown[] | undefined} */ (expr[3]);
      for (const seg of path) checkPathSegment(seg);
      let cur = /** @type {any} */ (await resolveSubject(subject));
      if (args === undefined) {
        // Pure get: walk the whole path via HandledPromise.get so
        // presence handlers are consulted at each step.
        for (const seg of path) {
          cur = await HandledPromise.get(cur, /** @type {any} */ (seg));
        }
        return cur;
      }
      // Call.  Walk all but the last segment as gets, then dispatch the
      // call as applyMethod (path of length >= 1) or applyFunction
      // (empty path).
      const evaluatedArgs = await Promise.all(args.map(a => evaluate(a)));
      for (const seg of path.slice(0, -1)) {
        cur = await HandledPromise.get(cur, /** @type {any} */ (seg));
      }
      if (path.length === 0) {
        return HandledPromise.applyFunction(cur, evaluatedArgs);
      }
      const method = path[path.length - 1];
      return HandledPromise.applyMethod(
        cur,
        /** @type {any} */ (method),
        evaluatedArgs,
      );
    }
    // Literal: a primitive or a captured value already inline.
    return expr;
  };

  // Apply every instruction; non-last results go into variables.
  for (let i = 0; i < instructions.length - 1; i += 1) {
    variables.push(await evaluate(instructions[i]));
  }
  return evaluate(instructions[instructions.length - 1]);
};

harden(recordRemap);
harden(replayRemap);
