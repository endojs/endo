/* eslint-disable no-lone-blocks */
import { Passable, assertChecker } from '@endo/marshal';
import { expectType } from 'tsd';
import { M, checkMatches, mustMatch } from './patterns/patternMatchers.js';
import { Matcher } from './types.js';
import { identChecker } from './utils.js';

/// <reference types="ses"/>

const anUnknown: unknown = null;

// XXX works here but not mustMatch
function assertMatch<PA>(
  specimen: Passable,
  patt: PA,
  label?: string,
): asserts specimen is PA extends Matcher<'string'>
  ? string
  : PA extends Matcher<'kind'>
  ? number
  : unknown {
  // @ts-expect-error FIXME make mustMatch type work
  mustMatch(specimen, patt, label);
}

function stringCase() {
  assertMatch(anUnknown, M.string());
  expectType<string>(anUnknown);
}

function numberCase() {
  assertMatch(anUnknown, M.number());
  expectType<number>(anUnknown);
}
