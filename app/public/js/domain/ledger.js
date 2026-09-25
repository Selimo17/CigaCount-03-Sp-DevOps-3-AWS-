/**
 * Business rules of CigaCount.
 *
 * Every figure is derived from the raw data when it is read: nothing is
 * credited by a scheduled job at midnight. All functions in this module are
 * pure (no DOM, no storage) so they can be unit tested with Node.js.
 *
 * Data model (see storage/db.js):
 *   profile    { startDate: 'YYYY-MM-DD', timeZone }
 *   prices     [{ packPrice, cigarettesPerPack, unitPrice, effectiveAt (UTC ISO) }]
 *   baselines  [{ cigarettesPerDay, effectiveDate: 'YYYY-MM-DD' }]
 *   cigarettes [{ smokedAt (UTC ISO), unitPrice }]
 *   goals      [{ id, label, amount, position, status, claimedAt }]
 */

import {
  dateKeyToDayNumber,
  dayNumberToDateKey,
  toDayNumber,
  toLocalHour,
  weekdayOfDayNumber,
} from './time.js';

/** Length of a fixed progression-rate period, in days. */
export const PERIOD_LENGTH_DAYS = 14;

/** The very first period uses 20 % of the daily budget as its rate. */
export const BOOTSTRAP_RATE_RATIO = 0.2;

/** Window used by the secondary trend indicator. */
export const TREND_WINDOW_DAYS = 7;

/** Window used by the projected annual cost. */
export const ANNUAL_COST_WINDOW_DAYS = 30;

/** Amounts below half a cent are considered as zero. */
const EPSILON = 0.005;

/** prix_unitaire = prix_paquet / cigarettes_par_paquet */
export function computeUnitPrice(packPrice, cigarettesPerPack) {
  if (!(packPrice > 0) || !(cigarettesPerPack > 0)) {
    throw new RangeError('Pack price and cigarettes per pack must be positive.');
  }
  return packPrice / cigarettesPerPack;
}

/** budget_quotidien = consommation_reference × prix_unitaire */
export function computeDailyBudget(cigarettesPerDay, unitPrice) {
  return cigarettesPerDay * unitPrice;
}

/** dette = solde < 0 ? −solde : 0 */
export function computeDebt(balance) {
  return balance < 0 ? -balance : 0;
}

function sortBy(items, key) {
  return [...items].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
}

/**
 * Price record in effect at a given instant: the latest price whose
 * effective date is not after the instant (or the oldest one as a fallback).
 */
export function findPriceAt(prices, isoTimestamp) {
  const sorted = sortBy(prices, 'effectiveAt');
  if (sorted.length === 0) {
    throw new Error('At least one price is required.');
  }
  let current = sorted[0];
  for (const price of sorted) {
    if (price.effectiveAt <= isoTimestamp) {
      current = price;
    }
  }
  return current;
}

/** Returns a lookup "day number -> value in effect that day" for dated records. */
function buildDailyLookup(records, getDayNumber, getValue) {
  const sorted = [...records].sort((a, b) => getDayNumber(a) - getDayNumber(b));
  if (sorted.length === 0) {
    throw new Error('At least one record is required.');
  }
  return (dayNumber) => {
    let value = getValue(sorted[0]);
    for (const record of sorted) {
      if (getDayNumber(record) <= dayNumber) {
        value = getValue(record);
      }
    }
    return value;
  };
}

/**
 * Builds one entry per local calendar day since installation (today
 * included). Each day is credited with the daily budget in effect that day
 * (reference consumption × unit price), so a later change of price or of
 * reference consumption never rewrites the past.
 */
