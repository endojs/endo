import test from 'tape';
import { createUnsafeRec, getUnsafeGlobal } from '../../src/unsafeRec';

test('createUnsafeRec - unsafeRec', t => {
  t.plan(8);

  const unsafeRec = createUnsafeRec();
  const {
    unsafeGlobal,
    unsafeEval,
    unsafeFunction,
    sharedGlobalDescs
  } = unsafeRec;

  t.ok(Object.isFrozen(unsafeRec));

  t.ok(unsafeGlobal instanceof unsafeGlobal.Object, 'global must be an Object');
  t.ok(unsafeGlobal instanceof Object, 'must be Object in this realm');

  t.equal(unsafeEval, unsafeGlobal.eval);
  t.equal(unsafeFunction, unsafeGlobal.Function);

  // todo: more thorough test of descriptors.
  t.deepEqual(sharedGlobalDescs.Object, {
    value: unsafeGlobal.Object,
    configurable: false,
    enumerable: false,
    writable: false
  });

  t.ok(sharedGlobalDescs.eval === undefined);
  t.ok(sharedGlobalDescs.Function === undefined);
});

test('getUnsafeGlobal', t => {
  t.plan(6);

  const unsafeGlobal = getUnsafeGlobal();

  t.ok(unsafeGlobal instanceof unsafeGlobal.Object, 'global must be an Object');
  t.ok(unsafeGlobal instanceof Object, 'must be Object in this realm');

  t.ok(
    unsafeGlobal.eval instanceof unsafeGlobal.Function,
    'must provide eval() function'
  );
  t.ok(
    unsafeGlobal.eval instanceof Function,
    'eval() must be Function in this realm'
  );

  t.ok(
    unsafeGlobal.Function instanceof unsafeGlobal.Function,
    'must provide Function() function'
  );
  t.ok(
    unsafeGlobal.Function instanceof Function,
    'Function() must be Function in this realm'
  );
});
