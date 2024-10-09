
Experimental stand-alone Go binary for running Node.js style applications in
native XS compartments.

# xsnap-worker.a

Requires experimental support for building a shared library from xsnap-worker:
https://github.com/agoric-labs/xsnap-pub/pull/54

# xsnap.js

Generate with:

```
bundle-source -f endoScript -C xs js/xsnap.js | jq -r .source > xsnap.js
```
