/**
 * Return a list of all the elements present in the `leftList` and not
 * in the `rightList`. Return in the order of their appearance in `leftList`.
 * Uses the comparison built into `Set` membership (SameValueZero)
 * which is like JavaScript's `===` except that it judges any `NaN` to
 * be the same as any `NaN` and it judges `0` to be the same a `-0`.
 *
 * This is often used on lists of names that should match, in order to generate
 * useful diagnostics about the unmatched names.
 *
 * @template {any} V
 * @param {V[]} leftList
 * @param {V[]} rightList
 */
export const listDifference = (leftList, rightList) => {
  const rightSet = new Set(rightList);
  return leftList.filter(element => !rightSet.has(element));
};
harden(listDifference);
