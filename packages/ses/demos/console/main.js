/* globals document */
import('../../dist/ses.esm.js').then(({ lockdown }) => {
  lockdown();

  const $ = selector => document.querySelector(selector);

  const execute = $('#execute');
  const clear = $('#clear');
  const input = $('#input');
  const output = $('#output');

  const compartment = new Compartment();

  execute.addEventListener('click', () => {
    const sourceText = input.value;
    let result;
    let outputText;
    try {
      result = compartment.evaluate(sourceText);
      switch (typeof result) {
        case 'function':
          outputText = result.toString();
          break;
        case 'object':
          outputText = JSON.stringify(result);
          break;
        default:
          outputText = `${result}`;
      }
    } catch (e) {
      outputText = `${e}`;
    }

    console.log(result);
    output.value = outputText;
  });

  clear.addEventListener('click', () => {
    input.value = '';
    output.value = '';
  });
});
