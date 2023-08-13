/* eslint-disable no-lone-blocks */
import { Passable } from '@endo/marshal';
import { expectType } from 'tsd';
import { M, mustMatch } from './patterns/patternMatchers.js';
import { Implied } from './types.js';

/// <reference types="ses"/>

const anUnknown: unknown = null;

function stringCase() {
  mustMatch(anUnknown, M.string());
  expectType<string>(anUnknown);
}

function numberCase() {
  mustMatch(anUnknown, M.number());
  expectType<number>(anUnknown);
}
function bigintCase() {
  mustMatch(anUnknown, M.bigint());
  expectType<bigint>(anUnknown);
}
