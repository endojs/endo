// @ts-check

export const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'full',
  timeStyle: 'long',
});

export const timeFormatter = new Intl.DateTimeFormat(undefined, {
  timeStyle: 'short',
});

/**
 * @param {Date} date
 * @returns {string}
 */
export const relativeTime = date => {
  const now = Date.now();
  const then = date.getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return '';
};

export const numberFormatter = new Intl.NumberFormat();
