type Locator = {
  statePath: string;
  cachePath: string;
  sockPath: string;
};
export async function start(locator?: Locator);
export async function stop(locator?: Locator);
export async function restart(locator?: Locator);
export async function terminate(locator?: Locator);
export async function clean(locator?: Locator);
