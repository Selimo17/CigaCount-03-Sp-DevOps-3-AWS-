import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDailyBudget,
  computeDebt,
  computeLedger,
  computeUnitPrice,
  findPriceAt,
  projectScenario,
} from '../public/js/domain/ledger.js';

const TZ = 'Europe/Paris';

/** 20 cigarettes a day, 12 € per pack of 20: 0.60 € each, 12 € a day. */
function createState(overrides = {}) {
  return {
    profile: { startDate: '2026-01-01', timeZone: TZ },
    prices: [
      { packPrice: 12, cigarettesPerPack: 20, unitPrice: 0.6, effectiveAt: '2026-01-01T08:00:00.000Z' },
    ],
    baselines: [{ cigarettesPerDay: 20, effectiveDate: '2026-01-01' }],
    cigarettes: [],
    goals: [],
    ...overrides,
  };
}

/** Creates `perDay` cigarettes per day at 0.60 € from `fromDay` (1-based) for `dayCount` days. */
function smoke(perDay, fromDay, dayCount, unitPrice = 0.6) {
  const cigarettes = [];
  for (let day = fromDay; day < fromDay + dayCount; day += 1) {
    for (let i = 0; i < perDay; i += 1) {
      const date = new Date(Date.UTC(2026, 0, day, 9, i));
      cigarettes.push({ smokedAt: date.toISOString(), unitPrice });
    }
  }
  return cigarettes;
}

const noon = (dateKey) => new Date(`${dateKey}T11:00:00.000Z`);

const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('unit price and daily budget follow the specification', () => {
  approx(computeUnitPrice(12, 20), 0.6);
  approx(computeDailyBudget(20, 0.6), 12);
  assert.throws(() => computeUnitPrice(0, 20), RangeError);
});

test('debt is the opposite of a negative balance', () => {
  assert.equal(computeDebt(10), 0);
  assert.equal(computeDebt(-4.5), 4.5);
});

test('balance is credited at read time: days elapsed × daily budget − spent', () => {
  const state = createState({ cigarettes: smoke(15, 1, 3) });
  const ledger = computeLedger(state, noon('2026-01-03'));
  assert.equal(ledger.elapsedDays, 3);
  approx(ledger.totalCredited, 3 * 12);
  approx(ledger.totalSpent, 45 * 0.6);
  approx(ledger.balance, 36 - 27);
  assert.equal(ledger.debt, 0);
});

test('balance can become negative and is then shown as a debt', () => {
  const state = createState({ cigarettes: smoke(30, 1, 2) });
  const ledger = computeLedger(state, noon('2026-01-02'));
  approx(ledger.balance, 24 - 36);
  approx(ledger.debt, 12);
});

test('each cigarette keeps the price in effect when it was declared', () => {
  const state = createState({
    prices: [
      { packPrice: 12, cigarettesPerPack: 20, unitPrice: 0.6, effectiveAt: '2026-01-01T08:00:00.000Z' },
      { packPrice: 14, cigarettesPerPack: 20, unitPrice: 0.7, effectiveAt: '2026-01-03T00:00:00.000Z' },
    ],
    cigarettes: [...smoke(10, 1, 2, 0.6), ...smoke(10, 3, 1, 0.7)],
  });
  const ledger = computeLedger(state, noon('2026-01-03'));
  // Credit: two days at 12 € then one day at 14 €; the past is not rewritten.
  approx(ledger.totalCredited, 12 + 12 + 14);
  approx(ledger.cost.cumulativeRealCost, 20 * 0.6 + 10 * 0.7);
  assert.equal(findPriceAt(state.prices, '2026-01-02T10:00:00.000Z').unitPrice, 0.6);
  assert.equal(findPriceAt(state.prices, '2026-01-04T10:00:00.000Z').unitPrice, 0.7);
});

test('adjusting the reference consumption only affects the following days', () => {
  const state = createState({
    baselines: [
      { cigarettesPerDay: 20, effectiveDate: '2026-01-01' },
      { cigarettesPerDay: 10, effectiveDate: '2026-01-03' },
    ],
  });
  const ledger = computeLedger(state, noon('2026-01-04'));
  approx(ledger.totalCredited, 12 + 12 + 6 + 6);
});

test('first period rate is bootstrapped at 20 % of the daily budget', () => {
  const ledger = computeLedger(createState(), noon('2026-01-05'));
  approx(ledger.rate.current, 0.2 * 12);
  assert.equal(ledger.rate.nextRecalculationInDays, 10);
  assert.equal(ledger.rate.periods.length, 1);
});

