import type { PathEntry, PathEntryIssuer } from '../src/fs/types.js';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2
    ? true
    : false;

type Assert<T extends true> = T;

declare const issuer: PathEntryIssuer;
const entry: PathEntry = issuer.entry(['src', 'index.js']);
const child: PathEntry = entry.child('test.js');
type _EntryIsPortable = Assert<Equal<typeof child, PathEntry>>;
