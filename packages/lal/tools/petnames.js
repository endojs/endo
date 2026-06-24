// @ts-check
/**
 * Pet-name directory tools: presence, enumeration, lookup, and the three
 * directory-edit operations (remove, move, copy), plus
 * `adopt` which materializes a pet-name binding from an incoming package
 * message. The trigger for `adopt` is mail-shaped but its effect is to
 * create a pet name in the local directory, which is why it lives here
 * with the other directory mutators rather than in mail.js.
 *
 * @import { Pattern } from '@endo/patterns'
 */

import { M } from '@endo/patterns';
import { NamePathShape, NameOrPathShape } from '@endo/daemon/type-guards.js';

/** @import { LalToolDef } from './index.js' */

const MessageNumberShape = M.or(M.bigint(), M.number());

/** @type {LalToolDef[]} */
export const petnamesToolDefs = harden([
  // --- Directory operations ---
  {
    name: 'has',
    summary:
      'Check if a pet name exists in the directory. Returns true or false. ' +
      'Argument: petNamePath (string[]).',
    params: M.splitRecord({ petNamePath: NamePathShape }),
  },
  {
    name: 'list',
    summary:
      'List contents of your directory or any capability you have a pet name for. ' +
      'With no arguments, lists pet names in your root directory. ' +
      'With a name, looks up that capability and calls list() on it. ' +
      'Optional argument: name (string or string[]).',
    params: M.splitRecord({}, { name: NameOrPathShape }),
  },
  {
    name: 'lookup',
    summary:
      'Resolve a pet name or path to its value. Returns the value stored under that name. ' +
      'Argument: petNameOrPath (string or string[]).',
    params: M.splitRecord({ petNameOrPath: NameOrPathShape }),
  },
  {
    name: 'remove',
    summary:
      'Remove a pet name from the directory. The underlying value is not deleted, just the name mapping. ' +
      'Argument: petNamePath (string[]).',
    params: M.splitRecord({ petNamePath: NamePathShape }),
  },
  {
    name: 'move',
    summary:
      'Move/rename a reference from one name to another. The original name is removed. ' +
      'Arguments: fromPath (string[]), toPath (string[]).',
    params: M.splitRecord({ fromPath: NamePathShape, toPath: NamePathShape }),
  },
  {
    name: 'copy',
    summary:
      'Copy a reference to a new name. Both names will refer to the same value. ' +
      'Arguments: fromPath (string[]), toPath (string[]).',
    params: M.splitRecord({ fromPath: NamePathShape, toPath: NamePathShape }),
  },
  {
    name: 'adopt',
    summary:
      'Adopt a value from an incoming package message, giving it a pet name. ' +
      'Arguments: messageNumber (BigInt encoded as "+N", e.g. "+5"), edgeName, petName.',
    params: M.splitRecord({
      messageNumber: MessageNumberShape,
      edgeName: NameOrPathShape,
      petName: NameOrPathShape,
    }),
  },
]);