test('rate is recomputed every 14 days from the previous closed period and stays frozen', () => {
  // Period 1 (days 1-14): 16 cigarettes a day, i.e. 2.40 € saved per day.
  // Period 2 (days 15-28): 20 cigarettes a day, nothing saved.
  const state = createState({ cigarettes: [...smoke(16, 1, 14), ...smoke(20, 15, 14)] });

  const day15 = computeLedger(state, noon('2026-01-15'));
  approx(day15.rate.current, (14 * 2.4) / 14);
  assert.equal(day15.rate.nextRecalculationInDays, 14);

  // Still frozen on the last day of period 2, although nothing is saved anymore.
  const day28 = computeLedger(state, noon('2026-01-28'));
  approx(day28.rate.current, 2.4);
  assert.equal(day28.rate.nextRecalculationInDays, 1);

  const day29 = computeLedger(state, noon('2026-01-29'));
  approx(day29.rate.current, 0);
  assert.equal(day29.rate.periods[1].closed, true);
  assert.equal(day29.rate.periods[2].closed, false);
});

test('estimated duration is amount to cover divided by rate', () => {
  const state = createState({
    goals: [{ id: 'g1', label: 'Console', amount: 450, position: 0, status: 'active' }],
    cigarettes: smoke(12, 1, 1),
  });
  const ledger = computeLedger(state, noon('2026-01-01'));
  const [goal] = ledger.goals;
  // Balance 12 − 7.2 = 4.8 € saved; 445.2 € to cover at 2.40 € a day.
  approx(goal.saved, 4.8);
  approx(goal.toCover, 445.2);
  assert.equal(goal.projection.days, Math.ceil(445.2 / 2.4));
});

test('amount to cover includes the debt', () => {
  const state = createState({
    goals: [{ id: 'g1', label: 'Console', amount: 450, position: 0, status: 'active' }],
    cigarettes: smoke(30, 1, 2),
  });
  const ledger = computeLedger(state, noon('2026-01-02'));
  approx(ledger.goals[0].toCover, 450 + 12);
  approx(ledger.goals[0].saved, 0);
});

test('no date is projected when the rate is not positive, but scenarios are', () => {
  const state = createState({
    goals: [{ id: 'g1', label: 'Console', amount: 450, position: 0, status: 'active' }],
    cigarettes: [...smoke(25, 1, 14), ...smoke(25, 15, 1)],
  });
  const ledger = computeLedger(state, noon('2026-01-15'));
  assert.ok(ledger.rate.current < 0);
  assert.equal(ledger.goals[0].projection, null);

  const fullStop = projectScenario({
    cigarettesPerDay: 0,
    baseline: 20,
    unitPrice: 0.6,
    amountToCover: ledger.goals[0].toCover,
    todayDay: ledger.todayDay,
  });
  approx(fullStop.rate, 12);
  assert.ok(fullStop.projection.days > 0);
});

test('balance is shared between queued goals in order', () => {
  const state = createState({
    goals: [
      { id: 'g2', label: 'Casque', amount: 100, position: 1, status: 'active' },
      { id: 'g1', label: 'Livre', amount: 20, position: 0, status: 'active' },
    ],
  });
  // Nothing smoked for 3 days: 36 € saved.
  const ledger = computeLedger(state, noon('2026-01-03'));
  assert.deepEqual(ledger.goals.map((goal) => goal.id), ['g1', 'g2']);
  assert.equal(ledger.goals[0].reached, true);
  approx(ledger.goals[1].saved, 16);
  approx(ledger.goals[1].toCover, 84);
});

test('an obtained goal is withdrawn from the balance', () => {
  const state = createState({
    goals: [
      { id: 'g1', label: 'Livre', amount: 20, position: 0, status: 'claimed', claimedAt: '2026-01-03T10:00:00.000Z' },
    ],
  });
  const ledger = computeLedger(state, noon('2026-01-03'));
  approx(ledger.balance, 36 - 20);
  approx(ledger.balanceSeries.at(-1).balance, 16);
});

test('projected annual cost uses the last 30 days', () => {
  const state = createState({ cigarettes: smoke(10, 1, 40) });
  const ledger = computeLedger(state, noon('2026-02-09'));
  approx(ledger.cost.spentLast30Days, 30 * 10 * 0.6);
  approx(ledger.cost.projectedAnnualCost, ((30 * 10 * 0.6) / 30) * 365);
});

test('7-day trend is a rolling average of complete days, independent from the official rate', () => {
  // Days 1-7: 20 a day (0 € saved), days 8-14: 10 a day (6 € saved per day).
  const state = createState({ cigarettes: [...smoke(20, 1, 7), ...smoke(10, 8, 7)] });
  const ledger = computeLedger(state, noon('2026-01-15'));
  approx(ledger.rate.trend7Days, 6);
  // The official rate is based on the closed period: (7 × 0 + 7 × 6) / 14 = 3.
  approx(ledger.rate.current, 3);
});

test('distributions use the local hour and weekday', () => {
  const state = createState({
    cigarettes: [{ smokedAt: '2026-01-05T07:15:00.000Z', unitPrice: 0.6 }],
  });
  const ledger = computeLedger(state, noon('2026-01-12'));
  // 07:15 UTC is 08:15 in Paris in winter; January 5th 2026 is a Monday,
  // and two Mondays have elapsed (5th and 12th).
  assert.ok(ledger.distributions.averageByHour[8] > 0);
  approx(ledger.distributions.averageByWeekday[0], 1 / 2);
});
