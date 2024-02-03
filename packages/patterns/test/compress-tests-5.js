// @ts-check
import { M } from '../src/patterns/patternMatchers.js';

export const runTests = testTriple => {
  // const brand = Far('simoleans', {});
  // const moolaBrand = Far('moola', {});
  // const timer = Far('timer', {});

  // testTriple({ brand, value: 37n }, M.any(), { brand, value: 37n });
  // testTriple({ brand, value: 37n }, { brand, value: M.bigint() }, [37n]);
  // testTriple(
  //   { brand, value: 37n },
  //   { brand: M.remotable(), value: M.bigint() },
  //   [37n, brand],
  // );
  // testTriple(
  //   { brand, value: 37n },
  //   { brand: M.bigint(), value: M.bigint() },
  //   undefined,
  //   'test mustCompress: brand: remotable "[Alleged: simoleans]" - Must be a bigint',
  // );
  // testTriple({ brand, value: 37n }, M.recordOf(M.string(), M.scalar()), {
  //   brand,
  //   value: 37n,
  // });
  testTriple(
    [{ foo: 'a' }, { foo: 'b' }, { foo: 'c' }],
    M.arrayOf(harden({ foo: M.string() })),
    [[['a'], ['b'], ['c']]],
  );
  // testTriple(
  //   [{ foo: 'a' }, { foo: 'b' }, { foo: 'c' }],
  //   // Test that without the compression version tag, there is no
  //   // non -default compression or decompression
  //   makeTagged('match:arrayOf', harden([{ foo: M.string() }])),
  //   [{ foo: 'a' }, { foo: 'b' }, { foo: 'c' }],
  // );
  // testTriple(
  //   makeCopySet([{ foo: 'a' }, { foo: 'b' }, { foo: 'c' }]),
  //   M.setOf(harden({ foo: M.string() })),
  //   [[['c'], ['b'], ['a']]],
  // );
  // testTriple(
  //   makeCopyBagFromElements([{ foo: 'a' }, { foo: 'a' }, { foo: 'c' }]),
  //   M.bagOf(harden({ foo: M.string() })),
  //   [
  //     [
  //       ['c', 1n],
  //       ['a', 2n],
  //     ],
  //   ],
  // );
  // testTriple(
  //   makeCopyBagFromElements([{ foo: 'a' }, { foo: 'a' }, { foo: 'c' }]),
  //   M.bagOf(harden({ foo: M.string() }), 1n),
  //   undefined,
  //   'test mustCompress: bag counts[1]: "[2n]" - Must be: "[1n]"',
  // );
  // testTriple(
  //   makeCopyBagFromElements([{ foo: 'a' }, { foo: 'b' }, { foo: 'c' }]),
  //   M.bagOf(harden({ foo: M.string() }), 1n),
  //   [[['c'], ['b'], ['a']]],
  // );
  // testTriple(
  //   makeCopyMap([
  //     [{ foo: 'a' }, { bar: 1 }],
  //     [{ foo: 'b' }, { bar: 2 }],
  //     [{ foo: 'c' }, { bar: 3 }],
  //   ]),
  //   M.mapOf(harden({ foo: M.string() }), harden({ bar: M.number() })),
  //   [
  //     [
  //       [['c'], ['b'], ['a']],
  //       [[3], [2], [1]],
  //     ],
  //   ],
  // );
  // testTriple(
  //   makeCopyMap([
  //     [{ foo: 'c' }, { bar: 3 }],
  //     [{ foo: 'b' }, { bar: 2 }],
  //     [{ foo: 'a' }, { bar: 1 }],
  //   ]),
  //   // TODO Add a test case where the keys are in the same rankOrder but not
  //   // the same order.
  //   makeCopyMap([
  //     [{ foo: 'c' }, M.any()],
  //     // @ts-expect-error The array need not be generic
  //     [{ foo: 'b' }, { bar: M.number() }],
  //     [{ foo: 'a' }, { bar: 1 }],
  //   ]),
  //   [{ bar: 3 }, 2],
  // );
  // testTriple(
  //   {
  //     want: { Winnings: { brand: moolaBrand, value: ['x', 'y'] } },
  //     give: { Bid: { brand, value: 37n } },
  //     exit: { afterDeadline: { deadline: 11n, timer } },
  //   },
  //   {
  //     want: { Winnings: { brand: moolaBrand, value: M.array() } },
  //     give: { Bid: { brand, value: M.nat() } },
  //     exit: { afterDeadline: { deadline: M.gte(10n), timer } },
  //   },
  //   [['x', 'y'], 37n, 11n],
  // );
  // testTriple(
  //   {
  //     want: {
  //       Winnings: {
  //         brand: moolaBrand,
  //         value: makeCopyBagFromElements([
  //           { foo: 'a' },
  //           { foo: 'b' },
  //           { foo: 'c' },
  //         ]),
  //       },
  //     },
  //     give: { Bid: { brand, value: 37n } },
  //     exit: { afterDeadline: { deadline: 11n, timer } },
  //   },
  //   {
  //     want: {
  //       Winnings: {
  //         brand: moolaBrand,
  //         value: M.bagOf(harden({ foo: M.string() }), 1n),
  //       },
  //     },
  //     give: { Bid: { brand, value: M.nat() } },
  //     exit: { afterDeadline: { deadline: M.gte(10n), timer } },
  //   },
  //   [[['c'], ['b'], ['a']], 37n, 11n],
  // );
  // testTriple(
  //   'orange',
  //   M.or('red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet'),
  //   [[1, []]],
  // );
  // testTriple(
  //   { x: 3, y: 5 },
  //   M.or(harden({ x: M.number(), y: M.number() }), M.bigint(), M.record()),
  //   [[0, [5, 3]]],
  // );
  // testTriple(
  //   [5n],
  //   M.or(harden({ x: M.number(), y: M.number() }), [M.bigint()], M.record()),
  //   [[1, [5n]]],
  // );
  // testTriple(
  //   { x: 3, y: 5, z: 9 },
  //   M.or(harden({ x: M.number(), y: M.number() }), M.bigint(), M.record()),
  //   [[2, { x: 3, y: 5, z: 9 }]],
  // );
  // testTriple(
  //   {
  //     brand,
  //     value: [{ bar: 2 }, { bar: 1 }],
  //   },
  //   {
  //     brand,
  //     value: M.arrayOf(M.and(M.key(), { bar: M.number() })),
  //   },
  //   [[[[2]], [[1]]]],
  // );
  // testTriple(
  //   ['a', 'b', 'c', 'd', 'e'],
  //   M.splitArray(['a', M.string()], [M.any()], M.any()),
  //   [[['b'], [[1, 'c']], ['d', 'e']]],
  // );
  // testTriple(
  //   ['a', 'b', undefined, 'd'],
  //   M.splitArray(['a', M.string()], ['c', 'd', 'e'], M.any()),
  //   [
  //     [
  //       ['b'],
  //       [
  //         [0, []],
  //         [1, []],
  //       ],
  //       [],
  //     ],
  //   ],
  // );
  // testTriple(
  //   { a: 1, b: 2, c: undefined, d: 4, e: 5 },
  //   M.splitRecord({ a: 1, b: M.number() }, { c: M.any(), d: 4, f: 6 }, M.any()),
  //   [[[2], [null, [1, []], [0, []]], { e: 5 }]],
  // );
};
