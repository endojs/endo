import '../index.js';
import './lockdown-safe.js';
import { ModuleSource } from '@endo/module-source';
// Placing the ava import last demonstrates that ava itself is compatible with SES
import test from 'ava';

test('transforms apply to evaluated expressions', t => {
  t.plan(1);

  const transform = source => source.replace(/Farewell/g, 'Hello');
  const transforms = [transform];
  const c = new Compartment({ transforms, __options__: true });
  const greeting = c.evaluate('"Farewell, World!"');

  t.is(greeting, 'Hello, World!');
});

test('transforms apply to dynamic eval in compartments', t => {
  t.plan(1);

  const transform = source => source.replace(/Farewell/g, 'Hello');
  const transforms = [transform];
  const c = new Compartment({
    transforms,
    globals: {
      greeting: '"Farewell, World!"',
    },
    __options__: true,
  });
  const greeting = c.evaluate('(0, eval)(greeting)');

  t.is(greeting, 'Hello, World!');
});

test('transforms do not apply to dynamic eval in compartments within compartments', t => {
  t.plan(1);

  const transform = source => source.replace(/Farewell/g, 'Hello');
  const transforms = [transform];
  const c = new Compartment({ transforms, __options__: true });
  const d = c.evaluate('new Compartment()');
  const greeting = d.evaluate('"Farewell, World!"');

  t.is(greeting, 'Farewell, World!');
});

test('transforms do not apply to imported modules', async t => {
  t.plan(1);

  const transform = source => source.replace(/Farewell/g, 'Hello');
  const transforms = [transform];
  const resolveHook = () => '';
  const importHook = () =>
    new ModuleSource('export default "Farewell, World!";');
  const c = new Compartment({
    transforms,
    resolveHook,
    importHook,
    __noNamespaceBox__: true,
    __options__: true,
  });

  const namespace = await c.import('any-string-here');
  const { default: greeting } = namespace;

  t.is(greeting, 'Farewell, World!');
});

test('__shimTransforms__ apply to evaluated expressions', t => {
  t.plan(1);

  const transform = source => source.replace(/Farewell/g, 'Hello');
  const transforms = [transform];
  const c = new Compartment({
    __shimTransforms__: transforms,
    __options__: true,
  });
  const greeting = c.evaluate('"Farewell, World!"');

  t.is(greeting, 'Hello, World!');
});

test('__shimTransforms__ do apply to imported modules', async t => {
  t.plan(1);

  const transform = source => source.replace(/Farewell/g, 'Hello');
  const transforms = [transform];
  const resolveHook = () => '';
  const importHook = () =>
    new ModuleSource('export default "Farewell, World!";');
  const c = new Compartment({
    __shimTransforms__: transforms,
    __noNamespaceBox__: true,
    __options__: true,
    resolveHook,
    importHook,
  });

  const namespace = await c.import('any-string-here');
  const { default: greeting } = namespace;

  t.is(greeting, 'Hello, World!');
});
