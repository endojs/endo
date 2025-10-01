import { z } from 'zod';
import {
  makeFeatureFlagsZodSchema,
  makePromiseZodSchema,
  makeRemoteServiceZodSchema,
} from './advanced.js';

export const featureFlagsSchema = makeFeatureFlagsZodSchema(z);

export type FeatureFlags = readonly string[];

export const remoteServiceSchema = makeRemoteServiceZodSchema(z);

export interface RemoteService {
  getFlag(name: string): boolean | Promise<boolean>;
}

export const promiseSchema = makePromiseZodSchema(z);

export type KnownPromise = Promise<unknown>;
