/**
 *
 * @param {*} execa - the command execution environment
 * @param {(execa: *, testCommand: (command: *, expectation: *) => Promise<true>) => Promise<void>} testRoutine - the test logic implementation
 * @returns {(t: *) => Promise<void>}
 */
export function makeSectionTest(execa, testRoutine) {
  return async t => {
    const matchExpecation = (expectation, result, errMsg) => {
      (expectation instanceof RegExp ? t.regex : t.is)(
        result,
        expectation ?? '',
        errMsg,
      );
    };
    const testCommand = async (command, expectation) => {
      const result = await command;
      if (expectation !== undefined) {
        const errMsg = JSON.stringify({ expectation, result }, null, 2);
        matchExpecation(expectation.stdout, result.stdout, errMsg);
        matchExpecation(expectation.stderr, result.stderr, errMsg);
      }
    };
    await testRoutine(execa, testCommand);
  };
}
