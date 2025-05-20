# cache-map

This `@endo/cache-map` package creates bounded-size caches having
WeakMap-compatible `has`/`get`/`set`/`delete` methods.
Key validity, comparison, and referential strength are all identical to WeakMap
(e.g., user abandonment of a key used in the cache releases the associated value
from the cache for garbage collection).
Cache eviction policy is not currently configurable, but strives for a hit ratio
at least as good as
[LRU](https://en.wikipedia.org/wiki/Cache_replacement_policies#LRU) (e.g., it
might be [CLOCK](https://en.wikipedia.org/wiki/Page_replacement_algorithm#Clock)
or [SIEVE](https://sievecache.com/)).

## Usage

```js
import { makeCacheMap } from '@endo/cache-map';

const cache = makeCacheMap(2);
const entries = [
  { key: Symbol('key 1'), value: Symbol('value 1') },
  { key: Symbol('key 2'), value: Symbol('value 2') },
  { key: Symbol('key 3'), value: Symbol('value 3') },
];
for (const { key, value } of entries) cache.set(key, value);

assert(!cache.has(entries[0].key));
assert(cache.has(entries[1].key));
assert(cache.get(entries[2].key) === entries[2].value);

cache.delete(entries[2].key);
cache.set(entries[1].key, entries[0]);

assert(!cache.has(entries[0].key));
assert(!cache.has(entries[2].key));
assert(cache.get(entries[1].key) === entries[0]);

assert.throws(() => cache.set('unweakable key', {}));
```

## License

[Apache License, Version 2.0](./LICENSE)
