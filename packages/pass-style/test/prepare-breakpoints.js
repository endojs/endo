/* global process */

process.env.ENDO_DELIVERY_BREAKPOINTS = `{
  "Bob": {
    "foo": "*"
  },
  "*": {
    "bar": 0
  }
}`;

process.env.ENDO_SEND_BREAKPOINTS = `{
  "Bob": {
    "foo": "*",
    "zap": 3
  },
  "*": {
    "bar": 0,
    "zip": 3
  }
}`;
