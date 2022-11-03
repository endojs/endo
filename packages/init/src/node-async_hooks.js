import { createHook, AsyncResource } from 'async_hooks';

const asyncHooksSymbols = {
  async_id_symbol: undefined,
  trigger_async_id_symbol: undefined,
  destroyed: undefined,
};

const promiseAsyncHookFallbackStates = new WeakMap();

const setAsyncSymbol = (description, symbol) => {
  if (!(description in asyncHooksSymbols)) {
    throw new Error('Unknown symbol');
  } else if (!asyncHooksSymbols[description]) {
    if (symbol.description !== description) {
      // Throw an error since the whitelist mechanism relies on the description
      throw new Error(
        `Mismatched symbol found for ${description}: ${String(symbol)}`,
      );
    }
    asyncHooksSymbols[description] = symbol;
    return true;
  } else if (asyncHooksSymbols[description] !== symbol) {
    // process._rawDebug(
    //   `Found duplicate ${description}:`,
    //   symbol,
    //   asyncHooksSymbols[description],
    // );
    return false;
  } else {
    return true;
  }
};

// We can get the `async_id_symbol` and `trigger_async_id_symbol` through a
// simple instantiation of async_hook.AsyncResource, which causes few side
// effects. These are the 2 symbols that may be late bound, aka after the promise
// is returned to the program and would normally be frozen.
const findAsyncSymbolsFromAsyncResource = () => {
  let found = 0;
  Object.getOwnPropertySymbols(new AsyncResource('Bootstrap')).forEach(sym => {
    const { description } = sym;
    if (description && description in asyncHooksSymbols) {
      if (setAsyncSymbol(description, sym)) {
        found += 1;
      }
    }
  });
  return found;
};

// To get the `destroyed` symbol installed on promises by async_hooks,
// the only option is to create and enable an AsyncHook.
// Different versions of Node handle this in various ways.
const getPromiseFromCreateHook = () => {
  const bootstrapHookData = [];
  const bootstrapHook = createHook({
    init(asyncId, type, triggerAsyncId, resource) {
      if (type !== 'PROMISE') return;
      // process._rawDebug('Bootstrap', asyncId, triggerAsyncId, resource);
      bootstrapHookData.push({ asyncId, triggerAsyncId, resource });
    },
    destroy(_asyncId) {
      // Needs to be present to trigger the addition of the destroyed symbol
    },
  });

  bootstrapHook.enable();
  // Use a never resolving promise to avoid triggering settlement hooks
  const trigger = new Promise(() => {});
  bootstrapHook.disable();

  // In some versions of Node, async_hooks don't give access to the resource
  // itself, but to a "wrapper" which is basically hooks metadata for the promise
  const promisesData = bootstrapHookData.filter(
    ({ resource }) => Promise.resolve(resource) === resource,
  );
  const { length } = promisesData;
  if (length > 1) {
    // process._rawDebug('Found multiple potential candidates');
  }

  const promiseData = promisesData.find(({ resource }) => resource === trigger);

  if (promiseData) {
    // Normally all promise hooks are disabled in a subsequent microtask
    // That means Node versions that modify promises at init will still
    // trigger our proto hooks for promises created in this turn
    // The following trick will disable the internal promise init hook
    // However, only do this for destroy modifying versions, since some versions
    // only modify promises if no destroy hook is requested, and do not correctly
    // reset the internal init promise hook in those case. (e.g. v14.16.2)
    const resetHook = createHook({});
    resetHook.enable();
    resetHook.disable();
  } else if (length) {
    // process._rawDebug('No candidates matched');
  }
  return promiseData;
};

