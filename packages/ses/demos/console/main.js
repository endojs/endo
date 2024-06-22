/* globals globalThis, document */

lockdown();
{
  const { quote: q } = assert;

  const $ = selector => document.querySelector(selector);

  const execute = $('#execute');
  const clear = $('#clear');
  const input = $('#input');
  const output = $('#output');

  // Under the default `lockdown` settings, it is safe enough
  // to endow with the safe `console`.
  const compartment = new Compartment({
    console,
    // See https://github.com/Agoric/agoric-sdk/issues/9515
    assert: globalThis.assert,
  });

  execute.addEventListener('click', () => {
    const sourceText = input.value;
    let result;
    let outputText;
    try {
      result = compartment.evaluate(sourceText);
      console.log(result);
      outputText = `${q(result, '  ')}`;
    } catch (e) {
      console.log('threw', e);
      outputText = `threw ${q(e)}`;
    }
    output.value = outputText;
  });

  clear.addEventListener('click', () => {
    input.value = '';
    output.value = '';
  });
}
