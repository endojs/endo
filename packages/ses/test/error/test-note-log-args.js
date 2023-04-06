import test from 'ava';

import { makeNoteLogArgsArrayKit } from '../../src/error/note-log-args.js';

test('note log args array kit basic', t => {
  const { addLogArgs, takeLogArgsArray } = makeNoteLogArgsArrayKit(3, 2);
  const e1 = Error('e1');
  const e2 = Error('e2');
  const e3 = Error('e3');
  const e4 = Error('e4');

  addLogArgs(e1, ['a']);
  addLogArgs(e3, ['b']);
  addLogArgs(e2, ['c']);
  addLogArgs(e4, ['d']); // drops e1
  addLogArgs(e1, ['e']); // new e1 entry, drops e3
  addLogArgs(e2, ['f']);
  addLogArgs(e2, ['g']); // drops e2,c
  addLogArgs(e2, ['h']); // drops e2,f
  t.deepEqual(takeLogArgsArray(e1), [['e']]);
  t.deepEqual(takeLogArgsArray(e2), [['g'], ['h']]);
  t.deepEqual(takeLogArgsArray(e3), undefined);
  t.deepEqual(takeLogArgsArray(e4), [['d']]);
});
