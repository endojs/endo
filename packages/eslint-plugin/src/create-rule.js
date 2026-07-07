import { ESLintUtils } from '@typescript-eslint/utils';

/**
 * Creates a typed ESLint rule with a standardized documentation URL pointing
 * to the published rule doc in this package's `docs/rules/` directory.
 *
 * @example
 * ```js
 * const rule = createRule({
 *   name: 'my-rule',
 *   meta: {
 *     type: 'problem',
 *     docs: { description: 'Prevents bad things.' },
 *     messages: { badThing: 'This is a bad thing.' },
 *     schema: [],
 *   },
 *   defaultOptions: [],
 *   create(context) {
 *     return {
 *       Identifier(node) {
 *         context.report({ node, messageId: 'badThing' });
 *       },
 *     };
 *   },
 * });
 * ```
 */
export const createRule = ESLintUtils.RuleCreator(
  name =>
    `https://github.com/endojs/endo/blob/master/packages/eslint-plugin/docs/rules/${name}.md`,
);
