// eslint-disable-next-line import/no-mutable-exports
export let value;
export const set = newValue => {
  // eslint-disable-next-line @endo/no-assign-to-exported-let-var-or-function
  value = newValue;
};
