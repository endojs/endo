// @ts-nocheck
import test from '@endo/ses-ava/prepare-endo.js';

import fs from 'fs';
import path from 'path';
import os from 'os';

import { makeFilePowers } from '../src/manager-node-powers.js';

/**
 * Allocate a fresh temporary directory that is removed at test teardown.
 *
 * Unit tests run in-process, so c8 captures every branch hit.  The
 * companion integration tests in endo.test.js drive the same code
 * through a forked daemon, where some intra-process branches reach
 * c8 unreliably.
 *
 * @param {import('ava').ExecutionContext} t
 * @param {string} label
 */
const makeTemporaryDirectory = async (t, label) => {
  const directory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), `watch-directory-${label}-`),
  );
  t.teardown(async () => {
    await null;
    try {
      await fs.promises.rm(directory, { recursive: true, force: true });
    } catch {
      // already gone
    }
  });
  return directory;
};

const collect = async (events, predicate, timeoutMs = 2000) => {
  await null;
  const iterator = events[Symbol.asyncIterator]();
  const sentinel = {};
  const timeout = new Promise(resolve =>
    setTimeout(() => resolve(sentinel), timeoutMs),
  );
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const result = await Promise.race([iterator.next(), timeout]);
    if (result === sentinel) {
      return undefined;
    }
    if (result.done) {
      return undefined;
    }
    if (predicate(result.value)) {
      return result.value;
    }
  }
};

test('watchDirectory yields a rename event after a debounce window', async t => {
  const directory = await makeTemporaryDirectory(t, 'rename');
  const powers = makeFilePowers({ fs, path });
  const { events, cancel } = powers.watchDirectory(directory);
  t.teardown(() => cancel());

  // Race the watcher startup.
  await new Promise(resolve => setTimeout(resolve, 50));
  await fs.promises.writeFile(path.join(directory, 'new.txt'), 'hello');

  const event = await collect(
    events,
    candidate => candidate.name === 'new.txt',
  );
  t.truthy(event, 'rename event should arrive');
  t.is(event.kind, 'replace');
  t.is(event.name, 'new.txt');
});

test('watchDirectory buffers events arriving before the consumer awaits next()', async t => {
  const directory = await makeTemporaryDirectory(t, 'buffer');

  // Stub fs.watch so we can deliver events deterministically without
  // racing the platform's debounce / coalesce behavior (which varies
  // between Linux's inotify and macOS's FSEvents).  The test
  // exercises the buffered.push() branch in the events iterator:
  // events arrive (via debounced deliver) before any consumer is
  // parked on a waiter, so they accumulate in the buffer for the
  // first next() call to drain.
  let stubListener;
  const stubWatcher = {
    on(event, listener) {
      if (event === 'change') stubListener = listener;
      return stubWatcher;
    },
    close() {},
  };
  const stubFs = { ...fs, watch: () => stubWatcher };

  const powers = makeFilePowers({ fs: stubFs, path });
  const { events, cancel } = powers.watchDirectory(directory);
  t.teardown(() => cancel());

  // Synchronously fire two rename events.  Both schedule debounced
  // timers; after the debounce window, both call deliver() with no
  // waiter parked, so both events buffer.
  stubListener('rename', 'a.txt');
  stubListener('rename', 'b.txt');

  // Wait past the debounce window so both timers fire and the
  // buffer has both entries before we await next().
  await new Promise(resolve => setTimeout(resolve, 150));

  const iterator = events[Symbol.asyncIterator]();
  const first = await iterator.next();
  t.false(first.done);
  const second = await iterator.next();
  t.false(second.done);
  const seen = new Set([first.value.name, second.value.name]);
  t.true(seen.has('a.txt'), 'a.txt observed from buffer');
  t.true(seen.has('b.txt'), 'b.txt observed from buffer');
});

