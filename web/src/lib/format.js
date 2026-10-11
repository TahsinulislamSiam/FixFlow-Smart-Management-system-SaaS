/** Formatting + small DOM helpers shared across the UI. */

export function cx(...values) {
  return values.filter(Boolean).join(' ');
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const dtf = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export function relativeTime(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 604800) return rtf.format(Math.round(diffSeconds / 86400), 'day');
  if (abs < 2592000) return rtf.format(Math.round(diffSeconds / 604800), 'week');
  return rtf.format(Math.round(diffSeconds / 2592000), 'month');
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dtf.format(date);
}

export function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

/** Turn a minute count into something a human reads at a glance. */
export function formatDuration(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '—';
  const value = Math.max(0, Math.round(minutes));
  if (value < 1) return '< 1 min';
  if (value < 60) return `${value} min`;
  if (value < 60 * 24) {
    const hours = Math.floor(value / 60);
    const mins = value % 60;
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(value / 1440);
  const hours = Math.floor((value % 1440) / 60);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

/** Signed countdown used by the SLA pill. */
export function formatCountdown(minutes) {
  if (minutes == null) return 'no SLA';
  return minutes < 0 ? `${formatDuration(-minutes)} overdue` : `${formatDuration(minutes)} left`;
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

export function titleCase(value = '') {
  return String(value)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function truncate(value = '', length = 140) {
  const text = String(value);
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export function formatFileSize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

/** Whatsapp-style "time ago" for the activity feed. */
export const timeAgo = relativeTime;

/** Debounce for the AI-preview-as-you-type field. */
export function debounce(fn, delay = 700) {
  let timer;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

/** Resolve an upload path against the API host (works behind the Vite proxy too). */
export function assetUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return url;
}
