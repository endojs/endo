import test from '@endo/ses-ava/test.js';
import {
  readPointer,
  writePointer,
} from '../../src/wire/pointer.js';

const makeView = () => new DataView(new ArrayBuffer(16));

test('null pointer round-trips', t => {
  const view = makeView();
  writePointer(view, 0, { kind: 'null' });
  t.deepEqual(readPointer(view, 0), { kind: 'null' });
});

test('struct pointer round-trips with positive offset', t => {
  const view = makeView();
  writePointer(view, 0, {
    kind: 'struct',
    offsetWords: 7,
    dataWords: 2,
    ptrWords: 3,
  });
  t.deepEqual(readPointer(view, 0), {
    kind: 'struct',
    offsetWords: 7,
    dataWords: 2,
    ptrWords: 3,
  });
});

test('struct pointer round-trips with negative offset', t => {
  const view = makeView();
  writePointer(view, 0, {
    kind: 'struct',
    offsetWords: -42,
    dataWords: 1,
    ptrWords: 0,
  });
  t.deepEqual(readPointer(view, 0), {
    kind: 'struct',
    offsetWords: -42,
    dataWords: 1,
    ptrWords: 0,
  });
});

test('list pointer round-trips', t => {
  const view = makeView();
  writePointer(view, 0, {
    kind: 'list',
    offsetWords: 4,
    elemSize: 6,
    elemCount: 100,
  });
  t.deepEqual(readPointer(view, 0), {
    kind: 'list',
    offsetWords: 4,
    elemSize: 6,
    elemCount: 100,
  });
});

test('far pointer round-trips', t => {
  const view = makeView();
  writePointer(view, 0, {
    kind: 'far',
    landingPad: 1,
    segmentId: 17,
    offsetWords: 200,
  });
  t.deepEqual(readPointer(view, 0), {
    kind: 'far',
    landingPad: 1,
    segmentId: 17,
    offsetWords: 200,
  });
});

test('cap pointer round-trips', t => {
  const view = makeView();
  writePointer(view, 0, { kind: 'cap', index: 42 });
  t.deepEqual(readPointer(view, 0), { kind: 'cap', index: 42 });
});
