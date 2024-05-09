import test from 'ava';
import '../index.js';

test('endowments own properties are mentionable', t => {
  t.plan(1);

  const endowments = { hello: 'World!' };
  const modules = {};
  const compartment = new Compartment(endowments, modules);

  const whom = compartment.evaluate('hello');
  t.is(whom, 'World!');
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

  t.throws(() => compartment.evaluate('hello'), {
    message: /hello is not defined/,
  });
});

test('endowments prototypically inherited properties are not enumerable', t => {
  t.plan(1);

  const endowments = { __proto__: { hello: 'World!' } };
  const modules = {};
  const compartment = new Compartment(endowments, modules);

  const keys = compartment.evaluate('Object.keys(globalThis)');
  t.deepEqual(keys, []);
});