test('watchDirectory coalesces a quick rewrite of the same name', async t => {
  const directory = await makeTemporaryDirectory(t, 'coalesce');
  const powers = makeFilePowers({ fs, path });
  const { events, cancel } = powers.watchDirectory(directory);
  t.teardown(() => cancel());

  await new Promise(resolve => setTimeout(resolve, 50));
  // Write, immediately remove, immediately re-write the same name.
  // The debounce window should collapse this into a single event.
  await fs.promises.writeFile(path.join(directory, 'churn.txt'), '1');
  await fs.promises.unlink(path.join(directory, 'churn.txt'));
  await fs.promises.writeFile(path.join(directory, 'churn.txt'), '2');

  const event = await collect(
    events,
    candidate => candidate.name === 'churn.txt',
  );
  t.truthy(event, 'coalesced event should arrive');
  t.is(event.name, 'churn.txt');
});

test('watchDirectory cancel is idempotent', async t => {
  const directory = await makeTemporaryDirectory(t, 'idempotent');
  const powers = makeFilePowers({ fs, path });
  const { cancel } = powers.watchDirectory(directory);

  cancel();
  cancel();
  cancel();
  t.pass('cancel() returns without throwing on repeat calls');
});

test('watchDirectory terminates the events stream after cancel()', async t => {
  const directory = await makeTemporaryDirectory(t, 'terminate');
  const powers = makeFilePowers({ fs, path });
  const { events, cancel } = powers.watchDirectory(directory);

  cancel();

  const iterator = events[Symbol.asyncIterator]();
  const result = await iterator.next();
  t.true(result.done, 'next() returns done after cancel()');
  // A second next() on the same iterator also reports done; the
  // `if (closed)` branch fires on the second call now that the
  // first call drained any buffered values.
  const again = await iterator.next();
  t.true(again.done, 'iterator stays done on subsequent calls');
});

test('watchDirectory unblocks pending next() callers on cancel()', async t => {
  const directory = await makeTemporaryDirectory(t, 'pending');
  const powers = makeFilePowers({ fs, path });
  const { events, cancel } = powers.watchDirectory(directory);

  const iterator = events[Symbol.asyncIterator]();
  // Park two next() calls.  Both should resolve to { done: true }
  // when cancel() drains the waiter queue.
  const first = iterator.next();
  const second = iterator.next();

  // Give the watcher a moment to settle, then close.
  await new Promise(resolve => setTimeout(resolve, 50));
  cancel();

  const firstResult = await first;
  const secondResult = await second;
  t.true(firstResult.done, 'first parked next() reports done');
  t.true(secondResult.done, 'second parked next() reports done');
});

test('watchDirectory iterator.return() closes the watcher', async t => {
  const directory = await makeTemporaryDirectory(t, 'return');
  const powers = makeFilePowers({ fs, path });
  const { events } = powers.watchDirectory(directory);

  const iterator = events[Symbol.asyncIterator]();
  const returned = await iterator.return();
  t.true(returned.done, 'return() reports done');

  // Subsequent next() should also report done because the watcher
  // is closed.
  const after = await iterator.next();
  t.true(after.done, 'next() after return() reports done');
});

test('watchDirectory returns an immediately-closed stream when fs.watch throws', async t => {
  // Pass a path that does not exist; Node's fs.watch synchronously
  // throws ENOENT.  The production code emits a `console.error`
  // diagnostic on the failure path; we let it through since SES
  // freezes console and we cannot stub it.
  const ghost = path.join(
    os.tmpdir(),
    `watch-directory-ghost-${Date.now()}-xyz`,
  );
  const powers = makeFilePowers({ fs, path });

  const result = powers.watchDirectory(ghost);

  // The events stream terminates immediately.
  const iterator = result.events[Symbol.asyncIterator]();
  const next = await iterator.next();
  t.true(next.done, 'events stream is empty');
  const returned = await iterator.return();
  t.true(returned.done, 'return() also reports done');

  // cancel() on the empty-stream branch is a no-op but must not throw.
  result.cancel();
  t.pass('cancel() on the empty-stream path is a no-op');
});

