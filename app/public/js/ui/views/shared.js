/**
 * Fragments shared by several screens.
 */

import { projectScenario } from '../../domain/ledger.js';
import { escapeHtml, formatDateKey, formatMoney, formatNumber, pluralize } from '../format.js';

export const MEDICAL_NOTICE = `
  <p class="notice" role="note">
    CigaCount est un outil de suivi budgétaire. Il ne remplace pas un accompagnement médical.
    Pour être aidé&nbsp;: Tabac Info Service, <a href="tel:3989">39&nbsp;89</a>
    ou <a href="https://www.tabac-info-service.fr" rel="noopener noreferrer" target="_blank">tabac-info-service.fr</a>.
  </p>`;

/** "le 3 juin 2027 (dans 250 jours)" */
export function describeProjection(projection) {
  if (projection.days === 0) {
    return 'atteint aujourd’hui';
  }
  return `le ${formatDateKey(projection.dateKey)} (dans ${pluralize(projection.days, 'jour')})`;
}

/**
 * Progress gauge with an accessible progressbar role. The width is applied
 * by JavaScript after rendering because the Content Security Policy forbids
 * inline style attributes.
 */
export function gauge(progress, label) {
  const percent = Math.round(Math.min(Math.max(progress, 0), 1) * 1000) / 10;
  return `
    <div class="gauge" role="progressbar" aria-label="${escapeHtml(label)}"
         aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
      <div class="gauge-fill" data-progress="${percent}"></div>
    </div>`;
}

/** Hypothetical scenarios, e.g. "down to 10 a day" and "full stop". */
export function scenarioList(ledger, amountToCover) {
  const { baseline, unitPrice } = ledger.today;
  const half = Math.floor(baseline / 2);
  const targets = [...new Set([half, 0])].filter((value) => value < baseline);
  const items = targets.map((cigarettesPerDay) => {
    const scenario = projectScenario({
      cigarettesPerDay,
      baseline,
      unitPrice,
      amountToCover,
      todayDay: ledger.todayDay,
    });
    const title =
      cigarettesPerDay === 0 ? 'En arrêt total' : `En descendant à ${pluralize(cigarettesPerDay, 'cigarette')} par jour`;
    return `<li><strong>${title}</strong>&nbsp;: ${formatMoney(scenario.rate)} par jour, objectif ${describeProjection(scenario.projection)}</li>`;
  });
  return `<ul class="scenarios">${items.join('')}</ul>`;
}

/** Interactive simulator: a slider from 0 to the reference consumption. */
export function simulator(ledger, amountToCover) {
  const { baseline } = ledger.today;
  if (baseline < 1) {
    return '';
  }
  const initial = Math.floor(baseline / 2);
  return `
    <div class="simulator" data-simulator data-amount="${amountToCover}">
      <label for="simulator-input">Simuler un rythme&nbsp;: <output data-simulator-value>${initial}</output> cigarette(s) par jour</label>
      <input id="simulator-input" type="range" min="0" max="${Math.max(baseline - 1, 0)}" step="1" value="${initial}" data-simulator-input />
      <p class="muted" data-simulator-result></p>
    </div>`;
}

export function describeRhythm(ledger) {
  const { cigarettesPerDay, netPerDay, sampleDays } = ledger.recentRhythm;
  return `Rythme réel sur ${pluralize(sampleDays, 'jour')}&nbsp;: ${formatNumber(cigarettesPerDay)} cigarette(s) par jour,
    soit ${formatMoney(netPerDay)} mis de côté par jour en moyenne.`;
}
