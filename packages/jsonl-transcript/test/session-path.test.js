// @ts-check
import test from 'ava';

import {
  sessionDirPath,
  sessionFileName,
  sessionFilePath,
  slugSegment,
} from '../src/session-path.js';

test('sessionDirPath places sessions under the guest directory', t => {
  t.is(sessionDirPath('/state', 'guestA'), '/state/sessions/guestA');
});

test('sessionFileName zero-pads the timestamp so names sort chronologically', t => {
  const early = sessionFileName({
    timestamp: 1_715_817_600_000,
    sessionId: 's1',
  });
  const later = sessionFileName({
    timestamp: 1_715_817_600_001,
    sessionId: 's2',
  });
  t.is(early, '01715817600000_s1.jsonl');
  t.true(early < later, 'lexical order matches chronological order');
});

test('sessionFilePath composes the full layout', t => {
  t.is(
    sessionFilePath('/var/endo/state', 'b1946ac9', {
      timestamp: 1_715_817_600_000,
      sessionId: '01975f',
    }),
    '/var/endo/state/sessions/b1946ac9/01715817600000_01975f.jsonl',
  );
});

test('slugSegment neutralizes path separators so an id cannot escape the tree', t => {
  t.is(slugSegment('../../etc/passwd'), '..-..-etc-passwd');
  t.is(slugSegment('a/b'), 'a-b');
  t.is(slugSegment('01975f-ab.CD_9'), '01975f-ab.CD_9');
});
