### python test suite

For testing the Endo OCapN client against the [OCapN test suite](https://github.com/ocapn/ocapn-test-suite/tree/main).

### Usage

1. Run this server, to act as the host for the test.

```bash
node ./packages/ocapn/test/python-test-suite/index.js
```

2. From the python test suite repo, run the test suite specifying the locator for the Endo peer.

From the python test suite repo directory, setup the python virtual environment:
```sh
source ./venv/bin/activate
```

And run the test runner, specifying this address for our implmenetation's client:
```sh
python ./test_runner.py 'ocapn://a2ef69ddd5f84840970612ff660f5058.tcp-testing-only?host=127.0.0.1&port=22046'
```
