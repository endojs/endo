/** @import {Context, TestRoutine} from '../types' */

/** @type {TestRoutine} */
export const section = async (execa, testLine) => {
  // We make a doubler mostly the same way we made the counter...
  await testLine(execa`endo mkguest doubler-handle doubler-agent`, {
    stdout: 'Object [Alleged: EndoGuest] {}',
  });
  await testLine(
    execa`endo make doubler.js --name doubler --powers doubler-agent`,
  );

  // This creates a doubler, but the doubler cannot respond until we resolve...
  await testLine(execa`endo inbox`, {
    stdout:
      /^0\. "doubler-handle" requested "a counter, suitable for doubling"/,
  });
  await testLine(execa`endo resolve 0 counter`);

  // Now we can get a response from the doubler.
  await testLine(execa`endo eval E(doubler).incr() doubler`, {
    stdout: '8',
  });
  await testLine(execa`endo eval E(doubler).incr() doubler`, {
    stdout: '10',
  });
  await testLine(execa`endo eval E(doubler).incr() doubler`, {
    stdout: '12',
  });

  // Also, in the optional second argument to request, doubler.js names...
  await testLine(execa`endo restart`);
  await testLine(execa`endo eval E(doubler).incr() doubler`, {
    stdout: '2',
  });
  await testLine(execa`endo eval E(doubler).incr() doubler`, {
    stdout: '4',
  });
  await testLine(execa`endo eval E(doubler).incr() doubler`, {
    stdout: '6',
  });
};

/** @type {Context} */
export const context = {
  setup: async execa => {
    await execa`endo mkguest doubler-handle doubler-agent`;
    await execa`endo make doubler.js --name doubler --powers doubler-agent`;
    await execa`endo inbox`;
    await execa`endo resolve 0 counter`;
  },
};
