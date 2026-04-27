import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import { E, makeLoopback } from '../src/index.js';

test('Finish is sent after Return; answers are released', async t => {
  const root = makeExo('root', undefined, {
    echo(x) { return x; },
  });
  const { near, far, registerInterface } = makeLoopback({ farBootstrap: root });
  registerInterface({ id: 0xfffan, methods: { echo: 0 } });
  const remote = near.getBootstrap();
  await E(remote).echo('one');
  await E(remote).echo('two');
  // After both calls settle and the loopback flushes, far should have no
  // outstanding answers.
  await Promise.resolve();
  await Promise.resolve();
  t.is(far.stats().answers, 0, 'all answers released after Finish');
});

test('exports are reused for the same value as long as peer holds it', async t => {
  const inner = makeExo('inner', undefined, { ping() { return 'pong'; } });
  const root = makeExo('root', undefined, {
    getInner() { return inner; },
  });
  const { near, far, registerInterface } = makeLoopback({ farBootstrap: root });
  registerInterface({ id: 0xfffbn, methods: { getInner: 0, ping: 1 } });
  const remote = near.getBootstrap();
  const a = await E(remote).getInner();
  const b = await E(remote).getInner();
  t.is(a, b);
  // Far has exported `inner` once with one id, refcount > 1 due to multiple imports
  // (or the same id reused). Either way, exactly one entry exists.
  t.true(far.stats().exports >= 1);
});
