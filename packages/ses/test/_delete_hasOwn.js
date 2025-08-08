// See https://github.com/endojs/endo/issues/2930

// Delete `Object.hasOwn` to emulate JS engines that still do not provide
// an `Object.hasOwn` themselves, such as the Safari/JSC that ships with
// iOS 15.3 or earlier. While technically ses and endo no longer
// support such engines, this absence seems to be the only impediment to
// running on these particular ones.

// @ts-ignore Purposeful violation
delete Object.hasOwn;
