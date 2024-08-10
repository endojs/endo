import test from 'ava';
import url from 'url';
import { exec } from 'child_process';

const cwd = url.fileURLToPath(new URL('console-error-trap', import.meta.url));

const exitAssertions = (
  t,
  resolve,
  expectedCode,
  altExpectedCode = expectedCode,
) => {
  return (err, stdout, stderr) => {
    t.log({ stdout, stderr, code: err.code, expectedCode, altExpectedCode });
    // Unix error codes are uint8.
    // Windows error codes are uint32.
    // Node.js exits with -1, which gets captured as either 0xff or 0xffffffff
    // depending on the platform. Truncation normalizes both of these to the
    // same expected code.
    // eslint-disable-next-line no-bitwise
    const code = err.code === null ? null : err.code & 0xff;
    t.assert(
      code === expectedCode || code === altExpectedCode,
      'exit error code',
    );
    t.assert(
      stderr.includes('SES_UNCAUGHT_EXCEPTION:'),
      'stderr should have SES_UNCAUGHT_EXCEPTION:',
    );
    t.assert(
      stderr.includes('(Error#1)'),
      'stderr should have an error marker',
    );
    t.assert(
      !stderr.includes('(Error#2)'),
      'stderr should not have a second error marker',
    );
    t.assert(
      stderr.includes('Error#1: Shibboleth'),
      'stderr should contain error message',
    );
    t.assert(
      !stderr.includes('Error#2'),
      'stderr should not contain second error message',
    );
    resolve(true);
  };
};

test('errors reveal their stacks', async t => {
  t.plan(6);
  await new Promise(resolve => {
    exec('node default.js', { cwd }, exitAssertions(t, resolve, 255));
  });
});

test('errors reveal their stacks with errorTrapping: platform', async t => {
  t.plan(6);
  await new Promise(resolve => {
    exec('node platform.js', { cwd }, exitAssertions(t, resolve, 255));
  });
});

test('errors reveal their stacks with errorTrapping: exit', async t => {
  t.plan(6);
  await new Promise(resolve => {
    exec('node exit.js', { cwd }, exitAssertions(t, resolve, 255));
  });
});

test('errors reveal their stacks with errorTrapping: exit with code', async t => {
  t.plan(6);
  await new Promise(resolve => {
    exec('node exit-code.js', { cwd }, exitAssertions(t, resolve, 127));
  });
});

test('errors reveal their stacks with errorTrapping: abort', async t => {
  t.plan(6);
  // Mac exits with null, Linux exits with code 134
  await new Promise(resolve => {
    exec('node abort.js', { cwd }, exitAssertions(t, resolve, null, 134));
  });
});

test('errors reveal their stacks with errorTrapping: report', async t => {
  t.plan(6);
  await new Promise(resolve => {
    exec('node report.js', { cwd }, (err, stdout, stderr) => {
      t.log({ stdout, stderr });
      t.is(err, null);
      t.assert(
        stderr.includes('SES_UNCAUGHT_EXCEPTION:'),
        'stderr should have SES_UNCAUGHT_EXCEPTION:',
      );
      t.assert(
        stderr.includes('(Error#1)'),
        'stderr should have an error marker',
      );
      t.assert(
        stderr.includes('(Error#2)'),
        'stderr should have a second error marker',
      );
      t.assert(
        stderr.includes('Error#1: Shibboleth'),
        'stderr should contain error message',
      );
      t.assert(
        stderr.includes('Error#2: I am once again'),
        'stderr should contain second error message',
      );
      resolve(true);
    });
  });
});
