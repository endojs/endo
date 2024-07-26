/** @import {Context, TestRoutine} from '../types' */

/** @type {TestRoutine} */
export const section = async (execa, testLine) => {
  // So far, we have run guest programs like the doubler. Guests and hosts can exchange messages...
  await testLine(execa`endo mkguest alice alice-agent`, {
    stdout: 'Object [Alleged: EndoGuest] {}',
  });
  await testLine(execa`endo send alice ${'Please enjoy this @doubler.'}`);
  await testLine(execa`endo inbox --as alice-agent`, {
    stdout: /^0\. "HOST" sent "Please enjoy this @doubler\."/,
  });
  await testLine(execa`endo adopt --as alice-agent 0 doubler`);
  await testLine(execa`endo list --as alice-agent`, {
    stdout: 'doubler',
  });
  await testLine(execa`endo dismiss --as alice-agent 0`);
};

/** @type {Context} */
export const context = {
  setup: async execa => {
    await execa`endo mkguest alice alice-agent`;
    await execa`endo send alice ${'Please enjoy this @doubler.'}`;
    await execa`endo adopt alice-agent 0 doubler`;
    await execa`endo dismiss --as alice-agent 0`;
  },
};
