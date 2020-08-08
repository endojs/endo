/* global lockdown */
import test from 'tape';
import '../ses.js';

lockdown({ errorTaming: 'unsafe' });

test('callSite properties', t => {
  function topFrame() {
    let sst;
    const orig = Error.prepareStackTrace;
    try {
      const pst = (_err, sst0) => sst0;
      Error.prepareStackTrace = pst;
      const e = Error();
      sst = e.stack;
    } finally {
      Error.prepareStackTrace = orig;
    }
    // TODO: if we're not under v8, 'sst' will be undefined or an empty
    // string, and we shouldn't look for these properties. This test checks
    // what happens if we *are* under v8.
    return sst[0];
  }
  const top = topFrame();

  // We currently expect unsafe-tamed Error to allow prepareStackTrace to
  // see the following properties, most of which violate confidentiality of
  // the code that threw the exception and everybody on the stack below
  // them. But we hide the properties that would violate integrity, like
  // `getThis` and `getFunction`.
  t.equal(top.getTypeName(), null);
  t.equal(top.getFunctionName(), 'topFrame');
  t.equal(top.getMethodName(), null);
  t.equal(typeof top.getFileName(), 'string');
  t.equal(typeof top.getLineNumber(), 'number');
  t.equal(typeof top.getColumnNumber(), 'number');
  t.equal(top.getEvalOrigin(), undefined);
  t.equal(top.isToplevel(), true);
  t.equal(top.isNative(), false);
  t.equal(typeof top.getPosition(), 'number');
  t.equal(typeof top.getScriptNameOrSourceURL(), 'string');

  t.end();
});
