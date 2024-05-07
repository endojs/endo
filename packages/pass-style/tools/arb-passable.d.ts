/**
 * The only elements with identity. Everything else should be equal
 * by contents.
 */
export const exampleAlice: import("../src/types.js").RemotableObject<`Alleged: ${string}`> & import("@endo/eventual-send").RemotableBrand<{}, {}>;
export const exampleBob: import("../src/types.js").RemotableObject<`Alleged: ${string}`> & import("@endo/eventual-send").RemotableBrand<{}, {}>;
export const exampleCarol: import("../src/types.js").RemotableObject<`Alleged: ${string}`> & import("@endo/eventual-send").RemotableBrand<{}, {}>;
export const arbString: fc.Arbitrary<string>;
export const arbLeaf: fc.Arbitrary<string | number | bigint | boolean | symbol | Error | Promise<any> | (import("../src/types.js").RemotableObject<`Alleged: ${string}`> & import("@endo/eventual-send").RemotableBrand<{}, {}>) | {
    [x: string]: any;
} | null | undefined>;
/**
 * A factory for arbitrary passables
 */
export const arbPassable: fc.Arbitrary<any>;
import { fc } from '@fast-check/ava';
//# sourceMappingURL=arb-passable.d.ts.map