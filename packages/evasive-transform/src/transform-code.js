const evadeRegexp = /import\s*\(|<!--|-->/g;
// The replacement collection for regexp patterns matching the evadeRegexp is only applied to the first matched character, so it is necessary for the regexpReplacements to be maintained together with the evadeRegexp.
const regexpReplacements = {
  i: '\\x69',
  '<': '\\x3C',
  '-': '\\x2D',
};

/**
 * Copy the location from one AST node to another (round-tripping through JSON
 * to sever references), updating the target's end position as if it had zero
 * length.
 *
 * @param {import('@babel/types').Node} target
 * @param {import('@babel/types').Node} src
 */
const adoptStartFrom = (target, src) => {
  try {
    const srcLoc = src.loc;
    if (!srcLoc) return;
    const loc = /** @type {typeof srcLoc} */ (
      JSON.parse(JSON.stringify(srcLoc))
    );
    const start = loc?.start;
    target.loc = loc;
    if (!start) return;
    target.loc.end = /** @type {typeof start} */ ({ ...start });
  } catch (_err) {
    // Ignore errors; this is purely opportunistic.
  }
};

/**
 * Creates a BinaryExpression adding two expressions
 *
 * @param {import('@babel/types').Expression} left
 * @param {string} rightString
 * @returns {import('@babel/types').BinaryExpression}
 */
const addStringToExpressions = (left, rightString) => ({
  type: 'BinaryExpression',
  operator: '+',
  left,
  right: {
    type: 'StringLiteral',
    value: rightString,
  },
});

export const evadeStrings = p => {
  /** @type {import('@babel/types').Node} */
  const { type } = p.node;
  if (type !== 'StringLiteral') {
    return;
  }
  /** @type {import('@babel/types').StringLiteral} */
  const { value } = p.node;
  // Break up problematic substrings, e.g. `"import("` -> `"im"+"port("`.
  /** @type {import('@babel/types').Expression | undefined} */
  let expr;
  let lastIndex = 0;
  for (const match of value.matchAll(evadeRegexp)) {
    const index = match.index + 2;
    const part = value.substring(lastIndex, index);
    expr = !expr
      ? { type: 'StringLiteral', value: part }
      : addStringToExpressions(expr, part);
    if (lastIndex === 0) adoptStartFrom(expr, p.node);
    lastIndex = index;
  }
  if (expr) {
    expr = addStringToExpressions(expr, value.substring(lastIndex));
    p.replaceWith(expr);
  }
};

export const evadeTemplates = p => {
  /** @type {import('@babel/types').Node} */
  const { type } = p.node;

  // Handle template literals (multiline strings)
  // `import(` -> `im${}port(`
  // The transform is only meaning-preserving if not part of a TaggedTemplateExpression, so these need to be excluded until a motivating case shows up. It should be possible to wrap the tag with a function that omits expressions we insert, but that's a lot of work to do preemptively.
  // https://github.com/endojs/endo/pull/3026#discussion_r2632507228
  if (
    type !== 'TemplateLiteral' ||
    p.parent.type === 'TaggedTemplateExpression'
  ) {
    return;
  }
  /** @type {import('@babel/types').TemplateLiteral} */
  const node = p.node;

  const { quasis } = node;

  // Check if any quasi needs transformation
  if (!quasis.some(quasi => quasi.value.raw.match(evadeRegexp))) return;

  /** @type {import('@babel/types').TemplateElement[]} */
  const newQuasis = [];
  /** @type {import('@babel/types').Expression[]} */
  const newExpressions = [];

  const addQuasi = quasiValue => {
    // Insert empty expression to break the pattern
    newExpressions.push({
      type: 'StringLiteral',
      value: '',
    });

    // Add chunk from lastIndex to nextSplitIndex
    newQuasis.push({
      type: 'TemplateElement',
      value: {
        raw: quasiValue,
        cooked: quasiValue,
      },
      tail: false,
    });
  };

  for (let i = 0; i < quasis.length; i += 1) {
    const quasi = quasis[i];
    // We're not currently preserving raw vs. cooked literal data.
    const quasiValue = quasi.value.raw;

    let lastIndex = 0;
    for (const match of quasiValue.matchAll(evadeRegexp)) {
      const index = match.index + 2;
      const raw = quasiValue.substring(lastIndex, index);
      if (lastIndex === 0) {
        // Literal text up to our first cut point.
        newQuasis.push({
          type: 'TemplateElement',
          value: { raw, cooked: raw },
          tail: false,
        });
      } else {
        addQuasi(raw);
      }
      lastIndex = index;
    }
    if (lastIndex !== 0) {
      addQuasi(quasiValue.substring(lastIndex));
    } else {
      newQuasis.push(quasi);
    }

    // Add original expression between quasis
    if (i < node.expressions.length) {
      // @ts-ignore whatever was there, must still be allowed.
      newExpressions.push(node.expressions[i]);
    }
  }

  // Mark last quasi as tail
  if (newQuasis.length > 0) {
    newQuasis[newQuasis.length - 1].tail = true;
  }

  /** @type {import('@babel/types').Node} */
  const replacement = {
    type: 'TemplateLiteral',
    quasis: newQuasis,
    expressions: newExpressions,
  };
  adoptStartFrom(replacement, p.node);
  p.replaceWith(replacement);
};

/**
 * Transforms RegExp literals containing "import" to use a character class
 * to break the pattern detection.
 *
 * `/import(/` -> `/im[p]ort(/`
 *
 * @param {import('@babel/traverse').NodePath} p
 * @returns {void}
 */
export const evadeRegexpLiteral = p => {
  if (p.node.type !== 'RegExpLiteral') {
    return;
  }
  /** @type {import('@babel/types').RegExpLiteral} */
  const node = p.node;
  const { pattern } = node;

  if (pattern.match(evadeRegexp)) {
    node.pattern = pattern.replace(
      evadeRegexp,
      s => regexpReplacements[s[0]] + s.substring(1),
    );
  }
};

/**
 * Prevents `-->` from appearing in output by transforming
 * `x-->y` to `(0,x--)>y`.
 *
 * @param {import('@babel/traverse').NodePath} p
 * @returns {void}
 */
export const evadeDecrementGreater = p => {
  if (
    p.node.type === 'BinaryExpression' &&
    p.node.operator === '>' &&
    p.node.left.type === 'UpdateExpression' &&
    p.node.left.operator === '--'
  ) {
    // Wrap the UpdateExpression in a SequenceExpression: (0, x--)
    p.node.left = {
      type: 'SequenceExpression',
      expressions: [{ type: 'NumericLiteral', value: 0 }, p.node.left],
    };
  }
};
