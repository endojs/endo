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

import { isForbiddenKey } from './path-keys.js';

const PLACEHOLDER = Symbol('capnweb.remap.placeholder');

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
  // For objects (typically stubs) and other non-trivial captures we
  // store them in `state.captures` and reference via negative subject.
  if (
    arg === null ||
    typeof arg === 'string' ||
    typeof arg === 'boolean' ||
    typeof arg === 'number'
  ) {
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
 * @param {(input: unknown) => unknown} mapper
 * @returns {{ propertyPath: (string | number)[], captures: unknown[], instructions: unknown[][] }}
 */
export const recordRemap = mapper => {
  /** @type {{ instructions: unknown[][], captures: unknown[] }} */
  const state = { instructions: [], captures: [] };
  const inputPlaceholder = makePlaceholder(state, 0, []);
  const result = mapper(inputPlaceholder);

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
  } else if (
    result === null ||
    typeof result === 'string' ||
    typeof result === 'boolean' ||
    typeof result === 'number'
  ) {
    // Atomic primitive: encode inline as the final instruction.
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
   * @param {unknown} expr
   */
  const evaluate = async expr => {
    if (Array.isArray(expr) && expr[0] === 'pipeline') {
      const subject = /** @type {number} */ (expr[1]);
      const path = /** @type {(string | number)[]} */ (expr[2] || []);
      const args = /** @type {unknown[] | undefined} */ (expr[3]);
      for (const seg of path) checkPathSegment(seg);
      let cur = await resolveSubject(subject);
      if (args === undefined) {
        // Pure get: walk the path.
        for (const seg of path) {
          cur = await cur;
          if (cur === null || cur === undefined) {
            throw new TypeError(`cannot read ${String(seg)} of ${cur}`);
          }
          cur = /** @type {any} */ (cur)[seg];
        }
        return cur;
      }
      // Call: walk all but the last segment, then invoke.
      const evaluatedArgs = await Promise.all(args.map(a => evaluate(a)));
      if (path.length === 0) {
        cur = await cur;
        if (typeof cur !== 'function') {
          throw new TypeError('cannot call non-function');
        }
        return /** @type {Function} */ (cur)(...evaluatedArgs);
      }
      for (const seg of path.slice(0, -1)) {
        cur = await cur;
        if (cur === null || cur === undefined) {
          throw new TypeError(`cannot read ${String(seg)} of ${cur}`);
        }
        cur = /** @type {any} */ (cur)[seg];
      }
      cur = await cur;
      const method = path[path.length - 1];
      const fn = /** @type {any} */ (cur)[method];
      if (typeof fn !== 'function') {
        throw new TypeError(`${String(method)} is not a function`);
      }
      return fn.apply(cur, evaluatedArgs);
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
