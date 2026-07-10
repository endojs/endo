// @ts-check
/**
 * Filesystem-shaped tools that read or write text through
 * ReadableTree/WritableTree capabilities, plus `makeDirectory`, which
 * creates a subdirectory in the tree.
 *
 * @import { Pattern } from '@endo/patterns'
 */

import { M } from '@endo/patterns';
import { NamePathShape, NameOrPathShape } from '@endo/daemon/type-guards.js';

/** @import { LalToolDef } from './index.js' */

/** @type {LalToolDef[]} */
export const fsToolDefs = harden([
  {
    name: 'makeDirectory',
    summary:
      'Create a new subdirectory at the given path. ' +
      'Argument: petNamePath (string[]).',
    params: M.splitRecord({ petNamePath: NamePathShape }),
  },
  {
    name: 'readText',
    summary:
      'Read text content from a capability (ReadableTree, WritableTree, etc.). ' +
      'Arguments: petNameOrPath, fileName (string).',
    params: M.splitRecord({
      petNameOrPath: NameOrPathShape,
      fileName: M.string(),
    }),
  },
  {
    name: 'writeText',
    summary:
      'Write text content to a capability (WritableTree, etc.). ' +
      'Arguments: petNameOrPath, fileName (string), content (string).',
    params: M.splitRecord({
      petNameOrPath: NameOrPathShape,
      fileName: M.string(),
      content: M.string(),
    }),
  },
  {
    name: 'editText',
    summary:
      'Edit a text file in a capability (WritableTree, etc.) by exact-string ' +
      'replacement, without re-sending the whole file. Each edit replaces a ' +
      'uniquely-matching `oldText` with `newText`; pass several edits to apply ' +
      'them in one call (they must not overlap). Line endings and a leading BOM ' +
      'are preserved, and a unified diff of the change is returned. ' +
      'Arguments: petNameOrPath, fileName (string), edits (array of ' +
      '{ oldText, newText }).',
    params: M.splitRecord({
      petNameOrPath: NameOrPathShape,
      fileName: M.string(),
      edits: M.arrayOf(
        M.splitRecord({
          oldText: M.string(),
          newText: M.string(),
        }),
      ),
    }),
  },
]);
