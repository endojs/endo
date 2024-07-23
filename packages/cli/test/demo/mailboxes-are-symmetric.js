import { withContext as withContextNamesInTransit } from './names-in-transit.js';

export const section = async (execa, testLine) => {
  await withContextNamesInTransit(execa, async () => {
    // Guests can also send their host messages...
    await testLine(
      execa`endo send HOST --as alice-agent ${'This is the @doubler you sent me.'}`,
    );
    await testLine(execa`endo inbox`, {
      stdout: /^0\. \"alice\" sent \"This is the \@doubler you sent me\.\"/,
    });
    await testLine(execa`endo adopt 0 doubler doubler-from-alice`);
    await testLine(execa`endo dismiss 0`);
  });
};
