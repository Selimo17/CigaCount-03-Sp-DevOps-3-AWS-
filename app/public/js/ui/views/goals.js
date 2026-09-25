import { escapeHtml, formatDateTime, formatMoney } from '../format.js';
import { MEDICAL_NOTICE, describeProjection, gauge } from './shared.js';

function queueItem(goal, index, total) {
  let status;
  if (goal.reached) {
    status = `<button type="button" class="button button-small" data-action="claim-goal" data-id="${goal.id}">Marquer comme obtenu</button>`;
  } else if (goal.projection) {
    status = `<p class="small">Reste ${formatMoney(goal.toCover)} · ${describeProjection(goal.projection)}</p>`;
  } else {
    status = `<p class="small">Reste ${formatMoney(goal.toCover)} · pas de date au taux actuel</p>`;
  }
  return `
    <li class="goal-item">
      <div class="goal-header">
        <span class="goal-rank">${index + 1}</span>
        <strong class="goal-label">${escapeHtml(goal.label)}</strong>
        <span>${formatMoney(goal.amount)}</span>
      </div>
      ${gauge(goal.progress, `Progression vers ${goal.label}`)}
      ${status}
      <div class="goal-actions">
        <button type="button" class="icon-button" data-action="move-goal" data-id="${goal.id}" data-direction="-1"
          aria-label="Monter ${escapeHtml(goal.label)} dans la file" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="icon-button" data-action="move-goal" data-id="${goal.id}" data-direction="1"
          aria-label="Descendre ${escapeHtml(goal.label)} dans la file" ${index === total - 1 ? 'disabled' : ''}>↓</button>
        <button type="button" class="link-button" data-action="archive-goal" data-id="${goal.id}">Retirer</button>
      </div>
    </li>`;
}

function historyItem(goal, timeZone) {
  const isClaimed = goal.status === 'claimed';
  const date = isClaimed ? goal.claimedAt : goal.archivedAt;
  return `
    <li class="history-item">
      <span><strong>${escapeHtml(goal.label)}</strong> · ${formatMoney(goal.amount)}</span>
      <span class="muted small">${isClaimed ? 'Obtenu' : 'Retiré'} le ${date ? formatDateTime(date, timeZone) : '—'}</span>
    </li>`;
}

export function renderGoals({ state, ledger }) {
  const queue = ledger.goals;
  const history = state.goals
    .filter((goal) => goal.status !== 'active')
    .sort((a, b) => ((a.claimedAt ?? a.archivedAt ?? '') < (b.claimedAt ?? b.archivedAt ?? '') ? 1 : -1));

  return `
    <h1 class="page-title">Objectifs</h1>
    <section class="card" aria-labelledby="new-goal-title">
      <h2 id="new-goal-title" class="card-title">Nouvel objectif</h2>
      <form data-form="add-goal" class="form">
        <label>Libellé
          <input name="label" type="text" maxlength="60" required placeholder="Console" />
        </label>
        <label>Montant (€)
          <input name="amount" type="number" min="1" step="0.01" inputmode="decimal" required placeholder="450" />
        </label>
        <button type="submit" class="button">Ajouter à la file</button>
      </form>
    </section>

    <section class="card" aria-labelledby="queue-title">
      <h2 id="queue-title" class="card-title">File d’attente</h2>
      <p class="muted small">La cagnotte finance les objectifs dans l’ordre de la file.</p>
      ${queue.length > 0 ? `<ol class="goal-list">${queue.map((goal, index) => queueItem(goal, index, queue.length)).join('')}</ol>` : '<p>Aucun objectif en attente.</p>'}
    </section>

    <section class="card" aria-labelledby="history-title">
      <h2 id="history-title" class="card-title">Historique</h2>
      ${history.length > 0 ? `<ul class="history-list">${history.map((goal) => historyItem(goal, state.profile.timeZone)).join('')}</ul>` : '<p class="muted">Aucun objectif terminé pour le moment.</p>'}
    </section>
    ${MEDICAL_NOTICE}`;
}
