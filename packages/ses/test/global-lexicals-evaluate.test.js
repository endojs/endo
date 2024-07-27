import test from 'ava';
import '../index.js';

test('endowments own properties are mentionable', t => {
  t.plan(1);

  const globals = { hello: 'World!' };
  const compartment = new Compartment({
    globals,
    __options__: true,
  });

  const whom = compartment.evaluate('hello');
  t.is(whom, 'World!');
});

test('endowments own properties are enumerable', t => {
  t.plan(1);

  const globals = { hello: 'World!' };
  const compartment = new Compartment({
    globals,
    __options__: true,
  });

  const keys = compartment.evaluate('Object.keys(globalThis)');
  t.deepEqual(keys, ['hello']);
});

test('endowments prototypically inherited properties are not mentionable', t => {
  t.plan(1);

  const globals = { __proto__: { hello: 'World!' } };
  const compartment = new Compartment({
    globals,
    __options__: true,
  });

  t.throws(() => compartment.evaluate('hello'), {
    message: /hello is not defined/,
  });
});

test('endowments prototypically inherited properties are not enumerable', t => {
  t.plan(1);

  const globals = { __proto__: { hello: 'World!' } };
  const compartment = new Compartment({
    globals,
    __options__: true,
  });

  const keys = compartment.evaluate('Object.keys(globalThis)');
  t.deepEqual(keys, []);
});
