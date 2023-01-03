type Locator = {
  statePath: string;
  ephemeralStatePath: string;
  cachePath: string;
  sockPath: string;
};
export async function start(locator?: Locator);
export async function stop(locator?: Locator);
export async function restart(locator?: Locator);
export async function terminate(locator?: Locator);
export async function clean(locator?: Locator);
export async function reset(locator?: Locator);
export async function makeEndoClient<TBootstrap>(
  name: string,
  sockPath: string,
  cancelled: Promise<void>,
  bootstrap?: TBootstrap,
);
