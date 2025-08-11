/* global globalThis */

import { makeCustomDurableKindWithContext } from "./custom-kind"

export const defineDurableGlobalKind = (fakeVomKit, zone) => {
  const reanimate = (context) => {
    const { path } = context;
    const [firstPathPart] = path;
    const value = globalThis[firstPathPart];
    return value;
  }
  const make = (context, path) => {
    if (path === undefined) {
      throw new Error('path must be provided');
    }
    if (path.length > 1) {
      throw new Error('multipart paths not supported yet');
    }
    context.path = path;
    return reanimate(context);
  }
  const makeDurableGlobal = makeCustomDurableKindWithContext(
    fakeVomKit,
    zone,
    {
      make,
      reanimate,
    },
  )
  return makeDurableGlobal
}
