import { makeError, X, q } from '@endo/errors';

const { freeze } = Object;

export const exampleProblem = (label, optLogger = undefined) => {
  const subError = makeError(X`nested ${q(label)} ${'REDACTED'}`);

  const err = makeError(X`${q(label)} ${'NOTICE ME'} nest ${subError}`);

  if (optLogger === undefined) {
    throw err;
  }
  optLogger(label, err);
};
freeze(exampleProblem);
