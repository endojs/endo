/* global Compartment */

import '../src/main.js';
import test from 'tape';
import { resolveNode, makeNodeImporter } from './node.js';

const makeCompartment = (endowments, globalLexicals) => {
  const makeImportHook = makeNodeImporter({
    'https://example.com/packages/example/main.js': `
      export const whom = hello;
      export const whomElse = hello;
      export const keys = Object.keys(globalThis);
      export const globalHello = globalThis.hello;
    `,
    'https://example.com/packages/example/immutability.js': `
      hello = 'Please throw';
    `,
  });
  const compartment = new Compartment(
    endowments,
    /* modules: */ {},
    {
      resolveHook: resolveNode,
      importHook: makeImportHook('https://example.com/packages/example'),
      globalLexicals,
    },
  );
  return compartment;
};

test('endowments own properties are mentionable', async t => {
  t.plan(1);

  const endowments = { hello: 'World!' };
  const compartment = makeCompartment(endowments);

  const { namespace } = await compartment.import('./main.js');
  const { whom } = namespace;
  t.equal(whom, 'World!');
});

test('endowments own properties are enumerable', async t => {
  t.plan(1);

  const endowments = { hello: 'World!' };
  const compartment = makeCompartment(endowments);

  const { namespace } = await compartment.import('./main.js');
  const { keys } = namespace;
  t.deepEqual(keys, ['hello']);
});

test('endowments prototypically inherited properties are not mentionable', async t => {
  t.plan(1);

  const endowments = { __proto__: { hello: 'World!' } };
  const compartment = makeCompartment(endowments);

  try {
    await compartment.import('./main.js');
  } catch (error) {
    t.ok(true);
  }
});

test('endowments prototypically inherited properties are not enumerable', async t => {
  t.plan(1);

  const endowments = {
    __proto__: { bye: 'Friend!' },
    hello: 'World!',
  };
  const compartment = makeCompartment(endowments);

  const { namespace } = await compartment.import('./main.js');
  const { keys } = namespace;
  t.deepEqual(keys, ['hello']);
});

test('global lexicals are mentionable', async t => {
  t.plan(1);

  const endowments = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { whom } = namespace;
  t.equal(whom, 'World!');
});

test('global lexicals are not enumerable from global object', async t => {
  t.plan(1);

  const endowments = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { keys } = namespace;
  t.deepEqual(keys, []);
});

test('global lexicals are not reachable from global object', async t => {
  t.plan(1);

  const endowments = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { globalHello } = namespace;
  t.equal(globalHello, undefined);
});

test('global lexicals prototypically inherited properties are not reachable from global object', async t => {
  t.plan(1);

  const endowments = { hello: 'World!' };
  const globalLexicals = { __proto__: { hello: 'Other World!' } };
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { globalHello } = namespace;
  t.equal(globalHello, 'World!');
});

test('global lexicals prototypically inherited properties are not enumerable', async t => {
  t.plan(1);

  const endowments = {};
  const globalLexicals = {
    __proto__: {
      bye: 'So long and thanks for all the fish',
    },
    hello: 'World!',
  };
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { keys } = namespace;
  t.deepEqual(keys, []);
});

test('global lexicals overshadow global object', async t => {
  t.plan(1);

  const endowments = { hello: 'Your name here' };
  const globalLexicals = { hello: 'World!' };
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { whom } = namespace;
  t.equal(whom, 'World!');
});

test('global lexicals are constant', async t => {
  t.plan(1);

  const endowments = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = makeCompartment(endowments, globalLexicals);

  try {
    await compartment.import('./immutability.js');
  } catch (error) {
    t.ok(true);
  }
});

test('global lexicals are captured on construction', async t => {
  t.plan(1);

  const endowments = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = makeCompartment(endowments, globalLexicals);

  // Psych!
  globalLexicals.hello = 'Something else';

  const { namespace } = await compartment.import('./main.js');
  const { whom } = namespace;
  t.equal(whom, 'World!');
});

test('global lexical accessors are sampled once up front', async t => {
  t.plan(2);

  let counter = 0;
  const globalLexicals = {
    get hello() {
      const result = counter;
      counter += 1;
      return result;
    },
  };

  const endowments = {};
  const compartment = makeCompartment(endowments, globalLexicals);

  const { namespace } = await compartment.import('./main.js');
  const { whom, whomElse } = namespace;
  t.equal(whom, 0);
  t.equal(whomElse, 0);
});
