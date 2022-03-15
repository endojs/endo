// @ts-check

export {};

declare global {
  interface SymbolConstructor {
    readonly nodeAsyncHooksAsyncId: unique symbol;
    readonly nodeAsyncHooksTriggerAsyncId: unique symbol;
    readonly nodeAsyncHooksDestroyed: unique symbol;
  }
}
