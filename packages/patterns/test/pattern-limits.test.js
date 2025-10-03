import test from '@endo/ses-ava/test.js';
import harden from '@endo/harden';

import { passableSymbolForName } from '@endo/pass-style';
import { makeCopyBag, makeCopyMap, makeCopySet } from '../src/keys/checkKey.js';
import {
  mustMatch,
  matches,
  M,
  defaultLimits,
} from '../src/patterns/patternMatchers.js';

/**
 * @import {Passable} from '@endo/marshal'
 * @import {Pattern} from '../src/types.js'
 */

/**
 * @typedef {object} MatchTest
 * @property {Passable} specimen
 * @property {Pattern[]} yesPatterns
 * @property {[Pattern, RegExp|string][]} noPatterns
 */

const runTests = (successCase, failCase) => {
  // decimalDigitsLimit
  {
    const specimen = 379n;
    successCase(specimen, M.bigint());
    successCase(specimen, M.bigint(harden({ decimalDigitsLimit: 3 })));
    successCase(specimen, M.nat());
    successCase(specimen, M.nat(harden({ decimalDigitsLimit: 3 })));
    failCase(
      specimen,
      M.bigint({ decimalDigitsLimit: 2 }),
      /^bigint (\(a bigint\)|"\[379n\]") must not have more than (\(a number\)|2) digits$/,
    );
    failCase(
      specimen,
      M.nat({ decimalDigitsLimit: 2 }),
      /^bigint (\(a bigint\)|"\[379n\]") must not have more than (\(a number\)|2) digits$/,
    );
  }
  {
    const specimen = -379n;
    successCase(specimen, M.bigint());
    successCase(specimen, M.bigint(harden({ decimalDigitsLimit: 3 })));

    failCase(
      specimen,
      M.bigint({ decimalDigitsLimit: 2 }),
      /^bigint (\(a bigint\)|"\[-379n\]") must not have more than (\(a number\)|2) digits$/,
    );
    failCase(
      specimen,
      M.nat(),
      /^(\(a bigint\)|"\[-379n\]") - Must be non-negative$/,
    );
    failCase(
      specimen,
      M.nat({ decimalDigitsLimit: 2 }),
      /^(\(a bigint\)|"\[-379n\]") - Must be non-negative$/,
    );
  }
  {
    const specimen = 10n ** BigInt(defaultLimits.decimalDigitsLimit);
    successCase(specimen, M.bigint(harden({ decimalDigitsLimit: Infinity })));
    successCase(specimen, M.nat(harden({ decimalDigitsLimit: Infinity })));

    failCase(
      specimen,
      M.bigint(),
      /^bigint (\(a bigint\)|"\[1(0+)n\]") must not have more than (\(a number\)|100) digits$/,
    );
    failCase(
      specimen,
      M.nat(),
      /^bigint (\(a bigint\)|"\[1(0+)n\]") must not have more than (\(a number\)|100) digits$/,
    );
  }
  {
    const specimen = makeCopyBag(
      harden([
        ['z', 1n],
        ['x', 379n],
        ['a', 1n],
      ]),
    );
    successCase(specimen, M.bag());
    successCase(specimen, M.bagOf(M.string()));

    failCase(
      specimen,
      M.bag(harden({ decimalDigitsLimit: 2 })),
      /^bag counts\[1\]: bigint (\(a bigint\)|"\[379n\]") must not have more than (\(a number\)|2) digits$/,
    );
    failCase(
      specimen,
      M.bagOf(M.string(), undefined, harden({ decimalDigitsLimit: 2 })),
      /^bag counts\[1\]: bigint (\(a bigint\)|"\[379n\]") must not have more than (\(a number\)|2) digits$/,
    );
  }
  // stringLengthLimit
  {
    const specimen = 'moderate length string';
    successCase(specimen, M.string());
    successCase(specimen, M.string(harden({ stringLengthLimit: 40 })));
    failCase(
      specimen,
      M.string(harden({ stringLengthLimit: 10 })),
      /^string (\(a string\)|"moderate length string") must not be bigger than (\(a number\)|10)$/,
    );
  }
  {
    const specimen = 'x'.repeat(defaultLimits.stringLengthLimit + 1);
    successCase(specimen, M.string(harden({ stringLengthLimit: Infinity })));

    failCase(
      specimen,
      M.string(),
      /^string (\(a string\)|"(x+)") must not be bigger than (\(a number\)|100000)$/,
    );
  }
  // symbolNameLengthLimit
  {
    const specimen = passableSymbolForName('moderate length string');
    successCase(specimen, M.symbol());
    successCase(specimen, M.symbol(harden({ symbolNameLengthLimit: 40 })));

    failCase(
      specimen,
      M.symbol(harden({ symbolNameLengthLimit: 10 })),
      /^Symbol name (\(a string\)|"moderate length string") must not be bigger than (\(a number\)|10)$/,
    );
  }
  {
    const specimen = passableSymbolForName(
      'x'.repeat(defaultLimits.symbolNameLengthLimit + 1),
    );
    successCase(
      specimen,
      M.symbol(harden({ symbolNameLengthLimit: Infinity })),
    );

    failCase(
      specimen,
      M.symbol(),
      /^Symbol name (\(a string\)|"(x+)") must not be bigger than (\(a number\)|100)$/,
    );
  }
  // numPropertiesLimit, propertyNameLengthLimit
  {
    const specimen = {
      z: 1000000n,
      x0123456789: 379n,
      a: 10000000n,
    };
    successCase(specimen, M.record());
    successCase(
      specimen,
      M.record(harden({ numPropertiesLimit: 10, propertyNameLengthLimit: 20 })),
    );
    successCase(specimen, M.recordOf(M.string(), M.bigint()));
    successCase(
      specimen,
      M.recordOf(
        M.string(),
        M.bigint(),
        harden({ numPropertiesLimit: 10, propertyNameLengthLimit: 20 }),
      ),
    );

    failCase(
      specimen,
      M.record(harden({ numPropertiesLimit: 2 })),
      /^Must not have more than (\(a number\)|2) properties: (\(an? object\)|\{"a":"\[10000000n\]","x0123456789":"\[379n\]","z":"\[1000000n\]"\})$/,
    );
    failCase(
      specimen,
      M.record(harden({ propertyNameLengthLimit: 5 })),
      /^(\(a string\)|x0123456789): Property name must not be longer than (\(a number\)|5)$/,
    );
  }
  // arrayLengthLimit
  {
    const specimen = [...'moderate length string'];
    successCase(specimen, M.array());
    successCase(specimen, M.arrayOf(M.string()));
    successCase(specimen, M.array(harden({ arrayLengthLimit: 40 })));
    successCase(
      specimen,
      M.arrayOf(M.string(), harden({ arrayLengthLimit: 40 })),
    );

    failCase(
      specimen,
      M.array(harden({ arrayLengthLimit: 10 })),
      /^Array length (\(a number\)|22) must be <= limit (\(a number\)|10)$/,
    );
    failCase(
      specimen,
      M.arrayOf(M.number()),
      /^\[0\]: string (\(a string\)|"m") - Must be a number$/,
    );
    failCase(
      specimen,
      M.arrayOf(M.number(), harden({ arrayLengthLimit: 10 })),
      /^Array length (\(a number\)|22) must be <= limit (\(a number\)|10)$/,
    );
    failCase(
      specimen,
      M.arrayOf(M.string(), harden({ arrayLengthLimit: 10 })),
      /^Array length (\(a number\)|22) must be <= limit (\(a number\)|10)$/,
    );
  }
  {
    const specimen = Array(defaultLimits.arrayLengthLimit + 1).fill(1);
    successCase(specimen, M.array(harden({ arrayLengthLimit: Infinity })));
    failCase(
      specimen,
      M.array(),
      /^Array length (\(a number\)|10001) must be <= limit (\(a number\)|10000)$/,
    );
  }
  // byteLengthLimit
  {
    const specimen = new ArrayBuffer(1000).transferToImmutable();
    successCase(specimen, M.byteArray());
    successCase(specimen, M.byteArray(harden({ byteLengthLimit: 1001 })));
    successCase(specimen, M.byteArray(harden({ byteLengthLimit: 1000 })));
    failCase(
      specimen,
      M.byteArray(harden({ byteLengthLimit: 999 })),
      /byteArray (\(an? object\)|"\[.*ArrayBuffer\]") must not be bigger than (\(a number\)|999)/,
    );
  }
  // numSetElementsLimit
  {
    const specimen = makeCopySet([0, 1, 2, 3, 4, 5]);
    successCase(specimen, M.set());
    successCase(specimen, M.setOf(M.number()));

    failCase(
      specimen,
      M.set(harden({ numSetElementsLimit: 3 })),
      /^Set must not have more than (\(a number\)|3) elements: (\(a number\)|6)$/,
    );
  }
  // numUniqueBagElementsLimit
  {
    const specimen = makeCopyBag([
      [0, 37n],
      [1, 3n],
      [2, 100000n],
      [3, 1n],
    ]);
    successCase(specimen, M.bag());
    successCase(specimen, M.bagOf(M.number()));

    failCase(
      specimen,
      M.bag(harden({ numUniqueBagElementsLimit: 3 })),
      /^Bag must not have more than (\(a number\)|3) unique elements: (\(an object\)|"\[copyBag\]")$/,
    );
  }
  // numMapEntriesLimit
  {
    const specimen = makeCopyMap([
      [0, 37n],
      [1, 3n],
      [2, 100000n],
      [3, 1n],
    ]);
    successCase(specimen, M.mapOf());
    successCase(specimen, M.mapOf(M.number(), M.nat()));

    failCase(
      specimen,
      M.map(harden({ numMapEntriesLimit: 3 })),
      /^CopyMap must have no more than (\(a number\)|3) entries: (\(an object\)|"\[copyMap\]")$/,
    );
  }
};

test('test pattern limits', t => {
  const successCase = (specimen, yesPattern) => {
    harden(specimen);
    harden(yesPattern);
    t.notThrows(() => mustMatch(specimen, yesPattern), `${yesPattern}`);
    t.assert(matches(specimen, yesPattern), `${yesPattern}`);
  };
  const failCase = (specimen, noPattern, message) => {
    harden(specimen);
    harden(noPattern);
    t.throws(() => mustMatch(specimen, noPattern), { message }, `${noPattern}`);
    t.false(matches(specimen, noPattern), `${noPattern}`);
  };
  runTests(successCase, failCase);
});
