### python test suite

For testing the Endo OCapN client against the [OCapN test suite](https://github.com/ocapn/ocapn-test-suite/tree/main).

### Usage

1. Run this server, to act as the host for the test.

```bash
node ./packages/ocapn/test/python-test-suite/index.js
```

2. From the python test suite repo, run the test suite specifying the locator for the Endo peer.

```
python ./test_runner.py 'ocapn://127.0.0.1:22046.tcp-testing-only'
```
