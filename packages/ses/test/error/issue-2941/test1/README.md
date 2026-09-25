# Repro browser behavior

If relevant, first `yarn build` in the ancestral `ses` directory above.

---

## `errorTrapping: 'platform'`

In ses/src/test/error/issue-2941/test1/
1. open error-trapping-platform.js in the browser using `file://` protocol
2. see

Brave (likely all Chromium):

<img alt="errorTrapping: 'platform'" src="./error-trapping-platform.jpg" />

FireFox (TODO):
```
???
```

---

## `errorTrapping: 'platform', errorTaming: 'safe'`

In ses/src/test/error/issue-2941/test1/
1. open error-trapping-platform-safe.js in the browser using `file://` protocol
2. see

Brave (likely all Chromium):

<img alt="errorTrapping: 'platform'" src="./error-trapping-platform-safe.jpg" />

FireFox (TODO):
```
???
```

---

## `errorTrapping: 'none'`

In ses/src/test/error/issue-2941/test1/
1. open error-trapping-none.js in the browser using `file://` protocol
2. see

Brave (likely all Chromium):

<img alt="errorTrapping: 'none'" src="./error-trapping-none.jpg" />

FireFox (TODO):
```
???
```
