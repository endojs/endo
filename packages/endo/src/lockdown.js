/* global lockdown */
import "ses";

// This is used by Endo to lockdown its own start compartment.

lockdown({
  errorTaming: "unsafe"
});
