// `.map()` record-replay support.
//
// On the SENDER side, recordRemap invokes the user's mapper callback once
// with a placeholder proxy.  Each property access / method call on the proxy
// appends an instruction to a list; the proxy returned from each operation
// references the result of that instruction.  The user's return value,
// translated to a reference index, is the recording's "answer".
//
// On the RECEIVER side, replayRemap walks the instruction list per input,
// applying each operation to a small register file (input, captures,
// previous results) and returning the value of the indicated answer.
//
// Reference index conventions (per the protocol):
//    0  -> the input value
//   -1, -2, ...  -> captures[0], captures[1], ...
//   +1, +2, ...  -> result of instruction 1, 2, ...

import harden from '@endo/harden';

/**
 * Internal: a placeholder proxy returned from the recorder.  Each operation
 * appends to the shared instruction list and returns a fresh placeholder
 * pointing at the next instruction's result index.
 */
const PLACEHOLDER = Symbol('capnweb.remapPlaceholder');

/**
 * Encode an argument to an instruction.  Placeholders become reference
 * indices; non-placeholder values are stored as captures and referenced by
 * negative index.
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
    return ['ref', /** @type {any} */ (arg)[PLACEHOLDER]];
  }
  state.captures.push(arg);
  return ['ref', -state.captures.length];
};

/**
 * @param {{ instructions: unknown[][], captures: unknown[], answerRef: { value: number } }} state
 * @param {number} ref
 * @returns {any}
 */
const makePlaceholder = (state, ref) => {
  const fn = (...args) => {
    // Calling the placeholder = a function call.
    state.instructions.push([
      'call',
      ref,
      [],
      args.map(a => encodeArg(state, a)),
    ]);
    state.answerRef.value = state.instructions.length;
    return makePlaceholder(state, state.instructions.length);
  };
  return new Proxy(fn, {
    get(_t, prop) {
      if (prop === PLACEHOLDER) return ref;
      if (prop === 'then') return undefined; // not a thenable
      // Property access: emit a "get" instruction.
      state.instructions.push(['get', ref, [prop]]);
      state.answerRef.value = state.instructions.length;
      return makePlaceholder(state, state.instructions.length);
    },
    apply(_t, _thisArg, args) {
      state.instructions.push([
        'call',
        ref,
        [],
        args.map(a => encodeArg(state, a)),
      ]);
      state.answerRef.value = state.instructions.length;
      return makePlaceholder(state, state.instructions.length);
    },
  });
};

/**
 * Record a mapper callback into a remap recording.
 *
 * @param {(input: unknown) => unknown} mapper
 * @returns {{ instructions: unknown[][], captures: unknown[], answerRef: number }}
 */
export const recordRemap = mapper => {
  /** @type {{ instructions: unknown[][], captures: unknown[], answerRef: { value: number } }} */
  const state = {
    instructions: [],
    captures: [],
    answerRef: { value: 0 },
  };
  const inputPlaceholder = makePlaceholder(state, 0);
  const result = mapper(inputPlaceholder);
  // If the user returned the input directly, the answerRef is still 0;
  // if they returned a placeholder, it's been updated.
  if (
    result !== null &&
    (typeof result === 'object' || typeof result === 'function') &&
    /** @type {any} */ (result)[PLACEHOLDER] !== undefined
  ) {
    state.answerRef.value = /** @type {any} */ (result)[PLACEHOLDER];
  } else if (result !== inputPlaceholder) {
    // User returned a literal (e.g. a number).  Append a "literal" instr.
    state.captures.push(result);
    state.instructions.push(['literal', -state.captures.length]);
    state.answerRef.value = state.instructions.length;
  }
  return harden({
    instructions: state.instructions.map(i => harden(i.slice())),
    captures: state.captures.slice(),
    answerRef: state.answerRef.value,
  });
};

/**
 * Replay a recording against a given input.  Awaits at each step so that
 * pipelining over remote stubs works.
 *
 * @param {{ instructions: readonly unknown[][], captures: readonly unknown[], answerRef: number }} recording
 * @param {unknown} input
 * @returns {Promise<unknown>}
 */
/* eslint-disable no-await-in-loop -- the interpreter is sequential by design */
export const replayRemap = async (recording, input) => {
  const { instructions, captures, answerRef } = recording;
  const results = new Array(instructions.length + 1);
  results[0] = await input;

  /** @param {unknown} encoded */
  const resolveRef = encoded => {
    if (Array.isArray(encoded) && encoded[0] === 'ref') {
      const ref = /** @type {number} */ (encoded[1]);
      if (ref === 0) return results[0];
      if (ref < 0) return captures[-ref - 1];
      return results[ref];
    }
    return encoded;
  };

  for (let i = 0; i < instructions.length; i += 1) {
    const instr = instructions[i];
    const op = instr[0];
    if (op === 'literal') {
      const ref = /** @type {number} */ (instr[1]);
      results[i + 1] = captures[-ref - 1];
    } else if (op === 'get') {
      const target = await resolveRef(['ref', instr[1]]);
      const path = /** @type {PropertyKey[]} */ (instr[2]);
      let cur = target;
      for (const seg of path) {
        cur = await cur;
        if (cur === null || cur === undefined) {
          throw new TypeError(`cannot read ${String(seg)} of ${cur}`);
        }
        cur = /** @type {any} */ (cur)[seg];
      }
      results[i + 1] = cur;
    } else if (op === 'call') {
      const target = await resolveRef(['ref', instr[1]]);
      const path = /** @type {PropertyKey[]} */ (instr[2]);
      const argEncs = /** @type {unknown[]} */ (instr[3]);
      const args = await Promise.all(argEncs.map(a => resolveRef(a)));
      let cur = target;
      if (path.length === 0) {
        cur = await cur;
        if (typeof cur !== 'function') {
          throw new TypeError('cannot call non-function');
        }
        results[i + 1] = await /** @type {Function} */ (cur)(...args);
      } else {
        for (const seg of path.slice(0, -1)) {
          cur = await cur;
          cur = /** @type {any} */ (cur)[seg];
        }
        cur = await cur;
        const method = path[path.length - 1];
        const fn = /** @type {any} */ (cur)[method];
        if (typeof fn !== 'function') {
          throw new TypeError(`${String(method)} is not a function`);
        }
        results[i + 1] = await fn.apply(cur, args);
      }
    } else {
      throw new TypeError(`unknown remap op: ${String(op)}`);
    }
  }
  if (answerRef === 0) return results[0];
  if (answerRef < 0) return captures[-answerRef - 1];
  return results[answerRef];
};

harden(recordRemap);
harden(replayRemap);
