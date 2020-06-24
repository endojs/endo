/* global Compartment */
import test from 'tape';
import '../src/main.js';

test('endowments own properties are mentionable', t => {
  t.plan(1);

  const endowments = { hello: 'World!' };
  const modules = {};
  const compartment = new Compartment(endowments, modules);

  const whom = compartment.evaluate('hello');
  t.equal(whom, 'World!');
});

test('endowments own properties are enumerable', t => {
  t.plan(1);

  const endowments = { hello: 'World!' };
  const modules = {};
  const compartment = new Compartment(endowments, modules);

  const keys = compartment.evaluate('Object.keys(globalThis)');
  t.deepEqual(keys, ['hello']);
});

test('endowments prototypically inherited properties are not mentionable', t => {
  t.plan(1);

  const endowments = { __proto__: { hello: 'World!' } };
  const modules = {};
  const compartment = new Compartment(endowments, modules);

  t.throws(() => compartment.evaluate('hello'), /hello is not defined/);
});

test('endowments prototypically inherited properties are not enumerable', t => {
  t.plan(1);

  const endowments = { __proto__: { hello: 'World!' } };
  const modules = {};
  const compartment = new Compartment(endowments, modules);

  const keys = compartment.evaluate('Object.keys(globalThis)');
  t.deepEqual(keys, []);
});

test('global lexicals are mentionable', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  const whom = compartment.evaluate('hello');
  t.equal(whom, 'World!');
});

test('global lexicals are not reachable from global object', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  const keys = compartment.evaluate('Object.keys(globalThis)');
  t.deepEqual(keys, []);
});

test('global lexicals prototypically inherited properties are not mentionable', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { __proto__: { hello: 'World!' } };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  t.throws(() => compartment.evaluate('hello'), /hello is not defined/);
});

test('global lexicals prototypically inherited properties are not enumerable', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { __proto__: { hello: 'World!' } };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  const keys = compartment.evaluate('Object.keys(globalThis)');
  t.deepEqual(keys, []);
});

test('global lexicals overshadow global object', t => {
  t.plan(1);

  const endowments = { hello: 'Your name here' };
  const modules = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  const whom = compartment.evaluate('hello');
  t.equal(whom, 'World!');
});

test('global lexicals are constant', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  t.throws(
    () => compartment.evaluate('hello = "Dave."'),
    /Assignment to constant/,
  );
});

test('global lexicals are captured on construction', t => {
  t.plan(1);

  const endowments = {};
  const modules = {};
  const globalLexicals = { hello: 'World!' };
  const compartment = new Compartment(endowments, modules, { globalLexicals });

  // Psych!
  globalLexicals.hello = 'Something else';

  const whom = compartment.evaluate('hello');
  t.equal(whom, 'World!');
});
