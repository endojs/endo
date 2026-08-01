// @ts-nocheck
import test from '@endo/ses-ava/prepare-endo.js';

import { E } from '@endo/eventual-send';

import {
  endowCompartment,
  makeXsWorkerFacet,
  standardEndowments,
} from '../src/bus-worker-xs-facet.js';
import { WorkerFacetForDaemonInterface } from '../src/worker-facet-interface.js';
import { WorkerFacetForDaemonInterface as fromInterfaces } from '../src/interfaces.js';

const neverSettles = () => new Promise(() => {});

const makeFacet = () => {
  const terminations = [];
  const facet = makeXsWorkerFacet({
    markShouldTerminate: () => terminations.push(true),
  });
  return { facet, terminations };
};

test('the worker-facet interface guard has exactly one definition', t => {
  // The XS worker used to carry a hand-copy of this guard, free to
  // drift from the Node worker's.  Identity, not deep equality, is
  // the assertion: they must be the same object.
  t.is(WorkerFacetForDaemonInterface, fromInterfaces);
});

test('terminate raises the flag the Rust main loop polls', async t => {
  const { facet, terminations } = makeFacet();
  await E(facet).terminate();
  t.deepEqual(terminations, [true]);
});

test('evaluate returns the compartment result', async t => {
  const { facet } = makeFacet();
  t.is(await E(facet).evaluate('1 + 1', [], [], 'id-1', neverSettles()), 2);
});

test('evaluate exposes $id and $cancelled', async t => {
  const { facet } = makeFacet();
  t.is(await E(facet).evaluate('$id', [], [], 'id-2', neverSettles()), 'id-2');
  t.is(
    await E(facet).evaluate(
      'typeof $cancelled.then',
      [],
      [],
      'id-2',
      neverSettles(),
    ),
    'function',
  );
});

test('evaluate exposes the standard endowments', async t => {
  const { facet } = makeFacet();
  t.is(
    await E(facet).evaluate('typeof M.string', [], [], 'id-3', neverSettles()),
    'function',
  );
  t.is(
    await E(facet).evaluate('typeof E', [], [], 'id-3', neverSettles()),
    'function',
  );
});

test('a named endowment shadows $id, as in the Node worker', async t => {
  // `./worker.js`'s evaluate spreads the caller's names last, so they
  // win.  The XS worker had the precedence inverted.
  const { facet } = makeFacet();
  t.is(
    await E(facet).evaluate(
      '$id',
      ['$id'],
      ['shadow'],
      'real-id',
      neverSettles(),
    ),
    'shadow',
  );
});

test('a named endowment shadows a standard endowment', async t => {
  const { facet } = makeFacet();
  t.is(
    await E(facet).evaluate(
      'M',
      ['M'],
      ['not-patterns'],
      'id-4',
      neverSettles(),
    ),
    'not-patterns',
  );
});

test('the unimplemented make* methods reject and name the gap', async t => {
  const { facet } = makeFacet();
  for (const [method, args] of [
    ['makeArchive', [null, null, null, {}]],
    ['makeFromTree', [null, null, null, {}]],
    ['makeUnconfined', ['./x.js', null, null, {}]],
  ]) {
    // eslint-disable-next-line no-await-in-loop
    const error = await t.throwsAsync(() => E(facet)[method](...args));
    t.true(error.message.startsWith(`${method} not yet implemented`));
    t.true(error.message.includes('designs/worker-rust-xs.md'));
  }
});

test('standardEndowments drops undefined values', t => {
  for (const [name, value] of Object.entries(standardEndowments)) {
    t.not(value, undefined, `${name} should not be endowed as undefined`);
  }
  t.true(Object.isFrozen(standardEndowments));
});

// endowCompartment, exercised against a Compartment that ignores its
// constructor argument, which is the XS-native shape.  The tests
// above run on SES's Compartment, where the constructor argument
// already did the work, so these are the only ones that reach the
// install loop's own behavior.

const makeXsShapedCompartment = () => ({ globalThis: {} });

test('endowCompartment installs globals an XS Compartment would not', t => {
  const compartment = makeXsShapedCompartment();
  endowCompartment(compartment, { alpha: 1, beta: 2 });
  t.is(compartment.globalThis.alpha, 1);
  t.is(compartment.globalThis.beta, 2);
});

test('endowCompartment does not treat inherited names as present', t => {
  const compartment = makeXsShapedCompartment();
  const original = compartment.globalThis.toString;
  endowCompartment(compartment, { toString: 'endowed' });
  t.not(compartment.globalThis.toString, original);
  t.is(compartment.globalThis.toString, 'endowed');
});

test('endowCompartment leaves an already-correct binding alone', t => {
  const value = { marker: true };
  const compartment = makeXsShapedCompartment();
  Object.defineProperty(compartment.globalThis, 'gamma', {
    value,
    writable: false,
    enumerable: false,
    configurable: false,
  });
  // Non-configurable, so a redefinition would throw; the same-value
  // fast path must skip it (this is the SES path, where the
  // constructor argument already installed the endowment).
  t.notThrows(() => endowCompartment(compartment, { gamma: value }));
  t.is(compartment.globalThis.gamma, value);
});

test('endowCompartment throws rather than silently substituting', t => {
  const compartment = makeXsShapedCompartment();
  Object.defineProperty(compartment.globalThis, 'delta', {
    value: 'the compartment global',
    writable: false,
    enumerable: false,
    configurable: false,
  });
  const error = t.throws(() =>
    endowCompartment(compartment, { delta: 'the caller endowment' }),
  );
  t.true(error.message.startsWith('Cannot endow delta'));
  // The old loop skipped instead, so guest code saw the compartment's
  // value under the caller's name with no diagnostic anywhere.
  t.is(compartment.globalThis.delta, 'the compartment global');
});
