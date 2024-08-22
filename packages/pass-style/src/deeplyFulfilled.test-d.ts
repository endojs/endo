/* eslint-disable */
import { expectType } from 'tsd';
import { Far } from './make-far';
import { makeTagged } from './makeTagged';
import { deeplyFulfilled } from './deeplyFulfilled';
import type { CopyTagged, Passable, RemotableObject } from './types';

const remotable = Far('foo', {
  myFunc() {
    return 'foo';
  },
});

type MyRemotable = typeof remotable;
type MyNonBrandedRemotable = { myFunc(): 'foo' } & RemotableObject;

const copyTagged = makeTagged('someTag', remotable);

const someUnknown: unknown = null;
const someAny: any = null;

expectType<undefined>(await deeplyFulfilled(undefined));
expectType<string>(await deeplyFulfilled('str'));
expectType<boolean>(await deeplyFulfilled(true));
expectType<number>(await deeplyFulfilled(1));
expectType<bigint>(await deeplyFulfilled(1n));
expectType<symbol>(await deeplyFulfilled(Symbol.for('foo')));
expectType<null>(await deeplyFulfilled(null));
expectType<Error>(await deeplyFulfilled(new Error()));
expectType<MyRemotable>(await deeplyFulfilled(remotable));
expectType<MyNonBrandedRemotable>(
  await deeplyFulfilled(remotable as MyNonBrandedRemotable),
);
expectType<CopyTagged<'someTag', MyRemotable>>(
  await deeplyFulfilled(copyTagged),
);
expectType<[]>(await deeplyFulfilled([]));
expectType<{}>(await deeplyFulfilled({}));

expectType<MyRemotable>(await deeplyFulfilled(Promise.resolve(remotable)));
expectType<{ a: MyRemotable }>(
  await deeplyFulfilled(Promise.resolve({ a: Promise.resolve(remotable) })),
);

// By default TS infer an array type instead of a tuple type
const tuple: [Promise<MyRemotable>] = [Promise.resolve(remotable)];

expectType<Passable>(tuple);
expectType<[MyRemotable]>(await deeplyFulfilled(tuple));
expectType<[MyRemotable]>(await deeplyFulfilled(Promise.resolve(tuple)));

expectType<CopyTagged<'someOtherTag', MyRemotable>>(
  await deeplyFulfilled(
    Promise.resolve(makeTagged('someOtherTag', Promise.resolve(remotable))),
  ),
);

// @ts-expect-error not passable
deeplyFulfilled(someUnknown);
// @ts-expect-error not passable
deeplyFulfilled(Promise.resolve(someUnknown));
// @ts-expect-error not passable
deeplyFulfilled(Promise.resolve({ a: Promise.resolve(someUnknown) }));
// @ts-expect-error not passable
deeplyFulfilled(Promise.resolve([Promise.resolve(someUnknown)]));

expectType<any>(await deeplyFulfilled(someAny));
expectType<any>(await deeplyFulfilled(Promise.resolve(someAny)));
expectType<{ a: any }>(
  await deeplyFulfilled(Promise.resolve({ a: Promise.resolve(someAny) })),
);
expectType<[any]>(
  await deeplyFulfilled(
    Promise.resolve([Promise.resolve(someAny)] as [Promise<any>]),
  ),
);
