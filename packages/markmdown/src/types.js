// @ts-check

/**
 * @typedef {object} Token
 * @property {'text' | 'emphasis' | 'strong' | 'strikethrough' | 'code' | 'link'} type
 * @property {string} [content] - Text content (for text and code tokens)
 * @property {Token[]} [children] - Child tokens (for emphasis, strong, strikethrough, link)
 * @property {string} [href] - Link URL (for link tokens)
 * @property {string} [title] - Link title (for link tokens)
 */

/**
 * @typedef {object} Block
 * @property {'paragraph' | 'heading' | 'code-fence' | 'list-item' | 'list' | 'table' | 'blockquote' | 'horizontal-rule'} type
 * @property {number} [level] - Heading level (1-6)
 * @property {string} [language] - Code fence language
 * @property {Token[] | string} [content] - Inline tokens for text blocks, raw string for code
 * @property {Block[]} [children] - Child blocks for lists, blockquotes
 * @property {boolean} [ordered] - Whether list is ordered
 * @property {Token[][]} [headerRow] - Table header cells (each cell is Token[])
 * @property {Token[][][]} [bodyRows] - Table body rows (each row is Token[][])
 * @property {Array<'left' | 'right' | 'center' | 'none'>} [alignments] - Table column alignments
 */

/**
 * @typedef {object} RenderResult
 * @property {DocumentFragment} fragment - The rendered DOM fragment
 * @property {HTMLElement[]} insertionPoints - Elements where chips should be inserted
 */

/**
 * @callback HighlightCode
 * @param {string} code - Raw source text
 * @param {string} language - Language tag from the fence (may be '')
 * @param {Document} document - DOM document for element creation
 * @returns {DocumentFragment} - Highlighted DOM fragment
 */

/**
 * @typedef {object} RenderOptions
 * @property {Document} [document] - DOM document (defaults to globalThis.document)
 * @property {HighlightCode} [highlightCode] - Code fence highlighter
 */
