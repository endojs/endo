import { create, freeze, getOwnPropertyDescriptors, ownKeys } from './commons';

export function sanitizeEndowments(endowments) {
  const sanitized = create(null, getOwnPropertyDescriptors(endowments));

  return sanitized;
}

export function sanitizeOptions(options, allowedOptions) {
  // Get names and symbols.
  const sanitized = create(null);

  ownKeys(options).forEach(key => {
    if (!allowedOptions.includes(key)) {
      throw new TypeError(`Unsupported option ${key}`);
    }

    sanitized[key] = options[key];
  });

  return freeze(sanitized);
}
