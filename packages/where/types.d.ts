export type Info = {
  home: string;
  user: string;
  temp: string;
};

export function whereEndoState(
  platform: string,
  env: { [name: string]: string | undefined },
  info: Info,
): string;
export function whereEndoEphemeralState(
  platform: string,
  env: { [name: string]: string | undefined },
  info: Info,
): string;
export function whereEndoSock(
  platform: string,
  env: { [name: string]: string | undefined },
  info: Info,
  protocol?: string,
): string;
export function whereEndoCache(
  platform: string,
  env: { [name: string]: string | undefined },
  info: Info,
): string;
