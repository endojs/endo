const evadeRegexp = /import\s*\(|<!--|-->/g;
const importRegexp = /import(\s*\()/g;

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
  // if p is a string literal containing the string "import(", replace it with a concatenation of two string literals
  // `import(` -> `im`+`port(`
  if (type === 'StringLiteral' && evadeRegexp.test(value)) {
    evadeRegexp.lastIndex = 0; // Reset after test()

    let match = evadeRegexp.exec(value);

    // Initialize with first chunk (up to and including "im")
    // continue appending binary expressions
    // @ts-expect-error we tested earlier, there must be a match. I won't waste cpu time convincing TS there is.
    let lastIndex = match.index + 2;
    /** @type {import('@babel/types').Expression} */
    let expr = {
      type: 'StringLiteral',
      value: value.substring(0, lastIndex),
    };

    // eslint-disable-next-line no-cond-assign
    while ((match = evadeRegexp.exec(value)) !== null) {
      const nextSplitIndex = match.index + 2;
      expr = addStringToExpressions(
        expr,
        value.substring(lastIndex, nextSplitIndex),
      );

      lastIndex = nextSplitIndex;
    }

    // Add final chunk
    expr = addStringToExpressions(expr, value.substring(lastIndex));

    evadeRegexp.lastIndex = 0; // Reset for next use

    p.replaceWith(expr);
  }
};

export const evadeTemplates = p => {
  /** @type {import('@babel/types').Node} */
  const { type } = p.node;

  // Handle template literals (multiline strings)
  // `import(` -> `im${}port(`
  // The transform is only meaning-preserving if not part of a TaggedTemplateExpression, so these need to be excluded until a motivating case shows up. It should be possible to wrap the tag with a function that omits expressions we insert, but that's a lot of work to do preemptively.
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
  let needsTransform = false;
  for (const quasi of quasis) {
    if (evadeRegexp.test(quasi.value.raw)) {
      needsTransform = true;
      evadeRegexp.lastIndex = 0;
      break;
    }
  }

  if (!needsTransform) {
    return;
  }

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
    const quasiValue = quasi.value.raw;

    let match = evadeRegexp.exec(quasiValue);
    if (match !== null) {
      // Add first chunk (up to and including "im")
      let lastIndex = match.index + 2;
      newQuasis.push({
        type: 'TemplateElement',
        value: {
          raw: quasiValue.substring(0, lastIndex),
          cooked: quasiValue.substring(0, lastIndex),
        },
        tail: false,
      });

      // eslint-disable-next-line no-cond-assign
      while ((match = evadeRegexp.exec(quasiValue)) !== null) {
        const nextSplitIndex = match.index + 2;

        addQuasi(quasiValue.substring(lastIndex, nextSplitIndex));

        lastIndex = nextSplitIndex;
      }

      // Add final chunk of this quasi
      addQuasi(quasiValue.substring(lastIndex));

      evadeRegexp.lastIndex = 0;
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

  p.replaceWith({
    type: 'TemplateLiteral',
    quasis: newQuasis,
    expressions: newExpressions,
  });
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

  if (importRegexp.test(pattern)) {
    importRegexp.lastIndex = 0;
    node.pattern = pattern.replace(importRegexp, 'im[p]ort$1');
  }
};

/**
 * Prevents `-->` from appearing in output by adding 
 * an empty block comment to force spacing.
 *
 * @param {import('@babel/traverse').NodePath} p
 * @returns {void}
 */
export const evadeDecrementGreater = p => {
  if (
    p.node.type === 'BinaryExpression' &&
    p.node.operator === '>' &&
    p.node.left.type === 'UpdateExpression' &&
    p.node.left.operator === '--' &&
    !p.node.left.trailingComments?.length
  ) {
    // Add an empty block comment to force a space between -- and >
    p.node.left.trailingComments = [{ type: 'CommentBlock', value: '' }];
  }
};
