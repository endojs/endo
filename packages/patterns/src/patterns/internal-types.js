/// <reference types="ses"/>

// TODO
// The following commented out type should be in this file, since the
// `MatchHelper` type is purely internal to this package. However,
// in order to get the governance and solo packages both to pass lint,
// I moved the type declaration itself to types.js. See the comments there
// and in exports.js

// /**
//  * @typedef {object} MatchHelper
//  * This factors out only the parts specific to each kind of Matcher. It is
//  * encapsulated, and its methods can make the stated unchecker assumptions
//  * enforced by the common calling logic.
//  *
//  * @property {(allegedPayload: Passable,
//  *             check: Checker
//  * ) => boolean} checkIsWellFormed
//  * Assumes this is the payload of a CopyTagged with the corresponding
//  * matchTag. Is this a valid payload for a Matcher with that tag?
//  *
//  * @property {(specimen: Passable,
//  *             matcherPayload: Passable,
//  *             check: Checker
//  * ) => boolean} checkMatches
//  * Assuming a valid Matcher of this type with `matcherPayload` as its
//  * payload, does this specimen match that Matcher?
//  *
//  * @property {(payload: Passable) => RankCover} getRankCover
//  * Assumes this is the payload of a CopyTagged with the corresponding
//  * matchTag. Return a RankCover to bound from below and above,
//  * in rank order, all possible Passables that would match this Matcher.
//  * The left element must be before or the same rank as any possible
//  * matching specimen. The right element must be after or the same
//  * rank as any possible matching specimen.
//  */
