/* Minimal support for URL manipulation beyond what most hosts provide
 * natively, used to normalize URLs before capturing them in a platform- and
 * location-agnostic archive.
 */

// @ts-check

// Derrived from https://github.com/junosuarez/url-relative
//
// Copyright (c) MMXV jden jason@denizac.org
//
// ISC License
//
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
// SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
// OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
// CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

/**
 * Computes the relative URL from the referrer to the location.
 *
 * @param {string} referrer
 * @param {string} location
 * @returns {string}
 */
export const relative = (referrer, location) => {
  referrer = String(referrer || '');
  location = String(location || '');

  if (referrer === location) {
    return '';
  }

  const referrerURL = new URL(referrer);
  const locationURL = new URL(location);

  if (
    referrerURL.host !== locationURL.host ||
    referrerURL.port !== locationURL.port ||
    referrerURL.protocol !== locationURL.protocol
  ) {
    return location;
  }

  // left location right, look for closest common path segment
  const referrerParts = referrerURL.pathname.substr(1).split('/');
  const locationParts = locationURL.pathname.substr(1).split('/');

  if (referrerURL.pathname === locationURL.pathname) {
    if (locationURL.pathname[locationURL.pathname.length - 1] === '/') {
      return '.';
    }
    return locationParts[locationParts.length - 1];
  }

  while (referrerParts[0] === locationParts[0]) {
    referrerParts.shift();
    locationParts.shift();
  }

  let length = referrerParts.length - locationParts.length;
  if (length > 0) {
    if (referrer.endsWith('/')) {
      locationParts.unshift('..');
    }
    while (length > 0) {
      length -= 1;
      locationParts.unshift('..');
    }
    return locationParts.join('/');
  }
  if (length < 0) {
    return locationParts.join('/');
  }
  length = locationParts.length - 1;
  while (length > 0) {
    length -= 1;
    locationParts.unshift('..');
  }
  return locationParts.join('/');
};
