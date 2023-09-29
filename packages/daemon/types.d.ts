type Locator = {
  statePath: string;
  cachePath: string;
  sockPath: string;
};
export function start(locator?: Locator);
export function stop(locator?: Locator);
export function restart(locator?: Locator);
export function terminate(locator?: Locator);
export function clean(locator?: Locator);
export function reset(locator?: Locator);
export function makeEndoClient<TBootstrap>(
  name: string,
  sockPath: string,
  cancelled: Promise<void>,
  bootstrap?: TBootstrap,
);
