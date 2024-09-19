/** @import {TestRoutine} from '../types' */

/** @type {TestRoutine} */
export const section = async (execa, testLine) => {
  // Guests can also send their host messages...
  await testLine(
    execa`endo send HOST --as alice-agent ${'This is the @doubler you sent me.'}`,
  );
  await testLine(execa`endo inbox`, {
    stdout: /3\. "alice" sent "This is the @doubler you sent me\."/,
  });
  await testLine(execa`endo adopt 3 doubler doubler-from-alice`);
  await testLine(execa`endo dismiss 3`);
  await testLine(execa`endo inbox`, {
    stdout: /^(?!3\. "alice" sent "This is the @doubler you sent me\.").*/,
  });
};
