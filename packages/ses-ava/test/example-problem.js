// Avoid importing from @endo/errors to avoid more dependence cycles
const { error: makeError, details: X, quote: q } = assert;

const { freeze } = Object;

export const exampleProblem = label => {
  const subError = makeError(X`nested ${q(label)} ${'REDACTED'}`);

  return makeError(X`${q(label)} ${'NOTICE ME'} nest ${subError}`);
};
freeze(exampleProblem);
