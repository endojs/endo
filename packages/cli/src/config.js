/* global process */
import os from 'os';
import path from 'path';

import {
  whereEndoState,
  whereEndoEphemeralState,
  whereEndoSock,
  whereEndoCache,
} from '@endo/where';

const { username, homedir } = os.userInfo();
const temp = os.tmpdir();
const info = {
  user: username,
  home: homedir,
  temp,
};

export const statePath = whereEndoState(process.platform, process.env, info);

export const logPath = path.join(statePath, 'endo.log');

export const ephemeralStatePath = whereEndoEphemeralState(
  process.platform,
  process.env,
  info,
);

export const cachePath = whereEndoCache(process.platform, process.env, info);

export const sockPath = whereEndoSock(process.platform, process.env, info);
