// @ts-check
import test from '@endo/ses-ava/prepare-endo.js';

import { passStyleOf } from '@endo/pass-style';
import {
  M,
  getAwaitArgGuardPayload,
  getInterfaceGuardPayload,
  getMethodGuardPayload,
  oldM,
} from '@endo/patterns';
import { makeExo } from '../src/exo-makers.js';

// Tests the legacy guard makes in `oldM`
// tests that the `get*Payload` methods work with mixtures of
// legacy and current guards.
test('legacy guard making and tolerance', async t => {
  await null;
  const aag = M.await(88);
  const laag = oldM.await(88);
  const mg1 = M.callWhen(77, aag).returns(M.any());
  const mg2 = M.callWhen(77, laag).returns(M.any());
  const lmg = oldM.callWhen(77, laag).returns(M.any());
  const ig1 = M.interface('Foo', {
    mg1,
    mg2,
  });
  const lig = oldM.interface('Foo', {
    mg1,
    mg2,
    lmg,
  });
  t.is(passStyleOf(laag), 'copyRecord');
  t.is(passStyleOf(lmg), 'copyRecord');
  t.is(passStyleOf(lig), 'copyRecord');

  t.deepEqual(getAwaitArgGuardPayload(aag), {
    argGuard: 88,
  });
  // @ts-expect-error Legacy adaptor can be ill typed
  t.deepEqual(getAwaitArgGuardPayload(laag), {
    argGuard: 88,
  });

  t.deepEqual(getMethodGuardPayload(mg1), {
    callKind: 'async',
    argGuards: [77, aag],
    optionalArgGuards: undefined,
    restArgGuard: undefined,
    returnGuard: M.any(),
  });
  t.deepEqual(getMethodGuardPayload(mg2), {
    callKind: 'async',
    argGuards: [77, laag], // Hazard: Not converted by getMethodGuardPayload
    optionalArgGuards: undefined,
    restArgGuard: undefined,
    returnGuard: M.any(),
  });
  t.deepEqual(lmg, {
    klass: 'methodGuard',
    callKind: 'async',
    argGuards: [77, laag],
    optionalArgGuards: undefined,
    restArgGuard: undefined,
    returnGuard: M.any(),
  });
  // @ts-expect-error Legacy adaptor can be ill typed
  t.deepEqual(getMethodGuardPayload(lmg), {
    callKind: 'async',
    argGuards: [77, aag], // converted by getMethodGuardPayload
    optionalArgGuards: undefined,
    restArgGuard: undefined,
    returnGuard: M.any(),
  });

  t.deepEqual(getInterfaceGuardPayload(ig1), {
    interfaceName: 'Foo',
    methodGuards: {
      mg1,
      mg2,
    },
    defaultGuards: undefined,
  });
  // would have been ig2 if it could be made
  t.throws(
    () =>
      M.interface('Foo', {
        mg1,
        mg2,
        // @ts-expect-error Legacy adaptor can be ill typed
        lmg,
      }),
    {
      message:
        'interfaceGuard: guard:interfaceGuard: methodGuards: lmg: [1]: copyRecord {"argGuards":[77,{"argGuard":88,"klass":"awaitArg"}],"callKind":"async","klass":"methodGuard","optionalArgGuards":"[undefined]","restArgGuard":"[undefined]","returnGuard":"[match:any]"} - Must be a guard:methodGuard',
    },
  );
  t.deepEqual(lig, {
    klass: 'Interface',
    interfaceName: 'Foo',
    methodGuards: {
      mg1,
      mg2,
      lmg,
    },
    sloppy: false,
  });
  // @ts-expect-error Legacy adaptor can be ill typed
  t.deepEqual(getInterfaceGuardPayload(lig), {
    interfaceName: 'Foo',
    methodGuards: {
      mg1,
      mg2,
      lmg: M.callWhen(77, M.await(88)) // converted by getInterfaceGuardPayload
        .optional()
        .rest(M.any())
        .returns(M.any()),
    },
    sloppy: false,
  });

  const { meth } = {
    meth: (x, y) => [x, y],
  };

  const f1 = makeExo('foo', ig1, {
    mg1: meth,
    mg2: meth,
  });
  t.deepEqual(await f1.mg1(77, 88), [77, 88]);
  await t.throwsAsync(async () => f1.mg1(77, laag), {
    message:
      'In "mg1" method of (foo): arg 1: {"argGuard":88,"klass":"awaitArg"} - Must be: 88',
  });
  await t.throwsAsync(async () => f1.mg2(77, 88), {
    message:
      'In "mg2" method of (foo): arg 1: 88 - Must be: {"argGuard":88,"klass":"awaitArg"}',
  });
  t.deepEqual(await f1.mg2(77, laag), [77, laag]);

  const f2 = makeExo(
    'foo',
    // @ts-expect-error Legacy adaptor can be ill typed
    lig,
    {
      mg1: meth,
      mg2: meth,
      lmg: meth,
    },
  );
  t.deepEqual(await f2.mg1(77, 88), [77, 88]);
  await t.throwsAsync(async () => f2.mg1(77, laag), {
    message:
      'In "mg1" method of (foo): arg 1: {"argGuard":88,"klass":"awaitArg"} - Must be: 88',
  });
  await t.throwsAsync(async () => f2.mg2(77, 88), {
    message:
      'In "mg2" method of (foo): arg 1: 88 - Must be: {"argGuard":88,"klass":"awaitArg"}',
  });
  t.deepEqual(await f2.mg2(77, laag), [77, laag]);
  t.deepEqual(await f2.lmg(77, 88), [77, 88]);
  await t.throwsAsync(async () => f2.lmg(77, laag), {
    message:
      'In "lmg" method of (foo): arg 1: {"argGuard":88,"klass":"awaitArg"} - Must be: 88',
  });
});
