import test from '@endo/ses-ava/test.js';

import {
  isPassableSymbol,
  assertPassableSymbol,
  nameForPassableSymbol,
  passableSymbolForName,
} from '../src/symbol.js';

// --- isPassableSymbol ---

test('isPassableSymbol - registered symbols', t => {
  t.true(isPassableSymbol(Symbol.for('hello')));
  t.true(isPassableSymbol(Symbol.for('')));
});

test('isPassableSymbol - well-known symbols', t => {
  t.true(isPassableSymbol(Symbol.iterator));
  t.true(isPassableSymbol(Symbol.toStringTag));
  t.true(isPassableSymbol(Symbol.hasInstance));
});

test('isPassableSymbol - unique symbols are not passable', t => {
  t.false(isPassableSymbol(Symbol('unique')));
  t.false(isPassableSymbol(Symbol('no-description-intent')));
});

test('isPassableSymbol - non-symbols', t => {
  t.false(isPassableSymbol('string'));
  t.false(isPassableSymbol(42));
  t.false(isPassableSymbol(undefined));
});

// --- assertPassableSymbol ---

test('assertPassableSymbol - passes for registered', t => {
  t.notThrows(() => assertPassableSymbol(Symbol.for('ok')));
});

test('assertPassableSymbol - throws for unique', t => {
  t.throws(() => assertPassableSymbol(Symbol('bad')), {
    message: /Only registered symbols or well-known symbols are passable/,
  });
});

// --- nameForPassableSymbol ---

test('nameForPassableSymbol - registered symbol', t => {
  t.is(nameForPassableSymbol(Symbol.for('hello')), 'hello');
});

test('nameForPassableSymbol - well-known symbol', t => {
  t.is(nameForPassableSymbol(Symbol.iterator), '@@iterator');
  t.is(nameForPassableSymbol(Symbol.toStringTag), '@@toStringTag');
});

test('nameForPassableSymbol - registered symbol starting with @@', t => {
  // Hilbert Hotel encoding: @@ prefix gets doubled
  const sym = Symbol.for('@@iterator');
  t.is(nameForPassableSymbol(sym), '@@@@iterator');
});

test('nameForPassableSymbol - unique symbol returns undefined', t => {
  t.is(nameForPassableSymbol(Symbol('unique')), undefined);
});

// --- passableSymbolForName ---

test('passableSymbolForName - plain name', t => {
  t.is(passableSymbolForName('hello'), Symbol.for('hello'));
});

test('passableSymbolForName - well-known symbol by @@ prefix', t => {
  t.is(passableSymbolForName('@@iterator'), Symbol.iterator);
  t.is(passableSymbolForName('@@toStringTag'), Symbol.toStringTag);
});

test('passableSymbolForName - @@@@ prefix decodes to @@ registered symbol', t => {
  // @@@@foo → Symbol.for('@@foo')
  t.is(passableSymbolForName('@@@@foo'), Symbol.for('@@foo'));
  t.is(passableSymbolForName('@@@@iterator'), Symbol.for('@@iterator'));
});

test('passableSymbolForName - throws for unknown @@ name', t => {
  // @@notAWellKnownSymbol should throw
  t.throws(() => passableSymbolForName('@@notAWellKnownSymbol'), {
    message: /Reserved for well known symbol/,
  });
});

test('passableSymbolForName - throws for non-string', t => {
  t.throws(() => passableSymbolForName(/** @type {any} */ (42)), {
    message: /must be a string/,
  });
});

// --- round-trips ---

test('nameForPassableSymbol / passableSymbolForName round-trip', t => {
  // Registered symbol
  const reg = Symbol.for('test-round-trip');
  t.is(
    passableSymbolForName(/** @type {string} */ (nameForPassableSymbol(reg))),
    reg,
  );

  // Well-known symbol
  t.is(
    passableSymbolForName(
      /** @type {string} */ (nameForPassableSymbol(Symbol.iterator)),
    ),
    Symbol.iterator,
  );

  // Registered symbol with @@ prefix
  const atAt = Symbol.for('@@special');
  t.is(
    passableSymbolForName(/** @type {string} */ (nameForPassableSymbol(atAt))),
    atAt,
  );
});
