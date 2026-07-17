/* eslint-disable no-underscore-dangle */
// @ts-nocheck

import { createRequire } from 'node:module';
import { createRule } from '../create-rule.js';

const _require = createRequire(import.meta.url);

/**
 * Dynamically imports a module by trying multiple candidate paths in order.
 * Returns the first one that resolves, or `null` if none do.
 * @param {...any} moduleNames
 */
const safeRequire = (...moduleNames) => {
  for (const moduleName of moduleNames) {
    try {
      return _require(moduleName);
    } catch {
      // try next
    }
  }
  return null;
};

// XXX: we should probably just maintain our own copy of the code-path-analysis modules

// ESLint 8 and 9 keep code-path analysis at this location.
const CodePathAnalyzer = safeRequire(
  'eslint/lib/linter/code-path-analysis/code-path-analyzer',
  'eslint/lib/code-path-analysis/code-path-analyzer',
);
const CodePathSegment = safeRequire(
  'eslint/lib/linter/code-path-analysis/code-path-segment',
  'eslint/lib/code-path-analysis/code-path-segment',
);
const CodePath = safeRequire(
  'eslint/lib/linter/code-path-analysis/code-path',
  'eslint/lib/code-path-analysis/code-path',
);

const originalLeaveNode = CodePathAnalyzer?.prototype?.leaveNode;

/**
 * Mirrors ESLint's internal `forwardCurrentToHead` helper which advances the
 * code-path state machine after recognizing a throw-like exit.
 *
 * Copied from ESLint's code-path-analysis/code-path-analyzer.js.
 * @param analyzer
 * @param node
 */
const forwardCurrentToHead = (analyzer, node) => {
  const codePath = analyzer.codePath;
  const state = CodePath.getState(codePath);
  const currentSegments = state.currentSegments;
  const headSegments = state.headSegments;
  const end = Math.max(currentSegments.length, headSegments.length);

  for (let i = 0; i < end; i += 1) {
    const currentSegment = currentSegments[i];
    const headSegment = headSegments[i];
    if (currentSegment !== headSegment && currentSegment?.reachable) {
      analyzer.emitter.emit('onCodePathSegmentEnd', currentSegment, node);
    }
  }

  state.currentSegments = headSegments;

  for (let i = 0; i < end; i += 1) {
    const currentSegment = currentSegments[i];
    const headSegment = headSegments[i];
    if (currentSegment !== headSegment && headSegment) {
      CodePathSegment.markUsed(headSegment);
      if (headSegment.reachable) {
        analyzer.emitter.emit('onCodePathSegmentStart', headSegment, node);
      }
    }
  }
};

/**
 * Returns `true` when the node is an `assert.fail()` call expression.
 * @param node
 */
const isAssertFail = node =>
  node.type === 'CallExpression' &&
  node.callee.type === 'MemberExpression' &&
  !node.callee.computed &&
  node.callee.object.type === 'Identifier' &&
  node.callee.object.name === 'assert' &&
  node.callee.property.type === 'Identifier' &&
  node.callee.property.name === 'fail';

/**
 * Replacement `leaveNode` that treats `assert.fail()` as a throw for
 * the purposes of ESLint's control-flow / code-path analysis.
 *
 * Installed on `CodePathAnalyzer.prototype` while the rule is active and
 * restored on `Program:exit` so it doesn't bleed into other files.
 * @param node
 */
function overrideLeaveNode(node) {
  if (isAssertFail(node)) {
    this.currentNode = node;
    forwardCurrentToHead(this, node);
    CodePath.getState(this.codePath).makeThrow();
    this.original.leaveNode(node);
    this.currentNode = null;
  } else {
    originalLeaveNode.call(this, node);
  }
}

const visitor =
  CodePathAnalyzer == null || !originalLeaveNode
    ? {}
    : {
        Program() {
          CodePathAnalyzer.prototype.leaveNode = overrideLeaveNode;
        },
        'Program:exit': function () {
          CodePathAnalyzer.prototype.leaveNode = originalLeaveNode;
        },
      };

export default createRule({
  name: 'assert-fail-as-throw',
  meta: {
    type: 'problem',
    docs: {
      description:
        "Make `assert.fail()` expressions count as a `throw` in ESLint's control-flow analysis.",
    },
    fixable: undefined,
    schema: [],
    // This rule patches ESLint's code-path analyzer and never calls
    // context.report(), so there are no violation messages to define.
    // eslint-disable-next-line eslint-plugin/prefer-message-ids
    messages: {},
  },
  defaultOptions: [],
  create() {
    return visitor;
  },
});
