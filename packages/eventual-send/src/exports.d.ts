import type { HandledPromiseConstructor } from './types.d.ts';

// Package Types /////////////////////////////////////////////////////
//
//   Types exported to consumers.
//

export type {
  Callable,
  RemotableBrand,
  DataOnly,
  FarRef,
  ERef,
  EProxy,
  EOnly,
  RemoteFunctions,
  LocalRecord,
  FilteredKeys,
  PickCallable,
  EPromiseKit as RemoteKit,
  ResolveWithPresenceOptionsBag,
  HandledExecutor,
  Settler,
  HandledPromiseStaticMethods,
  HandledPromiseConstructor,
  Handler as EHandler,
} from './types.d.ts';

declare global {
  // eslint-disable-next-line vars-on-top,no-var
  var HandledPromise: HandledPromiseConstructor;
}
