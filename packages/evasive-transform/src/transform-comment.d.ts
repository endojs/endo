/**
 * Rewrites a Comment Node to avoid triggering SES restrictions.
 *
 * Apparently coerces all comments to block comments.
 *
 * @param {import('@babel/types').Comment} node
 * @param {import('./location-unmapper.js').LocationUnmapper} [unmapLoc]
 */
export function transformComment(node: import('@babel/types').Comment, unmapLoc?: import("./location-unmapper.js").LocationUnmapper | undefined): void;
//# sourceMappingURL=transform-comment.d.ts.map