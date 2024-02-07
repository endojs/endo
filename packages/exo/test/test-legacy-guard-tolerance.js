// @ts-check
// eslint-disable-next-line import/order
import { test } from './prepare-test-env-ava.js';

import { passStyleOf } from '@endo/pass-style';
import {
  M,
  getAwaitArgGuardPayload,
  getInterfaceGuardPayload,
  getMethodGuardPayload,
} from '@endo/patterns';
import {
  makeLegacyAwaitArgGuard,
  makeLegacyMethodGuard,
  makeLegacyInterfaceGuard,
} from './make-legacy-guards.js';
import { makeExo } from '../src/exo-makers.js';

test('legacy guard tolerance', async t => {
  const aag = M.await(88);
  const laag = makeLegacyAwaitArgGuard({
    argGuard: 88,
  });
  const mg1 = M.callWhen(77, aag).returns(M.any());
  const mg2 = M.callWhen(77, laag).returns(M.any());
  const lmg = makeLegacyMethodGuard({
    callKind: 'async',
    argGuards: [77, laag],
    returnGuard: M.any(),
  });
  const ig1 = M.interface('Foo', {
    mg1,
    mg2,
  });
  const lig = makeLegacyInterfaceGuard({
    interfaceName: 'Foo',
    methodGuards: {
      mg1,
      mg2,
      // @ts-expect-error Legacy adaptor can be ill typed
      lmg,
    },
  });
  t.is(passStyleOf(laag), 'copyRecord');
  t.is(passStyleOf(lmg), 'copyRecord');
  t.is(passStyleOf(lig), 'copyRecord');

  t.deepEqual(getAwaitArgGuardPayload(aag), {
    argGuard: 88,
  });
  // @ts-expect-error Legacy adaptor can be ill typed
  t.throws(() => getAwaitArgGuardPayload(laag), {
    message:
      'awaitArgGuard: copyRecord {"argGuard":88,"klass":"awaitArg"} - Must be a guard:awaitArgGuard',
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
    argGuards: [77, laag],
    optionalArgGuards: undefined,
    restArgGuard: undefined,
    returnGuard: M.any(),
  });
  // @ts-expect-error Legacy adaptor can be ill typed
  t.throws(() => getMethodGuardPayload(lmg), {
    message:
      'methodGuard: copyRecord {"argGuards":[77,{"argGuard":88,"klass":"awaitArg"}],"callKind":"async","klass":"methodGuard","returnGuard":"[match:any]"} - Must be a guard:methodGuard',
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
        'interfaceGuard: guard:interfaceGuard: methodGuards: lmg: [1]: copyRecord {"argGuards":[77,{"argGuard":88,"klass":"awaitArg"}],"callKind":"async","klass":"methodGuard","returnGuard":"[match:any]"} - Must be a guard:methodGuard',
    },
  );
  // @ts-expect-error Legacy adaptor can be ill typed
  t.throws(() => getInterfaceGuardPayload(lig), {
    message:
      'interfaceGuard: copyRecord {"interfaceName":"Foo","klass":"Interface","methodGuards":{"lmg":{"argGuards":[77,{"argGuard":88,"klass":"awaitArg"}],"callKind":"async","klass":"methodGuard","returnGuard":"[match:any]"},"mg1":"[guard:methodGuard]","mg2":"[guard:methodGuard]"}} - Must be a guard:interfaceGuard',
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

  t.throws(
    () =>
      makeExo(
        'foo',
        // @ts-expect-error Legacy adaptor can be ill typed
        lig,
        {
          mg1: meth,
          mg2: meth,
        },
      ),
    {
      message:
        'interfaceGuard: copyRecord {"interfaceName":"Foo","klass":"Interface","methodGuards":{"lmg":{"argGuards":[77,{"argGuard":88,"klass":"awaitArg"}],"callKind":"async","klass":"methodGuard","returnGuard":"[match:any]"},"mg1":"[guard:methodGuard]","mg2":"[guard:methodGuard]"}} - Must be a guard:interfaceGuard',
    },
  );
});
