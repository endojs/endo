/* eslint-disable no-lone-blocks */
import { Passable } from '@endo/marshal';
import { expectType } from 'tsd';
import { M, mustMatch } from './patterns/patternMatchers.js';
import { Implied } from './types.js';

/// <reference types="ses"/>

const anUnknown: unknown = null;

// simple matchers

function stringCase() {
  mustMatch(anUnknown, M.string());
  expectType<string>(anUnknown);
}
function bigintCase() {
  mustMatch(anUnknown, M.bigint());
  expectType<bigint>(anUnknown);
}

// kinds matchers
function booleanCase() {
  mustMatch(anUnknown, M.boolean());
  expectType<boolean>(anUnknown);
}
function errorCase() {
  mustMatch(anUnknown, M.error());
  expectType<Error>(anUnknown);
}
function numberCase() {
  mustMatch(anUnknown, M.number());
  expectType<number>(anUnknown);
}
function promiseCase() {
  mustMatch(anUnknown, M.promise());
  expectType<Promise<unknown>>(anUnknown);
}
function undefinedCase() {
  mustMatch(anUnknown, M.undefined());
  expectType<undefined>(anUnknown);
}
