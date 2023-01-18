/**
 * checkIntrinsics()
 * Ensure that the intrinsics are consistent with defined.
 *
 * @param {object} intrinsics
 */
export function checkIntrinsics(intrinsics) {
  Object.keys(intrinsics).forEach(name => {
    if (intrinsics[name] === undefined) {
      throw new TypeError(`Malformed intrinsic: ${name}`);
    }
  });
}
