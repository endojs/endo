import "ses";

// This is used by Endo to lockdown its own start compartment.

lockdown({
  errorTaming: "unsafe"
});

// Even on non-v8, we tame the start compartment's Error constructor so
// this assignment is not rejected, even if it does nothing.
Error.stackTraceLimit = Infinity;
