/* global globalThis */

import '../index.js';
import './_lockdown-safe.js';
import test from 'ava';

const hasURL = typeof globalThis.URL === 'function';
const hasURLSearchParams = typeof globalThis.URLSearchParams === 'function';

test('URL is present on the start compartment when the host provides it', t => {
  if (!hasURL) {
    t.pass('host does not provide URL; nothing to permit');
    return;
  }
  t.is(typeof globalThis.URL, 'function');
  t.is(typeof globalThis.URL.prototype.toString, 'function');
  // The start compartment keeps the ambient blob-registry authority by
  // default (`urlBlobTaming: 'retain'`).
  t.true('createObjectURL' in globalThis.URL);
  t.true('revokeObjectURL' in globalThis.URL);
});

test('URLSearchParams is present on the start compartment when the host provides it', t => {
  if (!hasURLSearchParams) {
    t.pass('host does not provide URLSearchParams; nothing to permit');
    return;
  }
  t.is(typeof globalThis.URLSearchParams, 'function');
  t.is(typeof globalThis.URLSearchParams.prototype.get, 'function');
});

test('shared compartments receive a tamed URL without the blob methods', t => {
  if (!hasURL) {
    t.pass('host does not provide URL');
    return;
  }
  const c = new Compartment();
  t.is(c.evaluate('typeof URL'), 'function');
  // The shared binding is a distinct constructor from the powered start
  // compartment binding (the Date-style split), and it omits the ambient
  // blob-registry statics.
  t.not(c.globalThis.URL, globalThis.URL);
  t.false('createObjectURL' in c.globalThis.URL);
  t.false('revokeObjectURL' in c.globalThis.URL);
});

test('URLSearchParams is identity-equal across compartments (universal)', t => {
  if (!hasURLSearchParams) {
    t.pass('host does not provide URLSearchParams');
    return;
  }
  const c = new Compartment();
  t.is(c.evaluate('typeof URLSearchParams'), 'function');
  t.is(c.globalThis.URLSearchParams, globalThis.URLSearchParams);
  t.is(
    c.globalThis.URLSearchParams.prototype,
    globalThis.URLSearchParams.prototype,
  );
});

test('URL.prototype is shared between the start and shared compartments', t => {
  if (!hasURL) {
    t.pass('host does not provide URL');
    return;
  }
  // The %URL% and %SharedURL% constructors are distinct values but share one
  // prototype, so an instance constructed on either side is `instanceof URL`
  // on the other.
  const c = new Compartment();
  t.is(c.globalThis.URL.prototype, globalThis.URL.prototype);

  const startInstance = new URL('http://example.com/');
  t.true(c.evaluate('u => u instanceof URL')(startInstance));

  const sharedInstance = c.evaluate('new URL("http://example.com/")');
  t.true(sharedInstance instanceof URL);
});

test('URL.prototype.constructor points at the tamed URL, not the powered one', t => {
  if (!hasURL) {
    t.pass('host does not provide URL');
    return;
  }
  // The escape-closing invariant: `URL.prototype.constructor` must resolve to
  // the tamed `%SharedURL%` (no blob statics), never the powered `%URL%` the
  // start compartment may keep. Without the constructor re-point in
  // tame-url-constructor.js, a shared compartment would regain the ambient
  // blob-registry authority through `URL.prototype.constructor.createObjectURL`
  // even though its own `URL` binding omits it. This test reddens if that
  // re-point is dropped, mirroring how `%DatePrototype%.constructor` is pinned
  // to `%SharedDate%`.
  const c = new Compartment();
  const sharedURL = c.globalThis.URL;
  // The shared prototype's constructor is the shared (powerless) binding.
  t.is(c.globalThis.URL.prototype.constructor, sharedURL);
  t.is(globalThis.URL.prototype.constructor, sharedURL);
  // ...and is distinct from the powered start-compartment binding by default.
  t.not(sharedURL, globalThis.URL);
  // Reaching the constructor from an instance yields the blob-less binding.
  const ctorFromInstance = c.evaluate(
    'new URL("http://example.com/").constructor',
  );
  t.is(ctorFromInstance, sharedURL);
  t.false('createObjectURL' in ctorFromInstance);
  t.false('revokeObjectURL' in ctorFromInstance);
});

test('URL constructor and prototype are frozen', t => {
  if (!hasURL) {
    t.pass('host does not provide URL');
    return;
  }
  t.true(Object.isFrozen(globalThis.URL));
  t.true(Object.isFrozen(globalThis.URL.prototype));
});

test('URLSearchParams constructor and prototype are frozen', t => {
  if (!hasURLSearchParams) {
    t.pass('host does not provide URLSearchParams');
    return;
  }
  t.true(Object.isFrozen(globalThis.URLSearchParams));
  t.true(Object.isFrozen(globalThis.URLSearchParams.prototype));
});