test('watchDirectory ignores fs.watch events without a filename', async t => {
  const directory = await makeTemporaryDirectory(t, 'no-filename');

  // Stub fs.watch so we can deliver a synthetic change event with
  // filename === null (the platform-conditional branch the
  // production code drops).
  let stubListener;
  let stubErrorListener;
  let closed = false;
  const stubWatcher = {
    on(event, listener) {
      if (event === 'change') {
        stubListener = listener;
      } else if (event === 'error') {
        stubErrorListener = listener;
      }
      return stubWatcher;
    },
    close() {
      closed = true;
    },
  };
  const stubFs = {
    ...fs,
    watch: () => stubWatcher,
  };

  const powers = makeFilePowers({ fs: stubFs, path });
  const { events, cancel } = powers.watchDirectory(directory);
  t.teardown(() => cancel());

  // Fire two events the watcher must ignore.
  stubListener('rename', null);
  stubListener('rename', undefined);
  // Fire a 'change' event (file content mutation) which is also
  // intentionally dropped.
  stubListener('change', 'irrelevant.txt');

  // Now fire a legitimate rename for a name encoded as a Buffer
  // (the Buffer branch in production code).
  stubListener('rename', Buffer.from('legit.txt'));

  const event = await collect(
    events,
    candidate => candidate.name === 'legit.txt',
  );
  t.truthy(event, 'Buffer-named rename event should arrive');
  t.is(event.name, 'legit.txt');

  // Drive the error handler.  It logs to console.error and closes
  // the stream; SES freezes console so we cannot silence the log.
  stubErrorListener(Error('synthetic watcher error'));

  // After the error handler the events stream reports done on next().
  const iterator = events[Symbol.asyncIterator]();
  const result = await iterator.next();
  t.true(result.done, 'next() after watcher error reports done');
  t.true(closed, 'underlying watcher.close() was invoked');
});

test('watchDirectory cancel clears pending debounced timers', async t => {
  const directory = await makeTemporaryDirectory(t, 'pending-clear');

  // Stub fs.watch so we can synthesise an event that schedules a
  // debounced timer, then cancel before the debounce window
  // elapses.  cancel() must drain the pending map.
  let stubListener;
  const stubWatcher = {
    on(event, listener) {
      if (event === 'change') stubListener = listener;
      return stubWatcher;
    },
    close() {},
  };
  const stubFs = { ...fs, watch: () => stubWatcher };

  const powers = makeFilePowers({ fs: stubFs, path });
  const { events, cancel } = powers.watchDirectory(directory);

  // Schedule a debounced reconciliation, then cancel immediately
  // (well within the 50 ms debounce window).
  stubListener('rename', 'will-not-fire.txt');
  cancel();

  // Wait past the debounce window.  The timer fired (or was cleared)
  // long enough ago that no event should be observable.  The events
  // stream must be done.
  await new Promise(resolve => setTimeout(resolve, 120));

  const iterator = events[Symbol.asyncIterator]();
  const result = await iterator.next();
  t.true(result.done, 'stream is done; debounced event did not leak through');
});

test('watchDirectory tolerates watcher.close() throwing', async t => {
  const directory = await makeTemporaryDirectory(t, 'close-throws');

  // Stub a watcher whose close() throws.  The cancel() path must
  // swallow the error.
  const stubWatcher = {
    on() {
      return stubWatcher;
    },
    close() {
      throw Error('synthetic close failure');
    },
  };
  const stubFs = { ...fs, watch: () => stubWatcher };

  const powers = makeFilePowers({ fs: stubFs, path });
  const { cancel } = powers.watchDirectory(directory);

  // cancel() must not throw even when the underlying watcher does.
  cancel();
  t.pass('cancel() swallows watcher.close() errors');
});