export function buildDailySeries(state, now = new Date()) {
  const { profile, prices, baselines, cigarettes, goals = [] } = state;
  const timeZone = profile.timeZone;
  const startDay = dateKeyToDayNumber(profile.startDate);
  const todayDay = Math.max(startDay, toDayNumber(now, timeZone));

  const unitPriceOn = buildDailyLookup(
    prices,
    (price) => toDayNumber(price.effectiveAt, timeZone),
    (price) => price.unitPrice,
  );
  const baselineOn = buildDailyLookup(
    baselines,
    (baseline) => dateKeyToDayNumber(baseline.effectiveDate),
    (baseline) => baseline.cigarettesPerDay,
  );

  const days = [];
  for (let dayNumber = startDay; dayNumber <= todayDay; dayNumber += 1) {
    const unitPrice = unitPriceOn(dayNumber);
    const baseline = baselineOn(dayNumber);
    days.push({
      dayNumber,
      dateKey: dayNumberToDateKey(dayNumber),
      unitPrice,
      baseline,
      budget: computeDailyBudget(baseline, unitPrice),
      spent: 0,
      count: 0,
      claimed: 0,
    });
  }

  for (const cigarette of cigarettes) {
    const index = toDayNumber(cigarette.smokedAt, timeZone) - startDay;
    if (index >= 0 && index < days.length) {
      days[index].spent += cigarette.unitPrice;
      days[index].count += 1;
    }
  }

  for (const goal of goals) {
    if (goal.status === 'claimed' && goal.claimedAt) {
      const index = Math.min(
        Math.max(toDayNumber(goal.claimedAt, timeZone) - startDay, 0),
        days.length - 1,
      );
      days[index].claimed += goal.amount;
    }
  }

  return { startDay, todayDay, days };
}

/**
 * Progression rate, recomputed every 14 days in FIXED periods starting on
 * the installation day. The rate used during period p is the net amount
 * saved during the previous closed period divided by 14. It stays frozen
 * during the current period. Period 0 is bootstrapped at 20 % of the daily
 * budget.
 */
export function computeRatePeriods(days) {
  const periods = [];
  for (let start = 0; start < days.length; start += PERIOD_LENGTH_DAYS) {
    const periodDays = days.slice(start, start + PERIOD_LENGTH_DAYS);
    const index = periods.length;
    const net = periodDays.reduce((sum, day) => sum + day.budget - day.spent, 0);
    const rate =
      index === 0
        ? BOOTSTRAP_RATE_RATIO * days[0].budget
        : periods[index - 1].net / PERIOD_LENGTH_DAYS;
    periods.push({
      index,
      startDateKey: days[start].dateKey,
      endDateKey: dayNumberToDateKey(days[start].dayNumber + PERIOD_LENGTH_DAYS - 1),
      // Every period but the last one is over.
      closed: start + PERIOD_LENGTH_DAYS < days.length,
      net,
      rate,
      bootstrap: index === 0,
    });
  }

  const elapsedInPeriod = (days.length - 1) % PERIOD_LENGTH_DAYS;
  return {
    periods,
    currentRate: periods[periods.length - 1].rate,
    nextRecalculationInDays: PERIOD_LENGTH_DAYS - elapsedInPeriod,
  };
}

/**
 * Average of a daily value over the last `windowDays` complete days (today
 * is excluded because it is not over yet). Falls back to the days available.
 */
export function averageOverRecentDays(days, windowDays, getValue) {
  const completeDays = days.length > 1 ? days.slice(0, -1) : days;
  const window = completeDays.slice(-windowDays);
  const total = window.reduce((sum, day) => sum + getValue(day), 0);
  return { average: total / window.length, sampleDays: window.length };
}

/**
 * durée_estimee = a_couvrir / taux. Returns null when the rate does not
 * allow any projection (rate <= 0).
 */
export function projectDate(amountToCover, rate, todayDay) {
  if (amountToCover <= EPSILON) {
    return { days: 0, dateKey: dayNumberToDateKey(todayDay) };
  }
  if (!(rate > 0)) {
    return null;
  }
  const days = Math.ceil(amountToCover / rate);
  return { days, dateKey: dayNumberToDateKey(todayDay + days) };
}

/**
 * Hypothetical scenario: "if I went down to N cigarettes a day". The rate
 * is what would be saved each day compared to the reference consumption.
 * N = 0 ("full stop") is always computable as long as the budget is positive.
 */
export function projectScenario({ cigarettesPerDay, baseline, unitPrice, amountToCover, todayDay }) {
  const rate = (baseline - cigarettesPerDay) * unitPrice;
  return { cigarettesPerDay, rate, projection: projectDate(amountToCover, rate, todayDay) };
}

/**
 * Splits the available balance between the active goals, in queue order.
 * For each goal: a_couvrir = (sum of previous goals + amount) − available.
 * When the balance is negative this is exactly montant_objectif + dette.
 */
