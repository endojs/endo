/* global Realm */
/* eslint-disable no-self-compare, no-console */

const r = Realm.makeRootRealm();

document.getElementById('run').addEventListener('click', () => {
  const sourceText = document.getElementById('sourceText').value;
  let result, output;
  try {
    result = r.evaluate(sourceText);
  } catch (e) {
    result = `Error: ${e}`;
  }
  try {
    output =
      typeof result === 'function' ? result.toString() : JSON.stringify(result);
  } catch (e) {
    output = `Error trying to serialize the result: ${e}\nOriginal Object: ${result}`;
  }
  console.log(result);
  document.getElementById('output').value = output;
});
