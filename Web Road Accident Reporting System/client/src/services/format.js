// Relative time in the phrasing the map sidebar already uses, so a situation
// strip on any tab reads timestamps the same way the map does.
export function timeAgo(value) {
  if (!value) return 'time unknown';

  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return 'time unknown';

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  return `${Math.round(hours / 24)} d ago`;
}
