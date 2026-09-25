import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateKeyToDayNumber,
  dayNumberToDateKey,
  toDateKey,
  toLocalHour,
  weekdayOfDayNumber,
  zonedTimeToUtcIso,
} from '../public/js/domain/time.js';

test('days are cut according to the local time zone, not UTC', () => {
  // 23:30 UTC on March 10th is already March 11th in Paris (UTC+1).
  assert.equal(toDateKey('2026-03-10T23:30:00.000Z', 'Europe/Paris'), '2026-03-11');
  assert.equal(toDateKey('2026-03-10T23:30:00.000Z', 'UTC'), '2026-03-10');
  // ... and still March 10th in New York.
  assert.equal(toDateKey('2026-03-11T03:00:00.000Z', 'America/New_York'), '2026-03-10');
});

test('local hour follows daylight saving time', () => {
  assert.equal(toLocalHour('2026-01-15T12:00:00.000Z', 'Europe/Paris'), 13);
  assert.equal(toLocalHour('2026-07-15T12:00:00.000Z', 'Europe/Paris'), 14);
});

test('date keys and day numbers round-trip', () => {
  assert.equal(dateKeyToDayNumber('1970-01-01'), 0);
  assert.equal(dayNumberToDateKey(dateKeyToDayNumber('2026-09-25')), '2026-09-25');
  // DST changes do not create 23 or 25 hour "days" in day arithmetic.
  assert.equal(dateKeyToDayNumber('2026-03-30') - dateKeyToDayNumber('2026-03-29'), 1);
});

test('weekday index starts on Monday', () => {
  assert.equal(weekdayOfDayNumber(dateKeyToDayNumber('2026-09-21')), 0); // Monday
  assert.equal(weekdayOfDayNumber(dateKeyToDayNumber('2026-09-27')), 6); // Sunday
});

test('local wall-clock time is converted to UTC', () => {
  assert.equal(zonedTimeToUtcIso('2026-01-15', '08:30', 'Europe/Paris'), '2026-01-15T07:30:00.000Z');
  assert.equal(zonedTimeToUtcIso('2026-07-15', '08:30', 'Europe/Paris'), '2026-07-15T06:30:00.000Z');
  assert.equal(zonedTimeToUtcIso('2026-07-15', '08:30', 'UTC'), '2026-07-15T08:30:00.000Z');
});