test('the URLSearchParams iterator prototype is frozen', t => {
  if (!hasURLSearchParams) {
    t.pass('host does not provide URLSearchParams');
    return;
  }
  // The hidden %URLSearchParamsIteratorPrototype% is reachable only by
  // walking an instance. If the sampler failed to seed it, harden would not
  // reach it and this would be false.
  const iteratorPrototype = Object.getPrototypeOf(
    new URLSearchParams().entries(),
  );
  t.true(Object.isFrozen(iteratorPrototype));
});

test('all URLSearchParams iteration methods share one frozen iterator prototype', t => {
  if (!hasURLSearchParams) {
    t.pass('host does not provide URLSearchParams');
    return;
  }
  // The sampler in get-anonymous-intrinsics.js seeds the hidden iterator
  // prototype from `entries()` alone. The taming is only complete if
  // `keys()`, `values()`, and `[Symbol.iterator]()` share that same
  // prototype: were a host to hand any of them a distinct prototype, the
  // sampler would miss it and harden would leave it reachable-but-unfrozen (or
  // the whitelist would prune it), silently. Pin the shared identity so the
  // one-sample design stays sound.
  const usp = new URLSearchParams('a=1&b=2');
  const entriesProto = Object.getPrototypeOf(usp.entries());
  t.is(Object.getPrototypeOf(usp.keys()), entriesProto);
  t.is(Object.getPrototypeOf(usp.values()), entriesProto);
  t.is(Object.getPrototypeOf(usp[Symbol.iterator]()), entriesProto);
  t.true(Object.isFrozen(entriesProto));
});

test('the URLSearchParams iterator prototype rejects tampering', t => {
  if (!hasURLSearchParams) {
    t.pass('host does not provide URLSearchParams');
    return;
  }
  // A compartment that gets a single URLSearchParams must not be able to
  // mutate the shared iterator prototype and influence every other
  // compartment's iteration.
  const iteratorPrototype = Object.getPrototypeOf(
    new URLSearchParams().entries(),
  );
  t.throws(() => {
    iteratorPrototype.next = () => {};
  });
  // A second, independent iteration is unaffected.
  const c = new Compartment();
  t.deepEqual(c.evaluate('[...new URLSearchParams("a=1&b=2").keys()]'), [
    'a',
    'b',
  ]);
});

test('the URLSearchParams iterator carries the standard toStringTag', t => {
  if (!hasURLSearchParams) {
    t.pass('host does not provide URLSearchParams');
    return;
  }
  // The permit names `@@toStringTag` on the iterator prototype so the tag is
  // preserved rather than pruned to `'[object Object]'`.
  t.is(
    Object.prototype.toString.call(new URLSearchParams().entries()),
    '[object URLSearchParams Iterator]',
  );
});

test('round-trip URL parsing is preserved', t => {
  if (!hasURL) {
    t.pass('host does not provide URL');
    return;
  }
  // Guards against accidental over-pruning of the URL prototype accessors.
  const url = new URL('http://example.com/a?b=1#c');
  t.is(url.searchParams.get('b'), '1');
  t.is(url.pathname, '/a');
  t.is(url.hash, '#c');
  t.is(url.href, 'http://example.com/a?b=1#c');
});

test('the pure static parse helpers survive on the shared URL', t => {
  if (!hasURL || typeof globalThis.URL.parse !== 'function') {
    t.pass('host does not provide URL.parse');
    return;
  }
  const c = new Compartment();
  t.is(c.evaluate('URL.parse("http://example.com/").host'), 'example.com');
  t.is(c.evaluate('URL.parse("::not a url::")'), null);
  t.is(c.evaluate('URL.canParse("http://example.com/")'), true);
  t.is(c.evaluate('URL.canParse("::not a url::")'), false);
});

test('the shared URL is not callable without new', t => {
  if (!hasURL) {
    t.pass('host does not provide URL');
    return;
  }
  const c = new Compartment();
  t.throws(() => c.evaluate('URL("http://example.com/")'));
});

test('URLSearchParams built from an iterable stores only string copies', t => {
  if (!hasURLSearchParams) {
    t.pass('host does not provide URLSearchParams');
    return;
  }
  // The constructor accepts a sequence of [name, value] pairs. The host
  // implementation consumes the iterable strictly and stores only string
  // copies, so a caller-supplied iterable cannot smuggle live objects past
  // the tamed constructor. This is not a new attack surface, but the design
  // calls for exercising it.
  const source = /** @type {any} */ ([
    ['a', 1],
    ['b', { toString: () => '2' }],
  ]);
  const params = new URLSearchParams(source);
  t.is(params.get('a'), '1');
  t.is(params.get('b'), '2');
  t.is(typeof params.get('a'), 'string');
  t.is(typeof params.get('b'), 'string');
});
