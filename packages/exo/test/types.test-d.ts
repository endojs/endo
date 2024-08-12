import { expectAssignable } from 'tsd';

import type { Passable } from '@endo/pass-style';

import { defineExoClassKit, makeExo } from '../src/exo-makers.js';

const exo = makeExo('foo', undefined, { sayHi: () => 'hi' });

expectAssignable<Passable>(exo);
expectAssignable<Passable>({ foo: exo });
// @ts-expect-error functions not passable
expectAssignable<Passable>(exo.sayHi);

const exoKit = defineExoClassKit('foo', undefined, () => {}, {
  public: { sayHi: () => 'hi' },
})();
expectAssignable<Passable>(exoKit);
expectAssignable<Passable>(exoKit.public);
