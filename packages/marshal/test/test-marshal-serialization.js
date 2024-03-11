import { test } from '@endo/ses-ava/prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { makeMarshal } from '../src/marshal.js';

test('toCapData', t => {
  const m = makeMarshal();
  const o = harden({ a: 1 });

  // deprecated seralization API
  const usingSerializeMethod = m.serialize(o);

  const usingToCapDataMethod = m.toCapData(o);

  t.deepEqual(
    usingSerializeMethod,
    usingToCapDataMethod,
    'should create a serialized object that is deeply equal to value produced using makeMarshal().serialize',
  );

  const oo = harden([o, o]);

  const ooUsingSerializeMethod = m.serialize(oo);
  const ooUsingToCapDataMethod = m.toCapData(oo);
  t.deepEqual(
    ooUsingSerializeMethod,
    ooUsingToCapDataMethod,
    'given a previously serialized object, should create a serialized object that is deeply equal to value produced using makeMarshal().serialize',
  );
});

test('fromCapData', t => {
  const m = makeMarshal();
  const o = harden({ a: 1 });

  // deprecated seralization API
  const usingSerializeMethod = m.serialize(o);

  const usingToCapDataMethod = m.toCapData(o);

  const usingUnserializeMethod = m.unserialize(usingSerializeMethod);
  const usingFromCapDataMethod = m.fromCapData(usingToCapDataMethod);

  t.deepEqual(
    usingUnserializeMethod,
    usingFromCapDataMethod,
    'should return an unserialized object that is deeply equal to value unserialized using makeMarshal().unserialize',
  );

  const oo = harden([o, o]);

  const ooUsingSerializeMethod = m.serialize(oo);
  const ooUsingToCapDataMethod = m.toCapData(oo);

  const uoUsingUnserializeMethod = m.unserialize(ooUsingSerializeMethod);
  const uoUsingFromCapDataMethod = m.fromCapData(ooUsingToCapDataMethod);

  t.deepEqual(
    uoUsingUnserializeMethod,
    uoUsingFromCapDataMethod,
    'given a previously serialized object, should create a serialized object that is deeply equal to value produced using makeMarshal().serialize',
  );
});