export function allocateGoals(goals, availableBalance, rate, todayDay) {
  const activeGoals = sortBy(
    goals.filter((goal) => goal.status === 'active'),
    'position',
  );
  let cumulative = 0;
  return activeGoals.map((goal) => {
    const before = cumulative;
    cumulative += goal.amount;
    const saved = Math.min(Math.max(availableBalance - before, 0), goal.amount);
    const toCover = Math.max(cumulative - availableBalance, 0);
    const reached = toCover <= EPSILON;
    return {
      ...goal,
      saved,
      toCover: reached ? 0 : toCover,
      progress: goal.amount > 0 ? saved / goal.amount : 0,
      reached,
      projection: projectDate(toCover, rate, todayDay),
    };
  });
}

/** Distribution of cigarettes by local hour and by day of week. */
export function computeDistributions(cigarettes, days, timeZone) {
  const byHour = new Array(24).fill(0);
  const byWeekday = new Array(7).fill(0);
  const weekdayOccurrences = new Array(7).fill(0);

  for (const day of days) {
    weekdayOccurrences[weekdayOfDayNumber(day.dayNumber)] += 1;
    byWeekday[weekdayOfDayNumber(day.dayNumber)] += day.count;
  }
  for (const cigarette of cigarettes) {
    byHour[toLocalHour(cigarette.smokedAt, timeZone)] += 1;
  }

  return {
    averageByHour: byHour.map((count) => count / days.length),
    averageByWeekday: byWeekday.map((count, index) =>
      weekdayOccurrences[index] > 0 ? count / weekdayOccurrences[index] : 0,
    ),
  };
}

/**
 * Computes every figure displayed by the application from the raw data.
 */
export function computeLedger(state, now = new Date()) {
  const { days, todayDay } = buildDailySeries(state, now);
  const today = days[days.length - 1];

  // solde = (jours_ecoules × budget_quotidien) − total_depense
  // The credit is the sum of the budget of each elapsed day, which equals
  // jours_ecoules × budget_quotidien while price and reference are unchanged.
  // Goals marked as obtained are withdrawn from the savings jar.
  const totalCredited = days.reduce((sum, day) => sum + day.budget, 0);
  const totalSpent = state.cigarettes.reduce((sum, cigarette) => sum + cigarette.unitPrice, 0);
  const totalClaimed = days.reduce((sum, day) => sum + day.claimed, 0);
  const balance = totalCredited - totalSpent - totalClaimed;
  const debt = computeDebt(balance);

  const { periods, currentRate, nextRecalculationInDays } = computeRatePeriods(days);

  const trend = averageOverRecentDays(days, TREND_WINDOW_DAYS, (day) => day.budget - day.spent);
  const recentRhythm = averageOverRecentDays(days, PERIOD_LENGTH_DAYS, (day) => day.count);
  const recentNet = averageOverRecentDays(days, PERIOD_LENGTH_DAYS, (day) => day.budget - day.spent);

  const goals = allocateGoals(state.goals ?? [], balance, currentRate, todayDay);

  // cout_annuel_projete = (depense_30_derniers_jours / 30) × 365
  const last30Days = days.slice(-ANNUAL_COST_WINDOW_DAYS);
  const spentLast30Days = last30Days.reduce((sum, day) => sum + day.spent, 0);
  const projectedAnnualCost = (spentLast30Days / ANNUAL_COST_WINDOW_DAYS) * 365;

  let runningBalance = 0;
  const balanceSeries = days.map((day) => {
    runningBalance += day.budget - day.spent - day.claimed;
    return { dateKey: day.dateKey, balance: runningBalance };
  });

  return {
    todayDateKey: today.dateKey,
    todayDay,
    elapsedDays: days.length,
    today: {
      count: today.count,
      spent: today.spent,
      budget: today.budget,
      baseline: today.baseline,
      unitPrice: today.unitPrice,
    },
    totalCredited,
    totalSpent,
    totalClaimed,
    balance,
    debt,
    rate: {
      current: currentRate,
      nextRecalculationInDays,
      periods,
      trend7Days: trend.average,
      trendSampleDays: trend.sampleDays,
    },
    recentRhythm: {
      cigarettesPerDay: recentRhythm.average,
      netPerDay: recentNet.average,
      sampleDays: recentRhythm.sampleDays,
    },
    goals,
    cost: {
      projectedAnnualCost,
      spentLast30Days,
      historyDays: last30Days.length,
      cumulativeRealCost: totalSpent,
      totalCigarettes: state.cigarettes.length,
    },
    balanceSeries,
    distributions: computeDistributions(state.cigarettes, days, state.profile.timeZone),
  };
}
