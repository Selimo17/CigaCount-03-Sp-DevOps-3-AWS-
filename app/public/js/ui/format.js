/**
 * Formatting helpers (French locale, euros) and HTML escaping.
 */

const currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const numberFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const integerFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const longDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export const formatMoney = (amount) => currencyFormatter.format(amount);

/** Signed amount, e.g. "+2,40 €" or "−1,20 €". */
export const formatSignedMoney = (amount) =>
  `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${currencyFormatter.format(Math.abs(amount))}`;

export const formatNumber = (value) => numberFormatter.format(value);

export const formatInteger = (value) => integerFormatter.format(value);

/** Formats a local date key (YYYY-MM-DD) as "3 juin 2027". */
export const formatDateKey = (dateKey) => longDateFormatter.format(new Date(`${dateKey}T00:00:00Z`));

export const formatShortDateKey = (dateKey) => shortDateFormatter.format(new Date(`${dateKey}T00:00:00Z`));

/** Formats a UTC timestamp in the user's time zone, e.g. "25/09/2026 08:30". */
export function formatDateTime(isoTimestamp, timeZone) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(isoTimestamp));
}

export const pluralize = (count, singular, plural = `${singular}s`) =>
  `${formatInteger(count)} ${Math.abs(count) >= 2 ? plural : singular}`;

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes user-provided text before inserting it in HTML templates. */
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
