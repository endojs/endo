import type { HandledPromiseConstructor } from './types.js';

// Package Types /////////////////////////////////////////////////////
//
//   Types exported to consumers.
//

export type {
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
} from './types.js';

declare global {
  // eslint-disable-next-line vars-on-top,no-var
  var HandledPromise: HandledPromiseConstructor;
}
