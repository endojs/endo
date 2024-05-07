export function makeMessageBreakpointTester(optionName: string): MessageBreakpointTester | undefined;
/**
 * A star `'*'` matches any recipient. Otherwise, the string is
 * matched against the value of a recipient's `@@toStringTag`
 * after stripping out any leading `'Alleged: '` or `'DebugName: '`
 * prefix. For objects defined with `Far` this is the first argument,
 * known as the `farName`. For exos, this is the tag.
 */
export type MatchStringTag = string | '*';
/**
 * A star `'*'` matches any method name. Otherwise, the string is
 * matched against the method name. Currently, this is only an exact match.
 * However, beware that we may introduce a string syntax for
 * symbol method names.
 */
export type MatchMethodName = string | '*';
/**
 * A star `'*'` will always breakpoint. Otherwise, the string
 * must be a non-negative integer. Once that is zero, always breakpoint.
 * Otherwise decrement by one each time it matches until it reaches zero.
 * In other words, the countdown represents the number of
 * breakpoint occurrences to skip before actually breakpointing.
 */
export type MatchCountdown = number | '*';
/**
 * This is the external JSON representation, in which
 * - the outer property name is the class-like tag or '*',
 * - the inner property name is the method name or '*',
 * - the value is a non-negative integer countdown or '*'.
 */
export type MessageBreakpoints = Record<MatchStringTag, Record<MatchMethodName, MatchCountdown>>;
/**
 * This is the internal JSON representation, in which
 * - the outer property name is the method name or '*',
 * - the inner property name is the class-like tag or '*',
 * - the value is a non-negative integer countdown or '*'.
 */
export type BreakpointTable = Record<MatchMethodName, Record<MatchStringTag, MatchCountdown>>;
export type MessageBreakpointTester = {
    getBreakpoints: () => MessageBreakpoints;
    setBreakpoints: (newBreakpoints?: MessageBreakpoints) => void;
    shouldBreakpoint: (recipient: object, methodName: string | symbol | undefined) => boolean;
};
//# sourceMappingURL=message-breakpoints.d.ts.map