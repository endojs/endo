import { createHook, AsyncResource } from 'async_hooks';

/// <reference path="./node-async_hooks-symbols.d.ts" />

const asyncHooksWellKnownNameFromDescription = {
  async_id_symbol: 'nodeAsyncHooksAsyncId',
  trigger_async_id_symbol: 'nodeAsyncHooksTriggerAsyncId',
  destroyed: 'nodeAsyncHooksDestroyed',
};

const promiseAsyncHookFallbackStates = new WeakMap();

const setAsyncSymbol = (description, symbol) => {
  const wellKnownName = asyncHooksWellKnownNameFromDescription[description];
  if (!wellKnownName) {
    throw new Error('Unknown symbol');
  } else if (!Symbol[wellKnownName]) {
    Symbol[wellKnownName] = symbol;
    return true;
  } else if (Symbol[wellKnownName] !== symbol) {
    // console.warn(
    //   `Found duplicate ${description}:`,
    //   symbol,
    //   Symbol[wellKnownName],
    // );
    return false;
  } else {
    return true;
  }
};

// We can get the `async_id_symbol` and `trigger_async_id_symbol` through a
// simple instantiation of async_hook.AsyncResource, which causes little side
// effects. These are the 2 symbols that may be late bound, aka after the promise
// is returned to the program and would normally be frozen.
const findAsyncSymbolsFromAsyncResource = () => {
  let found = 0;
  Object.getOwnPropertySymbols(new AsyncResource('Bootstrap')).forEach(sym => {
    const { description } = sym;
    if (description in asyncHooksWellKnownNameFromDescription) {
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
const findAsyncSymbolsFromPromiseCreateHook = () => {
  const bootstrapData = [];

  {
    const bootstrapHook = createHook({
      init(asyncId, type, triggerAsyncId, resource) {
        if (type !== 'PROMISE') return;
        // console.log('Bootstrap', asyncId, triggerAsyncId, resource);
        bootstrapData.push({ asyncId, triggerAsyncId, resource });
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
    const promisesData = bootstrapData.filter(
      ({ resource }) => Promise.resolve(resource) === resource,
    );
    bootstrapData.length = 0;
    const { length } = promisesData;
    if (length > 1) {
      // console.warn('Found multiple potential candidates');
    }

    const promiseData = promisesData.find(
      ({ resource }) => resource === trigger,
    );
    if (promiseData) {
      bootstrapData.push(promiseData);
    } else if (length) {
      // console.warn('No candidates matched');
    }
  }

  if (bootstrapData.length) {
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

    const { asyncId, triggerAsyncId, resource } = bootstrapData.pop();
    const symbols = Object.getOwnPropertySymbols(resource);
    // const { length } = symbols;
    let found = 0;
    // if (length !== 3) {
    //   console.error(`Found ${length} symbols on promise:`, ...symbols);
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
        // console.error(`Unexpected symbol`, symbol);
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

const getAsyncHookFallbackState = (promise, create) => {
  let state = promiseAsyncHookFallbackStates.get(promise);
  if (!state && create) {
    state = {
      [Symbol.nodeAsyncHooksAsyncId]: undefined,
      [Symbol.nodeAsyncHooksTriggerAsyncId]: undefined,
    };
    if (Symbol.nodeAsyncHooksDestroyed) {
      state[Symbol.nodeAsyncHooksDestroyed] = undefined;
    }
    promiseAsyncHookFallbackStates.set(promise, state);
  }
  return state;
};

const setAsyncIdFallback = (promise, symbol, value) => {
  const state = getAsyncHookFallbackState(promise, true);

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

const getAsyncHookSymbolPromiseProtoDesc = (symbol, disallowGet) => ({
  set(value) {
    if (Object.isExtensible(this)) {
      Object.defineProperty(this, symbol, {
        value,
        writable: false,
        configurable: false,
        enumerable: false,
      });
    } else {
      // console.log('fallback set of async id', symbol, value, new Error().stack);
      setAsyncIdFallback(this, symbol, value);
    }
  },
  get() {
    if (disallowGet) {
      return undefined;
    }
    const state = getAsyncHookFallbackState(this, false);
    return state && state[symbol];
  },
  enumerable: false,
  configurable: true,
});

export const setup = (withDestroy = true) => {
  if (withDestroy) {
    findAsyncSymbolsFromPromiseCreateHook();
  } else {
    findAsyncSymbolsFromAsyncResource();
  }

  if (!Symbol.nodeAsyncHooksAsyncId || !Symbol.nodeAsyncHooksTriggerAsyncId) {
    // console.log(`Async symbols not found, moving on`);
    return;
  }

  const PromiseProto = Promise.prototype;
  Object.defineProperty(
    PromiseProto,
    Symbol.nodeAsyncHooksAsyncId,
    getAsyncHookSymbolPromiseProtoDesc(Symbol.nodeAsyncHooksAsyncId),
  );
  Object.defineProperty(
    PromiseProto,
    Symbol.nodeAsyncHooksTriggerAsyncId,
    getAsyncHookSymbolPromiseProtoDesc(Symbol.nodeAsyncHooksTriggerAsyncId),
  );

  if (Symbol.nodeAsyncHooksDestroyed) {
    Object.defineProperty(
      PromiseProto,
      Symbol.nodeAsyncHooksDestroyed,
      getAsyncHookSymbolPromiseProtoDesc(Symbol.nodeAsyncHooksDestroyed, true),
    );
  } else if (withDestroy) {
    // console.warn(`Couldn't find destroyed symbol to setup trap`);
  }
};
