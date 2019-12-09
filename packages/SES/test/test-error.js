import test from 'tape';
import SES from '../src/index';

test('Error.captureStackTrace neutered by default', t => {
  const s = SES.makeSESRootRealm();
  t.equal(s.evaluate('Error.captureStackTrace'), undefined);
  t.end();
});

test('Error.captureStackTrace neutered upon request', t => {
  const s = SES.makeSESRootRealm({ errorStackMode: false });
  t.equal(s.evaluate('Error.captureStackTrace'), undefined);
  t.end();
});

// Error.captureStackTrace is a v8 extension, and other engines may or may
// not provide it

test('Error.captureStackTrace can be left alone', t => {
  const rootHasCaptureStackTrace = 'captureStackTrace' in Error;
  const s = SES.makeSESRootRealm({ errorStackMode: 'allow' });
  const realmHasCaptureStackTrace = s.evaluate('"captureStackTrace" in Error');
  t.equal(rootHasCaptureStackTrace, realmHasCaptureStackTrace);
  t.end();
});
