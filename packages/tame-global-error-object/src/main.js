const { getOwnPropertyDescriptor } = Object;

export default function tameGlobalErrorObject() {
  // Tame static properties;
  delete Error.captureStackTrace;

  if (getOwnPropertyDescriptor(Error, 'captureStackTrace')) {
    throw Error('Cannot remove Error.captureStackTrace');
  }

  delete Error.stackTraceLimit;

  if (getOwnPropertyDescriptor(Error, 'stackTraceLimit')) {
    throw Error('Cannot remove Error.stackTraceLimit');
  }
}
