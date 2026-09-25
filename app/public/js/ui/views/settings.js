import { findPriceAt } from '../../domain/ledger.js';
import { escapeHtml, formatDateTime, formatMoney } from '../format.js';
import { MEDICAL_NOTICE } from './shared.js';

const RECENT_ENTRIES_LIMIT = 10;

function listTimeZones(current) {
  let zones = [current];
  if (typeof Intl.supportedValuesOf === 'function') {
    zones = Intl.supportedValuesOf('timeZone');
    if (!zones.includes(current)) {
      zones = [current, ...zones];
    }
  }
  return zones
    .map((zone) => `<option value="${escapeHtml(zone)}" ${zone === current ? 'selected' : ''}>${escapeHtml(zone)}</option>`)
    .join('');
}

function recentEntries(state) {
  const entries = [...state.cigarettes]
    .sort((a, b) => (a.smokedAt < b.smokedAt ? 1 : -1))
    .slice(0, RECENT_ENTRIES_LIMIT);
  if (entries.length === 0) {
    return '<p class="muted">Aucune cigarette déclarée.</p>';
  }
  return `
    <ul class="history-list">
      ${entries
        .map(
          (entry) => `
        <li class="history-item history-item-row">
          <span>${formatDateTime(entry.smokedAt, state.profile.timeZone)} · ${formatMoney(entry.unitPrice)}${entry.retroactive ? ' <span class="badge">rétroactive</span>' : ''}</span>
          <button type="button" class="link-button" data-action="delete-cigarette" data-id="${entry.id}">Supprimer</button>
        </li>`,
        )
        .join('')}
    </ul>`;
}

export function renderSettings({ state, ledger, appVersion }) {
  const currentPrice = findPriceAt(state.prices, new Date().toISOString());
  const { baseline } = ledger.today;
  const { startDate, timeZone } = state.profile;
  const today = ledger.todayDateKey;

  return `
    <h1 class="page-title">Réglages</h1>

    <section class="card" aria-labelledby="price-title">
      <h2 id="price-title" class="card-title">Prix du paquet</h2>
      <p class="muted small">Un nouveau prix s’applique à partir de maintenant. Les cigarettes déjà déclarées gardent leur prix.</p>
      <form data-form="update-price" class="form">
        <label>Prix du paquet (€)
          <input name="packPrice" type="number" min="0.01" step="0.01" inputmode="decimal" required value="${currentPrice.packPrice}" />
        </label>
        <label>Cigarettes par paquet
          <input name="cigarettesPerPack" type="number" min="1" step="1" inputmode="numeric" required value="${currentPrice.cigarettesPerPack}" />
        </label>
        <button type="submit" class="button">Enregistrer le prix</button>
      </form>
    </section>

    <section class="card" aria-labelledby="baseline-title">
      <h2 id="baseline-title" class="card-title">Consommation de référence</h2>
      <p class="muted small">Elle détermine le budget crédité chaque jour, à partir de la date choisie.</p>
      <form data-form="update-baseline" class="form">
        <label>Cigarettes par jour
          <input name="cigarettesPerDay" type="number" min="1" max="200" step="1" inputmode="numeric" required value="${baseline}" />
        </label>
        <label>À partir du
          <input name="effectiveDate" type="date" min="${startDate}" max="${today}" required value="${today}" />
        </label>
        <button type="submit" class="button">Enregistrer la référence</button>
      </form>
    </section>

    <section class="card" aria-labelledby="retro-title">
      <h2 id="retro-title" class="card-title">Saisie rétroactive</h2>
      <form data-form="retroactive" class="form form-inline">
        <label>Date
          <input name="date" type="date" min="${startDate}" max="${today}" required value="${today}" />
        </label>
        <label>Heure
          <input name="time" type="time" required value="12:00" />
        </label>
        <label>Nombre
          <input name="count" type="number" min="1" max="60" step="1" inputmode="numeric" required value="1" />
        </label>
        <button type="submit" class="button">Ajouter</button>
      </form>
      <h3 class="subtitle">Dernières déclarations</h3>
      ${recentEntries(state)}
    </section>

    <section class="card" aria-labelledby="timezone-title">
      <h2 id="timezone-title" class="card-title">Fuseau horaire</h2>
      <p class="muted small">Les journées sont découpées selon ce fuseau. Les horodatages restent stockés en UTC.</p>
      <form data-form="update-timezone" class="form">
        <label>Fuseau
          <select name="timeZone">${listTimeZones(timeZone)}</select>
        </label>
        <button type="submit" class="button">Enregistrer le fuseau</button>
      </form>
    </section>

    <section class="card" aria-labelledby="data-title">
      <h2 id="data-title" class="card-title">Données</h2>
      <p class="muted small">Vos données restent sur cet appareil (stockage local du navigateur). Exportez-les pour les conserver.</p>
      <div class="button-row">
        <button type="button" class="button button-secondary" data-action="export-json">Exporter (JSON)</button>
        <button type="button" class="button button-secondary" data-action="export-csv">Exporter (CSV)</button>
      </div>
      <button type="button" class="link-button danger" data-action="reset-data">Effacer toutes les données</button>
    </section>

    <p class="muted small center">Version ${escapeHtml(appVersion)}</p>
    ${MEDICAL_NOTICE}`;
}
