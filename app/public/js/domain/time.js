/**
 * Time utilities.
 *
 * Timestamps are always stored in UTC (ISO 8601 strings), but calendar days
 * are cut according to the user's local time zone. A local calendar day is
 * represented by a "date key" (YYYY-MM-DD) or by a "day number" (number of
 * days since 1970-01-01), which makes day arithmetic trivial and immune to
 * daylight saving time changes.
 */

const MS_PER_DAY = 86_400_000;

const formatterCache = new Map();

function getFormatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(
      timeZone,
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    );
  }
  return formatterCache.get(timeZone);
}

/** Returns the wall-clock parts of a UTC instant in the given time zone. */
export function getZonedParts(date, timeZone) {
  const parts = {};
  for (const { type, value } of getFormatter(timeZone).formatToParts(date)) {
    if (type !== 'literal') {
      parts[type] = Number(value);
    }
  }
  return parts;
}

/** Local calendar day (YYYY-MM-DD) of a UTC instant in the given time zone. */
export function toDateKey(isoOrDate, timeZone) {
  const { year, month, day } = getZonedParts(new Date(isoOrDate), timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Local hour of day (0-23) of a UTC instant in the given time zone. */
export function toLocalHour(isoOrDate, timeZone) {
  return getZonedParts(new Date(isoOrDate), timeZone).hour;
}

/** Converts a date key (YYYY-MM-DD) to a day number. */
export function dateKeyToDayNumber(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Converts a day number back to a date key (YYYY-MM-DD). */
export function dayNumberToDateKey(dayNumber) {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Day number of a UTC instant, using the user's local calendar. */
export function toDayNumber(isoOrDate, timeZone) {
  return dateKeyToDayNumber(toDateKey(isoOrDate, timeZone));
}

/** Day of week of a day number, 0 = Monday ... 6 = Sunday. */
export function weekdayOfDayNumber(dayNumber) {
  // 1970-01-01 (day 0) was a Thursday, i.e. index 3 when Monday = 0.
  return (((dayNumber + 3) % 7) + 7) % 7;
}

/** Offset (in ms) between the given time zone and UTC at a given instant. */
function getTimeZoneOffset(timestamp, timeZone) {
  const p = getZonedParts(new Date(timestamp), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(timestamp / 1000) * 1000;
}

/**
 * Converts a local wall-clock time (date key + "HH:MM") in the given time
 * zone to a UTC ISO string. Used for retroactive entries.
 */
export function zonedTimeToUtcIso(dateKey, time, timeZone) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hours, minutes);
  // Two passes handle instants close to a daylight saving time transition.
  let timestamp = wallClock - getTimeZoneOffset(wallClock, timeZone);
  timestamp = wallClock - getTimeZoneOffset(timestamp, timeZone);
  return new Date(timestamp).toISOString();
}

/** Time zone configured on the device, with a safe fallback. */
export function detectTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
