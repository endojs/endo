import { Fail, X, annotateError, q } from '@endo/errors';
import { isObject, passStyleOf } from '@endo/pass-style';
import { compareRank } from './rankOrder.js';
import { recordNames, recordValues } from './encodePassable.js';

const { is } = Object;

/**
 * Since we're starting below the level where Checker is defined, try
 * using a Rejector parameter directly.
 *
 * The pleasantness of this exercise shows we should have used Rejector
 * parameters rather than Checker parameters all along. TODO we should seek
 * to migrate existing uses of Checker to Rejector.
 *
 * TODO Also experiment with pleasant error path labeling.
 */

export const makeReplayBridge = (memoG2H, memoH2G) => {
  const bind = (g, h) => {
    memoG2H.set(g, h);
    memoH2G.set(h, g);
  };

  const bridge = (g, h, _label) => {
    if (isObject(g)) {
      isObject(h) || Fail`isObject must be the same: ${g} vs ${h}`;
      if (memoG2H.has(g)) {
        memoG2H.get(g) === h || Fail`Unqual objects: ${g} vs ${h}`;
        memoH2G.get(h) === g ||
          Fail`internal: memos inconsistent on: ${g} vs ${h}`;
        return;
      } else {
        !memoH2G.has(h) || Fail`internal: memos inconsistent on: ${g} vs ${h}`;
      }
    } else {
      is(g, h) || Fail`Unqual primitive values: ${g} vs ${h}`;
      return;
    }
    const passStyle = passStyleOf(g);
    const hPassStyle = passStyleOf(h);
    passStyle === hPassStyle ||
      Fail`passStyles must be the same: ${q(passStyle)} vs ${q(hPassStyle)}`;
    switch (passStyle) {
      case 'copyArray': {
        g.length === h.length ||
          Fail`Unqual lengths: ${q(g.length)} vs ${q(h.length)}`;
        g.forEach((gElement, i) => bridge(gElement, h[i], i));
        bind(g, h);
        return;
      }
      case 'copyRecord': {
        const names = recordNames(g);
        const hNames = recordNames(h);
        compareRank(names, hNames) === 0 ||
          Fail`Unequal property names: ${q(names)} vs ${q(hNames)}`;
        const gValues = recordValues(g, names);
        const hValues = recordValues(h, names);
        gValues.forEach((gValue, i) => bridge(gValue, hValues[i], names[i]));
        bind(g, h);
        return;
      }
      case 'tagged': {
        bridge(g.tag, h.tag, 'tag');
        bridge(g.payload, h.payload, 'payload');
        bind(g, h);
        return;
      }
      case 'error': {
        bridge(g.name, h.name, 'error name');
        // Ok for everything else to differ
        // but would be nice to warn on different errors
        annotateError(g, X`guest for host error ${h}`);
        annotateError(h, X`host for guest error ${g}`);
        bind(g, h);
        return;
      }
      case 'remotable': {
        // Would be nice to want on different iface strings
        bind(g, h);
        return;
      }
      case 'promise': {
        // Would be nice to want on different iface strings
        bind(g, h);
        return;
      }
      default: {
        Fail`unrecognized passStyle ${q(passStyle)}`;
      }
    }
  };
  return harden(bridge);
};
harden(makeReplayBridge);
