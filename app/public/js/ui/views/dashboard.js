import { escapeHtml, formatDateKey, formatMoney, formatSignedMoney, pluralize } from '../format.js';
import { MEDICAL_NOTICE, describeProjection, describeRhythm, gauge, scenarioList, simulator } from './shared.js';

function balanceCard(ledger, state) {
  const since = `Depuis le ${formatDateKey(state.profile.startDate)} (${pluralize(ledger.elapsedDays, 'jour')})`;
  if (ledger.debt > 0) {
    return `
      <section class="card hero hero-debt" aria-labelledby="balance-title">
        <h2 id="balance-title" class="card-title">Dette à rembourser</h2>
        <p class="hero-value">${formatMoney(ledger.debt)}</p>
        <p class="muted">La progression vers l’objectif reprend une fois ce montant couvert.</p>
        <p class="muted small">${since} · crédité ${formatMoney(ledger.totalCredited)} · dépensé ${formatMoney(ledger.totalSpent)}</p>
      </section>`;
  }
  return `
    <section class="card hero" aria-labelledby="balance-title">
      <h2 id="balance-title" class="card-title">Cagnotte</h2>
      <p class="hero-value">${formatMoney(ledger.balance)}</p>
      <p class="muted small">${since} · crédité ${formatMoney(ledger.totalCredited)} · dépensé ${formatMoney(ledger.totalSpent)}</p>
    </section>`;
}

function todayCard(ledger) {
  const { count, baseline, spent, budget } = ledger.today;
  return `
    <section class="card" aria-labelledby="today-title">
      <h2 id="today-title" class="card-title">Aujourd’hui</h2>
      <div class="stat-row">
        <div class="stat"><span class="stat-value">${count}</span><span class="stat-label">cigarette(s) · référence ${baseline}</span></div>
        <div class="stat"><span class="stat-value">${formatMoney(spent)}</span><span class="stat-label">sur ${formatMoney(budget)} de budget</span></div>
      </div>
    </section>`;
}

function goalCard(ledger) {
  const goal = ledger.goals[0];
  if (!goal) {
    return `
      <section class="card" aria-labelledby="goal-title">
        <h2 id="goal-title" class="card-title">Objectif</h2>
        <p>Aucun objectif en cours.</p>
        <a class="button" href="#/goals">Définir un objectif</a>
      </section>`;
  }

  let projection;
  if (goal.reached) {
    projection = `
      <p><strong>Objectif atteint.</strong> Le montant est disponible dans la cagnotte.</p>
      <button type="button" class="button" data-action="claim-goal" data-id="${goal.id}">Marquer comme obtenu</button>`;
  } else if (goal.projection) {
    projection = `<p>Date estimée&nbsp;: <strong>${describeProjection(goal.projection)}</strong></p>`;
  } else {
    projection = `
      <p>Pas de date estimée au taux actuel (${formatSignedMoney(ledger.rate.current)} par jour).</p>
      <p class="muted">${describeRhythm(ledger)}</p>
      ${scenarioList(ledger, goal.toCover)}`;
  }

  return `
    <section class="card" aria-labelledby="goal-title">
      <h2 id="goal-title" class="card-title">Objectif&nbsp;: ${escapeHtml(goal.label)}</h2>
      ${gauge(goal.progress, `Progression vers ${goal.label}`)}
      <p class="gauge-legend"><span>${formatMoney(goal.saved)} sur ${formatMoney(goal.amount)}</span><span>${Math.floor(goal.progress * 100)}&nbsp;%</span></p>
      ${goal.reached ? '' : `<p>Reste à couvrir&nbsp;: <strong>${formatMoney(goal.toCover)}</strong>${ledger.debt > 0 ? ` (dont ${formatMoney(ledger.debt)} de dette)` : ''}</p>`}
      ${projection}
      ${goal.reached ? '' : simulator(ledger, goal.toCover)}
    </section>`;
}

function rateCard(ledger) {
  const { current, nextRecalculationInDays, trend7Days, trendSampleDays, periods } = ledger.rate;
  const origin = periods.length === 1 ? ' (amorçage à 20&nbsp;% du budget quotidien)' : '';
  return `
    <section class="card" aria-labelledby="rate-title">
      <h2 id="rate-title" class="card-title">Rythme d’épargne</h2>
      <div class="stat-row">
        <div class="stat">
          <span class="stat-value">${formatSignedMoney(current)}</span>
          <span class="stat-label">par jour, taux officiel${origin}</span>
        </div>
        <div class="stat">
          <span class="stat-value">${formatSignedMoney(trend7Days)}</span>
          <span class="stat-label">tendance ${trendSampleDays}&nbsp;j (indicative)</span>
        </div>
      </div>
      <p class="muted small">Prochain recalcul du taux dans ${pluralize(nextRecalculationInDays, 'jour')}. La tendance n’influence pas la date estimée.</p>
    </section>`;
}

export function renderDashboard({ state, ledger }) {
  return `
    <h1 class="page-title">Mon tableau de bord</h1>
    ${balanceCard(ledger, state)}
    ${todayCard(ledger)}
    ${goalCard(ledger)}
    ${rateCard(ledger)}
    ${MEDICAL_NOTICE}`;
}
