import { z } from 'zod';
import { mustMatch } from '../../../src/patterns/patternMatchers.js';
import { makeUserProfileZodSchema, userProfilePattern } from './basic.js';

export const userProfileSchema = makeUserProfileZodSchema(z);

export type UserProfile = {
  id: bigint;
  handle: string;
  email?: string;
  note?: string;
};

export const assertUserProfile = (value: unknown): UserProfile => {
  const runtimeChecked = userProfileSchema.parse(value);
  mustMatch(runtimeChecked, userProfilePattern);
  return runtimeChecked;
};
