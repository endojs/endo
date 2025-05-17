import { getEnvironmentOption } from '@endo/env-options';
import { Fail, q } from '@endo/errors';

/**
 * A symbol is passable iff it is not a registered symbol. In the distributed
 * object semantics, two passable symbols are "equal" iff they have the same
 * `description`.
 *
 * @param {any} sym
 * @returns {boolean}
 */
export const isPassableSymbol = sym =>
  typeof sym === 'symbol' && Symbol.keyFor(sym) === undefined;
harden(isPassableSymbol);

export const assertPassableSymbol = sym =>
  isPassableSymbol(sym) ||
  Fail`Only unregistered symbols are passable: ${q(sym)}`;
harden(assertPassableSymbol);

/**
 * If `sym` is a passable symbol, return its `description`.
 * If `sym` is not a passable symbol, return `undefined`.
 *
 * @param {symbol} sym
 * @returns {string=}
 */
export const nameForPassableSymbol = sym =>
  isPassableSymbol(sym) ? sym.description : undefined;
harden(nameForPassableSymbol);

const symbolAsyncIteratorDescription = Symbol.asyncIterator.description;

export const specialCaseAsyncIteratorSymbol =
  getEnvironmentOption('PASS_STYLE_LEGACY_ASYNC_ITERATOR_SYMBOL', 'enabled', [
    'disabled',
  ]) === 'enabled';

/**
 * Return a *fresh* unregistered not-well-known symbol whose `description`
 * is `name`.
 *
 * Alternatively, to soften the transition from legacy,
 * if environment variable `PASS_STYLE_LEGACY_ASYNC_ITERATOR_SYMBOL`
 * is `'enabled'` (not the default) and the name is either `'@@asyncIterator'`
 * or the `description` string of `Symbol.asyncIterator`, then return
 * `Symbol.asyncIterator`.
 *
 * NOTE: In this PR we make `'enabled'` the default, so agoric-sdk testing
 * can switch between `#endo-branch: ` with this fork vs the "normal" fork
 * described above. When this is `'enabled'` then `Symbol.asyncIterator`
 * itself is still allowed as a method name.
 *
 * TODO Once we're on the other side of this transition, we will eventually
 * stop supporting this config switch.
 *
 * @param {string} name
 * @returns {symbol}
 */
export const passableSymbolForName = name =>
  specialCaseAsyncIteratorSymbol &&
  ['@@asyncIterator', symbolAsyncIteratorDescription].includes(name)
    ? Symbol.asyncIterator
    : Symbol(name);
harden(passableSymbolForName);

/**
 * An adapter to help transition to flip which symbols are passable.
 * See `ses-utils.js` in `@agoric/internal` at
 * https://github.com/Agoric/agoric-sdk/pull/11338
 *
 * @param {string} name
 * @returns {symbol}
 */
export const unpassableSymbolForName = name => Symbol.for(name);
