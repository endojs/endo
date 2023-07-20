export function whereEndoState(
  platform: string,
  env: { [name: string]: string | undefined },
  info: { home: string },
): string;
export function whereEndoEphemeralState(
  platform: string,
  env: { [name: string]: string | undefined },
  info: { home: string; user: string; temp: string },
): string;
export function whereEndoSock(
  platform: string,
  env: { [name: string]: string | undefined },
  info: { home: string; user: string; temp: string },
  protocol?: string,
): string;
export function whereEndoCache(
  platform: string,
  env: { [name: string]: string | undefined },
  info: { home: string },
): string;
