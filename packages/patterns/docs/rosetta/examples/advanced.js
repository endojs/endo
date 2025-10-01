import { Far } from '@endo/marshal';
import { passStyleOf } from '@endo/pass-style';
import {
  M,
  matches,
  mustMatch,
} from '../../../src/patterns/patternMatchers.js';
import { makeCopySet } from '../../../src/keys/checkKey.js';

export const featureFlagsPattern = M.setOf(M.string());

export const featureFlagsSpecimen = makeCopySet(['alpha', 'beta']);

export const featureFlagsInvalid = harden(['alpha', 'alpha']);

export const makeFeatureFlagsZodSchema = z =>
  z.array(z.string()).superRefine((value, ctx) => {
    const seen = new Set();
    for (const entry of value) {
      if (seen.has(entry)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Feature flags must be unique',
        });
        return;
      }
      seen.add(entry);
    }
  });

export const remotablePattern = M.remotable('FlagService');

export const remoteServiceSpecimen = Far('FlagService', {
  async getFlag(name) {
    return name === 'alpha';
  },
});

export const remoteServiceInvalid = harden({
  async getFlag(name) {
    return name === 'alpha';
  },
});

export const makeRemoteServiceZodSchema = z =>
  z.object({
    getFlag: z
      .function()
      .args(z.string())
      .returns(z.union([z.boolean(), z.promise(z.boolean())])),
  });

export const promisePattern = M.promise();

export const promiseSpecimen = harden(Promise.resolve('ok'));

export const promiseInvalid = harden({ then: () => undefined });

export const makePromiseZodSchema = z =>
  z.custom(value => value instanceof Promise, {
    message: 'Must be a real Promise',
  });

export const validateFeatureFlagsWithPattern = specimen =>
  mustMatch(specimen, featureFlagsPattern);

export const validateRemotableWithPattern = specimen =>
  mustMatch(specimen, remotablePattern);

export const validatePromiseWithPattern = specimen =>
  mustMatch(specimen, promisePattern);

export const describePassStyle = specimen => passStyleOf(specimen);

export const matchesPromisePattern = specimen =>
  matches(specimen, promisePattern);
