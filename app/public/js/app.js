/**
 * Application entry point: routing, rendering and user interactions.
 */

import { computeLedger, computeUnitPrice, projectScenario } from './domain/ledger.js';
import { detectTimeZone, toDateKey, zonedTimeToUtcIso } from './domain/time.js';
import * as store from './store.js';
import { formatDateTime, formatMoney } from './ui/format.js';
import { renderCost } from './ui/views/cost.js';
import { renderDashboard } from './ui/views/dashboard.js';
import { renderGoals } from './ui/views/goals.js';
import { renderOnboarding } from './ui/views/onboarding.js';
import { renderSettings } from './ui/views/settings.js';
import { describeProjection } from './ui/views/shared.js';
import { renderStats } from './ui/views/stats.js';

const ROUTES = {
  '/': renderDashboard,
  '/goals': renderGoals,
  '/stats': renderStats,
  '/cost': renderCost,
  '/settings': renderSettings,
};

const TOAST_DURATION_MS = 5000;

const main = document.querySelector('#main');
const fab = document.querySelector('#declare-button');
const nav = document.querySelector('#bottom-nav');
const toast = document.querySelector('#toast');

let appVersion = 'inconnue';
let currentLedger = null;
let toastTimer = null;

function currentRoute() {
  const path = window.location.hash.replace(/^#/, '') || '/';
  return ROUTES[path] ? path : '/';
}

/* ---------- Rendering ---------- */

function render() {
  const onboarded = store.isOnboarded();
  fab.hidden = !onboarded;
  nav.hidden = !onboarded;

  if (!onboarded) {
    main.innerHTML = renderOnboarding({ timeZone: detectTimeZone() });
    updateOnboardingPreview();
    return;
  }

  const route = currentRoute();
  currentLedger = computeLedger(store.state, new Date());
  const scrollPosition = window.scrollY;
  main.innerHTML = ROUTES[route]({ state: store.state, ledger: currentLedger, appVersion });
  window.scrollTo(0, scrollPosition);

  for (const link of nav.querySelectorAll('a')) {
    if (link.getAttribute('href') === `#${route}`) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  }
  applyGaugeWidths();
  updateSimulator();
}

/** Inline styles are forbidden by the CSP, so widths are set through the CSSOM. */
function applyGaugeWidths() {
  for (const element of main.querySelectorAll('[data-progress]')) {
    element.style.width = `${element.dataset.progress}%`;
  }
}

function updateOnboardingPreview() {
  const form = main.querySelector('[data-form="onboarding"]');
  const preview = main.querySelector('[data-onboarding-preview]');
  if (!form || !preview) {
    return;
  }
  const data = new FormData(form);
  try {
    const unitPrice = computeUnitPrice(Number(data.get('packPrice')), Number(data.get('cigarettesPerPack')));
    const dailyBudget = Number(data.get('cigarettesPerDay')) * unitPrice;
    preview.textContent = `Prix unitaire : ${formatMoney(unitPrice)} · budget quotidien : ${formatMoney(dailyBudget)}`;
  } catch {
    preview.textContent = '';
  }
}

function updateSimulator() {
  const container = main.querySelector('[data-simulator]');
  if (!container || !currentLedger) {
    return;
  }
  const cigarettesPerDay = Number(container.querySelector('[data-simulator-input]').value);
  const scenario = projectScenario({
    cigarettesPerDay,
    baseline: currentLedger.today.baseline,
    unitPrice: currentLedger.today.unitPrice,
    amountToCover: Number(container.dataset.amount),
    todayDay: currentLedger.todayDay,
  });
  container.querySelector('[data-simulator-value]').textContent = String(cigarettesPerDay);
  container.querySelector('[data-simulator-result]').textContent = scenario.projection
    ? `${formatMoney(scenario.rate)} par jour : objectif ${describeProjection(scenario.projection)}`
    : 'Aucune épargne à ce rythme.';
}

/* ---------- Feedback ---------- */

function showToast(message, { undo } = {}) {
  clearTimeout(toastTimer);
  toast.replaceChildren();
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(text);
  if (undo) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = 'Annuler';
    button.addEventListener('click', async () => {
      toast.hidden = true;
      await undo();
    });
    toast.append(button);
  }
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, TOAST_DURATION_MS);
}

function reportError(error) {
  console.error(error);
  showToast('Une erreur est survenue, l’action n’a pas été enregistrée.');
}

