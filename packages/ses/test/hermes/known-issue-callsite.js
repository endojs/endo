/* global test */
test('known issue: CallSite implementation', () => {
  const data = [];
  const wrap = cs => name => {
    try {
      const v = cs[name]();
      if (name === 'getFileName') {
        // Normalize the filename to avoid spurious diffs.
        data.push([name, typeof v, v && v.replace(/.*\//, '.../')]);
        return;
      }
      if (typeof v === 'object' && v == null) {
        data.push([name, 'null', v]);
        return;
      }
      data.push([name, typeof v, v]);
    } catch (e) {
      data.push([name, 'Error', e.message]);
    }
  };

  Error.prepareStackTrace = function prep(_, b) {
    const collect = wrap(b[0]);
    collect('getColumnNumber');
    collect('getEnclosingColumnNumber');
    collect('getEnclosingLineNumber');
    collect('getEvalOrigin');
    collect('getFileName');
    collect('getFunction');
    collect('getFunctionName');
    collect('getLineNumber');
    collect('getMethodName');
    collect('getPosition');
    collect('getPromiseIndex');
    collect('getScriptNameOrSourceURL');
    collect('getScriptHash');
    collect('getThis');
    collect('getTypeName');
    collect('isAsync');
    collect('isConstructor');
    collect('isEval');
    collect('isNative');
    collect('isPromiseAll');
    collect('isToplevel');
    collect('toString');
  };

  function myfunction() {
    Error().stack;
  }

  myfunction();

  const actual = data.map(row => row.join('|')).sort();
  const expected = `getColumnNumber|number|10
getEnclosingColumnNumber|Error|undefined is not a function
getEnclosingLineNumber|Error|undefined is not a function
getEvalOrigin|null|
getFileName|string|.../known-issue-callsite.js
getFunctionName|null|
getFunction|undefined|
getLineNumber|number|49
getMethodName|null|
getPosition|Error|undefined is not a function
getPromiseIndex|null|
getScriptHash|Error|undefined is not a function
getScriptNameOrSourceURL|Error|undefined is not a function
getThis|undefined|
getTypeName|null|
isAsync|boolean|false
isConstructor|null|
isEval|null|
isNative|boolean|false
isPromiseAll|boolean|false
isToplevel|null|
toString|string|[object CallSite]`.split('\n');

  const issues = expected.flatMap((expectedRow, index) => {
    if (actual[index] !== expectedRow) {
      return `Expected ${expectedRow} got ${actual[index]}`;
    }
    return [];
  });

  if (issues.length) {
    assert.fail(`Hermes CallSite implementation has changed. Please verify the changes are acceptable and update this test's expected results.
----
${issues.join('\n')}
----
`);
  }
});
