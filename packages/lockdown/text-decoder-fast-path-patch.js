// @ts-nocheck
/* global globalThis */

// Node.js stores private "fast path" flags on each `TextDecoder` instance as
// own data properties keyed by symbols such as `Symbol(kUTF8FastPath)` and
// `Symbol(kWindows1252FastPath)`. The `decode()` method mutates these flags via
// a logical-and-assignment of the form
//
//   this[kUTF8FastPath] &&= !options?.stream;
//
// Once a `TextDecoder` instance is hardened the own data properties become
// non-writable, so any subsequent `decode()` call that would re-assign one of
// the flags throws a TypeError. The bug surfaces for any encoding whose initial
// fast-path flag is `true` (e.g. `'utf-8'`, `'ascii'`, `'latin1'`,
// `'iso-8859-1'`, `'windows-1252'`).
//
// See https://github.com/endojs/endo/issues/2813 and
// https://github.com/nodejs/node/pull/55275.
//
// Mitigation: replace the per-instance own data properties with accessors
// defined on `TextDecoder.prototype`, backed by a `WeakMap`. The `decode()`
// implementation can then read and write these flags freely even when the
// instance is frozen. Because Node only ever toggles the flags from `true` to
// `false` (a logical AND can never re-enable a falsy flag), the setter only
// honors writes that lower the flag. This preserves Node's observable
// semantics and limits the patched accessor to a single one-way bit per
// instance — the same observability already available on an unhardened
// instance — so it does not introduce a new covert channel between holders of
// the same `TextDecoder`.
export const patchTextDecoderFastPath = () => {
  const NativeTextDecoder = globalThis.TextDecoder;
  if (typeof NativeTextDecoder !== 'function') {
    return;
  }

  let probe;
  try {
    probe = new NativeTextDecoder();
  } catch (_err) {
    return;
  }

  const ownSymbols = Object.getOwnPropertySymbols(probe);
  const fastPathSymbols = ownSymbols.filter(sym => {
    const { description } = sym;
    return (
      typeof description === 'string' &&
      description.startsWith('k') &&
      description.endsWith('FastPath')
    );
  });

  if (fastPathSymbols.length === 0) {
    return;
  }

  const proto = NativeTextDecoder.prototype;

  // Bail out if `TextDecoder.prototype` is already frozen (e.g. an outer
  // lockdown has already run). In that case we cannot install accessors and
  // the original bug remains, but at least we do not throw.
  if (Object.isFrozen(proto)) {
    return;
  }

  // One state object per `TextDecoder` instance, keyed in a `WeakMap` so that
  // hardening the instance does not pin the state.
  const states = new WeakMap();

  const ensureState = instance => {
    let state = states.get(instance);
    if (state === undefined) {
      state = Object.create(null);
      states.set(instance, state);
    }
    return state;
  };

  for (const sym of fastPathSymbols) {
    const existing = Object.getOwnPropertyDescriptor(proto, sym);
    if (existing && !existing.configurable) {
      // Cannot install our accessor; skip this symbol.
      continue;
    }
    Object.defineProperty(proto, sym, {
      get() {
        const state = states.get(this);
        return state === undefined ? undefined : state[sym];
      },
      set(value) {
        // Node toggles the flag from `true` to `false` via `&&=`; it never
        // raises a falsy flag back to `true`. Honor only the lowering write
        // so the accessor is not usable as a multi-bit covert channel.
        if (value === false) {
          ensureState(this)[sym] = false;
        }
      },
      enumerable: false,
      configurable: true,
    });
  }

  // Wrap the constructor so freshly-constructed instances expose the flags via
  // the prototype accessors rather than as own data properties.
  function TextDecoder(...args) {
    if (new.target === undefined) {
      // Match the native class's "cannot be invoked without 'new'" behavior.
      // Delegating to `Reflect.construct(NativeTextDecoder, [])` would raise
      // the appropriate `TypeError`.
      Reflect.apply(NativeTextDecoder, undefined, args);
      // The line above is expected to throw; bail just in case it does not.
      throw TypeError(`Constructor TextDecoder requires 'new'`);
    }
    const decoder = Reflect.construct(NativeTextDecoder, args, new.target);
    const state = ensureState(decoder);
    for (const sym of fastPathSymbols) {
      const desc = Object.getOwnPropertyDescriptor(decoder, sym);
      if (desc && 'value' in desc && desc.configurable) {
        state[sym] = desc.value;
        delete decoder[sym];
      }
    }
    return decoder;
  }

  Object.defineProperty(TextDecoder, 'prototype', {
    value: proto,
    writable: false,
    enumerable: false,
    configurable: false,
  });
  Object.defineProperty(TextDecoder, 'name', {
    value: NativeTextDecoder.name,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(TextDecoder, 'length', {
    value: NativeTextDecoder.length,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  Object.setPrototypeOf(TextDecoder, Object.getPrototypeOf(NativeTextDecoder));

  // Replace the prototype's `constructor` back-link so that
  // `instance.constructor === globalThis.TextDecoder`.
  const ctorDesc = Object.getOwnPropertyDescriptor(proto, 'constructor');
  if (ctorDesc && ctorDesc.configurable) {
    Object.defineProperty(proto, 'constructor', {
      value: TextDecoder,
      writable: ctorDesc.writable !== false,
      enumerable: ctorDesc.enumerable === true,
      configurable: true,
    });
  }

  globalThis.TextDecoder = TextDecoder;
};