/* ---------- Export ---------- */

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  const payload = { exportedAt: new Date().toISOString(), version: appVersion, ...store.state };
  download(`cigacount-${currentLedger.todayDateKey}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function exportCsv() {
  const { timeZone } = store.state.profile;
  const rows = [...store.state.cigarettes]
    .sort((a, b) => (a.smokedAt < b.smokedAt ? -1 : 1))
    .map((entry) =>
      [entry.smokedAt, formatDateTime(entry.smokedAt, timeZone), entry.unitPrice.toFixed(4), entry.retroactive ? 'yes' : 'no'].join(';'),
    );
  const csv = ['smoked_at_utc;smoked_at_local;unit_price_eur;retroactive', ...rows].join('\n');
  download(`cigacount-${currentLedger.todayDateKey}.csv`, csv, 'text/csv');
}

/* ---------- Actions ---------- */

async function declareNow() {
  const cigarette = await store.declareCigarette();
  const time = formatDateTime(cigarette.smokedAt, store.state.profile.timeZone).split(' ').pop();
  showToast(`Cigarette enregistrée à ${time}.`, {
    undo: () => store.deleteCigarette(cigarette.id),
  });
}

const ACTIONS = {
  'claim-goal': ({ id }) => store.claimGoal(id),
  'archive-goal': ({ id }) => store.archiveGoal(id),
  'move-goal': ({ id, direction }) => store.moveGoal(id, Number(direction)),
  'delete-cigarette': async ({ id }) => {
    const cigarette = store.state.cigarettes.find((entry) => entry.id === id);
    await store.deleteCigarette(id);
    showToast('Déclaration supprimée.', {
      undo: () => store.declareCigarette(cigarette.smokedAt, { retroactive: cigarette.retroactive }),
    });
  },
  'export-json': exportJson,
  'export-csv': exportCsv,
  'reset-data': async () => {
    if (window.confirm('Effacer définitivement toutes les données de cet appareil ?')) {
      await store.resetAllData();
      window.location.hash = '#/';
    }
  },
};

const FORMS = {
  onboarding: async (data) => {
    const goalLabel = String(data.get('goalLabel') ?? '').trim();
    const goalAmount = Number(data.get('goalAmount'));
    await store.completeOnboarding({
      cigarettesPerDay: Number(data.get('cigarettesPerDay')),
      packPrice: Number(data.get('packPrice')),
      cigarettesPerPack: Number(data.get('cigarettesPerPack')),
      timeZone: detectTimeZone(),
      goal: goalLabel && goalAmount > 0 ? { label: goalLabel, amount: goalAmount } : null,
    });
  },
  'add-goal': async (data, form) => {
    await store.addGoal({ label: String(data.get('label')).trim(), amount: Number(data.get('amount')) });
    form.reset();
    showToast('Objectif ajouté à la file.');
  },
  'update-price': async (data) => {
    await store.updatePrice(Number(data.get('packPrice')), Number(data.get('cigarettesPerPack')));
    showToast('Nouveau prix enregistré.');
  },
  'update-baseline': async (data) => {
    await store.updateBaseline(Number(data.get('cigarettesPerDay')), String(data.get('effectiveDate')));
    showToast('Consommation de référence enregistrée.');
  },
  retroactive: async (data) => {
    const smokedAt = zonedTimeToUtcIso(String(data.get('date')), String(data.get('time')), store.state.profile.timeZone);
    if (smokedAt > new Date().toISOString()) {
      showToast('Une déclaration ne peut pas être dans le futur.');
      return;
    }
    const count = Number(data.get('count'));
    await store.declareRetroactive(smokedAt, count);
    showToast(`${count} cigarette(s) ajoutée(s).`);
  },
  'update-timezone': async (data) => {
    await store.updateTimeZone(String(data.get('timeZone')));
    showToast('Fuseau horaire enregistré.');
  },
};

/* ---------- Event wiring ---------- */

fab.addEventListener('click', () => declareNow().catch(reportError));

main.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (button && ACTIONS[button.dataset.action]) {
    Promise.resolve(ACTIONS[button.dataset.action](button.dataset)).catch(reportError);
  }
});

main.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-form]');
  if (form && FORMS[form.dataset.form]) {
    event.preventDefault();
    FORMS[form.dataset.form](new FormData(form), form).catch(reportError);
  }
});

main.addEventListener('input', (event) => {
  if (event.target.matches('[data-preview]')) {
    updateOnboardingPreview();
  } else if (event.target.matches('[data-simulator-input]')) {
    updateSimulator();
  }
});

window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});

// Figures are computed at read time. When the local day changes, the screen
// is rendered again so the new day is credited without any scheduled job.
// (Rendering only on day change avoids wiping a form being filled in.)
function refreshIfDayChanged() {
  if (currentLedger && toDateKey(new Date(), store.state.profile.timeZone) !== currentLedger.todayDateKey) {
    render();
  }
}
setInterval(refreshIfDayChanged, 60_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshIfDayChanged();
  }
});

async function start() {
  store.subscribe(render);
  fetch('/api/version')
    .then((response) => response.json())
    .then((body) => {
      appVersion = body.version;
    })
    .catch(() => {});
  try {
    await store.loadState();
  } catch (error) {
    console.error(error);
    main.innerHTML = '<p class="card">Le stockage local est indisponible sur ce navigateur (navigation privée&nbsp;?).</p>';
  }
}

start();
