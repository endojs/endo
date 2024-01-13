/**
 *
 * @param {Array<string | symbol>} leftNames
 * @param {Array<string | symbol>} rightNames
 */
export const listDifference = (leftNames, rightNames) => {
  const rightSet = new Set(rightNames);
  return leftNames.filter(name => !rightSet.has(name));
};
harden(listDifference);
