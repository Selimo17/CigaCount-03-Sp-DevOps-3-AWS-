import { escapeHtml, formatDateTime, formatMoney, formatNumber, pluralize } from '../format.js';
import { MEDICAL_NOTICE } from './shared.js';

/** Reference prices used for concrete equivalences (indicative). */
const EQUIVALENCES = [
  { label: 'places de cinéma', unitPrice: 12 },
  { label: 'mois d’abonnement streaming', unitPrice: 13 },
  { label: 'repas au restaurant', unitPrice: 25 },
  { label: 'pleins d’essence', unitPrice: 75 },
  { label: 'nuits d’hôtel', unitPrice: 100 },
];

function equivalenceList(amount) {
  const items = EQUIVALENCES.map(
    ({ label, unitPrice }) =>
      `<li><strong>${formatNumber(amount / unitPrice)}</strong> ${label} <span class="muted small">(${formatMoney(unitPrice)})</span></li>`,
  );
  return `<ul class="equivalences">${items.join('')}</ul>`;
}

export function renderCost({ state, ledger }) {
  const { projectedAnnualCost, historyDays, cumulativeRealCost, totalCigarettes, spentLast30Days } = ledger.cost;
  const partialNotice =
    historyDays < 30
      ? `<p class="muted small">Projection calculée sur 30 jours alors que l’historique n’en compte que ${historyDays}&nbsp;: elle se précisera avec le temps.</p>`
      : '';
  const prices = [...state.prices].sort((a, b) => (a.effectiveAt < b.effectiveAt ? 1 : -1));

  return `
    <h1 class="page-title">Coût</h1>
    <section class="card" aria-labelledby="annual-title">
      <h2 id="annual-title" class="card-title">Coût annuel projeté</h2>
      <p class="hero-value">${formatMoney(projectedAnnualCost)}</p>
      <p class="muted small">(${formatMoney(spentLast30Days)} dépensés sur les 30 derniers jours ÷ 30) × 365</p>
      ${partialNotice}
      <h3 class="subtitle">Soit l’équivalent de</h3>
      ${equivalenceList(projectedAnnualCost)}
    </section>

    <section class="card" aria-labelledby="cumulative-title">
      <h2 id="cumulative-title" class="card-title">Coût réel cumulé</h2>
      <p class="hero-value">${formatMoney(cumulativeRealCost)}</p>
      <p class="muted small">${pluralize(totalCigarettes, 'cigarette déclarée', 'cigarettes déclarées')} depuis l’installation, chacune au prix en vigueur ce jour-là.</p>
      <h3 class="subtitle">Soit l’équivalent de</h3>
      ${equivalenceList(cumulativeRealCost)}
    </section>

    <section class="card" aria-labelledby="prices-title">
      <h2 id="prices-title" class="card-title">Historique des prix</h2>
      <ul class="history-list">
        ${prices
          .map(
            (price) => `
          <li class="history-item">
            <span>${formatMoney(price.packPrice)} le paquet de ${price.cigarettesPerPack} · ${formatMoney(price.unitPrice)} l’unité</span>
            <span class="muted small">depuis le ${escapeHtml(formatDateTime(price.effectiveAt, state.profile.timeZone))}</span>
          </li>`,
          )
          .join('')}
      </ul>
    </section>
    ${MEDICAL_NOTICE}`;
}
