type Locator = {
  endoPath: string;
  logPath: string;
  sockPath: string;
};
export async function start(locator?: Locator);
export async function stop(locator?: Locator);
export async function restart(locator?: Locator);
export async function shutdown(locator?: Locator);
export async function clean(locator?: Locator);
