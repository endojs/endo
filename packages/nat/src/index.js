// Copyright (C) 2011 Google Inc.
// Copyright (C) 2018 Agoric
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// @ts-check

/**
 * Is `allegedNum` a number in the [contiguous range of exactly and
 * unambiguously
 * representable](https://esdiscuss.org/topic/more-numeric-constants-please-especially-epsilon#content-14)
 *  natural numbers (non-negative integers)?
 *
 * To qualify `allegedNum` must either be a
 * non-negative `bigint`, or a non-negative `number` representing an integer
 * within range of [integers safely representable in
 * floating point](https://tc39.es/ecma262/#sec-number.issafeinteger).
 *
 * @param {unknown} allegedNum
 * @returns {boolean}
 */
function isNat(allegedNum) {
  if (typeof allegedNum === 'bigint') {
    return allegedNum >= 0;
  }
  if (typeof allegedNum !== 'number') {
    return false;
  }

  return Number.isSafeInteger(allegedNum) && allegedNum >= 0;
}

/**
 * If `allegedNumber` passes the `isNat` test, then return it as a bigint.
 * Otherwise throw an appropriate error.
 *
 * If `allegedNum` is neither a bigint nor a number, `Nat` throws a `TypeError`.
 * Otherwise, if it is not a [safely
 * representable](https://esdiscuss.org/topic/more-numeric-constants-please-especially-epsilon#content-14)
 * non-negative integer, `Nat` throws a `RangeError`.
 * Otherwise, it is converted to a bigint if necessary and returned.
 *
 * @param {unknown} allegedNum
 * @returns {bigint}
 */
function Nat(allegedNum) {
  if (typeof allegedNum === 'bigint') {
    if (allegedNum < 0) {
      throw RangeError(`${allegedNum} is negative`);
    }
    return allegedNum;
  }

  if (typeof allegedNum === 'number') {
    if (!Number.isSafeInteger(allegedNum)) {
      throw RangeError(`${allegedNum} not a safe integer`);
    }
    if (allegedNum < 0) {
      throw RangeError(`${allegedNum} is negative`);
    }
    return BigInt(allegedNum);
  }

  throw TypeError(
    `${allegedNum} is a ${typeof allegedNum} but must be a bigint or a number`,
  );
}

export { isNat, Nat };
