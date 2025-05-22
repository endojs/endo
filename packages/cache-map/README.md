# cache-map

This `@endo/cache-map` package creates bounded-size caches having
WeakMap-compatible `has`/`get`/`set`/`delete` methods.
Key validity, comparison, and referential strength are controlled by a `makeMap`
option, which defaults to `WeakMap` but can be set to any producer of objects
with those methods (e.g., using `Map` allows for arbitrary keys which will be
strongly held).
Cache eviction policy is not currently configurable, but strives for a hit ratio
at least as good as
[LRU](https://en.wikipedia.org/wiki/Cache_replacement_policies#LRU) (e.g., it
might be [CLOCK](https://en.wikipedia.org/wiki/Page_replacement_algorithm#Clock)
or [SIEVE](https://sievecache.com/)).

## Usage

### Weak Cache
```js
import { makeCacheMapKit } from '@endo/cache-map';

const { cache: weakCache, getMetrics } = makeCacheMapKit(2);
const entries = [
  { key: Symbol('key 1'), value: Symbol('value 1') },
  { key: Symbol('key 2'), value: Symbol('value 2') },
  { key: Symbol('key 3'), value: Symbol('value 3') },
];
for (const { key, value } of entries) weakCache.set(key, value);

assert(!weakCache.has(entries[0].key));
assert(weakCache.has(entries[1].key));
assert(weakCache.get(entries[2].key) === entries[2].value);

weakCache.delete(entries[2].key);
weakCache.set(entries[1].key, entries[0]);

assert(!weakCache.has(entries[0].key));
assert(!weakCache.has(entries[2].key));
assert(weakCache.get(entries[1].key) === entries[0]);

assert.throws(() => weakCache.set('unweakable key', {}));
```

### Strong Cache
```js
import { makeCacheMapKit } from '@endo/cache-map';

const { cache, getMetrics } = makeCacheMapKit(100, { makeMap: Map });
cache.set('unweakable key', 'ok');
assert(cache.get('unweakable key') === 'ok');
```

## License

[Apache License, Version 2.0](./LICENSE)
