import { create, getOwnPropertyDescriptors } from './commons.js';

export default function tameMathObject(mathTaming = 'safe') {
  if (mathTaming !== 'safe' && mathTaming !== 'unsafe') {
    throw new Error(`unrecognized mathTaming ${mathTaming}`);
  }
  const originalMath = Math;
  const initialMath = originalMath; // to follow the naming pattern

  // TODO I shouldn't need this eslint-disable for an ignored _ or variable
  // name beginning with underbar.
  // eslint-disable-next-line no-unused-vars
  const { random: _, ...otherDescriptors } = getOwnPropertyDescriptors(
    originalMath,
  );

  const sharedMath = create(Object.prototype, otherDescriptors);

  return {
    '%InitialMath%': initialMath,
    '%SharedMath%': sharedMath,
  };
}
