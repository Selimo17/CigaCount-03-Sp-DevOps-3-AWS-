/**
 * Application state: an in-memory copy of the database plus the actions that
 * modify it. Every action persists first, then notifies the listeners so the
 * current screen is rendered again.
 */

import { computeUnitPrice, findPriceAt } from './domain/ledger.js';
import { toDateKey } from './domain/time.js';
import { STORES, clearAll, createId, loadAll, put, putMany, remove } from './storage/db.js';

const listeners = new Set();

export const state = {
  profile: null,
  prices: [],
  baselines: [],
  cigarettes: [],
  goals: [],
};

function notify() {
  for (const listener of listeners) {
    listener(state);
  }
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadState() {
  Object.assign(state, await loadAll());
  notify();
}

export function isOnboarded() {
  return Boolean(state.profile) && state.prices.length > 0 && state.baselines.length > 0;
}

function createPriceRecord(packPrice, cigarettesPerPack, effectiveAt) {
  return {
    id: createId(),
    packPrice,
    cigarettesPerPack,
    unitPrice: computeUnitPrice(packPrice, cigarettesPerPack),
    effectiveAt,
  };
}

/** Onboarding: reference consumption, pack price, cigarettes per pack and first goal. */
export async function completeOnboarding({ cigarettesPerDay, packPrice, cigarettesPerPack, timeZone, goal }) {
  const now = new Date();
  const startDate = toDateKey(now, timeZone);
  const profile = { key: 'profile', startDate, timeZone, createdAt: now.toISOString() };
  const price = createPriceRecord(packPrice, cigarettesPerPack, now.toISOString());
  const baseline = { id: createId(), cigarettesPerDay, effectiveDate: startDate };

  await put(STORES.meta, profile);
  await put(STORES.prices, price);
  await put(STORES.baselines, baseline);
  state.profile = profile;
  state.prices = [price];
  state.baselines = [baseline];

  if (goal) {
    await addGoal(goal);
  } else {
    notify();
  }
}

/**
 * Declares one cigarette. The unit price in effect at that instant is stored
 * with the entry so that a later price change never rewrites history.
 */
export async function declareCigarette(smokedAt = new Date().toISOString(), { retroactive = false } = {}) {
  const cigarette = {
    id: createId(),
    smokedAt,
    unitPrice: findPriceAt(state.prices, smokedAt).unitPrice,
    createdAt: new Date().toISOString(),
    retroactive,
  };
  state.cigarettes.push(cigarette);
  notify();
  await put(STORES.cigarettes, cigarette);
  return cigarette;
}

/** Retroactive entry: several cigarettes at the same local time. */
export async function declareRetroactive(smokedAt, count) {
  const unitPrice = findPriceAt(state.prices, smokedAt).unitPrice;
  const createdAt = new Date().toISOString();
  const cigarettes = Array.from({ length: count }, () => ({
    id: createId(),
    smokedAt,
    unitPrice,
    createdAt,
    retroactive: true,
  }));
  await putMany(STORES.cigarettes, cigarettes);
  state.cigarettes.push(...cigarettes);
  notify();
}

export async function deleteCigarette(id) {
  await remove(STORES.cigarettes, id);
  state.cigarettes = state.cigarettes.filter((cigarette) => cigarette.id !== id);
  notify();
}

/** New pack price, effective immediately. Older entries keep their price. */
export async function updatePrice(packPrice, cigarettesPerPack) {
  const price = createPriceRecord(packPrice, cigarettesPerPack, new Date().toISOString());
  await put(STORES.prices, price);
  state.prices.push(price);
  notify();
}

/** New reference consumption, effective from the given local day. */
export async function updateBaseline(cigarettesPerDay, effectiveDate) {
  const existing = state.baselines.find((baseline) => baseline.effectiveDate === effectiveDate);
  const baseline = { id: existing?.id ?? createId(), cigarettesPerDay, effectiveDate };
  await put(STORES.baselines, baseline);
  state.baselines = [...state.baselines.filter((item) => item.id !== baseline.id), baseline];
  notify();
}

export async function updateTimeZone(timeZone) {
  const profile = { ...state.profile, timeZone };
  await put(STORES.meta, profile);
  state.profile = profile;
  notify();
}

export async function addGoal({ label, amount }) {
  const positions = state.goals.filter((goal) => goal.status === 'active').map((goal) => goal.position);
  const goal = {
    id: createId(),
    label,
    amount,
    position: positions.length > 0 ? Math.max(...positions) + 1 : 0,
    status: 'active',
    createdAt: new Date().toISOString(),
    claimedAt: null,
  };
  await put(STORES.goals, goal);
  state.goals.push(goal);
  notify();
}

async function saveGoal(goal) {
  await put(STORES.goals, goal);
  state.goals = state.goals.map((item) => (item.id === goal.id ? goal : item));
}

/** Moves an active goal up (-1) or down (+1) in the queue. */
export async function moveGoal(id, direction) {
  const queue = state.goals
    .filter((goal) => goal.status === 'active')
    .sort((a, b) => a.position - b.position);
  const index = queue.findIndex((goal) => goal.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= queue.length) {
    return;
  }
  [queue[index], queue[target]] = [queue[target], queue[index]];
  for (const [position, goal] of queue.entries()) {
    if (goal.position !== position) {
      await saveGoal({ ...goal, position });
    }
  }
  notify();
}

/** The goal has been obtained: its amount is withdrawn from the savings. */
export async function claimGoal(id) {
  const goal = state.goals.find((item) => item.id === id);
  await saveGoal({ ...goal, status: 'claimed', claimedAt: new Date().toISOString() });
  notify();
}

export async function archiveGoal(id) {
  const goal = state.goals.find((item) => item.id === id);
  await saveGoal({ ...goal, status: 'archived', archivedAt: new Date().toISOString() });
  notify();
}

export async function resetAllData() {
  await clearAll();
  Object.assign(state, { profile: null, prices: [], baselines: [], cigarettes: [], goals: [] });
  notify();
}
