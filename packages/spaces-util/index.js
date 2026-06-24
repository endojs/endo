// @ts-check

// Shared message-rendering primitives for Endo Chat spaces. These are the leaf
// utils the chat bodies and the host shell all consume — moved here so the space
// packages (`@endo/space-chat`, and the channel family later) can depend on them
// without depending back on the `@endo/chat` app.

export {
  prepareTextWithPlaceholders,
  renderMarkdown,
  renderPlainText,
} from './src/markdown-render.js';
export { markdownToVnodes, MarkdownFragment } from './src/markdown-vnodes.js';
export { valueToVnodes } from './src/value-vnodes.js';
export { valueComponent } from './src/value-component.js';
export {
  dateFormatter,
  timeFormatter,
  relativeTime,
  numberFormatter,
} from './src/time-formatters.js';
export { playChime } from './src/chime.js';
export { assertValidLocator, idFromLocator } from './src/locator.js';
export { tokenAutocompleteComponent } from './src/token-autocomplete.js';
