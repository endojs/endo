export type Checker = import('./types.js').Checker;
export type PassStyle = import('./types.js').PassStyle;
export type PassStyleOf = import('./types.js').PassStyleOf;
/**
 * The PassStyleHelper are only used to make a `passStyleOf` function.
 * Thus, it should not depend on an ambient one. Rather, each helper should be
 * pure, and get its `passStyleOf` or similar function from its caller.
 *
 * For those methods that have a last `passStyleOf` or `passStyleOfRecur`,
 * they must defend against the other arguments being malicious, but may
 * *assume* that `passStyleOfRecur` does what it is supposed to do.
 * Each such method is not trying to defend itself against a malicious
 * `passStyleOfRecur`, though it may defend against some accidents.
 */
export type PassStyleHelper = {
    styleName: PassStyle;
    /**
     * If `canBeValid` returns true, then the candidate would
     * definitely not be valid for any of the other helpers.
     * `assertValid` still needs to be called to determine if it
     * actually is valid.
     */
    canBeValid: (candidate: any, check?: Checker) => boolean;
    assertValid: (candidate: any, passStyleOfRecur: PassStyleOf) => void;
};
//# sourceMappingURL=internal-types.d.ts.map