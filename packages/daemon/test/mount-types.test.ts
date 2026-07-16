import type { PassableReader } from '@endo/exo-stream';
import type { TypeFromInterfaceGuard } from '@endo/patterns';
import type {
  DirectoryWriteSource,
  PathEntry,
  PathEntryIssuer,
  SnapshotTree,
} from '@endo/platform/fs/lite/types';

import { MountInterface } from '../src/interfaces.js';
import type {
  EndoMount,
  EndoMountEntry,
  EndoMountFile,
  EndoMountStat,
  MountNameChange,
  ReadableTreeView,
} from '../src/types.js';

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2
    ? true
    : false;

type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
type RuntimeMount = TypeFromInterfaceGuard<typeof MountInterface>;

declare const mount: EndoMount;
declare const source: DirectoryWriteSource;
const issuer: PathEntryIssuer = mount;
const entry = issuer.entry(['src']);
const hasPath: Promise<boolean> = mount.has('src', 'index.js');
const hasEntry: Promise<boolean> = mount.has(entry);
const lookup: Promise<EndoMount | EndoMountFile> = mount.lookup(entry);
const maybeLookup: Promise<EndoMount | EndoMountFile | undefined> =
  mount.maybeLookup(entry);
const subView: Promise<EndoMount> = mount.subView(entry);
const readOnly: ReadableTreeView = mount.readOnly();
const snapshot: Promise<SnapshotTree> = mount.snapshot();
const changes: PassableReader<MountNameChange, undefined> =
  mount.followNameChanges('src');
const stat: Promise<EndoMountStat | undefined> = mount.stat(entry);
const write: Promise<void> = mount.write(entry, source);
const makeFile: Promise<void> = mount.makeFile(entry, 'contents');

type _IssuerEntryIsPathEntry = Assert<
  Equal<typeof entry, ReturnType<PathEntryIssuer['entry']>>
>;
type _FollowNameChangesIsReader = Assert<
  Equal<
    ReturnType<EndoMount['followNameChanges']>,
    PassableReader<MountNameChange, undefined>
  >
>;
type _StatIsDaemonOwned = Assert<
  Equal<Awaited<ReturnType<EndoMount['stat']>>, EndoMountStat | undefined>
>;
type _LookupIsExact = Assert<
  Equal<Awaited<ReturnType<EndoMount['lookup']>>, EndoMount | EndoMountFile>
>;
type _MaybeLookupIsExact = Assert<
  Equal<
    Awaited<ReturnType<EndoMount['maybeLookup']>>,
    EndoMount | EndoMountFile | undefined
  >
>;
type _SubViewIsExact = Assert<
  Equal<Awaited<ReturnType<EndoMount['subView']>>, EndoMount>
>;
type _ReadOnlyIsExact = Assert<
  Equal<ReturnType<EndoMount['readOnly']>, ReadableTreeView>
>;
type _SnapshotIsExact = Assert<
  Equal<Awaited<ReturnType<EndoMount['snapshot']>>, SnapshotTree>
>;
type _WritePayloadIsPortable = Assert<
  Equal<Parameters<EndoMount['write']>[1], DirectoryWriteSource>
>;
type _MakeFileContentIsString = Assert<
  Equal<Parameters<EndoMount['makeFile']>[1], string | undefined>
>;

// Runtime patterns cannot encode the semantic payload of a promise, but each
// precise public promise still fits the broad guarded result.
type _LookupResultPassesGuard = Assert<
  ReturnType<EndoMount['lookup']> extends ReturnType<RuntimeMount['lookup']>
    ? true
    : false
>;
type _SubViewResultPassesGuard = Assert<
  ReturnType<EndoMount['subView']> extends ReturnType<RuntimeMount['subView']>
    ? true
    : false
>;
type _SnapshotResultPassesGuard = Assert<
  ReturnType<EndoMount['snapshot']> extends ReturnType<RuntimeMount['snapshot']>
    ? true
    : false
>;
type _MaybeLookupGuardIsAsync = Assert<
  IsAny<ReturnType<RuntimeMount['maybeLookup']>> extends false
    ? ReturnType<RuntimeMount['maybeLookup']> extends PromiseLike<unknown>
      ? true
      : false
    : false
>;
type _MakeFileGuardContentIsString = Assert<
  Equal<Parameters<RuntimeMount['makeFile']>[1], string | undefined>
>;
type _PublicEntryMatchesRuntimePath = Assert<
  EndoMountEntry extends Parameters<RuntimeMount['lookup']>[0] ? true : false
>;
type _PortableEntryIsCanonical = Assert<Equal<EndoMountEntry, PathEntry>>;

// The bindings above exist only so their declared type annotations force
// `tsc` to check the assignment against each call's inferred return type.
// None of them is otherwise read, so `void` each one to keep
// `no-unused-vars` from flagging them.
void hasPath;
void hasEntry;
void lookup;
void maybeLookup;
void subView;
void readOnly;
void snapshot;
void changes;
void stat;
void write;
void makeFile;
