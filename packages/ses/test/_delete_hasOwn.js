// Delete `Object.hasOwn` to emulate JS engines that still do not provide
// an `Object.hasOwn` themselves. While technically ses and endo no longer
// support such engines, it seems to be the only impediment to running on
// some ancient version of Safari/JSC that we're not set up to use for
// simply rerunning these local ava tests.

// @ts-ignore Purposeful violation
delete Object.hasOwn;
