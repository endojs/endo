import test from 'ava';
import url from 'url';
import { exec } from 'child_process';

const cwd = url.fileURLToPath(
  new URL('console-rejection-trap', import.meta.url),
);

const exitAssertions = (
  t,
  resolve,
  expectedCode,
  altExpectedCode = expectedCode,
) => {
  return (err, stdout, stderr) => {
    // Unix error codes are uint8.
    // Windows error codes are uint32.
    // Node.js exits with -1, which gets captured as either 0xff or 0xffffffff
    // depending on the platform. Truncation normalizes both of these to the
    // same expected code.
    // eslint-disable-next-line no-bitwise
    let code;
    if (err && err.code === null) {
      code = null;
    } else {
      // eslint-disable-next-line no-bitwise
      code = ((err && err.code) || 0) & 0xff;
    }
    t.log({ stdout, stderr, code, expectedCode, altExpectedCode });
    t.assert(
      code === expectedCode || code === altExpectedCode,
      'exit error code',
    );
    t.assert(
      stderr.includes('(Error#1)'),
      'stderr should have an error marker',
    );
    t.assert(
      code !== 0 || stderr.includes('SES_UNHANDLED_REJECTION'),
      'stderr should have SES_UNHANDLED_REJECTION',
    );
    t.assert(
      code === 0 || !stderr.includes('(Error#2)'),
      'failed stderr should not have a second error marker',
    );
    t.assert(
      stderr.includes('Error#1: Shibboleth'),
      'stderr should contain error message',
    );
    t.assert(
      code === 0 || !stderr.includes('Error#2'),
      'failed stderr should not contain second error message',
    );
    resolve(true);
  };
};

test('rejections reveal their stacks by default', async t => {
  t.plan(6);
  await new Promise(resolve =>
    exec('node default.js', { cwd }, exitAssertions(t, resolve, 0)),
  );
});

test('rejections reveal their stacks by report', async t => {
  t.plan(6);
  await new Promise(resolve =>
    exec('node report.js', { cwd }, exitAssertions(t, resolve, 0)),
  );
});

test('rejections are uncaught exceptions with unhandledRejectionTrapping: none', async t => {
  t.plan(4);
  await new Promise(resolve =>
    exec('node none.js', { cwd }, (err, stdout, stderr) => {
      let code;
      if (err && err.code === null) {
        code = null;
      } else {
        // eslint-disable-next-line no-bitwise
        code = ((err && err.code) || 0) & 0xff;
      }
      t.log({ stdout, stderr, code });

      t.assert(code === 0 || code === 1, 'exit code is expected');
      t.assert(
        // Node 14
        code !== 0 || stderr.includes('UnhandledPromiseRejectionWarning'),
        'if Node 14, exit 0 and print UnhandledPromiseRejectionWarning',
      );
      t.assert(
        code !== 1 ||
          stderr.includes("Promise.reject(new Error('Shibboleth'));"),
        'if Node 16, exit 1 and print the rejection code',
      );
      t.assert(
        !stderr.includes('Error#') && !stderr.includes('Error#'),
        'stderr should not contain SES errors',
      );
      resolve(true);
    }),
  );
});
