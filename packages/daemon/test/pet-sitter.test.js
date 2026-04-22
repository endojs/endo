import test from '@endo/ses-ava/prepare-endo.js';

import { makePetSitter } from '../src/pet-sitter.js';

/** @typedef {import('../src/types.js').FormulaIdentifier} FormulaIdentifier */

const id = /** @param {string} s @returns {FormulaIdentifier} */ s =>
  /** @type {FormulaIdentifier} */ (s);

const makeMockController = () => {
  /** @type {Map<string, string>} */
  const entries = new Map();
  return {
    has: name => entries.has(name),
    identifyLocal: name => entries.get(name),
    list: () => harden([...entries.keys()].sort()),
    reverseIdentify: targetId =>
      harden(
        [...entries.entries()]
          .filter(([, v]) => v === targetId)
          .map(([k]) => k),
      ),
    async *followNameChanges() {
      yield* [];
    },
    async *followIdNameChanges(_id) {
      yield harden({ names: [] });
    },
    storeIdentifier: async () => {},
    storeLocator: async () => {},
    remove: async () => {},
    rename: async () => {},
    seedGcEdges: async () => {},
    testEntries: entries,
  };
};

test('has finds special names', t => {
  const ctrl = makeMockController();
  const sitter = makePetSitter(ctrl, { '@agent': id('agent:node') });
  t.true(sitter.has('@agent'));
  t.false(sitter.has('@missing'));
});

test('has delegates to controller for pet names', t => {
  const ctrl = makeMockController();
  ctrl.testEntries.set('myval', id('val:node'));
  const sitter = makePetSitter(ctrl, { '@agent': id('agent:node') });
  t.true(sitter.has('myval'));
  t.false(sitter.has('nope'));
});

test('identifyLocal resolves special names', t => {
  const ctrl = makeMockController();
  const sitter = makePetSitter(ctrl, {
    '@agent': id('agent:node'),
    '@self': id('self:node'),
  });
  t.is(sitter.identifyLocal('@agent'), id('agent:node'));
  t.is(sitter.identifyLocal('@self'), id('self:node'));
});

test('identifyLocal delegates pet names to controller', t => {
  const ctrl = makeMockController();
  ctrl.testEntries.set('foo', id('foo:node'));
  const sitter = makePetSitter(ctrl, { '@agent': id('agent:node') });
  t.is(sitter.identifyLocal('foo'), id('foo:node'));
});

test('identifyLocal throws for name with @ that is not a known special', t => {
  const ctrl = makeMockController();
  const sitter = makePetSitter(ctrl, { '@agent': id('agent:node') });
  // '@unknown' contains '@' so isPetName returns false, and it's not a known special.
  t.throws(() => sitter.identifyLocal('@unknown'), {
    message: /Invalid pet name/,
  });
});

test('list prepends sorted special names', t => {
  const ctrl = makeMockController();
  ctrl.testEntries.set('beta', id('b:node'));
  ctrl.testEntries.set('alpha', id('a:node'));
  const sitter = makePetSitter(ctrl, {
    '@self': id('self:node'),
    '@agent': id('agent:node'),
  });
  const names = sitter.list();
  // Special names sorted first, then controller names.
  t.is(names[0], '@agent');
  t.is(names[1], '@self');
  t.true(names.includes('alpha'));
  t.true(names.includes('beta'));
});

test('reverseIdentify includes special names', t => {
  const ctrl = makeMockController();
  ctrl.testEntries.set('myname', id('target:node'));
  const sitter = makePetSitter(ctrl, { '@agent': id('target:node') });
  const names = sitter.reverseIdentify(id('target:node'));
  t.true(names.includes('myname'));
  t.true(names.includes('@agent'));
});

test('reverseIdentify excludes non-matching special names', t => {
  const ctrl = makeMockController();
  const sitter = makePetSitter(ctrl, { '@agent': id('other:node') });
  const names = sitter.reverseIdentify(id('target:node'));
  t.false(names.includes('@agent'));
});
