export const InertCompartment = function Compartment(
  _endowments = {},
  _modules = {},
  _options = {},
) {
  throw new TypeError('Not available');
};

// It is not clear that
// `StaticModuleRecord.prototype.constructor` needs to be the
// useless `InertStaticModuleRecord` rather than
// `StaticModuleRecord` itself. The reason we're starting off
// extra caution is that `StaticModuleRecord` would be the only
// remaining universally shared primordial reachable by navigation
// that can turn strings of code into a representation closer to
// code execution. The others, `eval`, `Function`, and `Compartment`
// are already protected, and only `Compartment` can turn a
// `StaticModuleRecord` into execution, which is why it would
// probably be safe. However, since this extra caution has a tiny
// cost, I'd rather start out more restrictive, maintaining the option
// to loosen the rule over time.
//
export const InertStaticModuleRecord = function StaticModuleRecord(
  _string,
  _url,
) {
  throw new TypeError('Not available');
};