const findAsyncSymbolsFromPromiseCreateHook = () => {
  const bootstrapPromise = getPromiseFromCreateHook();

  if (bootstrapPromise) {
    const { asyncId, triggerAsyncId, resource } = bootstrapPromise;
    const symbols = Object.getOwnPropertySymbols(resource);
    // const { length } = symbols;
    let found = 0;
    // if (length !== 3) {
    //   process._rawDebug(`Found ${length} symbols on promise:`, ...symbols);
    // }
    symbols.forEach(symbol => {
      const value = resource[symbol];
      let type;
      if (value === asyncId) {
        type = 'async_id_symbol';
      } else if (value === triggerAsyncId) {
        type = 'trigger_async_id_symbol';
      } else if (typeof value === 'object' && 'destroyed' in value) {
        type = 'destroyed';
      } else {
        // process._rawDebug(`Unexpected symbol`, symbol);
        return;
      }

      if (setAsyncSymbol(type, symbol)) {
        found += 1;
      }
    });
    return found;
  } else {
    // This node version is not mutating promises
    return -2;
  }
};

const getAsyncHookFallbackState = (promise, { create = false } = {}) => {
  let state = promiseAsyncHookFallbackStates.get(promise);
  if (!state && create) {
    state = {
      // @ts-expect-error key may be undefined
      [asyncHooksSymbols.async_id_symbol]: undefined,
      // @ts-expect-error key may be undefined
      [asyncHooksSymbols.trigger_async_id_symbol]: undefined,
    };
    if (asyncHooksSymbols.destroyed) {
      state[asyncHooksSymbols.destroyed] = undefined;
    }
    promiseAsyncHookFallbackStates.set(promise, state);
  }
  return state;
};

const setAsyncIdFallback = (promise, symbol, value) => {
  const state = getAsyncHookFallbackState(promise, { create: true });

  if (state[symbol]) {
    if (state[symbol] !== value) {
      // This can happen if a frozen promise created before hooks were enabled
      // is used multiple times as a parent promise
      // It's safe to ignore subsequent values
    }
  } else {
    state[symbol] = value;
  }
};

const getAsyncHookSymbolPromiseProtoDesc = (
  symbol,
  { disallowGet = false } = {},
) => ({
  set(value) {
    if (Object.isExtensible(this)) {
      Object.defineProperty(this, symbol, {
        value,
        // Workaround a Node bug setting the destroyed sentinel multiple times
        writable: disallowGet,
        configurable: false,
        enumerable: false,
      });
    } else {
      // process._rawDebug('fallback set of async id', symbol, value, new Error().stack);
      setAsyncIdFallback(this, symbol, value);
    }
  },
  get() {
    if (disallowGet) {
      return undefined;
    }
    const state = getAsyncHookFallbackState(this, { create: false });
    return state && state[symbol];
  },
  enumerable: false,
  configurable: true,
});

export const setup = ({ withDestroy = true } = {}) => {
  if (withDestroy) {
    findAsyncSymbolsFromPromiseCreateHook();
  } else {
    findAsyncSymbolsFromAsyncResource();
  }

  if (
    !asyncHooksSymbols.async_id_symbol ||
    !asyncHooksSymbols.trigger_async_id_symbol
  ) {
    // process._rawDebug(`Async symbols not found, moving on`);
    return;
  }

  const PromiseProto = Promise.prototype;
  Object.defineProperty(
    PromiseProto,
    asyncHooksSymbols.async_id_symbol,
    getAsyncHookSymbolPromiseProtoDesc(asyncHooksSymbols.async_id_symbol),
  );
  Object.defineProperty(
    PromiseProto,
    asyncHooksSymbols.trigger_async_id_symbol,
    getAsyncHookSymbolPromiseProtoDesc(
      asyncHooksSymbols.trigger_async_id_symbol,
    ),
  );

  if (asyncHooksSymbols.destroyed) {
    Object.defineProperty(
      PromiseProto,
      asyncHooksSymbols.destroyed,
      getAsyncHookSymbolPromiseProtoDesc(asyncHooksSymbols.destroyed, {
        disallowGet: true,
      }),
    );
  } else if (withDestroy) {
    // process._rawDebug(`Couldn't find destroyed symbol to setup trap`);
  }
};
