/**
 * checkIntrinsics()
 * Ensure that the intrinsics are consistent with defined.
 *
 * @param {object} intrinsics
 */
export function checkIntrinsics(intrinsics) {
  for (const name of Object.keys(intrinsics)) {
    if (intrinsics[name] === undefined) {
      throw TypeError(`Malformed intrinsic: ${name}`);
    }
  }
}
