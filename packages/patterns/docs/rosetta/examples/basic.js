import {
  M,
  matches,
  mustMatch,
} from '../../../src/patterns/patternMatchers.js';

/**
 * Pattern describing a simple user record. Required `id` and `handle`, optional
 * `email` and `note`. `id` uses `M.nat()` so the value must be a non-negative
 * bigint.
 */
export const userProfilePattern = M.splitRecord(
  { id: M.nat(), handle: M.string() },
  { email: M.string(), note: M.string() },
);

export const goodUserProfile = harden({
  id: 42n,
  handle: 'querycat',
  email: 'query@example.com',
});

export const badUserProfile = harden({
  id: -3n,
  handle: 'querycat',
});

export const makeUserProfileZodSchema = z =>
  z
    .object({
      id: z.bigint().refine(value => value >= 0n, {
        message: 'id must be a non-negative bigint',
      }),
      handle: z.string(),
    })
    .extend({
      email: z.string().email().optional(),
      note: z.string().optional(),
    });

export const validateWithPattern = specimen =>
  mustMatch(specimen, userProfilePattern);

export const matchesWithPattern = specimen =>
  matches(specimen, userProfilePattern);

export const explainZodFailure = (schema, specimen) =>
  schema.safeParse(specimen).error;
