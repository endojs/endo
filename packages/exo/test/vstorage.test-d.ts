import { expectTypeOf } from 'expect-type';

import type { Passable, RemotableObject } from '@endo/pass-style';
import type { RemotableBrand } from '@endo/eventual-send';
import { M } from '@endo/patterns';
import type {
  TypeFromInterfaceGuard,
  TypeFromMethodGuard,
} from '@endo/patterns';

import { makeExo, defineExoClass, defineExoClassKit } from '../index.js';
import type { Guarded, GuardedKit } from '../src/types.js';

/**
 * Defined by vstorageStoreKey in vstorage.go
 */
export type VStorageKey = {
  storeName: string;
  storeSubkey: string;
  dataPrefixBytes: string;
  noDataValue?: string;
};

// Complex guard similar to ChainStorageNode
{
  const StorageNodeI = M.interface('StorageNode', {
    setValue: M.callWhen(M.string()).returns(),
    getPath: M.call().returns(M.string()),
    getStoreKey: M.callWhen().returns(M.record()),
    makeChildNode: M.call(M.string())
      .optional(M.splitRecord({}, { sequence: M.boolean() }, {}))
      .returns(M.remotable('StorageNode')),
  });
  const makeNode = defineExoClass(
    'StorageNode',
    StorageNodeI,
    (path: string) => ({ path, data: '' }),
    {
      async setValue(val) {
        expectTypeOf(val).toEqualTypeOf<string>();
        this.state.data = val;
      },
      getPath() {
        return this.state.path;
      },
      async getStoreKey() {
        return {
          storeName: 'test',
          storeSubkey: this.state.path,
          dataPrefixBytes: '00',
        };
      },
      makeChildNode(name, _opts?) {
        expectTypeOf(name).toEqualTypeOf<string>();
        return undefined as any;
      },
    },
  );
  const node = makeNode('/root');
  expectTypeOf(node.setValue).toEqualTypeOf<(val: string) => Promise<void>>();
  expectTypeOf(node.getPath).toEqualTypeOf<() => string>();

  const keyResult = node.getStoreKey();
  expectTypeOf(keyResult).toExtend<Promise<Record<string, unknown>>>();
}
