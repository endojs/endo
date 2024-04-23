import { expectType } from 'tsd';
import { M } from '../src/patterns/patternMatchers.js';

// @ts-expect-error M.any missing parens
M.arrayOf(M.any);
M.arrayOf(M.any());
